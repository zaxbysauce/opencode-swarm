/**
 * Handles /swarm dark-matter command.
 * Detects hidden couplings (files that co-change without explicit import relationships).
 */
export declare function handleDarkMatterCommand(directory: string, args: string[]): Promise<string>;
