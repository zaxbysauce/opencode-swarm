import type { CuratorLLMDelegate } from './curator.js';
/**
 * Create a CuratorLLMDelegate that uses the opencode SDK to call
 * the Explorer agent in CURATOR_INIT or CURATOR_PHASE mode.
 *
 * Uses an ephemeral session (create → prompt → delete) to avoid
 * re-entrancy with the current session's message flow.
 *
 * Returns undefined if swarmState.opencodeClient is not set (e.g. in unit tests).
 */
export declare function createCuratorLLMDelegate(directory: string): CuratorLLMDelegate | undefined;
