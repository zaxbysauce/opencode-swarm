import type { AgentConfig as SDKAgentConfig } from '@opencode-ai/sdk';
import {
	loadAgentPrompt,
	type PluginConfig,
	type SwarmConfig,
} from '../config';
import { DEFAULT_MODELS } from '../config/constants';
import { type AgentDefinition, createArchitectAgent } from './architect';
import { createCoderAgent } from './coder';
import { createCriticAgent } from './critic';
import { createExplorerAgent } from './explorer';
import { createReviewerAgent } from './reviewer';
import { createSMEAgent } from './sme';
import { createTestEngineerAgent } from './test-engineer';

export type { AgentDefinition } from './architect';

/**
 * Get the model for an agent within a specific swarm config
 */
function getModelForAgent(
	agentName: string,
	swarmAgents?: Record<
		string,
		{ model?: string; temperature?: number; disabled?: boolean }
	>,
	swarmPrefix?: string,
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

	// 2. Default from constants
	return DEFAULT_MODELS[baseAgentName] ?? DEFAULT_MODELS.default;
}

/**
 * Check if an agent is disabled in swarm config
 */
function isAgentDisabled(
	agentName: string,
	swarmAgents?: Record<string, { disabled?: boolean }>,
	swarmPrefix?: string,
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
	swarmPrefix?: string,
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
	swarmPrefix?: string,
): AgentDefinition {
	const tempOverride = getTemperatureOverride(
		agent.name,
		swarmAgents,
		swarmPrefix,
	);
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
	isDefault: boolean,
	pluginConfig?: PluginConfig,
): AgentDefinition[] {
	const agents: AgentDefinition[] = [];
	const swarmAgents = swarmConfig.agents;

	// Prefix for non-default swarms (e.g., "local" for swarmId "local")
	// We pass swarmId as the prefix identifier, but only prepend to names if not default
	const prefix = isDefault ? '' : `${swarmId}_`;
	const swarmPrefix = isDefault ? undefined : swarmId;

	// Get qa_retry_limit from config (default: 3)
	const qaRetryLimit = pluginConfig?.qa_retry_limit ?? 3;

	// Helper to get model for agent (pass base name, not prefixed)
	const getModel = (baseName: string) =>
		getModelForAgent(baseName, swarmAgents, swarmPrefix);

	// Helper to load custom prompts
	const getPrompts = (name: string) => loadAgentPrompt(name);

	// Helper to create prefixed agent name
	const prefixName = (name: string) => `${prefix}${name}`;

	// 1. Create Architect
	if (!isAgentDisabled('architect', swarmAgents, swarmPrefix)) {
		const architectPrompts = getPrompts('architect');
		const architect = createArchitectAgent(
			getModel('architect'),
			architectPrompts.prompt,
			architectPrompts.appendPrompt,
		);
		architect.name = prefixName('architect');

		// Replace placeholders in architect prompt
		const swarmName = swarmConfig.name || swarmId;
		const swarmIdentity = isDefault ? 'default' : swarmId;
		const agentPrefix = prefix; // Empty for default, "cloud_" for cloud, "local_" for local, etc.

		architect.config.prompt = architect.config.prompt
			?.replace(/\{\{SWARM_ID\}\}/g, swarmIdentity)
			.replace(/\{\{AGENT_PREFIX\}\}/g, agentPrefix)
			.replace(/\{\{QA_RETRY_LIMIT\}\}/g, String(qaRetryLimit));

		// Add swarm identity header for non-default swarms
		if (!isDefault) {
			architect.description = `[${swarmName}] ${architect.description}`;
			const swarmHeader = `## ⚠️ YOU ARE THE ${swarmName.toUpperCase()} SWARM ARCHITECT

Your swarm ID is "${swarmId}". ALL your agents have the "${swarmId}_" prefix:
- @${swarmId}_explorer (not @explorer)
- @${swarmId}_coder (not @coder)
- @${swarmId}_sme (not @sme)
- @${swarmId}_reviewer (not @reviewer)
- etc.

CRITICAL: Agents without the "${swarmId}_" prefix DO NOT EXIST or belong to a DIFFERENT swarm.
If you call @coder instead of @${swarmId}_coder, the call will FAIL or go to the wrong swarm.

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
			explorerPrompts.appendPrompt,
		);
		explorer.name = prefixName('explorer');
		agents.push(applyOverrides(explorer, swarmAgents, swarmPrefix));
	}

	// 3. Create SME agent
	if (!isAgentDisabled('sme', swarmAgents, swarmPrefix)) {
		const smePrompts = getPrompts('sme');
		const sme = createSMEAgent(
			getModel('sme'),
			smePrompts.prompt,
			smePrompts.appendPrompt,
		);
		sme.name = prefixName('sme');
		agents.push(applyOverrides(sme, swarmAgents, swarmPrefix));
	}

	// 4. Create pipeline agents
	if (!isAgentDisabled('coder', swarmAgents, swarmPrefix)) {
		const coderPrompts = getPrompts('coder');
		const coder = createCoderAgent(
			getModel('coder'),
			coderPrompts.prompt,
			coderPrompts.appendPrompt,
		);
		coder.name = prefixName('coder');
		agents.push(applyOverrides(coder, swarmAgents, swarmPrefix));
	}

	if (!isAgentDisabled('reviewer', swarmAgents, swarmPrefix)) {
		const reviewerPrompts = getPrompts('reviewer');
		const reviewer = createReviewerAgent(
			getModel('reviewer'),
			reviewerPrompts.prompt,
			reviewerPrompts.appendPrompt,
		);
		reviewer.name = prefixName('reviewer');
		agents.push(applyOverrides(reviewer, swarmAgents, swarmPrefix));
	}

	if (!isAgentDisabled('critic', swarmAgents, swarmPrefix)) {
		const criticPrompts = getPrompts('critic');
		const critic = createCriticAgent(
			getModel('critic'),
			criticPrompts.prompt,
			criticPrompts.appendPrompt,
		);
		critic.name = prefixName('critic');
		agents.push(applyOverrides(critic, swarmAgents, swarmPrefix));
	}

	if (!isAgentDisabled('test_engineer', swarmAgents, swarmPrefix)) {
		const testPrompts = getPrompts('test_engineer');
		const testEngineer = createTestEngineerAgent(
			getModel('test_engineer'),
			testPrompts.prompt,
			testPrompts.appendPrompt,
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
		// Only a swarm explicitly named "default" gets unprefixed agents
		// All other swarms get prefixed (cloud_*, local_*, etc.)
		for (const swarmId of Object.keys(swarms)) {
			const swarmConfig = swarms[swarmId];
			const isDefault = swarmId === 'default';
			const swarmAgents = createSwarmAgents(
				swarmId,
				swarmConfig,
				isDefault,
				config,
			);
			allAgents.push(...swarmAgents);
		}
	} else {
		// Legacy single swarm mode - use top-level agents config
		const legacySwarmConfig: SwarmConfig = {
			name: 'Default',
			agents: config?.agents,
		};
		const swarmAgents = createSwarmAgents(
			'default',
			legacySwarmConfig,
			true,
			config,
		);
		allAgents.push(...swarmAgents);
	}

	return allAgents;
}

/**
 * Get agent configurations formatted for the OpenCode SDK.
 */
export function getAgentConfigs(
	config?: PluginConfig,
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
		}),
	);
}

// Re-export agent types
export { createArchitectAgent } from './architect';
export { createCoderAgent } from './coder';
export { createCriticAgent } from './critic';
export { createExplorerAgent } from './explorer';
export { createReviewerAgent } from './reviewer';
export { createSMEAgent } from './sme';
export { createTestEngineerAgent } from './test-engineer';
