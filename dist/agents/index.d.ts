import type { AgentConfig as SDKAgentConfig } from '@opencode-ai/sdk';
import { type PluginConfig } from '../config';
import { type AgentDefinition } from './architect';
export type { AgentDefinition } from './architect';
/**
 * Strip the swarm prefix from an agent name to get the base name.
 * e.g., "local_coder" with prefix "local" → "coder"
 * Returns the name unchanged if no prefix matches.
 */
export declare function stripSwarmPrefix(agentName: string, swarmPrefix?: string): string;
/**
 * Create all agent definitions with configuration applied
 */
export declare function createAgents(config?: PluginConfig): AgentDefinition[];
/**
 * Get agent configurations formatted for the OpenCode SDK.
 */
export declare function getAgentConfigs(config?: PluginConfig): Record<string, SDKAgentConfig>;
export { createArchitectAgent } from './architect';
export { createCoderAgent } from './coder';
export { createCriticAgent } from './critic';
export { createDesignerAgent } from './designer';
export { createDocsAgent } from './docs';
export { createExplorerAgent } from './explorer';
export { createReviewerAgent, SECURITY_CATEGORIES, type SecurityCategory, } from './reviewer';
export { createSMEAgent } from './sme';
export { createTestEngineerAgent } from './test-engineer';
