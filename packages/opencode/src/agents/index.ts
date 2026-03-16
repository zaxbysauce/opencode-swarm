import type { AgentConfig as SDKAgentConfig } from '@opencode-ai/sdk';
import {
	AGENT_TOOL_MAP,
	type AgentDefinition as CoreAgentDefinition,
	createCoderAgent as createCoreCoderAgent,
	createCriticAgent as createCoreCriticAgent,
	createDesignerAgent as createCoreDesignerAgent,
	createDocsAgent as createCoreDocsAgent,
	createExplorerAgent as createCoreExplorerAgent,
	createReviewerAgent as createCoreReviewerAgent,
	createSMEAgent as createCoreSMEAgent,
	createTestEngineerAgent as createCoreTestEngineerAgent,
	loadAgentPrompt,
	type PluginConfig,
	type SwarmConfig,
	stripKnownSwarmPrefix,
} from '@opencode-swarm/core';
import { DEFAULT_MODELS } from '../models';
import { type AgentDefinition, createArchitectAgent } from './architect';

export type { AgentDefinition } from './architect';

/**
 * Convert core AgentDefinition (platform-agnostic) to OpenCode AgentDefinition (SDK-dependent)
 */
function coreToOpenCodeAgentDef(
	coreDef: CoreAgentDefinition,
	model: string,
): AgentDefinition {
	return {
		name: coreDef.name,
		description: coreDef.description,
		config: {
			model,
			temperature: 0.2,
			prompt: coreDef.prompt,
			...(coreDef.toolPermissions && {
				tools: coreDef.toolPermissions.reduce(
					(acc, tool) => {
						acc[tool] = true;
						return acc;
					},
					{} as Record<string, boolean>,
				),
			}),
		},
	};
}

/**
 * Strip the swarm prefix from an agent name to get the base name.
 * e.g., "local_coder" with prefix "local" → "coder"
 * Returns the name unchanged if no prefix matches.
 */
