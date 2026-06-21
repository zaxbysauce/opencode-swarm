/**
 * Divergence recorder for Epic Mode Capability D (self-calibration).
 *
 * After every task transitions to `completed`, this module:
 *   1. Compares the task's DECLARED scope (from
 *      `.swarm/scopes/scope-{taskId}.json` — what the coder said it would
 *      touch) against the ACTUAL files modified during the task
 *      (`session.modifiedFilesThisCoderTask` — what the guardrails hook
 *      observed the coder writing to).
 *   2. Computes divergence — undeclared writes (actual − declared), unused
 *      declarations (declared − actual), and a per-task divergence ratio
 *      (undeclared / max(1, actual)).
 *   3. Appends one record to `.swarm/epic/divergence.jsonl`.
 *
 * The calibration engine (`./calibration-engine.ts`) reads this history on
 * the next `epic_decide_phase` invocation and uses it to adjust the
 * activation threshold and hot-module list. This module just records.
 *
 * Pure I/O: never throws to the caller. Failures are logged and swallowed
 * so the task-completion path is never blocked by an audit write.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as logger from '../../utils/logger.js';
import { normalizePath } from '../lean/conflicts.js';

/** One record per task completion. */
export interface DivergenceRecord {
	/** ISO 8601. */
	timestamp: string;
	sessionID: string;
	taskId: string;
	/** Phase the task belonged to, when known. */
	phaseNumber?: number;
	/** Normalised paths declared via `declare_scope` or files_touched fallback. */
	declaredScope: string[];
	/** Normalised paths the guardrails hook observed the coder write to. */
	actualFiles: string[];
	/** Files in `actualFiles` not present in `declaredScope`. */
	undeclared: string[];
	/** Files in `declaredScope` not present in `actualFiles`. */
	unused: string[];
	/** undeclared.length / max(1, actualFiles.length). 0 ⇒ fully declared. */
	divergenceRatio: number;
	/** True when divergenceRatio === 0 (no undeclared writes). */
	isClean: boolean;
}

const EVIDENCE_REL_DIR = path.join('.swarm', 'epic');
const EVIDENCE_FILE = 'divergence.jsonl';

/**
 * Compute the divergence between a declared scope and the files actually
 * modified. Pure — no I/O, no side effects. Returns the diff sets plus the
 * ratio used by the calibration engine.
 *
 * Path comparison uses `normalizePath` (POSIX-style, no trailing slash,
 * Windows-lowercased) from Lean Turbo's conflicts module so the comparison
 * is consistent with everything else in the lane planner.
 */
export function computeDivergence(
	declaredScope: readonly string[],
	actualFiles: readonly string[],
): {
	declared: string[];
	actual: string[];
	undeclared: string[];
	unused: string[];
	divergenceRatio: number;
} {
	const declared = Array.from(new Set(declaredScope.map(normalizePath))).sort();
	const actual = Array.from(new Set(actualFiles.map(normalizePath))).sort();
	const declaredSet = new Set(declared);
	const actualSet = new Set(actual);
	const undeclared = actual.filter((f) => !declaredSet.has(f));
	const unused = declared.filter((f) => !actualSet.has(f));
	const divergenceRatio =
		actual.length === 0 ? 0 : undeclared.length / actual.length;
	return { declared, actual, undeclared, unused, divergenceRatio };
}

interface RecordTaskDivergenceArgs {
	directory: string;
	sessionID: string;
	taskId: string;
	phaseNumber?: number;
	declaredScope: readonly string[];
	actualFiles: readonly string[];
}

/**
 * Append one divergence record to the JSONL audit file.
 *
 * Append-only, line-delimited so partial writes are tolerable (the calibration
 * reader skips malformed lines). Best-effort — never throws to caller:
 *   - Directory-creation failure → log and return null.
 *   - Append write failure → log and return null.
 * Either keeps the task-completion path moving even if the audit subsystem
 * is broken (audit miss is not a correctness issue; blocking task completion
 * would be).
 */
