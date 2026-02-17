import type { Plugin } from '@opencode-ai/plugin';
import { createAgents, getAgentConfigs } from './agents';
import { createSwarmCommandHandler } from './commands';
import { loadPluginConfig } from './config';
import { ORCHESTRATOR_NAME } from './config/constants';
import {
	GuardrailsConfigSchema,
	SummaryConfigSchema,
	stripKnownSwarmPrefix,
} from './config/schema';
import {
	composeHandlers,
	createAgentActivityHooks,
	createCompactionCustomizerHook,
	createContextBudgetHandler,
	createDelegationGateHook,
	createDelegationTrackerHook,
	createGuardrailsHooks,
	createPipelineTrackerHook,
	createSystemEnhancerHook,
	createToolSummarizerHook,
	safeHook,
} from './hooks';
import { ensureAgentSession, swarmState } from './state';
import { detect_domains, diff, extract_code_blocks, gitingest } from './tools';
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
	const agentDefinitions = createAgents(config);
	const pipelineHook = createPipelineTrackerHook(config);
	const systemEnhancerHook = createSystemEnhancerHook(config, ctx.directory);
	const compactionHook = createCompactionCustomizerHook(config, ctx.directory);
	const contextBudgetHandler = createContextBudgetHandler(config);
	const commandHandler = createSwarmCommandHandler(
		ctx.directory,
		Object.fromEntries(agentDefinitions.map((agent) => [agent.name, agent])),
	);
	const activityHooks = createAgentActivityHooks(config, ctx.directory);
	const delegationHandler = createDelegationTrackerHook(config);
	const delegationGateHandler = createDelegationGateHook(config);
	const guardrailsConfig = GuardrailsConfigSchema.parse(
		config.guardrails ?? {},
	);
	const guardrailsHooks = createGuardrailsHooks(guardrailsConfig);
	const summaryConfig = SummaryConfigSchema.parse(config.summaries ?? {});
	const toolSummarizerHook = createToolSummarizerHook(
		summaryConfig,
		ctx.directory,
	);

	log('Plugin initialized', {
		directory: ctx.directory,
		maxIterations: config.max_iterations,
		agentCount: Object.keys(agents).length,
		agentNames: Object.keys(agents),
		hooks: {
			pipeline: !!pipelineHook['experimental.chat.messages.transform'],
			systemEnhancer:
				!!systemEnhancerHook['experimental.chat.system.transform'],
			compaction: !!compactionHook['experimental.session.compacting'],
			contextBudget: !!contextBudgetHandler,
			commands: true,
			agentActivity: config.hooks?.agent_activity !== false,
			delegationTracker: config.hooks?.delegation_tracker === true,
			guardrails: guardrailsConfig.enabled,
			toolSummarizer: summaryConfig.enabled,
		},
	});

	return {
		name: 'opencode-swarm',

		// Register all agents
		agent: agents,

		// Register tools
		tool: {
			detect_domains,
			extract_code_blocks,
			gitingest,
			diff,
		},

		// Configure OpenCode - merge agents into config
		config: async (opencodeConfig: Record<string, unknown>) => {
			// Merge agent configs (don't override default_agent)
			if (!opencodeConfig.agent) {
				opencodeConfig.agent = { ...agents };
			} else {
				Object.assign(opencodeConfig.agent, agents);
			}

			// Register /swarm command
			opencodeConfig.command = {
				...((opencodeConfig.command as Record<string, unknown>) || {}),
				swarm: {
					template: '{{arguments}}',
					description: 'Swarm management commands',
				},
			};

			log('Config applied', {
				agents: Object.keys(agents),
				commands: ['swarm'],
			});
		},

		// Inject phase reminders before API calls
		'experimental.chat.messages.transform': composeHandlers(
			...[
				pipelineHook['experimental.chat.messages.transform'],
				contextBudgetHandler,
				guardrailsHooks.messagesTransform,
				delegationGateHandler,
			].filter((fn): fn is NonNullable<typeof fn> => Boolean(fn)),
			// biome-ignore lint/suspicious/noExplicitAny: Plugin API requires generic hook wrappers
		) as any,

		// Inject system prompt enhancements
		'experimental.chat.system.transform': systemEnhancerHook[
			'experimental.chat.system.transform'
			// biome-ignore lint/suspicious/noExplicitAny: Plugin API requires generic hook wrappers
		] as any,

		// Handle session compaction
		'experimental.session.compacting': compactionHook[
			'experimental.session.compacting'
			// biome-ignore lint/suspicious/noExplicitAny: Plugin API requires generic hook wrappers
		] as any,

		// Handle /swarm commands
		// biome-ignore lint/suspicious/noExplicitAny: Plugin API requires generic hook wrappers
		'command.execute.before': safeHook(commandHandler) as any,

		// Track tool usage + guardrails
		// biome-ignore lint/suspicious/noExplicitAny: Plugin API requires generic hook wrappers
		'tool.execute.before': (async (input: any, output: any) => {
			// If no active agent is mapped for this session, it's the primary agent (architect)
			// Subagent delegations always set activeAgent via chat.message before tool calls
			if (!swarmState.activeAgent.has(input.sessionID)) {
				swarmState.activeAgent.set(input.sessionID, ORCHESTRATOR_NAME);
			}

			// Revert to primary agent if delegation appears stale
			// Delegation is stale if:
			// 1. delegationActive is explicitly false, OR
			// 2. The session's lastAgentEventTime is >10s old (subagent completed, no chat.message reset)
			// 10s window is tight enough to prevent architect misidentification after delegation
			// but loose enough to allow for slow subagent operations (file I/O, network)
			// NOTE: Uses lastAgentEventTime (not lastToolCallTime) to ensure tool activity
			// does not prevent stale subagent identity from being detected
			const session = swarmState.agentSessions.get(input.sessionID);
			const activeAgent = swarmState.activeAgent.get(input.sessionID);
			if (session && activeAgent && activeAgent !== ORCHESTRATOR_NAME) {
				const stripActive = stripKnownSwarmPrefix(activeAgent);
				if (stripActive !== ORCHESTRATOR_NAME) {
					const staleDelegation =
						!session.delegationActive ||
						Date.now() - session.lastAgentEventTime > 10000;
					if (staleDelegation) {
						swarmState.activeAgent.set(input.sessionID, ORCHESTRATOR_NAME);
						ensureAgentSession(input.sessionID, ORCHESTRATOR_NAME);
					}
				}
			}

			// Guardrails runs first WITHOUT safeHook — throws must propagate to block tools
			await guardrailsHooks.toolBefore(input, output);
			// Activity tracking runs second WITH safeHook — errors should not propagate
			await safeHook(activityHooks.toolBefore)(input, output);
			// biome-ignore lint/suspicious/noExplicitAny: Plugin API requires generic hook wrappers
		}) as any,

		// Track tool usage + guardrails (after)
		// biome-ignore lint/suspicious/noExplicitAny: Plugin API requires generic hook wrappers
		'tool.execute.after': (async (input: any, output: any) => {
			// Run existing handlers
			await activityHooks.toolAfter(input, output);
			await guardrailsHooks.toolAfter(input, output);
			await toolSummarizerHook?.(input, output);

			// Deterministic handoff: when task tool completes, force handoff to architect
			// This ensures architect takes over even if chat.message is delayed
			// NOTE: Must NOT rely on chat.message ordering
			if (input.tool === 'task') {
				const sessionId = input.sessionID;
				// Set active agent to architect
				swarmState.activeAgent.set(sessionId, ORCHESTRATOR_NAME);
				// Ensure session is architect and reset state
				ensureAgentSession(sessionId, ORCHESTRATOR_NAME);
				// Mark delegation as inactive
				const session = swarmState.agentSessions.get(sessionId);
				if (session) {
					session.delegationActive = false;
					// Update agent event timestamp for stale detection
					session.lastAgentEventTime = Date.now();
				}
			}
			// biome-ignore lint/suspicious/noExplicitAny: Plugin API requires generic hook wrappers
		}) as any,

		// Track agent delegations and active agent
		// biome-ignore lint/suspicious/noExplicitAny: Plugin API requires generic hook wrappers
		'chat.message': safeHook(delegationHandler) as any,
	};
};

export default OpenCodeSwarm;

export type { AgentDefinition } from './agents';
// Export types for consumers
export type {
	AgentName,
	PipelineAgentName,
	PluginConfig,
	QAAgentName,
} from './config';
