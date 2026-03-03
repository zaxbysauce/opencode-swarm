/**
 * Handles /swarm knowledge quarantine <id> [reason] command.
 * Moves a knowledge entry to quarantine with optional reason.
 */
export declare function handleKnowledgeQuarantineCommand(directory: string, args: string[]): Promise<string>;
/**
 * Handles /swarm knowledge restore <id> command.
 * Restores a quarantined knowledge entry.
 */
export declare function handleKnowledgeRestoreCommand(directory: string, args: string[]): Promise<string>;
/**
 * Handles /swarm knowledge migrate [directory] command.
 * Triggers one-time migration from .swarm/context.md to .swarm/knowledge.jsonl.
 */
export declare function handleKnowledgeMigrateCommand(directory: string, args: string[]): Promise<string>;
