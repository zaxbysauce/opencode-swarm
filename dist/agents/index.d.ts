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
 * Resolve the fallback model for an agent based on its config and fallback index.
 * Called by guardrails at runtime when a transient model error is detected.
 *
 * Fallback inheritance:
 * - curator_init/curator_phase inherit fallback_models from explorer if not explicitly configured
 * - This matches the model inheritance: curator agents default to explorer's model
 */
export declare function resolveFallbackModel(agentBaseName: string, fallbackIndex: number, swarmAgents?: Record<string, {
    model?: string;
    temperature?: number;
    disabled?: boolean;
    fallback_models?: string[];
}>): string | null;
/**
 * Get the swarm agents config (for runtime fallback resolution by guardrails).
 */
export declare function getSwarmAgents(): Record<string, {
    model?: string;
    fallback_models?: string[];
    disabled?: boolean;
}> | undefined;
/**
 * Create all agent definitions with configuration applied
 */
export declare function createAgents(config?: PluginConfig): AgentDefinition[];
/**
 * Get agent configurations formatted for the OpenCode SDK.
 */
export declare function getAgentConfigs(config?: PluginConfig, directory?: string, sessionId?: string): Record<string, SDKAgentConfig>;
export { createArchitectAgent } from './architect';
export { createCoderAgent } from './coder';
export { DOMAIN_EXPERT_COUNCIL_PROMPT, GENERALIST_COUNCIL_PROMPT, SKEPTIC_COUNCIL_PROMPT, } from './council-prompts';
export { createCriticAgent } from './critic';
export { createCuratorAgent } from './curator-agent';
export { createDesignerAgent } from './designer';
export { createDocsAgent } from './docs';
export { createExplorerAgent } from './explorer';
export { createReviewerAgent, SECURITY_CATEGORIES, type SecurityCategory, } from './reviewer';
export { createSMEAgent } from './sme';
export { createTestEngineerAgent } from './test-engineer';
