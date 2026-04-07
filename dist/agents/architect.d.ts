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
export declare function createArchitectAgent(model: string, customPrompt?: string, customAppendPrompt?: string, adversarialTesting?: AdversarialTestingConfig): AgentDefinition;
