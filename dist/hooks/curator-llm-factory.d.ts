import type { CuratorLLMDelegate } from './curator.js';
/**
 * Create a CuratorLLMDelegate that uses the opencode SDK to call
 * the registered curator agent in CURATOR_INIT or CURATOR_PHASE mode.
 *
 * Uses an ephemeral session (create → prompt → delete) to avoid
 * re-entrancy with the current session's message flow.
 *
 * The `mode` parameter determines which registered named agent is used:
 *   - 'init'  → curator_init  (e.g. 'curator_init' or 'swarm1_curator_init')
 *   - 'phase' → curator_phase (e.g. 'curator_phase' or 'swarm1_curator_phase')
 *
 * The optional `sessionId` parameter enables deterministic swarm resolution:
 * when provided, the factory uses the calling session's registered agent to
 * identify the swarm prefix, rather than scanning all active sessions.
 * Pass `ctx?.sessionID` from tool handlers that have it available.
 *
 * Returns undefined if swarmState.opencodeClient is not set (e.g. in unit tests).
 */
export declare function createCuratorLLMDelegate(directory: string, mode?: 'init' | 'phase', sessionId?: string): CuratorLLMDelegate | undefined;
