import type { AgentConfig as SDKAgentConfig } from '@opencode-ai/sdk';
import {
	CATEGORY_PREFIXES,
	DEFAULT_MODELS,
	isQAAgent,
	isSMEAgent,
	isSubagent,
	ALL_SUBAGENT_NAMES,
} from '../config/constants';
import { loadAgentPrompt, type PluginConfig, type SwarmConfig } from '../config';
import { type AgentDefinition, createArchitectAgent } from './architect';
import { createAuditorAgent } from './auditor';
import { createCoderAgent } from './coder';
import { createExplorerAgent } from './explorer';
import { createSecurityReviewerAgent } from './security-reviewer';
import { createTestEngineerAgent } from './test-engineer';
import { createAllSMEAgents } from './sme';

export type { AgentDefinition } from './architect';

/**
 * Get the model for an agent within a specific swarm config
 */
function getModelForAgent(
	agentName: string,
	swarmAgents?: Record<string, { model?: string; temperature?: number; disabled?: boolean }>,
	swarmPrefix?: string
): string {
	// Strip swarm prefix if present (e.g., "local_coder" -> "coder")
	// Only strip if we have a known swarm prefix, not just any underscore
	let baseAgentName = agentName;
	if (swarmPrefix && agentName.startsWith(`${swarmPrefix}_`)) {
		baseAgentName = agentName.substring(swarmPrefix.length + 1);
	}

	// 1. Check explicit override
	const explicit = swarmAgents?.[baseAgentName]?.model;
	if (explicit) return explicit;

	// 2. Check category default for SME
	if (isSMEAgent(baseAgentName)) {
		const categoryModel = swarmAgents?.[CATEGORY_PREFIXES.sme]?.model;
		if (categoryModel) return categoryModel;
		return DEFAULT_MODELS._sme;
	}

	// 3. Check category default for QA
	if (isQAAgent(baseAgentName)) {
		const categoryModel = swarmAgents?.[CATEGORY_PREFIXES.qa]?.model;
		if (categoryModel) return categoryModel;
		return DEFAULT_MODELS._qa;
	}

	// 4. Default from constants
	return DEFAULT_MODELS[baseAgentName] ?? DEFAULT_MODELS.default;
}

/**
 * Check if an agent is disabled in swarm config
 */
function isAgentDisabled(
	agentName: string,
	swarmAgents?: Record<string, { disabled?: boolean }>,
	swarmPrefix?: string
): boolean {
	let baseAgentName = agentName;
	if (swarmPrefix && agentName.startsWith(`${swarmPrefix}_`)) {
		baseAgentName = agentName.substring(swarmPrefix.length + 1);
	}
	return swarmAgents?.[baseAgentName]?.disabled === true;
}

/**
 * Get temperature override for an agent
 */
function getTemperatureOverride(
	agentName: string,
	swarmAgents?: Record<string, { temperature?: number }>,
	swarmPrefix?: string
): number | undefined {
	let baseAgentName = agentName;
	if (swarmPrefix && agentName.startsWith(`${swarmPrefix}_`)) {
		baseAgentName = agentName.substring(swarmPrefix.length + 1);
	}
	return swarmAgents?.[baseAgentName]?.temperature;
}

/**
 * Apply config overrides to an agent definition
 */
function applyOverrides(
	agent: AgentDefinition,
	swarmAgents?: Record<string, { temperature?: number }>,
	swarmPrefix?: string
): AgentDefinition {
	const tempOverride = getTemperatureOverride(agent.name, swarmAgents, swarmPrefix);
	if (tempOverride !== undefined) {
		agent.config.temperature = tempOverride;
	}
	return agent;
}

/**
 * Create agents for a single swarm
 */