export function stripSwarmPrefix(
	agentName: string,
	swarmPrefix?: string,
): string {
	if (!swarmPrefix || !agentName) return agentName;
	const prefixWithUnderscore = `${swarmPrefix}_`;
	if (agentName.startsWith(prefixWithUnderscore)) {
		return agentName.substring(prefixWithUnderscore.length);
	}
	return agentName;
}

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
	const baseAgentName = stripSwarmPrefix(agentName, swarmPrefix);

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
	const baseAgentName = stripSwarmPrefix(agentName, swarmPrefix);
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
	const baseAgentName = stripSwarmPrefix(agentName, swarmPrefix);
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
			pluginConfig?.adversarial_testing?.enabled,
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
		const coreAgent = createCoreExplorerAgent(
			getModel('explorer'),
			explorerPrompts.prompt,
			explorerPrompts.appendPrompt,
		);
		const explorer = coreToOpenCodeAgentDef(coreAgent, getModel('explorer'));
		explorer.name = prefixName('explorer');
		agents.push(applyOverrides(explorer, swarmAgents, swarmPrefix));
	}

	// 3. Create SME agent
	if (!isAgentDisabled('sme', swarmAgents, swarmPrefix)) {
		const smePrompts = getPrompts('sme');
		const coreAgent = createCoreSMEAgent(
			getModel('sme'),
			smePrompts.prompt,
			smePrompts.appendPrompt,
		);
		const sme = coreToOpenCodeAgentDef(coreAgent, getModel('sme'));
		sme.name = prefixName('sme');
		agents.push(applyOverrides(sme, swarmAgents, swarmPrefix));
	}

	// 4. Create pipeline agents
	if (!isAgentDisabled('coder', swarmAgents, swarmPrefix)) {
		const coderPrompts = getPrompts('coder');
		const coreAgent = createCoreCoderAgent(
			getModel('coder'),
			coderPrompts.prompt,
			coderPrompts.appendPrompt,
		);
		const coder = coreToOpenCodeAgentDef(coreAgent, getModel('coder'));
		coder.name = prefixName('coder');
		agents.push(applyOverrides(coder, swarmAgents, swarmPrefix));
	}

	if (!isAgentDisabled('reviewer', swarmAgents, swarmPrefix)) {
		const reviewerPrompts = getPrompts('reviewer');
		const coreAgent = createCoreReviewerAgent(
			getModel('reviewer'),
			reviewerPrompts.prompt,
			reviewerPrompts.appendPrompt,
		);
		const reviewer = coreToOpenCodeAgentDef(coreAgent, getModel('reviewer'));
		reviewer.name = prefixName('reviewer');
		agents.push(applyOverrides(reviewer, swarmAgents, swarmPrefix));
	}

	if (!isAgentDisabled('critic', swarmAgents, swarmPrefix)) {
		const criticPrompts = getPrompts('critic');
		const coreAgent = createCoreCriticAgent(
			getModel('critic'),
			criticPrompts.prompt,
			criticPrompts.appendPrompt,
		);
		const critic = coreToOpenCodeAgentDef(coreAgent, getModel('critic'));
		critic.name = prefixName('critic');
		agents.push(applyOverrides(critic, swarmAgents, swarmPrefix));
	}

	if (!isAgentDisabled('test_engineer', swarmAgents, swarmPrefix)) {
		const testPrompts = getPrompts('test_engineer');
		const coreAgent = createCoreTestEngineerAgent(
			getModel('test_engineer'),
			testPrompts.prompt,
			testPrompts.appendPrompt,
		);
		const testEngineer = coreToOpenCodeAgentDef(
			coreAgent,
			getModel('test_engineer'),
		);
		testEngineer.name = prefixName('test_engineer');
		agents.push(applyOverrides(testEngineer, swarmAgents, swarmPrefix));
	}

	// 8. Create Docs agent (enabled by default — must be explicitly disabled)
	if (!isAgentDisabled('docs', swarmAgents, swarmPrefix)) {
		const docsPrompts = getPrompts('docs');
		const coreAgent = createCoreDocsAgent(
			getModel('docs'),
			docsPrompts.prompt,
			docsPrompts.appendPrompt,
		);
		const docs = coreToOpenCodeAgentDef(coreAgent, getModel('docs'));
		docs.name = prefixName('docs');
		agents.push(applyOverrides(docs, swarmAgents, swarmPrefix));
	}

	// 9. Create Designer agent (opt-in — only when ui_review.enabled === true)
	if (
		pluginConfig?.ui_review?.enabled === true &&
		!isAgentDisabled('designer', swarmAgents, swarmPrefix)
	) {
		const designerPrompts = getPrompts('designer');
		const coreAgent = createCoreDesignerAgent(
			getModel('designer'),
			designerPrompts.prompt,
			designerPrompts.appendPrompt,
		);
		const designer = coreToOpenCodeAgentDef(coreAgent, getModel('designer'));
		designer.name = prefixName('designer');
		agents.push(applyOverrides(designer, swarmAgents, swarmPrefix));
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

	// Check if tool filtering is disabled globally
	const toolFilterEnabled = config?.tool_filter?.enabled ?? true;
	const toolFilterOverrides = config?.tool_filter?.overrides ?? {};

	// Track warning for missing whitelist entries (warn once per unique base name)
	const warnedMissingWhitelist = new Set<string>();

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
				// Allow task delegation for architect agents
				(sdkConfig.permission as Record<string, 'allow'>) = { task: 'allow' };
			} else {
				sdkConfig.mode = 'subagent';
			}

			// Remove model for primary agents (model selection handled by orchestrator)
			if (sdkConfig.mode === 'primary') {
				delete sdkConfig.model;
			}

			// Extract base agent name using canonical prefix stripper (supports underscore, hyphen, space)
			const baseAgentName = stripKnownSwarmPrefix(agent.name);

			// If tool filtering is globally disabled, use original tools unchanged
			if (!toolFilterEnabled) {
				sdkConfig.tools = agent.config.tools ?? {};
				return [agent.name, sdkConfig];
			}

			// Determine allowed tools: check override first, then fall back to AGENT_TOOL_MAP
			let allowedTools: string[] | undefined;
			const override = toolFilterOverrides[baseAgentName];
			if (override !== undefined) {
				// Override exists - use it (even if empty array)
				allowedTools = override;
			} else {
				// No override - use default AGENT_TOOL_MAP
				allowedTools =
					AGENT_TOOL_MAP[baseAgentName as keyof typeof AGENT_TOOL_MAP];
			}

			// Warn once when base name lacks a whitelist entry (no override and no AGENT_TOOL_MAP)
			if (!allowedTools && !Object.hasOwn(toolFilterOverrides, baseAgentName)) {
				if (!warnedMissingWhitelist.has(baseAgentName)) {
					console.warn(
						`[getAgentConfigs] Unknown agent '${baseAgentName}', defaulting to minimal toolset.`,
					);
					warnedMissingWhitelist.add(baseAgentName);
				}
			}

			// Copy original tools to preserve flags (including write/edit)
			const originalTools = agent.config.tools
				? { ...agent.config.tools }
				: undefined;

			if (allowedTools) {
				// Preserve explicit false flags from original tools
				const baseTools = originalTools ?? {};
				const disabledTools = Object.fromEntries(
					Object.entries(baseTools).filter(([, value]) => value === false),
				) as Record<string, boolean>;
				const filteredTools: Record<string, boolean> = { ...disabledTools };

				// Add allowed tools (skip if explicitly disabled)
				for (const tool of allowedTools) {
					if (filteredTools[tool] === false) continue;
					filteredTools[tool] = true;
				}
				sdkConfig.tools = filteredTools;
			} else {
				// No whitelist entry: default to minimal safe toolset
				sdkConfig.tools = {
					write: false,
					edit: false,
				};
			}

			return [agent.name, sdkConfig];
		}),
	);
}

export {
	createCoderAgent,
	createCriticAgent,
	createDesignerAgent,
	createDocsAgent,
	createExplorerAgent,
	createReviewerAgent,
	createSMEAgent,
	createTestEngineerAgent,
	SECURITY_CATEGORIES,
	type SecurityCategory,
} from '@opencode-swarm/core';
// Re-export agent types
export { createArchitectAgent } from './architect';
