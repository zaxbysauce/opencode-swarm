/**
 * Promotion-evidence writer for Epic Mode (Capability C).
 *
 * Each activation decision (one per phase per session) appends a single
 * JSON line to `.swarm/evidence/epic-promotions.jsonl`. The file is
 * line-delimited so partial writes are tolerable — readers can skip a
 * truncated trailing line and continue.
 *
 * The write is intentionally append-mode (not atomic-rename) because
 * each line is a self-contained record and the file is monotonically
 * growing. Per AGENTS.md invariant 4, writes go under `ctx.directory`,
 * never `process.cwd()`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { EpicActivationVerdict } from './activation.js';

/** What `appendPromotionEvidence` writes per decision. */
export interface PromotionEvidenceRecord {
	/** ISO 8601 timestamp of the decision. */
	timestamp: string;
	/** Session that made the decision (so multi-session usage stays auditable). */
	sessionID: string;
	/** Phase the decision applied to (Capability C operates per-plan but each
	 *  phase invokes the runner; we record per phase for granular telemetry). */
	phase?: number;
	/** The decision and the rationale, copied from the activation verdict. */
	verdict: EpicActivationVerdict;
}

const EVIDENCE_REL_DIR = path.join('.swarm', 'evidence');
const EVIDENCE_FILE = 'epic-promotions.jsonl';

/**
 * Append one decision record to `.swarm/evidence/epic-promotions.jsonl`.
 *
 * Returns the absolute path of the file written. On any I/O failure the
 * error is rethrown — the caller decides whether to surface a warning to
 * the user or fail closed. Returns null when the directory itself cannot
 * be created (best-effort fail-soft so a missing `.swarm/` does not break
 * the activation flow's primary verdict).
 */
export function appendPromotionEvidence(
	directory: string,
	record: PromotionEvidenceRecord,
): string | null {
	let evidenceDir: string;
	try {
		evidenceDir = path.join(directory, EVIDENCE_REL_DIR);
		fs.mkdirSync(evidenceDir, { recursive: true });
	} catch {
		// Best-effort: if `.swarm/evidence/` cannot be created, surface null so
		// the caller can decide whether to warn the user. The activation flow
		// itself does not depend on this write.
		return null;
	}

	const filePath = path.join(evidenceDir, EVIDENCE_FILE);
	const line = `${JSON.stringify(record)}\n`;
	fs.appendFileSync(filePath, line, 'utf-8');
	return filePath;
}

/**
 * Read all evidence records from the JSONL file. Convenience for
 * `/swarm epic status` and tests. Skips malformed lines (best-effort
 * tolerance for the rare partial-write case).
 */
export function readPromotionEvidence(
	directory: string,
): PromotionEvidenceRecord[] {
	const filePath = path.join(directory, EVIDENCE_REL_DIR, EVIDENCE_FILE);
	if (!fs.existsSync(filePath)) {
		return [];
	}
	const raw = fs.readFileSync(filePath, 'utf-8');
	const lines = raw.split('\n').filter((l) => l.trim().length > 0);
	const records: PromotionEvidenceRecord[] = [];
	for (const line of lines) {
		try {
			records.push(JSON.parse(line) as PromotionEvidenceRecord);
		} catch {
			// Skip malformed line. A partial write of one line never corrupts
			// the well-formed lines before it.
		}
	}
	return records;
}
