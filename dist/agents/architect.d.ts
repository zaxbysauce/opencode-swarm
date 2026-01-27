import type { AgentConfig } from '@opencode-ai/sdk';
export interface AgentDefinition {
    name: string;
    description?: string;
    config: AgentConfig;
}
export declare function createArchitectAgent(model: string, customPrompt?: string, customAppendPrompt?: string): AgentDefinition;
