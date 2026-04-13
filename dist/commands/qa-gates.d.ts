/**
 * /swarm qa-gates command.
 *
 * View, enable, or add session overrides for QA gates tied to the current
 * plan's QA gate profile. Read-only display when called without arguments;
 * ratchet-tighter enable/override when called with `enable <gate>...` or
 * `override <gate>...`.
 *
 *   /swarm qa-gates                     -> show profile + effective gates
 *   /swarm qa-gates enable <gate>...    -> persist into profile (architect)
 *   /swarm qa-gates override <gate>...  -> session-only override
 *
 * Refuses to persist into a locked profile.
 */
export declare function handleQaGatesCommand(directory: string, args: string[], sessionID: string): Promise<string>;
