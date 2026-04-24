/**
 * General Council Mode — pure synthesis service.
 *
 * No I/O, no HTTP. Takes completed member responses for all rounds and
 * produces the final `GeneralCouncilResult`. Mirrors the design of
 * `./council-service.ts` (synthesizeCouncilVerdicts).
 *
 * Quadratic Voting (NSED arXiv:2601.16863): consensus claims are weighted by
 * member confidence rather than counted by headcount. A claim is a consensus
 * point only when its weighted agreement exceeds 0.6 across members.
 *
 * MAINTAIN/CONCEDE/NUANCE protocol (ConfMAD): a Round 2 response with the
 * CONCEDE keyword on a topic resolves the corresponding Round 1 disagreement;
 * MAINTAIN leaves it persisting; NUANCE marks it persisting-with-boundary.
 */
import type { GeneralCouncilDeliberationResponse, GeneralCouncilMemberResponse, GeneralCouncilResult } from './general-council-types.js';
/**
 * Pure synthesis. Given completed member responses, produces the final
 * `GeneralCouncilResult` (without `moderatorOutput` — moderator is invoked
 * by the architect after this returns and populated separately).
 */
export declare function synthesizeGeneralCouncil(question: string, mode: 'general' | 'spec_review', round1Responses: GeneralCouncilMemberResponse[], round2Responses: GeneralCouncilDeliberationResponse[]): GeneralCouncilResult;
