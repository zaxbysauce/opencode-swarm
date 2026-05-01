/**
 * Unit tests for `submit_phase_council_verdicts`.
 *
 * Covers quorum enforcement, evidence file write, config gate,
 * working directory pass-through, and args validation.
 */

import { describe, expect, test } from 'bun:test';
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

const writeConfig = (dir: string, council: Record<string, unknown>): void => {
	mkdirSync(join(dir, '.opencode'), { recursive: true });
	writeFileSync(
		join(dir, '.opencode', 'opencode-swarm.json'),
		JSON.stringify({ council }),
	);
};

const makeVerdict = (
	agent: string,
	verdict: 'APPROVE' | 'CONCERNS' | 'REJECT' = 'APPROVE',
): Record<string, unknown> => ({
	agent,
	verdict,
	confidence: 0.9,
	findings: [],
	criteriaAssessed: [],
	criteriaUnmet: [],
	durationMs: 10,
});

const ALL_5_VERDICTS = [
	makeVerdict('critic'),
	makeVerdict('reviewer'),
	makeVerdict('sme'),
	makeVerdict('test_engineer'),
	makeVerdict('explorer'),
];

const THREE_VERDICTS = [
	makeVerdict('critic'),
	makeVerdict('reviewer'),
	makeVerdict('sme'),
];

describe('submit_phase_council_verdicts — config gate', () => {
	test('council.enabled=false → returns config-disabled error', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'spcv-disabled-'));
		try {
			writeConfig(tempDir, { enabled: false });
			const { submit_phase_council_verdicts } = await import(
				'../../../src/tools/submit-phase-council-verdicts'
			);
			const result = await submit_phase_council_verdicts.execute(
				{
					phaseNumber: 1,
					swarmId: 'test',
					phaseSummary: 'Phase 1 complete.',
					verdicts: ALL_5_VERDICTS,
					working_directory: tempDir,
				},
				{ directory: tempDir },
			);
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.reason).toContain('council feature is disabled');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});

describe('submit_phase_council_verdicts — quorum enforcement', () => {
	test('2 verdicts with default minimumMembers=3 → insufficient_quorum', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'spcv-quorum-2-'));
		try {
			writeConfig(tempDir, { enabled: true });
			const { submit_phase_council_verdicts } = await import(
				'../../../src/tools/submit-phase-council-verdicts'
			);
			const result = await submit_phase_council_verdicts.execute(
				{
					phaseNumber: 1,
					swarmId: 'test',
					phaseSummary: 'Phase 1.',
					verdicts: [makeVerdict('critic'), makeVerdict('reviewer')],
					working_directory: tempDir,
				},
				{ directory: tempDir },
			);
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.reason).toBe('insufficient_quorum');
			expect(parsed.quorumRequired).toBe(3);
			expect(parsed.membersVoted).toEqual(
				expect.arrayContaining(['critic', 'reviewer']),
			);
			expect(parsed.membersAbsent).toHaveLength(3);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	test('3 verdicts with default minimumMembers=3 → quorum met, success', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'spcv-quorum-3-'));
		try {
			writeConfig(tempDir, { enabled: true });
			const { submit_phase_council_verdicts } = await import(
				'../../../src/tools/submit-phase-council-verdicts'
			);
			const result = await submit_phase_council_verdicts.execute(
				{
					phaseNumber: 1,
					swarmId: 'test',
					phaseSummary: 'Phase 1 complete.',
					verdicts: THREE_VERDICTS,
					working_directory: tempDir,
				},
				{ directory: tempDir },
			);
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(true);
			expect(parsed.quorumMet).toBe(true);
			expect(parsed.quorumSize).toBe(3);
			expect(parsed.membersAbsent).toHaveLength(2);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	test('5 verdicts → all members voted, success', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'spcv-quorum-5-'));
		try {
			writeConfig(tempDir, { enabled: true });
			const { submit_phase_council_verdicts } = await import(
				'../../../src/tools/submit-phase-council-verdicts'
			);
			const result = await submit_phase_council_verdicts.execute(
				{
					phaseNumber: 1,
					swarmId: 'test',
					phaseSummary: 'Phase 1 complete.',
					verdicts: ALL_5_VERDICTS,
					working_directory: tempDir,
				},
				{ directory: tempDir },
			);
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(true);
			expect(parsed.quorumSize).toBe(5);
			expect(parsed.membersAbsent).toHaveLength(0);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	test('requireAllMembers=true with 3 verdicts → insufficient_quorum (needs 5)', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'spcv-require-all-'));
		try {
			writeConfig(tempDir, { enabled: true, requireAllMembers: true });
			const { submit_phase_council_verdicts } = await import(
				'../../../src/tools/submit-phase-council-verdicts'
			);
			const result = await submit_phase_council_verdicts.execute(
				{
					phaseNumber: 1,
					swarmId: 'test',
					phaseSummary: 'Phase 1.',
					verdicts: THREE_VERDICTS,
					working_directory: tempDir,
				},
				{ directory: tempDir },
			);
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.reason).toBe('insufficient_quorum');
			expect(parsed.quorumRequired).toBe(5);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});

