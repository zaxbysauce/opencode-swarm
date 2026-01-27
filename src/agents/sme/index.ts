import type { AgentDefinition } from '../architect';
import { type SMEDomainConfig, createSMEAgent } from './base';

// Import all SME configurations
import { activeDirectorySMEConfig } from './active-directory';
import { azureSMEConfig } from './azure';
import { linuxSMEConfig } from './linux';
import { networkSMEConfig } from './network';
import { oracleSMEConfig } from './oracle';
import { powershellSMEConfig } from './powershell';
import { pythonSMEConfig } from './python';
import { securitySMEConfig } from './security';
import { uiUxSMEConfig } from './ui-ux';
import { vmwareSMEConfig } from './vmware';
import { windowsSMEConfig } from './windows';

// Map of domain name to SME configuration
export const SME_CONFIGS: Record<string, SMEDomainConfig> = {
	windows: windowsSMEConfig,
	powershell: powershellSMEConfig,
	python: pythonSMEConfig,
	oracle: oracleSMEConfig,
	network: networkSMEConfig,
	security: securitySMEConfig,
	linux: linuxSMEConfig,
	vmware: vmwareSMEConfig,
	azure: azureSMEConfig,
	active_directory: activeDirectorySMEConfig,
	ui_ux: uiUxSMEConfig,
};

// Map of agent name to domain
export const AGENT_TO_DOMAIN: Record<string, string> = {
	sme_windows: 'windows',
	sme_powershell: 'powershell',
	sme_python: 'python',
	sme_oracle: 'oracle',
	sme_network: 'network',
	sme_security: 'security',
	sme_linux: 'linux',
	sme_vmware: 'vmware',
	sme_azure: 'azure',
	sme_active_directory: 'active_directory',
	sme_ui_ux: 'ui_ux',
};

/**
 * Create all SME agent definitions
 */
export function createAllSMEAgents(
	getModel: (agentName: string) => string,
	loadPrompt: (agentName: string) => { prompt?: string; appendPrompt?: string }
): AgentDefinition[] {
	return Object.entries(AGENT_TO_DOMAIN).map(([agentName, domain]) => {
		const config = SME_CONFIGS[domain];
		const model = getModel(agentName);
		const prompts = loadPrompt(agentName);

		return createSMEAgent(
			agentName,
			config,
			model,
			prompts.prompt,
			prompts.appendPrompt
		);
	});
}

/**
 * Get list of available SME domains
 */
export function listDomains(): string[] {
	return Object.keys(SME_CONFIGS);
}

/**
 * Get SME agent name for a domain
 */
export function domainToAgent(domain: string): string | undefined {
	const normalized = domain.toLowerCase().replace(/\s+/g, '_');
	if (SME_CONFIGS[normalized]) {
		return `sme_${normalized}`;
	}
	return undefined;
}

// Re-export base utilities
export { createSMEAgent, type SMEDomainConfig } from './base';
