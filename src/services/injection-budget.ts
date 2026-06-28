/**
 * Unified Injection Budget Service (FR-002).
 *
 * Pure, side-effect-free allocation function for the combined
 * system-enhancer + knowledge-injector injection ceiling.
 *
 * Allocation strategy: proportional share.
 * - When combined demand fits within the budget, each component receives its
 *   full requested amount.
 * - When one component alone exceeds the budget, it receives the entire budget
 *   and the other receives zero (SC-005: single-component overrun is impossible).
 * - When both together exceed the budget but neither alone does, the budget is
 *   split proportionally to each component's demand. The system-enhancer
 *   receives the floor of its proportional share; the knowledge-injector
 *   receives the remainder so the total always equals the ceiling (SC-006).
 *
 * Proportional share is chosen over first-come-first-served because this
 * service is a pure function with no knowledge of hook ordering; it must
 * produce the same allocation regardless of which component calls first.
 * Priority-based allocation would require an arbitrary component ranking
 * not specified by the acceptance criteria.
 *
 * Char-to-token conversion uses the project's existing 0.33 tok/char ratio
 * (matches `estimateTokens` in src/hooks/utils.ts:200).
 */

/**
 * Allocation result for a single turn's unified injection budget.
 */
export interface InjectionBudgetAllocation {
	/** Tokens granted to the system-enhancer (input was already in tokens). */
	systemEnhancerTokens: number;
	/** Tokens granted to the knowledge-injector (converted from chars to tokens). */
	knowledgeInjectorTokens: number;
	/** Sum of both allocations; never exceeds the configured budget. */
	totalTokens: number;
}

/**
 * Configuration for the unified injection budget.
 */
export interface InjectionBudgetConfig {
	/** Unified ceiling (tokens) for combined system-enhancer + knowledge-injector injection per turn. */
	totalBudgetTokens: number;
}

/**
 * Convert a character count to tokens using the project's 0.33 tok/char ratio.
 *
 * @param chars - Character count from the knowledge-injector demand.
 * @returns Estimated token count (ceiling of chars * 0.33).
 */
function charsToTokens(chars: number): number {
	if (chars <= 0) return 0;
	return Math.ceil(chars * 0.33);
}

/**
 * Allocate the unified injection budget between system-enhancer and
 * knowledge-injector for a single turn.
 *
 * The allocation respects the configured ceiling and guarantees:
 * - totalTokens ≤ config.totalBudgetTokens
 * - If one component alone exceeds the budget, the other receives zero.
 * - If combined demand fits, each receives its full demand.
 * - If combined demand exceeds the budget but neither alone does, the split
 *   is proportional to each component's demand.
 *
 * @param systemEnhancerDemandTokens - Tokens requested by the system-enhancer.
 * @param knowledgeInjectorDemandChars - Characters requested by the knowledge-injector.
 * @param config - Budget configuration containing the total ceiling.
 * @returns Allocation breakdown with per-component token grants.
 */
export function allocateInjectionBudget(
	systemEnhancerDemandTokens: number,
	knowledgeInjectorDemandChars: number,
	config: InjectionBudgetConfig,
): InjectionBudgetAllocation {
	const budget = config.totalBudgetTokens;

	// Clamp negative inputs to zero (defensive; callers should pass non-negative values).
	const seDemand = Math.max(0, systemEnhancerDemandTokens);
	const kiChars = Math.max(0, knowledgeInjectorDemandChars);
	const ceiling = Math.max(0, budget);

	// Convert knowledge-injector demand to tokens for comparison.
	const kiDemand = charsToTokens(kiChars);

	// Fast path: both demands fit within the budget.
	if (seDemand + kiDemand <= ceiling) {
		return {
			systemEnhancerTokens: seDemand,
			knowledgeInjectorTokens: kiDemand,
			totalTokens: seDemand + kiDemand,
		};
	}

	// Single-component overrun: the component that alone exceeds the ceiling
	// receives the entire budget; the other receives zero.
	if (seDemand >= ceiling) {
		return {
			systemEnhancerTokens: ceiling,
			knowledgeInjectorTokens: 0,
			totalTokens: ceiling,
		};
	}

	if (kiDemand >= ceiling) {
		return {
			systemEnhancerTokens: 0,
			knowledgeInjectorTokens: ceiling,
			totalTokens: ceiling,
		};
	}

	// Proportional share: both together exceed the budget, but neither alone does.
	// System-enhancer gets the floor of its proportional share; knowledge-injector
	// receives the remainder so the total equals the ceiling exactly.
	const totalDemand = seDemand + kiDemand;
	const seShare = Math.floor((seDemand / totalDemand) * ceiling);
	const kiShare = ceiling - seShare;

	return {
		systemEnhancerTokens: seShare,
		knowledgeInjectorTokens: kiShare,
		totalTokens: ceiling,
	};
}

