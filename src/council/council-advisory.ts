/**
 * Work Complete Council — advisory routing helper.
 *
 * Purpose:
 *   Routes a CouncilSynthesis document (unifiedFeedbackMd plus verdict metadata)
 *   into the architect's non-blocking advisory queue (session.pendingAdvisoryMessages).
 *   That queue is drained by the guardrails `messagesTransform` hook into a
 *   [ADVISORIES] block prepended to the architect's first SYSTEM message.
 *
 * How the architect is expected to call it:
 *   After `convene_council` returns a synthesis, the architect (see Phase C wiring
 *   in `src/agents/architect.ts`) inspects the overall verdict. On REJECT or
 *   CONCERNS, the architect may call `pushCouncilAdvisory(session, synthesis)` to
 *   have the council's unified feedback surfaced back into its own system prompt
 *   on the next turn. On APPROVE with no advisoryFindings, the helper no-ops.
 *
 * Dedup semantics:
 *   The dedup key is `council:${taskId}:${roundNumber}`. If the queue already
 *   contains a string whose content includes that exact key, the push is a no-op.
 *   Different rounds or different tasks push distinct entries.
 *
 * Blocking vs non-blocking signal:
 *   - REJECT → the metadata header declares `blocking=true`. The advisory itself
 *     is still non-blocking at the pipeline level (pendingAdvisoryMessages is
 *     advisory by design); the flag is a semantic signal to the architect that
 *     the council vetoed the candidate and required fixes must land before
 *     re-convening.
 *   - CONCERNS → `blocking=false`. Architect should weigh fixes but is not vetoed.
 *   - APPROVE → treated as non-blocking; helper skips push when there are no
 *     advisoryFindings (nothing useful to surface in that case).
 *
 * Phase C wiring:
 *   The actual call site lives in `src/agents/architect.ts` (Phase C of the
 *   Phase 6 wiring PR). This module exports the helper only — it is NOT invoked
 *   by any tool's execute path in this phase.
 */

import type { AgentSessionState } from '../state';
import type { CouncilSynthesis } from './types';

/**
 * Push a CouncilSynthesis into the given session's advisory queue so the
 * architect will see it as an [ADVISORIES] block on the next messagesTransform.
 *
 * Idempotent per (taskId, roundNumber): repeated calls with the same key
 * leave the queue unchanged. Safe to call on APPROVE — it is a no-op when
 * there are no advisoryFindings.
 */
export function pushCouncilAdvisory(
	session: Pick<AgentSessionState, 'pendingAdvisoryMessages'>,
	synthesis: CouncilSynthesis,
): void {
	const dedupKey = `council:${synthesis.taskId}:${synthesis.roundNumber}`;

	// APPROVE with no advisoryFindings → nothing useful to surface.
	// Design choice: silently skip rather than pushing a "looks good" note,
	// because the architect already received the APPROVE verdict via the
	// convene_council tool return value.
	if (
		synthesis.overallVerdict === 'APPROVE' &&
		synthesis.advisoryFindings.length === 0
	) {
		return;
	}

	session.pendingAdvisoryMessages ??= [];

	// Dedup: same taskId + roundNumber should not re-push. Match existing
	// idiom used at guardrails.ts L1598 (`.some((m) => m.includes(...))`).
	if (
		session.pendingAdvisoryMessages.some((m: string) => m.includes(dedupKey))
	) {
		return;
	}

	const blocking = synthesis.overallVerdict === 'REJECT';
	const header = `[${dedupKey}] (priority=HIGH, blocking=${blocking})`;
	const body = synthesis.unifiedFeedbackMd;

	session.pendingAdvisoryMessages.push(`${header}\n${body}`);
}
