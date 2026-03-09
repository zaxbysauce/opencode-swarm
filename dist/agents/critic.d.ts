import type { AgentDefinition } from './architect';
export declare function createCriticAgent(model: string, customPrompt?: string, customAppendPrompt?: string): AgentDefinition;
export declare function createCriticDriftAgent(model: string, customAppendPrompt?: string): AgentDefinition;
