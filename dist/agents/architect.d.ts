import type { AgentConfig } from '@opencode-ai/sdk';
export interface AgentDefinition {
    name: string;
    description?: string;
    config: AgentConfig;
}
export interface AdversarialTestingConfig {
    enabled: boolean;
    scope: 'all' | 'security-only';
}
/**
 * Subset of PluginConfig.council needed to gate the Work Complete Council
 * workflow block in the architect prompt. Only `enabled` is consumed here —
 * runtime behavior (maxRounds, timeout, veto priority) is enforced elsewhere
 * via the council tools and config. Keeping this shape narrow avoids pulling
 * the full PluginConfig type into the agent-prompt layer.
 */
export interface CouncilWorkflowConfig {
    enabled?: boolean;
}
/**
 * Build the Work Complete Council four-phase workflow block. Returns the full
 * block text when council.enabled === true, otherwise the empty string. The
 * empty-string return path guarantees byte-for-byte non-regression when the
 * council feature is off or the config key is absent.
 */
export declare function buildCouncilWorkflow(council?: CouncilWorkflowConfig): string;
export declare function createArchitectAgent(model: string, customPrompt?: string, customAppendPrompt?: string, adversarialTesting?: AdversarialTestingConfig, council?: CouncilWorkflowConfig): AgentDefinition;
