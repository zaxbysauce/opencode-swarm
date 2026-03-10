/**
 * Phase completion tool for tracking and validating phase completion.
 * Core implementation - gathers data, enforces policy, writes event, resets state.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { tool } from '@opencode-ai/plugin';
import type { ToolDefinition } from '@opencode-ai/plugin/tool';
import { loadPluginConfigWithMeta } from '../config';
import type { EvidenceBundle } from '../config/evidence-schema';
import {
	CuratorConfigSchema,
	type PhaseCompleteConfig,
	PhaseCompleteConfigSchema,
	stripKnownSwarmPrefix,
} from '../config/schema';
import { listEvidenceTaskIds, loadEvidence } from '../evidence/manager';
import {
	applyCuratorKnowledgeUpdates,
	runCuratorPhase,
} from '../hooks/curator';
import { runCriticDriftCheck } from '../hooks/curator-drift';
import { curateAndStoreSwarm } from '../hooks/knowledge-curator.js';
import type { KnowledgeConfig } from '../hooks/knowledge-types.js';
import { validateSwarmPath } from '../hooks/utils';
import { ensureAgentSession, swarmState } from '../state';
import { createSwarmTool } from './create-tool';

/**
 * Arguments for the phase_complete tool
 */
export interface PhaseCompleteArgs {
	/** The phase number being completed */
	phase: number;
	/** Optional summary of the phase */
	summary?: string;
	/** Session ID to track state (optional, defaults to current session context) */
	sessionID?: string;
}

/**
 * Baseline success response shape for phase_complete tool
 * Policy enforcement and events will be added in later tasks
 */
interface PhaseCompleteResult {
	success: boolean;
	phase: number;
	message: string;
	agentsDispatched: string[];
	agentsMissing: string[];
	status: 'success' | 'incomplete' | 'warned' | 'disabled';
	warnings: string[];
}

/**
 * Result from cross-session agent aggregation helper
 */
interface CrossSessionAgentsResult {
	/** Aggregated normalized agent names from all contributor sessions */
	agents: Set<string>;
	/** Session IDs that contributed to this aggregation (including caller session) */
	contributorSessionIds: string[];
}

/**
 * Collect dispatched agents across contributor sessions.
 * Contributor sessions are defined as those with activity since a phase reference timestamp,
 * plus the caller session.
 *
 * @param phaseReferenceTimestamp - Filter sessions with activity after this timestamp (in ms)
 * @param callerSessionId - The caller's session ID (always included)
 * @returns Object containing aggregated agents and contributor session IDs
 */
