/**
 * Work Complete Council — evidence writer.
 *
 * Stamps council synthesis result into .swarm/evidence/{taskId}.json under a
 * `council` key, so downstream evidence consumers (notably check_gate_status
 * and update-task-status) observe the council gate at the same path they
 * already read. Existing fields in the evidence file are preserved.
 *
 * The raw taskId is used as the filename — matching check-gate-status.ts and
 * update-task-status.ts. The canonical taskId format (/^\d+\.\d+(\.\d+)*$/)
 * contains only digits and dots, so the filename carries no path-traversal
 * risk. Defense in depth: we re-validate format here before any FS op.
 */
import type { CouncilSynthesis } from './types';
export declare function writeCouncilEvidence(workingDir: string, synthesis: CouncilSynthesis): void;
