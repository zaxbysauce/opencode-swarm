/**
 * Validate checkpoint label - no shell metacharacters or path traversal
 */
export declare function validateLabel(label: string): string | null;
/**
 * Check if we're in a git repository
 */
export declare function isGitRepo(): boolean;
/**
 * Handle 'save' action - create checkpoint commit and log it
 */
export declare function handleSave(label: string, directory: string): string;
/**
 * Handle 'restore' action - soft reset to saved SHA
 */
export declare function handleRestore(label: string, directory: string): string;
/**
 * Handle 'list' action - return all checkpoints
 */
export declare function handleList(directory: string): string;
/**
 * Handle 'delete' action - remove entry from log (git commit remains)
 */
export declare function handleDelete(label: string, directory: string): string;
