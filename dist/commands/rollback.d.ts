/**
 * Handle /swarm rollback command
 * Restores .swarm/ state from a checkpoint using direct overwrite
 */
export declare function handleRollbackCommand(directory: string, args: string[]): Promise<string>;
