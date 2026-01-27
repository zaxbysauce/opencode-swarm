import type { AgentDefinition } from '../architect';
import { type SMEDomainConfig } from './base';
export declare const SME_CONFIGS: Record<string, SMEDomainConfig>;
export declare const AGENT_TO_DOMAIN: Record<string, string>;
/**
 * Create all SME agent definitions
 */
export declare function createAllSMEAgents(getModel: (agentName: string) => string, loadPrompt: (agentName: string) => {
    prompt?: string;
    appendPrompt?: string;
}): AgentDefinition[];
/**
 * Get list of available SME domains
 */
export declare function listDomains(): string[];
/**
 * Get SME agent name for a domain
 */
export declare function domainToAgent(domain: string): string | undefined;
export { createSMEAgent, type SMEDomainConfig } from './base';
