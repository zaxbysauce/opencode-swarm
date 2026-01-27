import type { AgentConfig as SDKAgentConfig } from '@opencode-ai/sdk';
import {
	CATEGORY_PREFIXES,
	DEFAULT_MODELS,
	QA_AGENTS,
	SME_AGENTS,
	isQAAgent,
	isSMEAgent,
	isSubagent,
} from '../config/constants';
import { loadAgentPrompt, type PluginConfig } from '../config';
import { type AgentDefinition, createArchitectAgent } from './architect';
import { createAuditorAgent } from './auditor';
import { createCoderAgent } from './coder';
import { createSecurityReviewerAgent } from './security-reviewer';
import { createTestEngineerAgent } from './test-engineer';
import { createAllSMEAgents } from './sme';

export type { AgentDefinition } from './architect';

/**
 * Get the model for an agent, considering category defaults and explicit overrides.
 *
 * Priority:
 * 1. Explicit agent override (config.agents[agentName].model)
 * 2. Category default (config.agents['_sme'].model or config.agents['_qa'].model)
 * 3. Default model from constants
 */
function getModelForAgent(agentName: string, config?: PluginConfig): string {
	// 1. Check explicit override
	const explicit = config?.agents?.[agentName]?.model;
	if (explicit) return explicit;

	// 2. Check category default
	if (isSMEAgent(agentName)) {
		const categoryModel = config?.agents?.[CATEGORY_PREFIXES.sme]?.model;
		if (categoryModel) return categoryModel;
		return DEFAULT_MODELS._sme;
	}

	if (isQAAgent(agentName)) {
		const categoryModel = config?.agents?.[CATEGORY_PREFIXES.qa]?.model;
		if (categoryModel) return categoryModel;
		return DEFAULT_MODELS._qa;
	}

	// 3. Default from constants
	return DEFAULT_MODELS[agentName] ?? DEFAULT_MODELS.default;
}

/**
 * Check if an agent is disabled in config
 */
function isAgentDisabled(agentName: string, config?: PluginConfig): boolean {
	return config?.agents?.[agentName]?.disabled === true;
}

/**
 * Get temperature override for an agent
 */
function getTemperatureOverride(
	agentName: string,
	config?: PluginConfig
): number | undefined {
	return config?.agents?.[agentName]?.temperature;
}

/**
 * Apply config overrides to an agent definition
 */
function applyOverrides(
	agent: AgentDefinition,
	config?: PluginConfig
): AgentDefinition {
	const tempOverride = getTemperatureOverride(agent.name, config);
	if (tempOverride !== undefined) {
		agent.config.temperature = tempOverride;
	}
	return agent;
}

/**
 * Create all agent definitions with configuration applied
 */
export function createAgents(config?: PluginConfig): AgentDefinition[] {
	const agents: AgentDefinition[] = [];

	// Helper to get model for agent
	const getModel = (name: string) => getModelForAgent(name, config);

	// Helper to load custom prompts
	const getPrompts = (name: string) => loadAgentPrompt(name);

	// 1. Create Architect (primary orchestrator)
	if (!isAgentDisabled('architect', config)) {
		const architectPrompts = getPrompts('architect');
		const architect = createArchitectAgent(
			getModel('architect'),
			architectPrompts.prompt,
			architectPrompts.appendPrompt
		);
		agents.push(applyOverrides(architect, config));
	}

	// 2. Create all SME agents
	const smeAgents = createAllSMEAgents(getModel, getPrompts);
	for (const sme of smeAgents) {
		if (!isAgentDisabled(sme.name, config)) {
			agents.push(applyOverrides(sme, config));
		}
	}

	// 3. Create pipeline agents (coder, security_reviewer, auditor, test_engineer)
	if (!isAgentDisabled('coder', config)) {
		const coderPrompts = getPrompts('coder');
		const coder = createCoderAgent(
			getModel('coder'),
			coderPrompts.prompt,
			coderPrompts.appendPrompt
		);
		agents.push(applyOverrides(coder, config));
	}

	if (!isAgentDisabled('security_reviewer', config)) {
		const securityPrompts = getPrompts('security_reviewer');
		const security = createSecurityReviewerAgent(
			getModel('security_reviewer'),
			securityPrompts.prompt,
			securityPrompts.appendPrompt
		);
		agents.push(applyOverrides(security, config));
	}

	if (!isAgentDisabled('auditor', config)) {
		const auditorPrompts = getPrompts('auditor');
		const auditor = createAuditorAgent(
			getModel('auditor'),
			auditorPrompts.prompt,
			auditorPrompts.appendPrompt
		);
		agents.push(applyOverrides(auditor, config));
	}

	if (!isAgentDisabled('test_engineer', config)) {
		const testPrompts = getPrompts('test_engineer');
		const testEngineer = createTestEngineerAgent(
			getModel('test_engineer'),
			testPrompts.prompt,
			testPrompts.appendPrompt
		);
		agents.push(applyOverrides(testEngineer, config));
	}

	return agents;
}

/**
 * Get agent configurations formatted for the OpenCode SDK.
 * Converts agent definitions to SDK config format and applies mode metadata.
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
			if (agent.name === 'architect') {
				sdkConfig.mode = 'primary';
			} else if (isSubagent(agent.name)) {
				sdkConfig.mode = 'subagent';
			}

			return [agent.name, sdkConfig];
		})
	);
}

// Re-export agent types
export { createArchitectAgent } from './architect';
export { createCoderAgent } from './coder';
export { createSecurityReviewerAgent } from './security-reviewer';
export { createAuditorAgent } from './auditor';
export { createTestEngineerAgent } from './test-engineer';
export { createAllSMEAgents, createSMEAgent, listDomains } from './sme';