// ---------------------------------------------------------------------------
// Legacy stateful session-ledger API (used by system-enhancer.ts and
// knowledge-injector.ts until task 1.3 integration). Kept for backward
// compatibility; the pure allocateInjectionBudget above is the Stage 1 deliverable.
// ---------------------------------------------------------------------------

/**
 * Per-session budget ledger. Keyed by sessionID; each entry is reset at the
 * start of the first component that runs for that turn.
 */
const sessionBudgets = new Map<
	string,
	{ total: number; used: number; seDemand: number }
>();

// ============================================================================
// Bounded session tracking (invariant 8)
// ============================================================================

const MAX_TRACKED_SESSIONS = 256;

function evictSessionBudgets(): void {
	while (sessionBudgets.size > MAX_TRACKED_SESSIONS) {
		const firstKey = sessionBudgets.keys().next().value;
		if (firstKey === undefined) break;
		sessionBudgets.delete(firstKey);
	}
}

/**
 * Reset the budget for a session to the full unified ceiling.
 * Called by the first component to run for a given turn.
 */
export function resetUnifiedBudget(
	sessionID: string,
	totalBudget: number,
): void {
	sessionBudgets.set(sessionID, { total: totalBudget, used: 0, seDemand: 0 });
	evictSessionBudgets();
}

/**
 * Return the remaining unified budget for a session.
 */
export function getUnifiedBudgetRemaining(sessionID: string): number {
	const budget = sessionBudgets.get(sessionID);
	if (!budget) return 0;
	return Math.max(0, budget.total - budget.used);
}

/**
 * Request a slice of the unified budget. Returns the granted token count.
 * If the requester's need exceeds the remaining budget, it gets the remainder
 * and the other source is implicitly blocked (remaining drops to 0).
 */
export function requestUnifiedBudget(
	sessionID: string,
	requestedTokens: number,
): number {
	const budget = sessionBudgets.get(sessionID);
	if (!budget) return requestedTokens; // fail-open: no budget set, allow full request
	const granted = Math.min(
		requestedTokens,
		Math.max(0, budget.total - budget.used),
	);
	budget.used += granted;
	return granted;
}

/**
 * Return the total unified budget configured for a session (or 0 if unset).
 */
export function getUnifiedBudgetTotal(sessionID: string): number {
	const budget = sessionBudgets.get(sessionID);
	return budget?.total ?? 0;
}

/**
 * Remove a session's budget entry. Used for cleanup in tests.
 */
export function clearUnifiedBudget(sessionID: string): void {
	sessionBudgets.delete(sessionID);
}

/**
 * Ensure a budget entry exists for the session. Creates one with the full
 * budget if none exists; leaves an existing entry untouched.
 */
export function ensureSessionBudget(
	sessionID: string,
	totalBudget: number,
): void {
	if (!sessionBudgets.has(sessionID)) {
		sessionBudgets.set(sessionID, { total: totalBudget, used: 0, seDemand: 0 });
		evictSessionBudgets();
	}
}

/**
 * Store the system-enhancer's actual per-turn token demand so that
 * knowledge-injector can read it and compute its proportional share.
 */
export function setSystemEnhancerDemand(
	sessionID: string,
	demand: number,
): void {
	const budget = sessionBudgets.get(sessionID);
	if (!budget) return;
	budget.seDemand = demand;
}

/**
 * Return the system-enhancer's actual per-turn token demand for a session.
 * Returns 0 if no budget entry exists or demand was not set.
 */
export function getSystemEnhancerDemand(sessionID: string): number {
	const budget = sessionBudgets.get(sessionID);
	return budget?.seDemand ?? 0;
}
