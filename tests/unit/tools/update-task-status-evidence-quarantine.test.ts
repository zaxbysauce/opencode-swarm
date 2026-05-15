/**
 * Issue #862: Quarantine on malformed evidence files.
 *
 * Verifies that `checkReviewerGate` no longer instructs agents to delete
 * malformed evidence files. When `readTaskEvidenceRaw` throws a non-ENOENT
 * error (corrupt JSON, permission error, schema mismatch) the helper:
 *   1. Renames the bad file to `<taskId>.corrupt-<ts>-<rand>.json`.
 *   2. Falls through to session-state evaluation instead of returning
 *      `{ blocked: true, reason: '... or delete it ...' }`.
 *   3. Never emits the "Fix the file at … or delete it" instruction.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { resetSwarmState } from '../../../src/state';
import { checkReviewerGate } from '../../../src/tools/update-task-status';

let tempDir: string;

beforeEach(async () => {
	resetSwarmState();
	tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'evidence-quarantine-'));
	fs.mkdirSync(path.join(tempDir, '.swarm', 'evidence'), { recursive: true });
});

afterEach(async () => {
	resetSwarmState();
	try {
		await fsp.rm(tempDir, { recursive: true, force: true });
	} catch {
		// best-effort
	}
});

function evidencePath(taskId: string): string {
	return path.join(tempDir, '.swarm', 'evidence', `${taskId}.json`);
}

function listEvidenceDir(): string[] {
	return fs.readdirSync(path.join(tempDir, '.swarm', 'evidence'));
}

describe('issue #862: malformed evidence quarantine', () => {
	it('quarantines a malformed evidence file rather than asking the agent to delete it', () => {
		fs.writeFileSync(evidencePath('4.4'), 'this is not json {{{');

		const result = checkReviewerGate('4.4', tempDir);

		// 1. The original file no longer exists at its canonical path.
		expect(fs.existsSync(evidencePath('4.4'))).toBe(false);

		// 2. A quarantine file has been created.
		const remaining = listEvidenceDir();
		const quarantined = remaining.find((f) =>
			/^4\.4\.corrupt-\d+-[0-9a-f]+\.json$/.test(f),
		);
		expect(quarantined).toBeDefined();

		// 3. The result must NOT contain the destructive "delete it" guidance.
		expect(result.reason).not.toMatch(/delete it/i);
		expect(result.reason).not.toMatch(/corrupt or unreadable/i);
	});

	it('falls through cleanly when no session state and no plan exist', () => {
		fs.writeFileSync(evidencePath('4.4'), 'not-json');

		const result = checkReviewerGate('4.4', tempDir);

		// With no session state, the gate falls through to allow (test-context behavior).
		expect(result.blocked).toBe(false);
	});

	it('does NOT quarantine when the evidence file is missing (ENOENT path is unchanged)', () => {
		// No file at all.
		const result = checkReviewerGate('5.5', tempDir);
		expect(result.blocked).toBe(false);
		// Directory should remain empty (no quarantine artifact).
		expect(listEvidenceDir()).toEqual([]);
	});

	it('survives back-to-back quarantines without filename collision', () => {
		// First corruption + check
		fs.writeFileSync(evidencePath('6.1'), 'bad-1');
		checkReviewerGate('6.1', tempDir);
		// Re-create another corrupt file at the same canonical path
		fs.writeFileSync(evidencePath('6.1'), 'bad-2');
		checkReviewerGate('6.1', tempDir);

		const remaining = listEvidenceDir();
		const quarantined = remaining.filter((f) =>
			/^6\.1\.corrupt-\d+-[0-9a-f]+\.json$/.test(f),
		);
		// Both quarantines must coexist — the random suffix prevents collisions
		// even when Date.now() returns the same millisecond.
		expect(quarantined.length).toBe(2);
	});

	it('preserves valid evidence end-to-end (no quarantine)', () => {
		const validEvidence = {
			taskId: '7.1',
			required_gates: ['reviewer', 'test_engineer'],
			gates: {
				reviewer: {
					sessionId: 's1',
					timestamp: new Date().toISOString(),
					agent: 'reviewer',
				},
				test_engineer: {
					sessionId: 's2',
					timestamp: new Date().toISOString(),
					agent: 'test_engineer',
				},
			},
		};
		fs.writeFileSync(evidencePath('7.1'), JSON.stringify(validEvidence));

		const result = checkReviewerGate('7.1', tempDir);

		expect(result.blocked).toBe(false);
		// Original file untouched.
		expect(fs.existsSync(evidencePath('7.1'))).toBe(true);
		// No quarantine.
		const remaining = listEvidenceDir();
		expect(remaining.some((f) => f.includes('.corrupt-'))).toBe(false);
	});
});
