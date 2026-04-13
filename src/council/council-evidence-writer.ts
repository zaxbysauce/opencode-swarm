/**
 * Work Complete Council — evidence writer.
 *
 * Stamps council synthesis result into .swarm/evidence/{taskId}.json under a
 * `council` key, so downstream evidence consumers (notably check_gate_status
 * and update-task-status) observe the council gate at the same path they
 * already read. Existing fields in the evidence file are preserved.
 *
 * The raw taskId is used as the filename — matching check-gate-status.ts and
 * update-task-status.ts. The canonical taskId format (/^\d+\.\d+(\.\d+)*$/)
 * contains only digits and dots, so the filename carries no path-traversal
 * risk. Defense in depth: we re-validate format here before any FS op.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CouncilSynthesis } from './types';

const EVIDENCE_DIR = '.swarm/evidence';
const VALID_TASK_ID = /^\d+\.\d+(\.\d+)*$/;

export function writeCouncilEvidence(
	workingDir: string,
	synthesis: CouncilSynthesis,
): void {
	// Defense in depth — library-level writer should not trust upstream validation.
	if (!VALID_TASK_ID.test(synthesis.taskId)) {
		throw new Error(
			`writeCouncilEvidence: invalid taskId "${synthesis.taskId}" — must match N.M or N.M.P format`,
		);
	}

	const dir = join(workingDir, EVIDENCE_DIR);
	mkdirSync(dir, { recursive: true });

	const filePath = join(dir, `${synthesis.taskId}.json`);
	let existing: Record<string, unknown> = {};
	if (existsSync(filePath)) {
		try {
			const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				existing = parsed as Record<string, unknown>;
			}
		} catch {
			// Corrupted evidence file — start fresh rather than crashing.
		}
	}

	const updated = {
		...existing,
		council: {
			verdict: synthesis.overallVerdict,
			vetoedBy: synthesis.vetoedBy,
			roundNumber: synthesis.roundNumber,
			allCriteriaMet: synthesis.allCriteriaMet,
			timestamp: synthesis.timestamp,
		},
	};

	writeFileSync(filePath, JSON.stringify(updated, null, 2));
}
