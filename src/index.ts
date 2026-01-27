import type { Plugin } from '@opencode-ai/plugin';
import { getAgentConfigs } from './agents';
import { loadPluginConfig } from './config';
import { createPipelineTrackerHook } from './hooks';
import { detect_domains, extract_code_blocks } from './tools';
import { log } from './utils';

/**
 * OpenCode Swarm Plugin
 *
 * Architect-centric agentic swarm for code generation.
 * Hub-and-spoke architecture with:
 * - Architect as central orchestrator
 * - Dynamic SME consultation (serial)
 * - Code generation with QA review
 * - Iterative refinement with triage
 */
const OpenCodeSwarm: Plugin = async (ctx) => {
	const config = loadPluginConfig(ctx.directory);
	const agents = getAgentConfigs(config);
	const pipelineHook = createPipelineTrackerHook(config);

	log('Plugin initialized', {
		directory: ctx.directory,
		swarmMode: config.swarm_mode,
		maxIterations: config.max_iterations,
		agentCount: Object.keys(agents).length,
	});

	return {
		name: 'opencode-swarm',

		// Register all agents
		agent: agents,

		// Register tools
		tool: {
			detect_domains,
			extract_code_blocks,
		},

		// Configure OpenCode
		config: async (opencodeConfig: Record<string, unknown>) => {
			// Set architect as default agent
			(opencodeConfig as { default_agent?: string }).default_agent = 'architect';

			// Merge agent configs
			if (!opencodeConfig.agent) {
				opencodeConfig.agent = { ...agents };
			} else {
				Object.assign(opencodeConfig.agent, agents);
			}

			log('Config applied', {
				defaultAgent: 'architect',
				agents: Object.keys(agents),
			});
		},

		// Inject phase reminders before API calls
		'experimental.chat.messages.transform':
			pipelineHook['experimental.chat.messages.transform'],
	};
};

export default OpenCodeSwarm;

// Export types for consumers
export type {
	AgentName,
	PluginConfig,
	SMEAgentName,
	QAAgentName,
	PipelineAgentName,
	SwarmMode,
} from './config';

export type { AgentDefinition } from './agents';
