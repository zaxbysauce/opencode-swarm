import type { AgentDefinition } from './architect';
export type CuratorRole = 'curator_init' | 'curator_phase';
/**
 * Create a Curator agent definition for the given role.
 *
 * Follows the same pattern as createCriticAgent:
 * - Two named variants: curator_init and curator_phase
 * - Each carries its own baked-in system prompt so the correct agent is
 *   resolved by name in any swarm (default or prefixed)
 * - customPrompt replaces the default prompt entirely; customAppendPrompt
 *   appends to the role-specific default (same semantics as createCriticAgent)
 * - Read-only tool config: write/edit/patch all false
 */
export declare function createCuratorAgent(model: string, customPrompt?: string, customAppendPrompt?: string, role?: CuratorRole): AgentDefinition;