export function recordTaskDivergence(
	args: RecordTaskDivergenceArgs,
): { path: string; record: DivergenceRecord } | null {
	const {
		directory,
		sessionID,
		taskId,
		phaseNumber,
		declaredScope,
		actualFiles,
	} = args;

	const { declared, actual, undeclared, unused, divergenceRatio } =
		computeDivergence(declaredScope, actualFiles);

	const record: DivergenceRecord = {
		timestamp: new Date().toISOString(),
		sessionID,
		taskId,
		phaseNumber,
		declaredScope: declared,
		actualFiles: actual,
		undeclared,
		unused,
		divergenceRatio,
		isClean: divergenceRatio === 0,
	};

	let evidenceDir: string;
	try {
		evidenceDir = path.join(directory, EVIDENCE_REL_DIR);
		fs.mkdirSync(evidenceDir, { recursive: true });
	} catch (err) {
		logger.warn(
			`[epic/divergence] could not create ${EVIDENCE_REL_DIR}: ${err instanceof Error ? err.message : String(err)}`,
		);
		return null;
	}

	const filePath = path.join(evidenceDir, EVIDENCE_FILE);
	try {
		fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf-8');
	} catch (err) {
		logger.warn(
			`[epic/divergence] append failed: ${err instanceof Error ? err.message : String(err)}`,
		);
		return null;
	}
	return { path: filePath, record };
}

export interface ReadDivergenceHistoryOptions {
	/** Read at most this many of the most recent records. */
	limit?: number;
	/** Filter to this session (default: all sessions). */
	sessionID?: string;
	/**
	 * Maximum bytes to read from the tail of the file. Defaults to
	 * `MAX_TAIL_BYTES` (16 MiB) — large enough to hold thousands of
	 * records, small enough to avoid OOMing on a runaway audit log.
	 * Pass `Infinity` to disable the bound (callers that truly need the
	 * whole history — adversarial review H3).
	 */
	maxBytes?: number;
}

/** 16 MiB cap on a single read of divergence.jsonl. */
const MAX_TAIL_BYTES = 16 * 1024 * 1024;

/**
 * Read divergence records from disk, oldest-to-newest within the read
 * window. Malformed lines (rare — could occur on partial write) are
 * silently skipped — they do not corrupt the well-formed records before or
 * after them. Returns `[]` when the file does not exist.
 *
 * Tail-bounded: by default reads at most the last `MAX_TAIL_BYTES`. When
 * the file is larger, the read starts mid-file and the FIRST encountered
 * line (which is almost certainly a partial record split by the byte
 * boundary) is discarded. This means very old records are not returned by
 * a default-bounded read — the calibration engine consumes the tail
 * incrementally via `processedRecords`, so it never needs the full history
 * in memory at once. For full-history audit reads (tests, ad-hoc tooling),
 * pass `maxBytes: Infinity`.
 */
export function readDivergenceHistory(
	directory: string,
	options?: ReadDivergenceHistoryOptions,
): DivergenceRecord[] {
	const filePath = path.join(directory, EVIDENCE_REL_DIR, EVIDENCE_FILE);
	if (!fs.existsSync(filePath)) {
		return [];
	}
	const maxBytes = options?.maxBytes ?? MAX_TAIL_BYTES;
	let raw: string;
	let tailTruncated = false;
	try {
		const stat = fs.statSync(filePath);
		if (Number.isFinite(maxBytes) && stat.size > maxBytes) {
			const fd = fs.openSync(filePath, 'r');
			try {
				const buf = Buffer.alloc(maxBytes);
				const offset = stat.size - maxBytes;
				fs.readSync(fd, buf, 0, maxBytes, offset);
				raw = buf.toString('utf-8');
				tailTruncated = true;
			} finally {
				try {
					fs.closeSync(fd);
				} catch {
					// already closed
				}
			}
		} else {
			raw = fs.readFileSync(filePath, 'utf-8');
		}
	} catch {
		// File disappeared between existsSync and statSync, or stat/open
		// failed for another reason. Audit-only — return empty rather than
		// throw.
		return [];
	}
	const lines = raw.split('\n').filter((l) => l.trim().length > 0);
	// If we did a mid-file read, the first line is almost certainly a
	// fragment of a record split by the byte boundary — drop it.
	const startIdx = tailTruncated && lines.length > 0 ? 1 : 0;
	const records: DivergenceRecord[] = [];
	for (let i = startIdx; i < lines.length; i++) {
		try {
			const parsed = JSON.parse(lines[i]!) as DivergenceRecord;
			if (options?.sessionID && parsed.sessionID !== options.sessionID) {
				continue;
			}
			records.push(parsed);
		} catch {
			// Skip malformed line; do not corrupt the stream.
		}
	}
	if (options?.limit !== undefined && options.limit >= 0) {
		return records.slice(-options.limit);
	}
	return records;
}
