/**
 * Handle /swarm checkpoint command
 * Creates, lists, restores, or deletes checkpoints with optional label
 */
export declare function handleCheckpointCommand(directory: string, args: string[]): Promise<string>;
