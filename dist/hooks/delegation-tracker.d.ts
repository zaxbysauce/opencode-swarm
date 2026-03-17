/**
 * Delegation Tracker Hook
 *
 * Tracks agent delegation by monitoring chat.message events with agent fields.
 * Updates the active agent map and optionally logs delegation chain entries.
 */
import type { PluginConfig } from '../config/schema';
/**
 * Creates the chat.message hook for delegation tracking.
 */
export declare function createDelegationTrackerHook(config: PluginConfig, guardrailsEnabled?: boolean): (input: {
    sessionID: string;
    agent?: string;
}, output: Record<string, unknown>) => Promise<void>;
