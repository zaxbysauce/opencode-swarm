/**
 * Work Complete Council — pre-declaration criteria writer/reader.
 *
 * Stores acceptance criteria under .swarm/council/{safeId}.json so they can be
 * read back during council evaluation.
 */
import type { CouncilCriteria, CouncilCriteriaItem } from './types';
export declare function writeCriteria(workingDir: string, taskId: string, criteria: CouncilCriteriaItem[]): void;
export declare function readCriteria(workingDir: string, taskId: string): CouncilCriteria | null;
