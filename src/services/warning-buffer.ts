/**
 * Bounded buffer for deferred non-critical init warnings.
 * Populated during plugin startup when quiet:true; replayed in /swarm diagnose.
 * Extracted from index.ts so agents/index.ts and diagnose-service.ts can
 * share the buffer without creating a circular dependency.
 * Max 50 entries to prevent memory growth.
 * Access is restricted via getter to prevent unauthorized mutation.
 */
const deferredWarnings: string[] = [];
const MAX_DEFERRED_WARNINGS = 50;

export function addDeferredWarning(warning: string): void {
	if (deferredWarnings.length < MAX_DEFERRED_WARNINGS) {
		deferredWarnings.push(warning);
	}
}

/**
 * Returns the current deferred warnings array (read-only reference).
 * Callers must not mutate this array directly; use addDeferredWarning() instead.
 */
export function getDeferredWarnings(): readonly string[] {
	return deferredWarnings;
}

/**
 * Clears all deferred warnings. Used at session boundaries for isolation.
 * Only exported for session lifecycle management; normal callers should
 * not invoke this.
 */
export function clearDeferredWarnings(): void {
	deferredWarnings.length = 0;
}
