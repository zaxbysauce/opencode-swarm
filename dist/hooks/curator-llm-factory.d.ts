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
 * Agent name resolution is lazy (at delegate call time, not factory call time)
 * so multi-swarm deployments always get the curator for the currently active
 * swarm — regardless of how many swarms are configured.
 *
 * Returns undefined if swarmState.opencodeClient is not set (e.g. in unit tests).
 */
export declare function createCuratorLLMDelegate(directory: string, mode?: 'init' | 'phase'): CuratorLLMDelegate | undefined;
