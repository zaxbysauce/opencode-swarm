import type { AgentConfig as SDKAgentConfig } from '@opencode-ai/sdk';
import { type PluginConfig } from '../config';
import { type AgentDefinition } from './architect';
export type { AgentDefinition } from './architect';
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
export { createExplorerAgent } from './explorer';
export { createReviewerAgent } from './reviewer';
export { createSMEAgent } from './sme';
export { createTestEngineerAgent } from './test-engineer';
