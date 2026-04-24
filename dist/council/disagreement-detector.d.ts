/**
 * Disagreement detection for the General Council Mode.
 *
 * Pure function module — no I/O, no HTTP, deterministic. Takes Round 1 member
 * responses, returns the set of factual disagreements that should be routed
 * back to disputing members for Round 2 reconciliation.
 *
 * Two-pass detection:
 *   Pass 1 — Explicit linguistic markers ("I disagree with", "unlike", etc.)
 *   Pass 2 — Claim divergence heuristic (mutually exclusive recommendations)
 *
 * NSED design note (arXiv:2601.16863): only the disagreement delta is fed
 * forward to Round 2, not full Round 1 context — mirrors the "semantic forget
 * gate" selective-retention insight and keeps prompt sizes bounded.
 */
import type { GeneralCouncilDisagreement, GeneralCouncilMemberResponse } from './general-council-types.js';
/**
 * Detect disagreements across Round 1 member responses.
 *
 * Returns at most MAX_DISAGREEMENTS items, deduplicated by topic. Pure function:
 * given the same input, produces the same output. Empty inputs and missing
 * fields are handled without throwing.
 */
export declare function detectDisagreements(responses: GeneralCouncilMemberResponse[]): GeneralCouncilDisagreement[];