function collectCrossSessionDispatchedAgents(
	phaseReferenceTimestamp: number,
	callerSessionId: string,
): CrossSessionAgentsResult {
	const agents = new Set<string>();
	const contributorSessionIds: string[] = [];

	// Always include the caller session
	const callerSession = swarmState.agentSessions.get(callerSessionId);
	if (callerSession) {
		contributorSessionIds.push(callerSessionId);

		// Collect agents from caller's phaseAgentsDispatched
		if (callerSession.phaseAgentsDispatched) {
			for (const agent of callerSession.phaseAgentsDispatched) {
				agents.add(agent);
			}
		}

		// Also include agents from the most recently completed phase (persisted across reset)
		if (callerSession.lastCompletedPhaseAgentsDispatched) {
			for (const agent of callerSession.lastCompletedPhaseAgentsDispatched) {
				agents.add(agent);
			}
		}

		// Collect agents from caller's delegation chains
		const callerDelegations = swarmState.delegationChains.get(callerSessionId);
		if (callerDelegations) {
			for (const delegation of callerDelegations) {
				agents.add(stripKnownSwarmPrefix(delegation.from));
				agents.add(stripKnownSwarmPrefix(delegation.to));
			}
		}
	}

	// Find all other sessions with activity since the reference timestamp
	for (const [sessionId, session] of swarmState.agentSessions) {
		// Skip the caller session (already processed)
		if (sessionId === callerSessionId) {
			continue;
		}

		// Check if session has phase-relevant execution evidence since the reference timestamp.
		// This requires EITHER:
		// 1. Recent tool call activity (primary evidence of work)
		// 2. Recent delegation activity (shows coordination/agent dispatch)
		// Note: lastAgentEventTime alone is insufficient as it can be fresh without actual execution

		const hasRecentToolCalls =
			session.lastToolCallTime >= phaseReferenceTimestamp;

		// Check for recent delegation activity
		const delegations = swarmState.delegationChains.get(sessionId);
		const hasRecentDelegations =
			delegations?.some((d) => d.timestamp >= phaseReferenceTimestamp) ?? false;

		// Check for restored session with dispatched agents from same phase lifecycle.
		// After close/reopen, snapshot-restored sessions retain phaseAgentsDispatched
		// but fail the timestamp freshness check. If the session has agents AND its
		// lastPhaseCompleteTimestamp matches the caller's reference (both came from
		// the same phase boundary), it's a valid contributor.
		const hasRestoredAgents =
			(session.phaseAgentsDispatched?.size ?? 0) > 0 &&
			session.lastPhaseCompleteTimestamp === phaseReferenceTimestamp;

		const hasActivity =
			hasRecentToolCalls || hasRecentDelegations || hasRestoredAgents;

		if (hasActivity) {
			contributorSessionIds.push(sessionId);

			// Collect agents from this session's phaseAgentsDispatched
			if (session.phaseAgentsDispatched) {
				for (const agent of session.phaseAgentsDispatched) {
					agents.add(agent);
				}
			}

			// Also include agents from this session's most recently completed phase
			if (session.lastCompletedPhaseAgentsDispatched) {
				for (const agent of session.lastCompletedPhaseAgentsDispatched) {
					agents.add(agent);
				}
			}

			// Collect agents from this session's delegation chains
			const delegations = swarmState.delegationChains.get(sessionId);
			if (delegations) {
				for (const delegation of delegations) {
					agents.add(stripKnownSwarmPrefix(delegation.from));
					agents.add(stripKnownSwarmPrefix(delegation.to));
				}
			}
		}
	}

	return { agents, contributorSessionIds };
}

/**
 * Event written to .swarm/events.jsonl on phase completion
 */
interface PhaseCompleteEvent {
	event: 'phase_complete';
	phase: number;
	timestamp: string;
	agents_dispatched: string[];
	agents_missing: string[];
	status: PhaseCompleteResult['status'];
	summary: string | null;
}

/**
 * Filter delegation chains since the last completion timestamp
 * @param sessionID - The session identifier
 * @param sinceTimestamp - Filter entries after this timestamp (0 means all entries)
 * @returns Array of delegation entries
 */
function _getDelegationsSince(
	sessionID: string,
	sinceTimestamp: number,
): Array<{ from: string; to: string; timestamp: number }> {
	const chain = swarmState.delegationChains.get(sessionID);
	if (!chain) {
		return [];
	}

	if (sinceTimestamp === 0) {
		// Return all entries if no previous completion
		return chain;
	}

	// Filter entries after the timestamp
	return chain.filter((entry) => entry.timestamp > sinceTimestamp);
}

/**
 * Normalize agent names from delegation entries
 * @param delegations - Array of delegation entries
 * @returns Set of normalized agent names
 */
function _normalizeAgentsFromDelegations(
	delegations: Array<{ from: string; to: string; timestamp: number }>,
): Set<string> {
	const agents = new Set<string>();

	for (const delegation of delegations) {
		const normalizedFrom = stripKnownSwarmPrefix(delegation.from);
		const normalizedTo = stripKnownSwarmPrefix(delegation.to);
		agents.add(normalizedFrom);
		agents.add(normalizedTo);
	}

	return agents;
}

/**
 * Type guard for valid retrospective entries matching a specific phase
 */
