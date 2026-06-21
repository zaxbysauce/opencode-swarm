/**
 * Tests for the `/swarm coupling` command handler.
 * File: tests/unit/commands/coupling.test.ts
 *
 * Covers:
 *  - Argument parsing: --phase, --threshold, --min-co-changes, --format, --persist.
 *  - Invalid argument rejection (out-of-range, missing value, unknown flag).
 *  - No plan present → friendly message.
 *  - Phase scoping (default = whole plan; --phase N = single phase).
 *  - Format switching (markdown / json).
 *  - --persist writes structured JSON under .swarm/epic/.
 *  - Uses _internals DI seam (no mock.module).
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	_internals,
	handleCouplingCommand,
} from '../../../src/commands/coupling';

const realInternals = { ..._internals };

function makePlan(): {
	phases: Array<{
		id: number;
		name: string;
		tasks: Array<{
			id: string;
			description: string;
			status: string;
			files_touched?: string[];
		}>;
	}>;
} {
	return {
		phases: [
			{
				id: 1,
				name: 'Phase 1',
				tasks: [
					{
						id: '1.1',
						description: 'a',
						status: 'pending',
						files_touched: ['src/a.ts'],
					},
					{
						id: '1.2',
						description: 'a-duplicate',
						status: 'pending',
						files_touched: ['src/a.ts'],
					},
					{
						id: '1.3',
						description: 'b',
						status: 'pending',
						files_touched: ['src/b.ts'],
					},
				],
			},
			{
				id: 2,
				name: 'Phase 2',
				tasks: [
					{
						id: '2.1',
						description: 'c',
						status: 'pending',
						files_touched: ['src/c.ts'],
					},
				],
			},
		],
	};
}

let tmpDir: string;

beforeEach(() => {
	tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'coupling-')));
	_internals.loadPlanJsonOnly = realInternals.loadPlanJsonOnly;
	_internals.getCoChangePairs = realInternals.getCoChangePairs;
});

afterEach(() => {
	_internals.loadPlanJsonOnly = realInternals.loadPlanJsonOnly;
	_internals.getCoChangePairs = realInternals.getCoChangePairs;
	try {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	} catch {
		// best-effort cleanup
	}
});

describe('handleCouplingCommand — argument parsing', () => {
	test('rejects unknown flag', async () => {
		_internals.loadPlanJsonOnly = (async () => makePlan()) as never;
		_internals.getCoChangePairs = (async () => []) as never;
		const out = await handleCouplingCommand(tmpDir, ['--bogus']);
		expect(out).toContain('Error');
		expect(out).toContain('unknown argument');
	});

	test('rejects --phase without value', async () => {
		const out = await handleCouplingCommand(tmpDir, ['--phase']);
		expect(out).toContain('--phase requires');
	});

	test('rejects --phase with non-numeric value', async () => {
		const out = await handleCouplingCommand(tmpDir, ['--phase', 'abc']);
		expect(out).toContain('--phase must be a positive integer');
	});

	test('rejects --threshold outside [-1, 1]', async () => {
		const out = await handleCouplingCommand(tmpDir, ['--threshold', '1.5']);
		expect(out).toContain('--threshold must be a number in [-1, 1]');
	});

	test('rejects --format other than markdown|json', async () => {
		const out = await handleCouplingCommand(tmpDir, ['--format', 'xml']);
		expect(out).toContain("--format must be 'markdown' or 'json'");
	});

	test('rejects --min-co-changes with zero or negative', async () => {
		const out = await handleCouplingCommand(tmpDir, ['--min-co-changes', '0']);
		expect(out).toContain('--min-co-changes must be a positive integer');
	});

	test('rejects --phase with decimal (silent-truncation guard)', async () => {
		const out = await handleCouplingCommand(tmpDir, ['--phase', '1.5']);
		expect(out).toContain('--phase must be a positive integer');
	});

	test('rejects --min-co-changes with decimal', async () => {
		const out = await handleCouplingCommand(tmpDir, [
			'--min-co-changes',
			'3.9',
		]);
		expect(out).toContain('--min-co-changes must be a positive integer');
	});

	test('accepts all flags together', async () => {
		_internals.loadPlanJsonOnly = (async () => makePlan()) as never;
		_internals.getCoChangePairs = (async () => []) as never;
		const out = await handleCouplingCommand(tmpDir, [
			'--phase',
			'1',
			'--threshold',
			'0.5',
			'--min-co-changes',
			'3',
			'--format',
			'markdown',
		]);
		expect(out).toContain('## Coupling Report');
	});
});

describe('handleCouplingCommand — no plan', () => {
	test('returns friendly message when plan is missing', async () => {
		_internals.loadPlanJsonOnly = (async () => null) as never;
		const out = await handleCouplingCommand(tmpDir, []);
		expect(out).toContain('No plan found');
		expect(out).toContain('.swarm/plan.json');
	});
});

describe('handleCouplingCommand — phase scoping', () => {
	test('default (no --phase) considers all phases', async () => {
		_internals.loadPlanJsonOnly = (async () => makePlan()) as never;
		_internals.getCoChangePairs = (async () => []) as never;
		const out = await handleCouplingCommand(tmpDir, ['--format', 'json']);
		const report = JSON.parse(out);
		// Four tasks total across the two phases.
		expect(report.taskCount).toBe(4);
		// (1.1, 1.2) conflicts on src/a.ts → 1 conflicting pair out of C(4,2)=6.
		expect(report.totalPairs).toBe(6);
		expect(report.conflictingPairCount).toBe(1);
	});

	test('--phase N scopes to one phase only', async () => {
		_internals.loadPlanJsonOnly = (async () => makePlan()) as never;
		_internals.getCoChangePairs = (async () => []) as never;
		const out = await handleCouplingCommand(tmpDir, [
			'--phase',
			'1',
			'--format',
			'json',
		]);
		const report = JSON.parse(out);
		// Phase 1 has 3 tasks: 1.1, 1.2 (conflict on src/a.ts), 1.3.
		expect(report.taskCount).toBe(3);
		expect(report.totalPairs).toBe(3);
		expect(report.conflictingPairCount).toBe(1);
	});

	test('--phase that does not exist returns helpful error', async () => {
		_internals.loadPlanJsonOnly = (async () => makePlan()) as never;
		_internals.getCoChangePairs = (async () => []) as never;
		const out = await handleCouplingCommand(tmpDir, ['--phase', '99']);
		expect(out).toContain('Phase 99 not found');
		expect(out).toContain('Available phases');
	});
});

describe('handleCouplingCommand — format switching', () => {
	test('markdown (default) returns formatted text with section headers', async () => {
		_internals.loadPlanJsonOnly = (async () => makePlan()) as never;
		_internals.getCoChangePairs = (async () => []) as never;
		const out = await handleCouplingCommand(tmpDir, []);
		expect(out).toContain('## Coupling Report');
		expect(out).toContain('### Per-module contention');
	});

	test('json returns valid JSON document', async () => {
		_internals.loadPlanJsonOnly = (async () => makePlan()) as never;
		_internals.getCoChangePairs = (async () => []) as never;
		const out = await handleCouplingCommand(tmpDir, ['--format', 'json']);
		const report = JSON.parse(out);
		expect(report).toHaveProperty('p');
		expect(report).toHaveProperty('perModule');
		expect(report).toHaveProperty('roadmap');
		expect(report).toHaveProperty('conflictingPairs');
	});
});

describe('handleCouplingCommand — --persist', () => {
	test('writes JSON to .swarm/epic/coupling-report.json', async () => {
		_internals.loadPlanJsonOnly = (async () => makePlan()) as never;
		_internals.getCoChangePairs = (async () => []) as never;

		const out = await handleCouplingCommand(tmpDir, ['--persist']);
		expect(out).toContain('Wrote structured report to');
		const reportPath = path.join(
			tmpDir,
			'.swarm',
			'epic',
			'coupling-report.json',
		);
		expect(fs.existsSync(reportPath)).toBe(true);
		const persisted = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
		expect(persisted.taskCount).toBe(4);
		expect(persisted.conflictingPairCount).toBe(1);
	});

	test('--persist creates the .swarm/epic/ directory if missing', async () => {
		_internals.loadPlanJsonOnly = (async () => makePlan()) as never;
		_internals.getCoChangePairs = (async () => []) as never;

		expect(fs.existsSync(path.join(tmpDir, '.swarm', 'epic'))).toBe(false);
		await handleCouplingCommand(tmpDir, ['--persist']);
		expect(fs.existsSync(path.join(tmpDir, '.swarm', 'epic'))).toBe(true);
	});

	test('--persist does NOT leave .tmp.* leftover files in .swarm/epic/', async () => {
		_internals.loadPlanJsonOnly = (async () => makePlan()) as never;
		_internals.getCoChangePairs = (async () => []) as never;

		await handleCouplingCommand(tmpDir, ['--persist']);
		const epicDir = path.join(tmpDir, '.swarm', 'epic');
		const leftovers = fs
			.readdirSync(epicDir)
			.filter((f) => f.startsWith('coupling-report.json.tmp.'));
		expect(leftovers).toEqual([]);
	});

	test('--format json --persist embeds a persist status field in the JSON', async () => {
		_internals.loadPlanJsonOnly = (async () => makePlan()) as never;
		_internals.getCoChangePairs = (async () => []) as never;

		const out = await handleCouplingCommand(tmpDir, [
			'--persist',
			'--format',
			'json',
		]);
		const envelope = JSON.parse(out);
		expect(envelope).toHaveProperty('persist');
		expect(envelope.persist.requested).toBe(true);
		expect(envelope.persist.written).toBe(true);
		expect(envelope.persist.path).toBe('.swarm/epic/coupling-report.json');
		// Core report fields are still present.
		expect(envelope).toHaveProperty('p');
		expect(envelope).toHaveProperty('perModule');
	});

	test('--format json without --persist sets persist.requested to false', async () => {
		_internals.loadPlanJsonOnly = (async () => makePlan()) as never;
		_internals.getCoChangePairs = (async () => []) as never;

		const out = await handleCouplingCommand(tmpDir, ['--format', 'json']);
		const envelope = JSON.parse(out);
		expect(envelope.persist).toEqual({ requested: false });
	});

	test('--format json --persist surfaces a failure (not silent) when rename throws', async () => {
		_internals.loadPlanJsonOnly = (async () => makePlan()) as never;
		_internals.getCoChangePairs = (async () => []) as never;

		// Sabotage: create the target as a NON-EMPTY DIRECTORY so renameSync
		// fails with ENOTEMPTY (cross-platform: same failure path on macOS,
		// Linux, Windows).
		const epicDir = path.join(tmpDir, '.swarm', 'epic');
		const targetAsDir = path.join(epicDir, 'coupling-report.json');
		fs.mkdirSync(epicDir, { recursive: true });
		fs.mkdirSync(targetAsDir);
		fs.writeFileSync(path.join(targetAsDir, 'blocker'), 'x', 'utf-8');

		const out = await handleCouplingCommand(tmpDir, [
			'--persist',
			'--format',
			'json',
		]);
		const envelope = JSON.parse(out);
		expect(envelope.persist.requested).toBe(true);
		expect(envelope.persist.written).toBe(false);
		expect(envelope.persist).toHaveProperty('error');
		// And no orphan tmp file should remain.
		const leftovers = fs
			.readdirSync(epicDir)
			.filter((f) => f.startsWith('coupling-report.json.tmp.'));
		expect(leftovers).toEqual([]);
	});
});

describe('handleCouplingCommand — cochange signal independent of config gate', () => {
	test('co-change pairs are consulted even though we never read turbo.epic.cochange.enabled', async () => {
		// The handler does NOT load EpicConfigSchema; the signal is queried
		// directly via getCoChangePairs. This is the design decision from M2
		// scope: /swarm coupling runs as a diagnostic, independent of the
		// runtime config gate that M3's planner integration will respect.
		_internals.loadPlanJsonOnly = (async () => ({
			phases: [
				{
					id: 1,
					name: 'P',
					tasks: [
						{
							id: '1.1',
							description: 'a',
							status: 'pending',
							files_touched: ['src/a.ts'],
						},
						{
							id: '1.2',
							description: 'b',
							status: 'pending',
							files_touched: ['src/b.ts'],
						},
					],
				},
			],
		})) as never;
		// Provide a strong co-change signal connecting src/a.ts and src/b.ts.
		_internals.getCoChangePairs = (async () => [
			{
				fileA: 'src/a.ts',
				fileB: 'src/b.ts',
				coChangeCount: 20,
				npmi: 0.9,
				lift: 1,
				hasStaticEdge: false,
				totalCommits: 100,
				commitsA: 20,
				commitsB: 20,
			},
		]) as never;
		const out = await handleCouplingCommand(tmpDir, ['--format', 'json']);
		const report = JSON.parse(out);
		expect(report.conflictingPairCount).toBe(1);
		expect(report.conflictingPairs[0].reason).toBe('cochange');
	});
});
