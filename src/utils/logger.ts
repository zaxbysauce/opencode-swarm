function isDebug(): boolean {
	return process.env.OPENCODE_SWARM_DEBUG === '1';
}

export function log(message: string, data?: unknown): void {
	if (!isDebug()) return;

	const timestamp = new Date().toISOString();
	if (data !== undefined) {
		console.log(`[opencode-swarm ${timestamp}] ${message}`, data);
	} else {
		console.log(`[opencode-swarm ${timestamp}] ${message}`);
	}
}

export function warn(message: string, data?: unknown): void {
	if (!isDebug()) return;
	const timestamp = new Date().toISOString();
	if (data !== undefined) {
		console.warn(`[opencode-swarm ${timestamp}] WARN: ${message}`, data);
	} else {
		console.warn(`[opencode-swarm ${timestamp}] WARN: ${message}`);
	}
}

/**
 * Phase 15 (B34): ALWAYS-EMITTED warning. Use this — not `warn()` — for
 * signals the operator MUST see during a live benchmark or production
 * run: Rule 2 commit failures, Phase 10 predecessor-evidence anomalies,
 * Phase 13 git-log-degraded states, Phase 14 lane-planning-blocked
 * correlations against `epic-promotions.jsonl`, phantom-dep typos.
 *
 * Rationale: `warn()` is gated behind `OPENCODE_SWARM_DEBUG=1`. Until
 * Phase 15 every diagnostic signal Phases 0-14 added was silenced
 * outside debug runs — including the audit-trail correlation log that
 * makes B22 wedges detectable. That defeats the whole point of those
 * signals.
 *
 * `criticalWarn` writes to stderr (so it survives stdout redirection
 * for grading scripts) with a `CRITICAL-WARN` tag distinct from
 * regular `WARN` so log scrapers can filter for must-act-on lines.
 */
export function criticalWarn(message: string, data?: unknown): void {
	const timestamp = new Date().toISOString();
	if (data !== undefined) {
		console.warn(
			`[opencode-swarm ${timestamp}] CRITICAL-WARN: ${message}`,
			data,
		);
	} else {
		console.warn(`[opencode-swarm ${timestamp}] CRITICAL-WARN: ${message}`);
	}
}

export function error(message: string, data?: unknown): void {
	const timestamp = new Date().toISOString();
	if (data !== undefined) {
		console.error(`[opencode-swarm ${timestamp}] ERROR: ${message}`, data);
	} else {
		console.error(`[opencode-swarm ${timestamp}] ERROR: ${message}`);
	}
}

/**
 * DI seam for testability. Contains all test-mocked exports.
 * Internal calls should use _internals.fn() instead of fn() directly.
 */
export const _internals: {
	isDebug: typeof isDebug;
	log: typeof log;
	warn: typeof warn;
	criticalWarn: typeof criticalWarn;
	error: typeof error;
} = {
	isDebug,
	log,
	warn,
	criticalWarn,
	error,
} as const;
