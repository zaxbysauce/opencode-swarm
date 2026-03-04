import * as path from 'node:path';
import type { Plugin } from '@opencode-ai/plugin';
import { createAgents, getAgentConfigs } from './agents';
import {
	type AutomationStatusArtifact,
	type BackgroundAutomationManager,
	createAutomationManager,
	PlanSyncWorker,
	type PreflightTriggerManager,
} from './background';
import { createSwarmCommandHandler } from './commands';
import { loadPluginConfigWithMeta } from './config';
import { ORCHESTRATOR_NAME } from './config/constants';
import {
	AutomationConfigSchema,
	GuardrailsConfigSchema,
	KnowledgeConfigSchema,
	SummaryConfigSchema,
	stripKnownSwarmPrefix,
} from './config/schema';
import {
	composeHandlers,
	consolidateSystemMessages,
	createAgentActivityHooks,
	createCompactionCustomizerHook,
	createContextBudgetHandler,
	createDelegationGateHook,
	createDelegationTrackerHook,
	createGuardrailsHooks,
	createPhaseMonitorHook,
	createPipelineTrackerHook,
	createSystemEnhancerHook,
	createToolSummarizerHook,
	safeHook,
} from './hooks';
import { createCoChangeSuggesterHook } from './hooks/co-change-suggester.js';
import { createDarkMatterDetectorHook } from './hooks/dark-matter-detector.js';
import { createHivePromoterHook } from './hooks/hive-promoter.js';
import { createKnowledgeCuratorHook } from './hooks/knowledge-curator.js';
import { createKnowledgeInjectorHook } from './hooks/knowledge-injector.js';
import { createSteeringConsumedHook } from './hooks/steering-consumed.js';
import { shouldRunOnStartup } from './services/config-doctor';
import { loadSnapshot } from './session/snapshot-reader.js';
import { createSnapshotWriterHook } from './session/snapshot-writer.js';
import { ensureAgentSession, swarmState } from './state';
import {
	checkpoint,
	complexity_hotspots,
	detect_domains,
	diff,
	evidence_check,
	extract_code_blocks,
	gitingest,
	imports,
	lint,
	phase_complete,
	pkg_audit,
	pre_check_batch,
	retrieve_summary,
	save_plan,
	schema_drift,
	secretscan,
	symbols,
	test_runner,
	todo_extract,
} from './tools';
import { log } from './utils';
import { truncateToolOutput } from './utils/tool-output';

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
	const { config, loadedFromFile } = loadPluginConfigWithMeta(ctx.directory);
	// v6.18 Session persistence — restore state from previous session (non-blocking)
	await loadSnapshot(ctx.directory);
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
	const delegationGateHooks = createDelegationGateHook(config);
	// Fail-secure: honor explicit guardrails.enabled === false first (highest priority),
	// then fall back to file-loaded config. When no config file exists, use config defaults
	// (which now have guardrails enabled due to fail-secure loader behavior).
	const guardrailsFallback =
		config.guardrails?.enabled === false
			? { ...config.guardrails, enabled: false }
			: loadedFromFile
				? (config.guardrails ?? {})
				: config.guardrails; // Use loader defaults (fail-secure)
	const guardrailsConfig = GuardrailsConfigSchema.parse(guardrailsFallback);

	// SECURITY AUDIT: Emit explicit warning when guardrails are disabled via user config
	// This is a security-relevant action that requires explicit acknowledgment
	if (loadedFromFile && guardrailsConfig.enabled === false) {
		console.warn('');
		console.warn(
			'══════════════════════════════════════════════════════════════',
		);
		console.warn(
			'[opencode-swarm] 🔴 SECURITY WARNING: GUARDRAILS ARE DISABLED',
		);
		console.warn(
			'══════════════════════════════════════════════════════════════',
		);
		console.warn(
			'Guardrails have been explicitly disabled in user configuration.',
		);
		console.warn('This disables safety measures including:');
		console.warn('  - Tool call limits');
		console.warn('  - Duration limits');
		console.warn('  - Repetition detection');
		console.warn('  - Error rate limits');
		console.warn('  - Idle timeouts');
		console.warn('');
		console.warn(
			'Only disable guardrails if you fully understand the security implications.',
		);
		console.warn(
			'To re-enable guardrails, set "guardrails.enabled" to true in your config.',
		);
		console.warn(
			'══════════════════════════════════════════════════════════════',
		);
		console.warn('');
	}

	const delegationHandler = createDelegationTrackerHook(
		config,
		guardrailsConfig.enabled,
	);
	const guardrailsHooks = createGuardrailsHooks(
		ctx.directory,
		guardrailsConfig,
	);
	const summaryConfig = SummaryConfigSchema.parse(config.summaries ?? {});
	const toolSummarizerHook = createToolSummarizerHook(
		summaryConfig,
		ctx.directory,
	);

	// v6.17 Knowledge system hooks — fire-and-forget, wrapped in safeHook
	const knowledgeConfig = KnowledgeConfigSchema.parse(config.knowledge ?? {});
	const knowledgeCuratorHook = knowledgeConfig.enabled
		? createKnowledgeCuratorHook(ctx.directory, knowledgeConfig)
		: undefined;
	const hivePromoterHook =
		knowledgeConfig.enabled && knowledgeConfig.hive_enabled
			? createHivePromoterHook(ctx.directory, knowledgeConfig)
			: undefined;
	const knowledgeInjectorHook = knowledgeConfig.enabled
		? createKnowledgeInjectorHook(ctx.directory, knowledgeConfig)
		: undefined;

	// v6.18 Steering acknowledgment hook — auto-acknowledges unconsumed steering directives
	const steeringConsumedHook = createSteeringConsumedHook(ctx.directory);

	// v6.18 Agent intelligence hooks — co-change suggestions and dark-matter gap detection
	const coChangeSuggesterHook = createCoChangeSuggesterHook(ctx.directory);
	const darkMatterDetectorHook = createDarkMatterDetectorHook(ctx.directory);
	// v6.18 Session persistence — write state snapshot after each tool call
	const snapshotWriterHook = createSnapshotWriterHook(ctx.directory);

	// Parse automation config (v6.7 feature flags)
	// Read flags without activating - scaffold only for now
	const automationConfig = AutomationConfigSchema.parse(
		config.automation ?? {},
	);

	// Initialize background automation framework (scaffold only - no business features yet)
	// Only enabled when automation mode is not 'manual' (default-off behavior)
	let automationManager: BackgroundAutomationManager | undefined;
	let preflightTriggerManager: PreflightTriggerManager | undefined;
	let statusArtifact: AutomationStatusArtifact | undefined;

	if (automationConfig.mode !== 'manual') {
		automationManager = createAutomationManager(automationConfig);

		// v6.7 Task 5.5: Initialize trigger manager (plumbing only, no preflight logic yet)
		const { PreflightTriggerManager: PTM } = await import(
			'./background/trigger'
		);
		preflightTriggerManager = new PTM(automationConfig);

		// v6.7 Task 5.5: Initialize status artifact for GUI visibility
		const { AutomationStatusArtifact: ASA } = await import(
			'./background/status-artifact'
		);
		const swarmDir = path.resolve(ctx.directory, '.swarm');
		statusArtifact = new ASA(swarmDir);
		statusArtifact.updateConfig(
			automationConfig.mode,
			automationConfig.capabilities,
		);

		// v6.8 Task 1.1: Wire evidence summary integration
		if (automationConfig.capabilities?.evidence_auto_summaries === true) {
			const { createEvidenceSummaryIntegration } = await import(
				'./background/evidence-summary-integration'
			);
			createEvidenceSummaryIntegration({
				automationConfig,
				directory: ctx.directory,
				swarmDir: ctx.directory, // NOTE: persistSummary appends .swarm/ internally
				summaryFilename: 'evidence-summary.json',
			});
			log('Evidence summary integration initialized', {
				directory: ctx.directory,
			});
		}

		// v6.8 Task 2.2: Wire preflight integration
		if (automationConfig.capabilities?.phase_preflight === true) {
			const { createPreflightIntegration } = await import(
				'./services/preflight-integration'
			);
			try {
				const { manager } = createPreflightIntegration({
					automationConfig,
					directory: ctx.directory,
					swarmDir,
				});
				preflightTriggerManager = manager;
				log('Preflight integration initialized', { directory: ctx.directory });
			} catch (err) {
				log('Preflight integration failed to initialize (non-fatal)', {
					error: err instanceof Error ? err.message : String(err),
				});
			}
		}

		// v6.8 Task 3.2: Wire PlanSyncWorker for plan.json -> plan.md sync
		if (automationConfig.capabilities?.plan_sync === true) {
			try {
				const planSyncWorker = new PlanSyncWorker({
					directory: ctx.directory,
					// Using defaults: debounceMs=300, pollIntervalMs=2000
				});
				planSyncWorker.start();
				log('PlanSyncWorker initialized', { directory: ctx.directory });
			} catch (err) {
				log('PlanSyncWorker failed to initialize (non-fatal)', {
					error: err instanceof Error ? err.message : String(err),
				});
			}
		}

		log('Automation framework initialized', {
			mode: automationConfig.mode,
			enabled: automationManager?.isEnabled(),
			preflightEnabled: preflightTriggerManager?.isEnabled(),
		});
	}

	// v6.7 Task 5.7: Config Doctor - run on startup if automation flags permit
	// Runs in background-safe way (non-blocking, no errors propagate)
	// SECURITY: Default is scan-only (autoFix=false). Autofix requires explicit opt-in
	// via config_doctor_autofix capability.
	if (shouldRunOnStartup(automationConfig)) {
		// Autofix is opt-in only - requires explicit config_doctor_autofix capability
		const enableAutofix =
			automationConfig.capabilities?.config_doctor_autofix === true;

		// Dynamically import to avoid circular dependencies
		import('./services/config-doctor').then(({ runConfigDoctorWithFixes }) => {
			// Default to scan-only mode (autoFix=false) for security
			// Autofix only runs when explicitly enabled via capability
			runConfigDoctorWithFixes(ctx.directory, config, enableAutofix)
				.then((doctorResult) => {
					if (doctorResult.result.findings.length > 0) {
						log('Config Doctor ran on startup', {
							findings: doctorResult.result.findings.length,
							errors: doctorResult.result.summary.error,
							warnings: doctorResult.result.summary.warn,
							appliedFixes: doctorResult.appliedFixes.length,
							autofixEnabled: enableAutofix,
						});
					}
				})
				.catch((err) => {
					// Config doctor errors should NOT block startup
					log('Config Doctor error (non-fatal)', {
						error: err instanceof Error ? err.message : String(err),
					});
				});
		});
	}

	log('Plugin initialized', {
		maxIterations: config.max_iterations,
		agentCount: Object.keys(agents).length,
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
			knowledge: knowledgeConfig.enabled,
		},
		// v6.7 automation flags (scaffold only - not yet active)
		automation: {
			mode: automationConfig.mode,
			capabilities: automationConfig.capabilities,
		},
	});

	return {
		name: 'opencode-swarm',

		// Register all agents
		agent: agents,

		// Register tools
		tool: {
			checkpoint,
			complexity_hotspots,
			detect_domains,
			evidence_check,
			extract_code_blocks,
			gitingest,
			imports,
			lint,
			diff,
			pkg_audit,
			phase_complete,
			pre_check_batch,
			retrieve_summary,
			save_plan,
			schema_drift,
			secretscan,
			symbols,
			test_runner,
			todo_extract,
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
					// Template is required by OpenCode and always sent to the LLM.
					// Keep it minimal — instructional text confuses non-frontier models.
					// The actual command is handled by command.execute.before hook.
					template: '/swarm $ARGUMENTS',
					description: 'Swarm management commands',
				},
				// Individual subcommands for discoverability by weaker models (Haiku-class)
				'swarm-status': {
					template: '/swarm status',
					description: 'Show current swarm status and active phase',
				},
				'swarm-plan': {
					template: '/swarm plan $ARGUMENTS',
					description: 'View or filter the current execution plan',
				},
				'swarm-agents': {
					template: '/swarm agents',
					description: 'List registered swarm agents',
				},
				'swarm-history': {
					template: '/swarm history',
					description: 'Show completed phases summary',
				},
				'swarm-config': {
					template: '/swarm config $ARGUMENTS',
					description: 'Show or validate configuration',
				},
				'swarm-evidence': {
					template: '/swarm evidence $ARGUMENTS',
					description: 'View evidence bundles and summaries',
				},
				'swarm-archive': {
					template: '/swarm archive',
					description: 'Archive old evidence bundles',
				},
				'swarm-diagnose': {
					template: '/swarm diagnose',
					description: 'Run health checks on swarm state',
				},
				'swarm-preflight': {
					template: '/swarm preflight',
					description: 'Run preflight automation checks',
				},
				'swarm-sync-plan': {
					template: '/swarm sync-plan',
					description: 'Sync plan.json with plan.md',
				},
				'swarm-benchmark': {
					template: '/swarm benchmark',
					description: 'Show performance metrics',
				},
				'swarm-export': {
					template: '/swarm export',
					description: 'Export plan and context as JSON',
				},
				'swarm-reset': {
					template: '/swarm reset --confirm',
					description: 'Clear swarm state (requires --confirm)',
				},
				'swarm-rollback': {
					template: '/swarm rollback $ARGUMENTS',
					description: 'Restore swarm state to a checkpoint',
				},
				'swarm-retrieve': {
					template: '/swarm retrieve $ARGUMENTS',
					description: 'Retrieve full output from summary',
				},
				'swarm-clarify': {
					template: '/swarm clarify $ARGUMENTS',
					description: 'Clarify and refine a feature specification',
				},
				'swarm-analyze': {
					template: '/swarm analyze',
					description: 'Analyze spec vs plan for coverage gaps',
				},
				'swarm-specify': {
					template: '/swarm specify $ARGUMENTS',
					description: 'Generate or import a feature specification',
				},
				'swarm-dark-matter': {
					template: '/swarm dark-matter',
					description: 'Detect hidden file couplings',
				},
				'swarm-knowledge': {
					template: '/swarm knowledge $ARGUMENTS',
					description: 'Knowledge management (quarantine/restore/migrate)',
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
				delegationGateHooks.messagesTransform,
				knowledgeInjectorHook, // v6.17 knowledge injection
				// Final transformation: consolidate multiple system messages into one
				(_input: unknown, output: { messages?: unknown[] }): Promise<void> => {
					if (output.messages) {
						// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
						output.messages = consolidateSystemMessages(output.messages as any);
					}
					return Promise.resolve();
				},
			].filter((fn): fn is NonNullable<typeof fn> => Boolean(fn)),
			// biome-ignore lint/suspicious/noExplicitAny: Plugin API requires generic hook wrappers
		) as any,

		// Inject system prompt enhancements + phase monitor (when phase_preflight enabled)
		'experimental.chat.system.transform': composeHandlers(
			...([
				systemEnhancerHook['experimental.chat.system.transform'],
				automationConfig.capabilities?.phase_preflight === true &&
				preflightTriggerManager
					? createPhaseMonitorHook(ctx.directory, preflightTriggerManager)
					: undefined,
			].filter(Boolean) as Array<
				(input: unknown, output: unknown) => Promise<void>
			>),
			// biome-ignore lint/suspicious/noExplicitAny: Plugin API requires generic hook wrappers
		) as any,

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
			await safeHook(delegationGateHooks.toolAfter)(input, output);
			// v6.17 Knowledge hooks — after guardrails, before summarizer
			if (knowledgeCuratorHook)
				await safeHook(knowledgeCuratorHook)(input, output);
			if (hivePromoterHook) await safeHook(hivePromoterHook)(input, output);
			// v6.18 Steering acknowledgment — auto-acknowledges unconsumed directives
			await safeHook(steeringConsumedHook)(input, output);
			// v6.18 Agent intelligence hooks — co-change suggestions and dark-matter gap detection
			await safeHook(coChangeSuggesterHook)(input, output);
			await safeHook(darkMatterDetectorHook)(input, output);
			// v6.18 Session persistence — write snapshot after each tool call
			await snapshotWriterHook(input, output);
			await toolSummarizerHook?.(input, output);

			// Tool output truncation (after summarizer to avoid double-processing)
			const toolOutputConfig = config.tool_output;
			if (
				toolOutputConfig &&
				toolOutputConfig.truncation_enabled !== false &&
				typeof output.output === 'string'
			) {
				// Skip structured JSON results
				const skipTools = [
					'pre_check_batch',
					'pkg_audit',
					'schema_drift',
					'sbom_generate',
				];
				if (!skipTools.includes(input.tool)) {
					// Check for per-tool override or use default
					const maxLines =
						toolOutputConfig.per_tool?.[input.tool] ??
						toolOutputConfig.max_lines ??
						150;

					// Only truncate diff and symbols outputs
					if (input.tool === 'diff' || input.tool === 'symbols') {
						output.output = truncateToolOutput(
							output.output,
							maxLines,
							input.tool,
						);
					}
				}
			}

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

		// v6.7 Background automation framework (scaffold only)
		// Exposed for future Task 5.x business feature integration
		automation: automationManager,
	};
};

export default OpenCodeSwarm;

export type { AgentDefinition } from './agents';
// Export types for consumers
export type {
	AgentName,
	AutomationCapabilities,
	AutomationConfig,
	AutomationMode,
	PipelineAgentName,
	PluginConfig,
	QAAgentName,
} from './config';
