/**
 * Service layer for the `qa_gate_profile` table in the per-project database.
 *
 * A QA gate profile is keyed by plan_id and captures which QA gates are
 * enabled for that plan. Profiles are locked after critic approval; once
 * locked, row updates are rejected by a SQLite trigger and by this service.
 * Sessions can only ratchet gates tighter (enable more), never disable them.
 */
/**
 * QA gate flags. All seven gates are tracked explicitly.
 */
export interface QaGates {
    reviewer: boolean;
    test_engineer: boolean;
    council_mode: boolean;
    sme_enabled: boolean;
    critic_pre_plan: boolean;
    hallucination_guard: boolean;
    sast_enabled: boolean;
}
/**
 * Default QA gate configuration for newly-created profiles.
 */
export declare const DEFAULT_QA_GATES: QaGates;
/**
 * Row-level representation of a persisted QA gate profile.
 */
export interface QaGateProfile {
    id: number;
    plan_id: string;
    created_at: string;
    project_type: string | null;
    gates: QaGates;
    locked_at: string | null;
    locked_by_snapshot_seq: number | null;
}
/**
 * Fetch the profile for `planId` or return null if none exists.
 */
export declare function getProfile(directory: string, planId: string): QaGateProfile | null;
/**
 * Return the existing profile for `planId`, or create a new one seeded with
 * `DEFAULT_QA_GATES` if none exists. Tolerates races on the UNIQUE index.
 */
export declare function getOrCreateProfile(directory: string, planId: string, projectType?: string): QaGateProfile;
/**
 * Update gates for `planId`. Gates can only be ratcheted tighter —
 * attempting to disable a currently-enabled gate throws. Throws if the
 * profile is locked.
 */
export declare function setGates(directory: string, planId: string, gates: Partial<QaGates>): QaGateProfile;
/**
 * Lock the profile for `planId`, recording the snapshot seq that anchors it.
 * Idempotent: locking an already-locked profile returns it unchanged.
 */
export declare function lockProfile(directory: string, planId: string, snapshotSeq: number): QaGateProfile;
/**
 * Compute a SHA-256 hex digest over the stable identity of a profile.
 * Used by `get_approved_plan` for drift detection.
 */
export declare function computeProfileHash(profile: QaGateProfile): string;
/**
 * Merge session-level gate overrides on top of the spec-level profile.
 * Session overrides can only ratchet gates tighter (set to true); false
 * values in overrides are ignored.
 *
 * IMPORTANT — caller responsibility: this function is the *computation*
 * of effective gates, not an enforcement point. Enforcement consumers
 * (reviewer dispatch, SAST runner, council convene paths, etc.) must
 * call this at their own check sites, passing the current profile from
 * `getProfile` and the agent session's `qaGateSessionOverrides ?? {}`.
 * Reading raw `profile.gates` directly from an enforcement site will
 * silently ignore operator-applied session overrides. Session overrides
 * are currently surfaced via `/swarm qa-gates show`; wiring additional
 * enforcement consumers is tracked as follow-up work and does not affect
 * spec-level gate correctness on the approved-plan path.
 *
 * Session overrides are intentionally ephemeral — they live only in
 * in-memory `AgentSessionState.qaGateSessionOverrides` and are NOT
 * persisted to the session snapshot. Process restart clears them.
 */
export declare function getEffectiveGates(profile: QaGateProfile, sessionOverrides: Partial<QaGates>): QaGates;
