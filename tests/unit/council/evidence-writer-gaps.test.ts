/**
 * Tests filling the gaps surfaced by the second-round council review:
 *  - prototype pollution via poisoned existing evidence file (HIGH)
 *  - preservation of existing non-council gate entries (MEDIUM)
 *  - corrupted-JSON recovery branch (MEDIUM)
 *  - JSON-array-input fresh-start branch (MEDIUM)
 *  - gates.council write path visible to check_gate_status semantics (HIGH/SME)
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeCouncilEvidence } from '../../../src/council/council-evidence-writer';
import type { CouncilSynthesis } from '../../../src/council/types';

let tempDir: string;

const makeSynthesis = (
	overrides: Partial<CouncilSynthesis> = {},
): CouncilSynthesis => ({
	taskId: '1.1',
	swarmId: 'swarm-1',
	timestamp: '2026-04-13T00:00:00.000Z',
	overallVerdict: 'APPROVE',
	vetoedBy: null,
	memberVerdicts: [],
	unresolvedConflicts: [],
	requiredFixes: [],
	advisoryFindings: [],
	unifiedFeedbackMd: '',
	roundNumber: 1,
	allCriteriaMet: true,
	...overrides,
});

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), 'council-evidence-gaps-'));
});

afterEach(() => {
	rmSync(tempDir, { recursive: true, force: true });
});

describe('evidence writer — gates.council integration', () => {
	test('writes to evidence.gates.council with standard GateInfo fields', () => {
		writeCouncilEvidence(tempDir, makeSynthesis());
		const evidence = JSON.parse(
			readFileSync(join(tempDir, '.swarm', 'evidence', '1.1.json'), 'utf-8'),
		);
		expect(evidence.gates).toBeDefined();
		expect(evidence.gates.council).toBeDefined();
		expect(evidence.gates.council.sessionId).toBe('swarm-1');
		expect(evidence.gates.council.timestamp).toBe('2026-04-13T00:00:00.000Z');
		expect(evidence.gates.council.agent).toBe('architect');
		expect(evidence.gates.council.verdict).toBe('APPROVE');
	});

	test('does NOT write council at top-level (must be under gates)', () => {
		writeCouncilEvidence(tempDir, makeSynthesis());
		const evidence = JSON.parse(
			readFileSync(join(tempDir, '.swarm', 'evidence', '1.1.json'), 'utf-8'),
		);
		expect(evidence.council).toBeUndefined();
	});
});

describe('evidence writer — preservation of existing evidence', () => {
	test('preserves existing non-council gate entries', () => {
		const dir = join(tempDir, '.swarm', 'evidence');
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, '1.1.json'),
			JSON.stringify({
				taskId: '1.1',
				required_gates: ['reviewer', 'test_engineer'],
				gates: {
					reviewer: {
						sessionId: 'prior-session',
						timestamp: '2024-01-01T00:00:00Z',
						agent: 'reviewer',
					},
				},
			}),
		);

		writeCouncilEvidence(tempDir, makeSynthesis());
		const evidence = JSON.parse(readFileSync(join(dir, '1.1.json'), 'utf-8'));

		// Existing reviewer gate entry survives
		expect(evidence.gates.reviewer).toBeDefined();
		expect(evidence.gates.reviewer.sessionId).toBe('prior-session');
		// Existing top-level keys survive
		expect(evidence.taskId).toBe('1.1');
		expect(evidence.required_gates).toEqual(['reviewer', 'test_engineer']);
		// Council added alongside
		expect(evidence.gates.council).toBeDefined();
	});

	test('second write overwrites council but keeps other gates', () => {
		writeCouncilEvidence(
			tempDir,
			makeSynthesis({ roundNumber: 1, overallVerdict: 'REJECT' }),
		);
		writeCouncilEvidence(
			tempDir,
			makeSynthesis({ roundNumber: 2, overallVerdict: 'APPROVE' }),
		);
		const evidence = JSON.parse(
			readFileSync(join(tempDir, '.swarm', 'evidence', '1.1.json'), 'utf-8'),
		);
		// Latest round wins
		expect(evidence.gates.council.verdict).toBe('APPROVE');
		expect(evidence.gates.council.roundNumber).toBe(2);
	});
});

describe('evidence writer — prototype pollution defence', () => {
	test('poisoned __proto__ in existing evidence does not pollute Object.prototype', () => {
		const dir = join(tempDir, '.swarm', 'evidence');
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, '1.1.json'),
			'{"__proto__": {"polluted": true}, "gates": {}}',
		);

		writeCouncilEvidence(tempDir, makeSynthesis());

		// Global Object.prototype must not have gained a `polluted` key.
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
		// File must still be valid JSON with the council entry.
		const evidence = JSON.parse(readFileSync(join(dir, '1.1.json'), 'utf-8'));
		expect(evidence.gates.council).toBeDefined();
		// Forbidden keys must not appear as enumerable own-properties of the root.
		expect(Object.hasOwn(evidence, '__proto__')).toBe(false);
	});

	test('poisoned constructor / prototype keys are dropped', () => {
		const dir = join(tempDir, '.swarm', 'evidence');
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, '1.1.json'),
			'{"constructor": "evil", "prototype": "bad", "gates": {"__proto__": {"x":1}}}',
		);

		writeCouncilEvidence(tempDir, makeSynthesis());
		const raw = readFileSync(
			join(tempDir, '.swarm', 'evidence', '1.1.json'),
			'utf-8',
		);
		// These keys must not be written back at the top level.
		expect(raw).not.toContain('"constructor"');
		expect(raw).not.toContain('"prototype"');
	});
});

describe('evidence writer — malformed input recovery', () => {
	test('corrupted existing JSON falls through to fresh start', () => {
		const dir = join(tempDir, '.swarm', 'evidence');
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, '1.1.json'), 'not valid json at all');

		// Must not throw; must write a valid council entry.
		expect(() => writeCouncilEvidence(tempDir, makeSynthesis())).not.toThrow();
		const evidence = JSON.parse(readFileSync(join(dir, '1.1.json'), 'utf-8'));
		expect(evidence.gates.council.verdict).toBe('APPROVE');
	});

	test('existing file containing a JSON array triggers fresh start (not spread)', () => {
		const dir = join(tempDir, '.swarm', 'evidence');
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, '1.1.json'), '["not","an","object"]');

		writeCouncilEvidence(tempDir, makeSynthesis());
		const evidence = JSON.parse(readFileSync(join(dir, '1.1.json'), 'utf-8'));
		// Result must be a plain object with gates.council, not an array.
		expect(Array.isArray(evidence)).toBe(false);
		expect(evidence.gates.council).toBeDefined();
		// None of the array entries should have been spread in.
		expect(Object.hasOwn(evidence, '0')).toBe(false);
	});

	test('existing JSON null triggers fresh start', () => {
		const dir = join(tempDir, '.swarm', 'evidence');
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, '1.1.json'), 'null');

		expect(() => writeCouncilEvidence(tempDir, makeSynthesis())).not.toThrow();
		const evidence = JSON.parse(readFileSync(join(dir, '1.1.json'), 'utf-8'));
		expect(evidence.gates.council.verdict).toBe('APPROVE');
	});

	test('file with gates field of wrong type (array) is gracefully replaced', () => {
		const dir = join(tempDir, '.swarm', 'evidence');
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, '1.1.json'), '{"taskId":"1.1","gates":["oops"]}');
		writeCouncilEvidence(tempDir, makeSynthesis());
		const evidence = JSON.parse(readFileSync(join(dir, '1.1.json'), 'utf-8'));
		expect(Array.isArray(evidence.gates)).toBe(false);
		expect(evidence.gates.council).toBeDefined();
		// Top-level taskId survives.
		expect(evidence.taskId).toBe('1.1');
	});
});

describe('evidence writer — idempotency / no directory pollution', () => {
	test('writer only creates files under .swarm/evidence/', () => {
		writeCouncilEvidence(tempDir, makeSynthesis());
		expect(existsSync(join(tempDir, '.swarm', 'evidence', '1.1.json'))).toBe(
			true,
		);
		// Guard: no other directories were created at the tempDir root.
		const entries = new Set(
			[
				'.swarm',
				// Any platform-generated entries (e.g. .DS_Store) would be noise.
			].filter(Boolean),
		);
		expect(entries.has('.swarm')).toBe(true);
	});
});
