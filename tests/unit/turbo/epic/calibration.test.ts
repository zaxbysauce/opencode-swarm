/**
 * Tests for the calibration durable-state module.
 * File: tests/unit/turbo/epic/calibration.test.ts
 *
 * Covers:
 *  - loadCalibrationState seeds an empty file on first access.
 *  - saveCalibrationState writes atomically (tmp + rename) and refreshes updatedAt.
 *  - Malformed JSON marks the directory unreadable (fail-closed).
 *  - Wrong version is treated as malformed.
 *  - repairCalibrationUnreadable clears the marker iff the file is now valid.
 *  - saveCalibrationState refuses to overwrite while the unreadable flag is set.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	emptyCalibrationState,
	isCalibrationStateUnreadable,
	loadCalibrationState,
	repairCalibrationUnreadable,
	saveCalibrationState,
} from '../../../../src/turbo/epic/calibration';

let dir: string;

beforeEach(() => {
	dir = fs.realpathSync(
		fs.mkdtempSync(path.join(os.tmpdir(), 'epic-calibration-')),
	);
});

afterEach(() => {
	// Always repair after each test so the per-directory unreadable marker
	// does not leak across tests (the same path won't be reused — mkdtemp
	// guarantees uniqueness — but the in-memory map keeps a stale entry).
	try {
		repairCalibrationUnreadable(dir);
	} catch {
		// best-effort
	}
	try {
		fs.rmSync(dir, { recursive: true, force: true });
	} catch {
		// best-effort
	}
});

describe('loadCalibrationState', () => {
	test('returns a seeded empty state on first access', () => {
		const state = loadCalibrationState(dir);
		expect(state).not.toBeNull();
		expect(state?.version).toBe(1);
		expect(state?.hotModuleAdditions).toEqual([]);
		expect(state?.consecutiveCleanCount).toBe(0);
		expect(state?.processedRecords).toBe(0);
	});

	test('persists the seed so a second read returns the same shape', () => {
		const first = loadCalibrationState(dir);
		const second = loadCalibrationState(dir);
		expect(second?.version).toBe(first?.version);
		expect(second?.processedRecords).toBe(first?.processedRecords);
	});

	test('returns null and sets fail-closed marker on malformed JSON', () => {
		const file = path.join(dir, '.swarm', 'epic', 'calibration.json');
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, '{not valid json', 'utf-8');
		expect(loadCalibrationState(dir)).toBeNull();
		expect(isCalibrationStateUnreadable(dir)).toBe(true);
	});

	test('returns null when version is unrecognised', () => {
		const file = path.join(dir, '.swarm', 'epic', 'calibration.json');
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(
			file,
			JSON.stringify({
				version: 99,
				updatedAt: 't',
				hotModuleAdditions: [],
				consecutiveCleanCount: 0,
				processedRecords: 0,
			}),
			'utf-8',
		);
		expect(loadCalibrationState(dir)).toBeNull();
		expect(isCalibrationStateUnreadable(dir)).toBe(true);
	});
});

describe('saveCalibrationState', () => {
	test('atomic write replaces the sentinel updatedAt on save', () => {
		const initial = emptyCalibrationState();
		// Use a sentinel value the save path will visibly overwrite.
		// (Two Date.now() calls in the same bun tick can produce the same
		// ISO timestamp, so we don't compare against the pre-save value.)
		initial.updatedAt = '1970-01-01T00:00:00.000Z';
		saveCalibrationState(dir, initial);

		const onDisk = loadCalibrationState(dir);
		expect(onDisk).not.toBeNull();
		expect(onDisk?.updatedAt).not.toBe('1970-01-01T00:00:00.000Z');
		// And the replacement must be a valid ISO timestamp.
		expect(() => new Date(onDisk!.updatedAt).toISOString()).not.toThrow();
	});

	test('round-trips hotModuleAdditions and processedRecords', () => {
		const state = emptyCalibrationState();
		state.hotModuleAdditions = ['src/x.ts', 'src/y.ts'];
		state.processedRecords = 7;
		state.consecutiveCleanCount = 3;
		state.activationThresholdOverride = 0.18;
		saveCalibrationState(dir, state);

		const onDisk = loadCalibrationState(dir);
		expect(onDisk?.hotModuleAdditions).toEqual(['src/x.ts', 'src/y.ts']);
		expect(onDisk?.processedRecords).toBe(7);
		expect(onDisk?.consecutiveCleanCount).toBe(3);
		expect(onDisk?.activationThresholdOverride).toBe(0.18);
	});

	test('refuses to overwrite while the unreadable flag is set', () => {
		const file = path.join(dir, '.swarm', 'epic', 'calibration.json');
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, '{not valid', 'utf-8');
		loadCalibrationState(dir); // sets the flag
		expect(() => saveCalibrationState(dir, emptyCalibrationState())).toThrow(
			/Epic calibration state is unreadable/,
		);
	});
});

describe('repairCalibrationUnreadable', () => {
	test('clears the marker once a valid file is in place', () => {
		const file = path.join(dir, '.swarm', 'epic', 'calibration.json');
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, '{not valid', 'utf-8');
		loadCalibrationState(dir);
		expect(isCalibrationStateUnreadable(dir)).toBe(true);

		// Replace with a valid file.
		fs.writeFileSync(
			file,
			JSON.stringify(emptyCalibrationState(), null, 2),
			'utf-8',
		);
		repairCalibrationUnreadable(dir);
		expect(isCalibrationStateUnreadable(dir)).toBe(false);
	});

	test('clears the marker when the broken file is removed entirely', () => {
		const file = path.join(dir, '.swarm', 'epic', 'calibration.json');
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, '{not valid', 'utf-8');
		loadCalibrationState(dir);
		fs.unlinkSync(file);
		repairCalibrationUnreadable(dir);
		expect(isCalibrationStateUnreadable(dir)).toBe(false);
	});
});

describe('loadCalibrationState — self-healing (adversarial H2)', () => {
	test('auto-repairs and proceeds when the file becomes valid out-of-band', () => {
		const file = path.join(dir, '.swarm', 'epic', 'calibration.json');
		fs.mkdirSync(path.dirname(file), { recursive: true });
		// First load: garbage → marker set, returns null.
		fs.writeFileSync(file, '{not valid', 'utf-8');
		expect(loadCalibrationState(dir)).toBeNull();
		expect(isCalibrationStateUnreadable(dir)).toBe(true);

		// User repairs the file out-of-band (NOT via repairCalibrationUnreadable).
		fs.writeFileSync(
			file,
			JSON.stringify(
				{ ...emptyCalibrationState(), processedRecords: 42 },
				null,
				2,
			),
			'utf-8',
		);

		// Next load: auto-detects valid file, clears marker, returns state.
		const state = loadCalibrationState(dir);
		expect(state).not.toBeNull();
		expect(state?.processedRecords).toBe(42);
		expect(isCalibrationStateUnreadable(dir)).toBe(false);
	});

	test('stays fail-closed when out-of-band write is still corrupt', () => {
		const file = path.join(dir, '.swarm', 'epic', 'calibration.json');
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, '{not valid', 'utf-8');
		expect(loadCalibrationState(dir)).toBeNull();

		// Different flavor of broken — wrong shape but valid JSON.
		fs.writeFileSync(file, JSON.stringify({ version: 99 }), 'utf-8');
		expect(loadCalibrationState(dir)).toBeNull();
		expect(isCalibrationStateUnreadable(dir)).toBe(true);
	});
});
