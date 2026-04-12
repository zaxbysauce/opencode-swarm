/**
 * Repo-Map Injector Hook for opencode-swarm.
 *
 * Auto-injects localization context into architect messages when the architect
 * is about to delegate to a coder via a Task tool call. Follows the same
 * safeHook / budget-aware / idempotent pattern as knowledge-injector.
 *
 * Trigger conditions (all must be true):
 *   1. Agent is the architect
 *   2. Messages contain a pending Task delegation (tool_use part with "Task")
 *   3. The task references specific files
 *   4. Repo map exists at .swarm/repo-map.json and is reasonably fresh
 *
 * Injection: compact one-line summary per referenced file, placed before the
 * last user message. Fixed budget of ~500 tokens (~1 500 chars at 0.33 tok/char).
 * Silently skips on any error or missing data — this is an enhancement, not
 * critical-path logic.
 */
import type { MessageWithParts } from './knowledge-types.js';
/**
 * Creates a repo-map injector hook that auto-injects structural localization
 * context into architect messages when delegating to a coder.
 *
 * @param directory - The project directory containing .swarm/
 * @returns A hook function that injects repo-map context into messages
 */
export declare function createRepoMapInjectorHook(directory: string): (input: Record<string, never>, output: {
    messages?: MessageWithParts[];
}) => Promise<void>;
