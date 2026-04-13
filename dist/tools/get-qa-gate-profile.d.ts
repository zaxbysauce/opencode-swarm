/**
 * Tool to retrieve the QA gate profile for the current plan.
 *
 * Read-only: derives plan_id from plan.json, then looks up the profile in the
 * per-project DB. Returns the spec-level profile gates, lock state, and profile
 * hash. Callers layering session overrides should combine with
 * `getEffectiveGates` themselves — this tool intentionally returns the
 * persisted/locked spec-level view.
 */
import type { tool } from '@opencode-ai/plugin';
interface GetQaGateProfileResult {
    success: boolean;
    reason?: string;
    plan_id?: string;
    profile?: {
        plan_id: string;
        project_type: string | null;
        gates: Record<string, boolean>;
        locked_at: string | null;
        locked_by_snapshot_seq: number | null;
        created_at: string;
        profile_hash: string;
    };
}
export declare function executeGetQaGateProfile(_args: Record<string, unknown>, directory: string): Promise<GetQaGateProfileResult>;
export declare const get_qa_gate_profile: ReturnType<typeof tool>;
export {};
