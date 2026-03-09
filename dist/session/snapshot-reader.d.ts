/**
 * Session snapshot reader for OpenCode Swarm plugin.
 * Reads .swarm/session/state.json and rehydrates swarmState on plugin init.
 */
import type { AgentSessionState } from '../state';
import type { SerializedAgentSession, SnapshotData } from './snapshot-writer';
/**
 * Deserialize a SerializedAgentSession back to AgentSessionState.
 * Handles Map/Set conversion and migration safety defaults.
 */
export declare function deserializeAgentSession(s: SerializedAgentSession): AgentSessionState;
/**
 * Read the snapshot file from .swarm/session/state.json.
 * Returns null if file doesn't exist, parse fails, or version is wrong.
 * NEVER throws - always returns null on any error.
 */
export declare function readSnapshot(directory: string): Promise<SnapshotData | null>;
/**
 * Rehydrate swarmState from a SnapshotData object.
 * Clears existing maps first, then populates from snapshot.
 * Does NOT touch activeToolCalls or pendingEvents (remain at defaults).
 */
export declare function rehydrateState(snapshot: SnapshotData): void;
/**
 * Reconcile task workflow states from plan.json for all active sessions.
 * Seeds completed plan tasks to 'tests_run' and in_progress tasks to 'coder_delegated'.
 * Best-effort: returns silently on any file/parse error. NEVER throws.
 *
 * @param directory - The project root directory containing .swarm/plan.json
 */
export declare function reconcileTaskStatesFromPlan(directory: string): Promise<void>;
/**
 * Load snapshot from disk and rehydrate swarmState.
 * Called on plugin init to restore state from previous session.
 * NEVER throws - swallows any errors silently.
 */
export declare function loadSnapshot(directory: string): Promise<void>;
