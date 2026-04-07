/**
 * Handles the /swarm retrieve command.
 * Loads full tool output from .swarm/summaries/{id}.json and returns it.
 */
export declare function handleRetrieveCommand(directory: string, args: string[]): Promise<string>;
