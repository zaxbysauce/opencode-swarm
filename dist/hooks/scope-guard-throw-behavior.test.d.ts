/**
 * Smoke test: documents the confirmed behavior that tool.execute.before hook
 * throws propagate as tool rejection, not session crash.
 *
 * VERIFIED from src/hooks/guardrails.ts existing patterns:
 *   - Loop circuit breaker (count >= 5): throw new Error('CIRCUIT BREAKER...')
 *   - Full test suite block: throw new Error('BLOCKED: Full test suite...')
 *   - Plan state violation: throw new Error('PLAN STATE VIOLATION...')
 * All throw in toolBefore, and the plugin propagates as tool rejection.
 *
 * SAFE MECHANISM for scope-guard.ts:
 *   throw new Error(`SCOPE VIOLATION: [agent] attempted to modify [file] not in task [id] scope`)
 * This is the CORRECT blocking pattern. DO NOT use return-value signals.
 */
export {};
