/**
 * Work Complete Council — pre-declaration criteria writer/reader.
 *
 * Stores acceptance criteria under .swarm/council/{safeId}.json so they can be
 * read back during council evaluation.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CouncilCriteria, CouncilCriteriaItem } from './types';

const COUNCIL_DIR = '.swarm/council';

export function writeCriteria(
	workingDir: string,
	taskId: string,
	criteria: CouncilCriteriaItem[],
): void {
	const dir = join(workingDir, COUNCIL_DIR);
	mkdirSync(dir, { recursive: true });
	const payload: CouncilCriteria = {
		taskId,
		criteria,
		declaredAt: new Date().toISOString(),
	};
	writeFileSync(
		join(dir, `${safeId(taskId)}.json`),
		JSON.stringify(payload, null, 2),
	);
}

export function readCriteria(
	workingDir: string,
	taskId: string,
): CouncilCriteria | null {
	const filePath = join(workingDir, COUNCIL_DIR, `${safeId(taskId)}.json`);
	if (!existsSync(filePath)) return null;
	try {
		const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown;
		if (
			parsed &&
			typeof parsed === 'object' &&
			typeof (parsed as CouncilCriteria).taskId === 'string' &&
			Array.isArray((parsed as CouncilCriteria).criteria)
		) {
			return parsed as CouncilCriteria;
		}
		return null;
	} catch {
		return null;
	}
}

// Sanitizes taskId to a safe filename for .swarm/council/ storage (dots → underscores).
// This differs intentionally from council-evidence-writer.ts which uses the raw taskId
// (under VALID_TASK_ID regex guard) to match check_gate_status/gate-evidence filename conventions.
function safeId(id: string): string {
	return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}
