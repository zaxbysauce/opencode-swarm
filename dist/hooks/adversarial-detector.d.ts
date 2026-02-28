import type { PluginConfig } from '../config';
/**
 * Resolve the model for a given agent by checking config overrides,
 * swarm configurations, and falling back to defaults.
 */
export declare function resolveAgentModel(agentName: string, config: PluginConfig): string;
/**
 * Detect if two agents share the same model (adversarial pair).
 * Returns the shared model string if matched, null otherwise.
 */
export declare function detectAdversarialPair(agentA: string, agentB: string, config: PluginConfig): string | null;
/**
 * Format an adversarial warning message based on policy.
 */
export declare function formatAdversarialWarning(agentA: string, agentB: string, sharedModel: string, policy: string): string;
