/**
 * Handles /swarm close command - closes the swarm by archiving evidence,
 * writing retrospectives for in-progress phases, and clearing session state.
 * Must be idempotent - safe to run multiple times.
 */
export declare function handleCloseCommand(directory: string, args: string[]): Promise<string>;
