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
 * Converts agent definitions to SDK config format and applies mode metadata.
 */
export declare function getAgentConfigs(config?: PluginConfig): Record<string, SDKAgentConfig>;
export { createArchitectAgent } from './architect';
export { createCoderAgent } from './coder';
export { createSecurityReviewerAgent } from './security-reviewer';
export { createAuditorAgent } from './auditor';
export { createTestEngineerAgent } from './test-engineer';
export { createAllSMEAgents, createSMEAgent, listDomains } from './sme';
