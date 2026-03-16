import type { AgentDefinition } from './types';
export declare function createExplorerAgent(model: string, customPrompt?: string, customAppendPrompt?: string): AgentDefinition;
export declare function createExplorerCuratorAgent(model: string, mode: 'CURATOR_INIT' | 'CURATOR_PHASE', customAppendPrompt?: string): AgentDefinition;
