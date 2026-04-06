/**
 * Diff scope validator — compares files changed in git against the declared scope
 * for a given task in plan.json. Returns a warning string if undeclared files
 * were modified, or null if in-scope, no scope declared, or git unavailable.
 * Never throws.
 */
/**
 * Validate that git-changed files match the declared scope for a task.
 * Returns a warning string if undeclared files were modified, null otherwise.
 * Never throws.
 */
export declare function validateDiffScope(taskId: string, directory: string): Promise<string | null>;
