/**
 * Work Complete Council — advisory routing helper.
 *
 * Purpose:
 *   Routes a CouncilSynthesis (unifiedFeedbackMd + verdict metadata) into the
 *   architect's non-blocking advisory queue (`session.pendingAdvisoryMessages`).
 *   The guardrails `messagesTransform` hook drains that queue into an
 *   [ADVISORIES] block prepended to the architect's first SYSTEM message on
 *   the next turn.
 *
 * Runtime call site:
 *   `src/tools/convene-council.ts` invokes this helper after writing evidence,
 *   guarded by `ctx?.sessionID` and `getAgentSession`. Missing session, missing
 *   sessionID, or any thrown error silently skip — the advisory is never
 *   critical-path. The helper is also re-exported for direct use by any future
 *   caller that wants to push synthesis output into an advisory queue.
 *
 * Scope and known limitation:
 *   The advisory queue is READ by the architect session on its next turn (self
 *   echo). It is NOT a programmatic architect→coder delivery channel — the
 *   architect still has to render `unifiedFeedbackMd` into the coder's
 *   delegation payload manually, per the prompt's four-phase workflow. A
 *   dedicated architect→coder advisory primitive is future work.
 *
 * Dedup semantics:
 *   Dedup key is `council:${taskId}:${roundNumber}`. If the queue already
 *   contains a string whose content includes that key, the push is a no-op.
 *   Different rounds or tasks push distinct entries.
 *
 * Blocking signal (metadata only):
 *   - REJECT  → header declares `blocking=true`. Council vetoed the candidate.
 *   - CONCERNS→ `blocking=false`. Architect should weigh fixes but is not vetoed.
 *   - APPROVE → `blocking=false`. Helper skips push entirely when there are no
 *               advisoryFindings (nothing useful to surface).
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
export declare function pushCouncilAdvisory(session: Pick<AgentSessionState, 'pendingAdvisoryMessages'>, synthesis: CouncilSynthesis): void;
