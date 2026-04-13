/**
 * Work Complete Council — pure synthesis service.
 *
 * Given the verdicts of council members (critic, reviewer, sme, test_engineer),
 * compute the overall verdict, classify findings, detect conflicts, and build a
 * single unified feedback document for the coder.
 *
 * No I/O — fully unit-testable with mock inputs. All file reads/writes happen in
 * sibling modules (criteria-store, council-evidence-writer).
 */
import type { CouncilConfig, CouncilCriteria, CouncilMemberVerdict, CouncilSynthesis } from './types';
export declare function synthesizeCouncilVerdicts(taskId: string, swarmId: string, verdicts: CouncilMemberVerdict[], criteria: CouncilCriteria | null, roundNumber: number, config?: Partial<CouncilConfig>): CouncilSynthesis;