describe('submit_phase_council_verdicts — evidence file write', () => {
	test('on success, phase-council.json is written at correct path', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'spcv-evidence-'));
		try {
			writeConfig(tempDir, { enabled: true });
			const { submit_phase_council_verdicts } = await import(
				'../../../src/tools/submit-phase-council-verdicts'
			);
			const result = await submit_phase_council_verdicts.execute(
				{
					phaseNumber: 2,
					swarmId: 'mega',
					phaseSummary: 'Phase 2 complete with all tasks done.',
					roundNumber: 1,
					verdicts: ALL_5_VERDICTS,
					working_directory: tempDir,
				},
				{ directory: tempDir },
			);
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(true);

			const evidencePath = join(
				tempDir,
				'.swarm',
				'evidence',
				'2',
				'phase-council.json',
			);
			expect(existsSync(evidencePath)).toBe(true);
			const evidence = JSON.parse(readFileSync(evidencePath, 'utf-8'));
			expect(evidence.entries).toBeDefined();
			expect(evidence.entries[0].type).toBe('phase-council');
			expect(evidence.entries[0].phase_number).toBe(2);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	test('evidence file path matches response evidencePath field', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'spcv-path-match-'));
		try {
			writeConfig(tempDir, { enabled: true });
			const { submit_phase_council_verdicts } = await import(
				'../../../src/tools/submit-phase-council-verdicts'
			);
			const result = await submit_phase_council_verdicts.execute(
				{
					phaseNumber: 1,
					swarmId: 'test',
					phaseSummary: 'Phase 1.',
					verdicts: ALL_5_VERDICTS,
					working_directory: tempDir,
				},
				{ directory: tempDir },
			);
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(true);
			expect(parsed.evidencePath).toBe('.swarm/evidence/1/phase-council.json');
			expect(existsSync(join(tempDir, parsed.evidencePath))).toBe(true);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	test('on quorum failure, no evidence file is written', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'spcv-no-evidence-'));
		try {
			writeConfig(tempDir, { enabled: true });
			const { submit_phase_council_verdicts } = await import(
				'../../../src/tools/submit-phase-council-verdicts'
			);
			await submit_phase_council_verdicts.execute(
				{
					phaseNumber: 1,
					swarmId: 'test',
					phaseSummary: 'Phase 1.',
					verdicts: [makeVerdict('critic')],
					working_directory: tempDir,
				},
				{ directory: tempDir },
			);
			const evidencePath = join(
				tempDir,
				'.swarm',
				'evidence',
				'1',
				'phase-council.json',
			);
			expect(existsSync(evidencePath)).toBe(false);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});

describe('submit_phase_council_verdicts — args validation', () => {
	test('missing required field returns validation error', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'spcv-invalid-'));
		try {
			writeConfig(tempDir, { enabled: true });
			const { submit_phase_council_verdicts } = await import(
				'../../../src/tools/submit-phase-council-verdicts'
			);
			const result = await submit_phase_council_verdicts.execute(
				{
					// missing phaseNumber
					swarmId: 'test',
					phaseSummary: 'Phase.',
					verdicts: ALL_5_VERDICTS,
					working_directory: tempDir,
				},
				{ directory: tempDir },
			);
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.reason).toBe('invalid arguments');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