function createSwarmAgents(
	swarmId: string,
	swarmConfig: SwarmConfig,
	isDefault: boolean
): AgentDefinition[] {
	const agents: AgentDefinition[] = [];
	const swarmAgents = swarmConfig.agents;
	
	// Prefix for non-default swarms (e.g., "local" for swarmId "local")
	// We pass swarmId as the prefix identifier, but only prepend to names if not default
	const prefix = isDefault ? '' : `${swarmId}_`;
	const swarmPrefix = isDefault ? undefined : swarmId;
	
	// Helper to get model for agent (pass base name, not prefixed)
	const getModel = (baseName: string) => getModelForAgent(baseName, swarmAgents, swarmPrefix);

	// Helper to load custom prompts
	const getPrompts = (name: string) => loadAgentPrompt(name);
	
	// Helper to create prefixed agent name
	const prefixName = (name: string) => `${prefix}${name}`;

	// Generate the list of subagent names for this swarm's architect prompt
	const subagentNames = ALL_SUBAGENT_NAMES.map(name => `@${prefix}${name}`).join(' ');

	// 1. Create Architect
	if (!isAgentDisabled('architect', swarmAgents, swarmPrefix)) {
		const architectPrompts = getPrompts('architect');
		const architect = createArchitectAgent(
			getModel('architect'),
			architectPrompts.prompt,
			architectPrompts.appendPrompt
		);
		architect.name = prefixName('architect');
		
		// Replace placeholders in architect prompt
		const swarmName = swarmConfig.name || swarmId;
		const swarmIdentity = isDefault ? 'default' : swarmId;
		const agentPrefix = prefix; // Empty for default, "local_" for local, etc.
		
		architect.config.prompt = architect.config.prompt
			?.replace(/\{\{SWARM_ID\}\}/g, swarmIdentity)
			.replace(/\{\{AGENT_PREFIX\}\}/g, agentPrefix);
		
		// Add warning header for non-default swarms
		if (!isDefault) {
			architect.description = `[${swarmName}] ${architect.description}`;
			const swarmHeader = `## ⚠️ YOU ARE THE ${swarmName.toUpperCase()} SWARM ARCHITECT

Your agents all have the "${swarmId}_" prefix. You MUST use this prefix when delegating.
If you call an agent WITHOUT the "${swarmId}_" prefix, you will call the WRONG swarm's agents!

`;
			architect.config.prompt = swarmHeader + architect.config.prompt;
		}
		
		agents.push(applyOverrides(architect, swarmAgents, swarmPrefix));
	}

	// 2. Create Explorer
	if (!isAgentDisabled('explorer', swarmAgents, swarmPrefix)) {
		const explorerPrompts = getPrompts('explorer');
		const explorer = createExplorerAgent(
			getModel('explorer'),
			explorerPrompts.prompt,
			explorerPrompts.appendPrompt
		);
		explorer.name = prefixName('explorer');
		agents.push(applyOverrides(explorer, swarmAgents, swarmPrefix));
	}

	// 3. Create all SME agents
	const smeAgents = createAllSMEAgents(getModel, getPrompts);
	for (const sme of smeAgents) {
		// Check disabled using the base SME name (e.g., "sme_powershell")
		if (!isAgentDisabled(sme.name, swarmAgents, swarmPrefix)) {
			const baseName = sme.name;
			sme.name = prefixName(baseName);
			agents.push(applyOverrides(sme, swarmAgents, swarmPrefix));
		}
	}

	// 4. Create pipeline agents
	if (!isAgentDisabled('coder', swarmAgents, swarmPrefix)) {
		const coderPrompts = getPrompts('coder');
		const coder = createCoderAgent(
			getModel('coder'),
			coderPrompts.prompt,
			coderPrompts.appendPrompt
		);
		coder.name = prefixName('coder');
		agents.push(applyOverrides(coder, swarmAgents, swarmPrefix));
	}

	if (!isAgentDisabled('security_reviewer', swarmAgents, swarmPrefix)) {
		const securityPrompts = getPrompts('security_reviewer');
		const security = createSecurityReviewerAgent(
			getModel('security_reviewer'),
			securityPrompts.prompt,
			securityPrompts.appendPrompt
		);
		security.name = prefixName('security_reviewer');
		agents.push(applyOverrides(security, swarmAgents, swarmPrefix));
	}

	if (!isAgentDisabled('auditor', swarmAgents, swarmPrefix)) {
		const auditorPrompts = getPrompts('auditor');
		const auditor = createAuditorAgent(
			getModel('auditor'),
			auditorPrompts.prompt,
			auditorPrompts.appendPrompt
		);
		auditor.name = prefixName('auditor');
		agents.push(applyOverrides(auditor, swarmAgents, swarmPrefix));
	}

	if (!isAgentDisabled('test_engineer', swarmAgents, swarmPrefix)) {
		const testPrompts = getPrompts('test_engineer');
		const testEngineer = createTestEngineerAgent(
			getModel('test_engineer'),
			testPrompts.prompt,
			testPrompts.appendPrompt
		);
		testEngineer.name = prefixName('test_engineer');
		agents.push(applyOverrides(testEngineer, swarmAgents, swarmPrefix));
	}

	return agents;
}

/**
 * Create all agent definitions with configuration applied
 */
export function createAgents(config?: PluginConfig): AgentDefinition[] {
	const allAgents: AgentDefinition[] = [];

	// Check if we have swarms configured
	const swarms = config?.swarms;
	
	if (swarms && Object.keys(swarms).length > 0) {
		// Multiple swarms mode
		const swarmIds = Object.keys(swarms);
		
		// Determine which swarm is the default (first one, or one named "default")
		const defaultSwarmId = swarmIds.includes('default') ? 'default' : swarmIds[0];
		
		for (const swarmId of swarmIds) {
			const swarmConfig = swarms[swarmId];
			const isDefault = swarmId === defaultSwarmId;
			const swarmAgents = createSwarmAgents(swarmId, swarmConfig, isDefault);
			allAgents.push(...swarmAgents);
		}
	} else {
		// Legacy single swarm mode - use top-level agents config
		const legacySwarmConfig: SwarmConfig = {
			name: 'Default',
			agents: config?.agents,
		};
		const swarmAgents = createSwarmAgents('default', legacySwarmConfig, true);
		allAgents.push(...swarmAgents);
	}

	return allAgents;
}

/**
 * Get agent configurations formatted for the OpenCode SDK.
 */
export function getAgentConfigs(
	config?: PluginConfig
): Record<string, SDKAgentConfig> {
	const agents = createAgents(config);

	return Object.fromEntries(
		agents.map((agent) => {
			const sdkConfig: SDKAgentConfig = {
				...agent.config,
				description: agent.description,
			};

			// Apply mode based on agent type
			// Architects are primary, everything else is subagent
			if (agent.name === 'architect' || agent.name.endsWith('_architect')) {
				sdkConfig.mode = 'primary';
			} else {
				sdkConfig.mode = 'subagent';
			}

			return [agent.name, sdkConfig];
		})
	);
}

// Re-export agent types
export { createArchitectAgent } from './architect';
export { createCoderAgent } from './coder';
export { createExplorerAgent } from './explorer';
export { createSecurityReviewerAgent } from './security-reviewer';
export { createAuditorAgent } from './auditor';
export { createTestEngineerAgent } from './test-engineer';
export { createAllSMEAgents, createSMEAgent, listDomains } from './sme';
