/**
 * Role-Scoped Context Injection Filter
 * Filters context entries based on [FOR: ...] tags for role-based context delivery.
 */
/**
 * Context entry with role metadata
 */
export interface ContextEntry {
    role: 'user' | 'assistant' | 'system';
    content: string;
    name?: string;
}
/**
 * Filter context entries based on target role and [FOR: ...] tags.
 *
 * Filtering rules:
 * - Entries with [FOR: ALL] are included for all agents
 * - Entries with [FOR: specific_agents] are included only for named agents
 * - Entries without [FOR: ...] tag are included for all agents (backward compatibility)
 * - System prompts, delegation envelopes, plan content, and knowledge entries are never filtered
 *
 * @param entries - Array of context entries to filter
 * @param targetRole - The target agent role to filter for
 * @param directory - Optional project directory for metrics logging (defaults to cwd)
 * @returns Filtered array of context entries
 */
export declare function filterByRole(entries: ContextEntry[], targetRole: string, directory?: string): ContextEntry[];
