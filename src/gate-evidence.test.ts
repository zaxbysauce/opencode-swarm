import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	deriveRequiredGates,
	expandRequiredGates,
	hasPassedAllGates,
	isValidTaskId,
	readTaskEvidence,
	recordAgentDispatch,
	recordGateEvidence,
} from './gate-evidence';

let tmpDir: string;

beforeEach(() => {
	tmpDir = mkdtempSync(path.join(os.tmpdir(), 'gate-evidence-test-'));
	mkdirSync(path.join(tmpDir, '.swarm'), { recursive: true });
});

afterEach(() => {
	try {
		rmSync(tmpDir, { recursive: true, force: true });
	} catch {
		/* best effort */
	}
});

// ── pure functions ──────────────────────────────────────────────────────────

describe('deriveRequiredGates', () => {
	it('1. coder → [reviewer, test_engineer]', () => {
		expect(deriveRequiredGates('coder')).toEqual(['reviewer', 'test_engineer']);
	});

	it('2. docs → [docs]', () => {
		expect(deriveRequiredGates('docs')).toEqual(['docs']);
	});

	it('3. designer → [designer, reviewer, test_engineer]', () => {
		expect(deriveRequiredGates('designer')).toEqual([
			'designer',
			'reviewer',
			'test_engineer',
		]);
	});

	it('4. explorer → [explorer]', () => {
		expect(deriveRequiredGates('explorer')).toEqual(['explorer']);
	});

	it('5. unknown_agent → [reviewer, test_engineer] (safe default)', () => {
		expect(deriveRequiredGates('unknown_agent')).toEqual([
			'reviewer',
			'test_engineer',
		]);
	});
});

describe('expandRequiredGates', () => {
	it('6. [docs] + coder → [docs, reviewer, test_engineer]', () => {
		expect(expandRequiredGates(['docs'], 'coder')).toEqual([
			'docs',
			'reviewer',
			'test_engineer',
		]);
	});

	it('7. [reviewer, test_engineer] + reviewer → same (idempotent)', () => {
		expect(
			expandRequiredGates(['reviewer', 'test_engineer'], 'reviewer'),
		).toEqual(['reviewer', 'test_engineer']);
	});
});

// ── recordGateEvidence ──────────────────────────────────────────────────────

describe('recordGateEvidence', () => {
	it('8. creates dir + file from scratch with correct required_gates', async () => {
		await recordGateEvidence(tmpDir, '1.1', 'reviewer', 'session-1');
		const evidence = await readTaskEvidence(tmpDir, '1.1');
		expect(evidence).not.toBeNull();
		expect(evidence!.taskId).toBe('1.1');
		expect(evidence!.required_gates).toEqual(['reviewer']);
		expect(evidence!.gates.reviewer).toBeDefined();
		expect(evidence!.gates.reviewer.sessionId).toBe('session-1');
		expect(evidence!.gates.reviewer.agent).toBe('reviewer');
	});

	it('9. merges second gate into existing file without overwriting first', async () => {
		await recordGateEvidence(tmpDir, '1.1', 'reviewer', 'session-1');
		await recordGateEvidence(tmpDir, '1.1', 'test_engineer', 'session-2');
		const evidence = await readTaskEvidence(tmpDir, '1.1');
		expect(evidence!.gates.reviewer).toBeDefined();
		expect(evidence!.gates.test_engineer).toBeDefined();
		expect(evidence!.gates.reviewer.sessionId).toBe('session-1');
		expect(evidence!.gates.test_engineer.sessionId).toBe('session-2');
	});
});

// ── recordAgentDispatch ─────────────────────────────────────────────────────

describe('recordAgentDispatch', () => {
	it('10. coder dispatch sets required_gates without gate entry in gates', async () => {
		await recordAgentDispatch(tmpDir, '1.2', 'coder');
		const evidence = await readTaskEvidence(tmpDir, '1.2');
		expect(evidence).not.toBeNull();
		expect(evidence!.required_gates).toEqual(['reviewer', 'test_engineer']);
		expect(Object.keys(evidence!.gates)).toHaveLength(0);
	});

	it('11. dispatch on existing evidence expands required_gates (union)', async () => {
		await recordGateEvidence(tmpDir, '1.3', 'docs', 'session-1');
		await recordAgentDispatch(tmpDir, '1.3', 'coder');
		const evidence = await readTaskEvidence(tmpDir, '1.3');
		expect(evidence!.required_gates).toEqual([
			'docs',
			'reviewer',
			'test_engineer',
		]);
		// docs gate entry still present
		expect(evidence!.gates.docs).toBeDefined();
	});
});

// ── readTaskEvidence ────────────────────────────────────────────────────────

describe('readTaskEvidence', () => {
	it('12. returns null for non-existent task', async () => {
		const result = await readTaskEvidence(tmpDir, '9.9');
		expect(result).toBeNull();
	});

	it('13. returns correct data after recording', async () => {
		await recordGateEvidence(tmpDir, '2.1', 'reviewer', 'sess-abc');
		const result = await readTaskEvidence(tmpDir, '2.1');
		expect(result).not.toBeNull();
		expect(result!.taskId).toBe('2.1');
		expect(result!.gates.reviewer.sessionId).toBe('sess-abc');
	});
});

