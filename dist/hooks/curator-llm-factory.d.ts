import type { CuratorLLMDelegate } from './curator.js';
/**
 * Create a CuratorLLMDelegate that uses the opencode SDK to call
 * the registered curator agent in CURATOR_INIT or CURATOR_PHASE mode.
 *
 * Uses an ephemeral session (create → prompt → delete) to avoid
 * re-entrancy with the current session's message flow.
 *
 * The `mode` parameter determines which registered named agent is used:
 *   - 'init'  → swarmState.curatorInitAgentName  (e.g. 'curator_init' or 'local_curator_init')
 *   - 'phase' → swarmState.curatorPhaseAgentName (e.g. 'curator_phase' or 'local_curator_phase')
 *
 * The curator agents are registered with their role-specific system prompts
 * baked in at plugin init (following the same pattern as critic_sounding_board /
 * critic_drift_verifier). The `system:` field passed via session.prompt serves
 * as a runtime override — this matches how curator.ts prepares mode-specific
 * context (CURATOR_INIT vs CURATOR_PHASE prompts).
 *
 * Returns undefined if swarmState.opencodeClient is not set (e.g. in unit tests).
 */
export declare function createCuratorLLMDelegate(directory: string, mode?: 'init' | 'phase'): CuratorLLMDelegate | undefined;
