/**
 * Platform-agnostic agent definition interface.
 * Used by core agent files without any SDK dependency.
 */
export interface AgentDefinition {
    name: string;
    description?: string;
    prompt: string;
    toolPermissions?: string[];
    defaultModel?: string;
}