function isValidRetroEntry(
	entry: { type: string; [key: string]: unknown },
	phase: number,
): boolean {
	return (
		entry.type === 'retrospective' &&
		'phase_number' in entry &&
		(entry as { phase_number?: unknown }).phase_number === phase &&
		'verdict' in entry &&
		(entry as { verdict?: unknown }).verdict === 'pass'
	);
}

/**
 * Execute the phase_complete tool
 * Gathers data, enforces policy, writes event, resets state
 */
export async function executePhaseComplete(
	args: PhaseCompleteArgs,
	workingDirectory?: string,
): Promise<string> {
	// Extract arguments
	const phase = Number(args.phase);
	const summary = args.summary;
	const sessionID = args.sessionID;

	// Validate phase number
	if (Number.isNaN(phase) || phase < 1) {
		return JSON.stringify(
			{
				success: false,
				phase: phase,
				message: 'Invalid phase number',
				agentsDispatched: [],
				warnings: ['Phase must be a positive number'],
			},
			null,
			2,
		);
	}

	// Get session state
	// If no sessionID provided, we can't track state - return error
	if (!sessionID) {
		return JSON.stringify(
			{
				success: false,
				phase: phase,
				message: 'Session ID is required',
				agentsDispatched: [],
				warnings: [
					'sessionID parameter is required for phase completion tracking',
				],
			},
			null,
			2,
		);
	}

	// Ensure session exists and get current state
	const session = ensureAgentSession(sessionID);

	// Get phase reference timestamp from session state (derived from last phase complete)
	const phaseReferenceTimestamp = session.lastPhaseCompleteTimestamp ?? 0;

	// Use aggregated cross-session agents for required-agent evaluation
	const crossSessionResult = collectCrossSessionDispatchedAgents(
		phaseReferenceTimestamp,
		sessionID,
	);
	const agentsDispatched = Array.from(crossSessionResult.agents).sort();

	// Load plugin config for policy enforcement
	const dir = workingDirectory ?? process.cwd();
	const { config } = loadPluginConfigWithMeta(dir);
	let phaseCompleteConfig: PhaseCompleteConfig;
	try {
		phaseCompleteConfig = PhaseCompleteConfigSchema.parse(
			config.phase_complete ?? {},
		);
	} catch (parseError) {
		return JSON.stringify(
			{
				success: false,
				phase,
				status: 'incomplete' as const,
				message: `Invalid phase_complete configuration: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
				agentsDispatched,
				agentsMissing: [],
				warnings: ['Configuration validation failed'],
			},
			null,
			2,
		);
	}

	// If enforcement is disabled, return early with success
	if (phaseCompleteConfig.enabled === false) {
		return JSON.stringify(
			{
				success: true,
				phase,
				status: 'disabled',
				message: `Phase ${phase} complete (enforcement disabled)`,
				agentsDispatched,
				agentsMissing: [],
				warnings: [],
			},
			null,
			2,
		);
	}

	// Retrospective gate: require a valid retro bundle for this phase
	const retroResult = await loadEvidence(dir, `retro-${phase}`);
	let retroFound = false;
	let retroEntry: { lessons_learned?: string[] } | null = null;
	let invalidSchemaErrors: string[] = [];
	let loadedRetroTaskId: string | null = null;
	let loadedRetroBundle: EvidenceBundle | null = null;

	// Track the task ID that was used to load the retro bundle
	const primaryRetroTaskId = `retro-${phase}`;

	if (retroResult.status === 'found') {
		const validEntry = retroResult.bundle.entries?.find((entry) =>
			isValidRetroEntry(entry, phase),
		);
		if (validEntry) {
			retroFound = true;
			retroEntry = validEntry as { lessons_learned?: string[] } | null;
			loadedRetroTaskId = primaryRetroTaskId;
			loadedRetroBundle = retroResult.bundle;
		}
	} else if (retroResult.status === 'invalid_schema') {
		invalidSchemaErrors = retroResult.errors;
	}

	if (!retroFound) {
		// Fallback: scan all task IDs for any retro-N matching this phase
		const allTaskIds = await listEvidenceTaskIds(dir);
		const retroTaskIds = allTaskIds.filter((id) => id.startsWith('retro-'));
		for (const taskId of retroTaskIds) {
			const bundleResult = await loadEvidence(dir, taskId);
			if (bundleResult.status !== 'found') {
				if (bundleResult.status === 'invalid_schema') {
					invalidSchemaErrors.push(...bundleResult.errors);
				}
				continue;
			}
			const validEntry = bundleResult.bundle.entries?.find((entry) =>
				isValidRetroEntry(entry, phase),
			);
			if (validEntry) {
				retroFound = true;
				retroEntry = validEntry as { lessons_learned?: string[] } | null;
				loadedRetroTaskId = taskId;
				loadedRetroBundle = bundleResult.bundle;
				break;
			}
		}
	}

	if (!retroFound) {
		const schemaErrorDetail =
			invalidSchemaErrors.length > 0
				? ` Schema validation failed: ${invalidSchemaErrors.join('; ')}.`
				: '';
		return JSON.stringify(
			{
				success: false,
				phase,
				status: 'blocked' as const,
				reason: 'RETROSPECTIVE_MISSING',
				message: `Phase ${phase} cannot be completed: no valid retrospective evidence found.${schemaErrorDetail} Write a retrospective bundle at .swarm/evidence/retro-${phase}/evidence.json before calling phase_complete.`,
				agentsDispatched,
				agentsMissing: [],
				warnings: [
					`Retrospective missing for phase ${phase}.${schemaErrorDetail} Use this template:`,
					JSON.stringify(
						{
							schema_version: '1.0.0',
							task_id: `retro-${phase}`,
							created_at: new Date().toISOString(),
							updated_at: new Date().toISOString(),
							entries: [
								{
									task_id: `retro-${phase}`,
									type: 'retrospective',
									timestamp: new Date().toISOString(),
									agent: 'architect',
									verdict: 'pass',
									summary: `Phase ${phase} completed.`,
									phase_number: phase,
									total_tool_calls: 0,
									coder_revisions: 0,
									reviewer_rejections: 0,
									test_failures: 0,
									security_findings: 0,
									integration_issues: 0,
									task_count: 1,
									task_complexity: 'simple',
									top_rejection_reasons: [],
									lessons_learned: [],
								},
							],
						},
						null,
						2,
					),
				],
			},
			null,
			2,
		);
	}

	// Extract and store lessons from retrospective to knowledge.jsonl
	if (
		retroFound &&
		retroEntry?.lessons_learned &&
		retroEntry.lessons_learned.length > 0
	) {
		try {
			// Infer project name from directory
			const projectName = path.basename(dir);

			// Build knowledge config with sensible defaults
			const knowledgeConfig: KnowledgeConfig = {
				enabled: true,
				swarm_max_entries: 100,
				hive_max_entries: 200,
				auto_promote_days: 90,
				max_inject_count: 5,
				dedup_threshold: 0.6,
				scope_filter: ['global'],
				hive_enabled: true,
				rejected_max_entries: 20,
				validation_enabled: true,
				evergreen_confidence: 0.9,
				evergreen_utility: 0.8,
				low_utility_threshold: 0.3,
				min_retrievals_for_utility: 3,
				schema_version: 1,
			};

			await curateAndStoreSwarm(
				retroEntry.lessons_learned,
				projectName,
				{ phase_number: phase },
				dir,
				knowledgeConfig,
			);
		} catch (error) {
			// Log warning but don't block phase completion
			console.warn(
				'[phase_complete] Failed to curate lessons from retrospective:',
				error,
			);
		}
	}

	// Curator pipeline: collect phase data and run drift check. Never blocks phase_complete.
	try {
		const curatorConfig = CuratorConfigSchema.parse(config.curator ?? {});
		if (curatorConfig.enabled && curatorConfig.phase_enabled) {
			const curatorResult = await runCuratorPhase(
				dir,
				phase,
				agentsDispatched,
				curatorConfig,
				{},
			);
			await applyCuratorKnowledgeUpdates(
				dir,
				curatorResult.knowledge_recommendations,
				{} as KnowledgeConfig,
			);
			await runCriticDriftCheck(dir, phase, curatorResult, curatorConfig);
		}
	} catch (curatorError) {
		console.warn(
			'[phase_complete] Curator pipeline error (non-blocking):',
			curatorError,
		);
	}

	// Build the effective required-agents list
	const effectiveRequired: string[] = [...phaseCompleteConfig.required_agents];
	if (phaseCompleteConfig.require_docs && !effectiveRequired.includes('docs')) {
		effectiveRequired.push('docs');
	}

	// Compute missing agents using cross-session aggregated agents
	let agentsMissing = effectiveRequired.filter(
		(req) => !crossSessionResult.agents.has(req),
	);

	// Build warnings and determine success based on policy
	const warnings: string[] = [];

	// Plan.json fallback: if agents are missing but all tasks in the phase are
	// completed in plan.json, treat the phase as closeable. Completed tasks prove
	// agents were dispatched (update_task_status requires QA gates to pass).
	if (agentsMissing.length > 0) {
		try {
			const planPath = validateSwarmPath(dir, 'plan.json');
			const planRaw = fs.readFileSync(planPath, 'utf-8');
			const plan: {
				phases: Array<{
					id: number;
					status: string;
					tasks: Array<{ id: string; status: string }>;
				}>;
			} = JSON.parse(planRaw);
			const targetPhase = plan.phases.find((p) => p.id === phase);
			if (
				targetPhase &&
				targetPhase.tasks.length > 0 &&
				targetPhase.tasks.every((t) => t.status === 'completed')
			) {
				warnings.push(
					`Agent dispatch fallback: all ${targetPhase.tasks.length} tasks in phase ${phase} are completed in plan.json. Clearing missing agents: ${agentsMissing.join(', ')}.`,
				);
				agentsMissing = [];
			}
		} catch {
			// plan.json missing or unreadable — fall through to normal enforcement
		}
	}

	// Detect potential auto-repair of retrospective bundle
	// If loaded from a retro-N task ID with schema_version 1.0.0 and valid task_complexity,
	// it may have been auto-repaired from a malformed legacy format
	const VALID_TASK_COMPLEXITY = ['trivial', 'simple', 'moderate', 'complex'];
	const firstEntry = loadedRetroBundle?.entries?.[0] as
		| { task_complexity?: string }
		| undefined;
	if (
		loadedRetroTaskId?.startsWith('retro-') &&
		loadedRetroBundle?.schema_version === '1.0.0' &&
		firstEntry?.task_complexity &&
		VALID_TASK_COMPLEXITY.includes(firstEntry.task_complexity)
	) {
		warnings.push(
			`Retrospective data for phase ${phase} may have been automatically migrated to current schema format.`,
		);
	}

	let success = true;
	let status: PhaseCompleteResult['status'] = 'success';
	const safeSummary = summary?.trim().slice(0, 500);
	let message = safeSummary
		? `Phase ${phase} completed: ${safeSummary}`
		: `Phase ${phase} completed`;

	if (agentsMissing.length > 0) {
		if (phaseCompleteConfig.policy === 'enforce') {
			success = false;
			status = 'incomplete';
			message = `Phase ${phase} incomplete: missing required agents: ${agentsMissing.join(', ')}`;
		} else {
			status = 'warned';
			warnings.push(
				`Warning: phase ${phase} missing required agents: ${agentsMissing.join(', ')}`,
			);
		}
	}

	// Record timing
	const now = Date.now();
	const durationMs = now - phaseReferenceTimestamp;

	// Write event to .swarm/events.jsonl
	const event: PhaseCompleteEvent = {
		event: 'phase_complete',
		phase,
		timestamp: new Date(now).toISOString(),
		agents_dispatched: agentsDispatched,
		agents_missing: agentsMissing,
		status,
		summary: safeSummary ?? null,
	};

	try {
		const eventsPath = validateSwarmPath(dir, 'events.jsonl');
		fs.appendFileSync(eventsPath, `${JSON.stringify(event)}\n`, 'utf-8');
	} catch (writeError) {
		warnings.push(
			`Warning: failed to write phase complete event: ${writeError instanceof Error ? writeError.message : String(writeError)}`,
		);
	}

	// Reset phase state on success
	if (success) {
		// Reset phase-tracking state for all contributor sessions
		for (const contributorSessionId of crossSessionResult.contributorSessionIds) {
			const contributorSession =
				swarmState.agentSessions.get(contributorSessionId);
			if (contributorSession) {
				// Only snapshot agents if there are any new agents to persist (prevents empty overwrite on repeated calls)
				if (contributorSession.phaseAgentsDispatched.size > 0) {
					contributorSession.lastCompletedPhaseAgentsDispatched = new Set(
						contributorSession.phaseAgentsDispatched,
					);
				}
				contributorSession.phaseAgentsDispatched = new Set();
				contributorSession.lastPhaseCompleteTimestamp = now;
				contributorSession.lastPhaseCompletePhase = phase;
			}
		}

		// Update plan.json phase status to completed
		try {
			const planPath = validateSwarmPath(dir, 'plan.json');
			const planJson = fs.readFileSync(planPath, 'utf-8');
			const plan: {
				phases: Array<{
					id: number;
					status: string;
					tasks: Array<{ id: string; status: string }>;
				}>;
			} = JSON.parse(planJson);

			const phaseObj = plan.phases.find((p) => p.id === phase);
			if (phaseObj) {
				phaseObj.status = 'completed';
				fs.writeFileSync(
					planPath,
					JSON.stringify(plan, null, 2) + '\n',
					'utf-8',
				);
			}
		} catch (error) {
			warnings.push(
				`Warning: failed to update plan.json phase status: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	// Build final result
	const result: PhaseCompleteResult = {
		success,
		phase,
		status,
		message,
		agentsDispatched,
		agentsMissing,
		warnings,
	};

	return JSON.stringify(
		{ ...result, timestamp: event.timestamp, duration_ms: durationMs },
		null,
		2,
	);
}

/**
 * Tool definition for phase_complete
 */
export const phase_complete: ToolDefinition = createSwarmTool({
	description:
		'Mark a phase as complete and track which agents were dispatched. ' +
		'Used for phase completion gating and tracking. ' +
		'Accepts phase number and optional summary. Returns list of agents that were dispatched.',
	args: {
		phase: tool.schema
			.number()
			.describe('The phase number being completed (e.g., 1, 2, 3)'),
		summary: tool.schema
			.string()
			.optional()
			.describe('Optional summary of what was accomplished in this phase'),
		sessionID: tool.schema
			.string()
			.optional()
			.describe(
				'Session ID for tracking state (auto-provided by plugin context)',
			),
	},
	execute: async (args, directory, ctx) => {
		// Parse and validate arguments
		let phaseCompleteArgs: PhaseCompleteArgs;

		try {
			phaseCompleteArgs = {
				phase: Number(args.phase),
				summary: args.summary !== undefined ? String(args.summary) : undefined,
				sessionID:
					ctx?.sessionID ??
					(args.sessionID !== undefined ? String(args.sessionID) : undefined),
			};
		} catch {
			return JSON.stringify(
				{
					success: false,
					phase: 0,
					message: 'Invalid arguments',
					agentsDispatched: [],
					warnings: ['Failed to parse arguments'],
				},
				null,
				2,
			);
		}

		return executePhaseComplete(phaseCompleteArgs, directory);
	},
});
