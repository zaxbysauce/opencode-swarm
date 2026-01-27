import type { AgentDefinition } from '../architect';
/**
 * SME domain configuration
 */
export interface SMEDomainConfig {
    domain: string;
    description: string;
    guidance: string;
}
/**
 * Create an SME agent definition
 */
export declare function createSMEAgent(agentName: string, domainConfig: SMEDomainConfig, model: string, customPrompt?: string, customAppendPrompt?: string): AgentDefinition;