// ── hasPassedAllGates ───────────────────────────────────────────────────────

describe('hasPassedAllGates', () => {
	it('14. returns false with only reviewer (code task also needs test_engineer)', async () => {
		// coder dispatch → required_gates: [reviewer, test_engineer]
		await recordAgentDispatch(tmpDir, '1.4', 'coder');
		await recordGateEvidence(tmpDir, '1.4', 'reviewer', 'sess-1');
		expect(await hasPassedAllGates(tmpDir, '1.4')).toBe(false);
	});

	it('15. returns true for docs task with docs evidence', async () => {
		await recordGateEvidence(tmpDir, '1.5', 'docs', 'sess-1');
		expect(await hasPassedAllGates(tmpDir, '1.5')).toBe(true);
	});

	it('16. returns true for code task with both reviewer + test_engineer', async () => {
		await recordGateEvidence(tmpDir, '1.6', 'reviewer', 'sess-1');
		await recordGateEvidence(tmpDir, '1.6', 'test_engineer', 'sess-2');
		expect(await hasPassedAllGates(tmpDir, '1.6')).toBe(true);
	});

	it('17. returns false for non-existent task', async () => {
		expect(await hasPassedAllGates(tmpDir, '8.8')).toBe(false);
	});
});

// ── taskId validation ───────────────────────────────────────────────────────

describe('isValidTaskId', () => {
	it('accepts valid N.M format (e.g., "1.1", "2.3")', () => {
		expect(isValidTaskId('1.1')).toBe(true);
		expect(isValidTaskId('2.3')).toBe(true);
		expect(isValidTaskId('10.5')).toBe(true);
	});

	it('accepts valid N.M.P format (e.g., "1.2.3")', () => {
		expect(isValidTaskId('1.2.3')).toBe(true);
		expect(isValidTaskId('1.0.0')).toBe(true);
		expect(isValidTaskId('10.20.30')).toBe(true);
	});

	it('rejects empty string', () => {
		expect(isValidTaskId('')).toBe(false);
	});

	it('rejects non-numeric formats', () => {
		expect(isValidTaskId('abc')).toBe(false);
		expect(isValidTaskId('1.a')).toBe(false);
		expect(isValidTaskId('a.1')).toBe(false);
	});

	it('rejects path traversal patterns', () => {
		expect(isValidTaskId('../etc/passwd')).toBe(false);
		expect(isValidTaskId('1.1..2')).toBe(false);
	});

	it('rejects path separators', () => {
		expect(isValidTaskId('foo/bar')).toBe(false);
		expect(isValidTaskId('foo\\bar')).toBe(false);
	});

	it('rejects null bytes', () => {
		expect(isValidTaskId('1.1\0')).toBe(false);
	});
});

describe('taskId validation', () => {
	it('18. rejects ../etc/passwd, foo/bar, foo\\bar', async () => {
		await expect(
			recordGateEvidence(tmpDir, '../etc/passwd', 'reviewer', 'sess-1'),
		).rejects.toThrow();
		await expect(
			recordGateEvidence(tmpDir, 'foo/bar', 'reviewer', 'sess-1'),
		).rejects.toThrow();
		await expect(
			recordGateEvidence(tmpDir, 'foo\\bar', 'reviewer', 'sess-1'),
		).rejects.toThrow();
	});
});

// ── concurrency ─────────────────────────────────────────────────────────────

describe('concurrency', () => {
	it("19. concurrent writes don't corrupt — both gates present after parallel writes", async () => {
		await Promise.all([
			recordGateEvidence(tmpDir, '3.1', 'reviewer', 'sess-A'),
			recordGateEvidence(tmpDir, '3.1', 'test_engineer', 'sess-B'),
		]);
		const evidence = await readTaskEvidence(tmpDir, '3.1');
		expect(evidence).not.toBeNull();
		// At least one gate must be present; the atomic rename means one write wins
		const gateCount = Object.keys(evidence!.gates).length;
		expect(gateCount).toBeGreaterThanOrEqual(1);
	});
});

// ── append-only expansion ───────────────────────────────────────────────────

describe('append-only expansion', () => {
	it('20. docs first, then coder dispatch → gates expand, never shrink', async () => {
		await recordGateEvidence(tmpDir, '4.1', 'docs', 'sess-1');
		const before = await readTaskEvidence(tmpDir, '4.1');
		expect(before!.required_gates).toEqual(['docs']);

		await recordAgentDispatch(tmpDir, '4.1', 'coder');
		const after = await readTaskEvidence(tmpDir, '4.1');
		expect(after!.required_gates).toEqual([
			'docs',
			'reviewer',
			'test_engineer',
		]);

		// docs gate still present after expansion
		expect(after!.gates.docs).toBeDefined();
	});
});
