/**
 * Phase completion tool for tracking and validating phase completion.
 * Core implementation - gathers data, enforces policy, writes event, resets state.
 */

import * as fs from 'node:fs';
import { type ToolDefinition, tool } from '@opencode-ai/plugin/tool';
import { loadPluginConfigWithMeta } from '../config';
import {
	type PhaseCompleteConfig,
	PhaseCompleteConfigSchema,
	stripKnownSwarmPrefix,
} from '../config/schema';
import { listEvidenceTaskIds, loadEvidence } from '../evidence/manager';
import { validateSwarmPath } from '../hooks/utils';
import { ensureAgentSession, swarmState } from '../state';

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
function getDelegationsSince(
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
function normalizeAgentsFromDelegations(
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

	// Get last completion timestamp from session state
	const lastCompletionTimestamp = session.lastPhaseCompleteTimestamp ?? 0;

	// Get delegations since last completion
	const recentDelegations = getDelegationsSince(
		sessionID,
		lastCompletionTimestamp,
	);

	// Normalize agent names from delegation chains
	const delegationAgents = normalizeAgentsFromDelegations(recentDelegations);

	// Get agents from session state tracking (phaseAgentsDispatched)
	const trackedAgents = session.phaseAgentsDispatched ?? new Set<string>();

	// Merge agents from both sources
	const allAgents = new Set<string>([...delegationAgents, ...trackedAgents]);
	const agentsDispatched = Array.from(allAgents).sort();

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
	const retroBundle = await loadEvidence(dir, `retro-${phase}`);
	let retroFound = false;

	if (retroBundle !== null) {
		// Check entries for a valid retrospective
		retroFound =
			retroBundle.entries?.some((entry) => isValidRetroEntry(entry, phase)) ??
			false;
	}

	if (!retroFound) {
		// Fallback: scan all task IDs for any retro-N matching this phase
		const allTaskIds = await listEvidenceTaskIds(dir);
		const retroTaskIds = allTaskIds.filter((id) => id.startsWith('retro-'));
		for (const taskId of retroTaskIds) {
			const bundle = await loadEvidence(dir, taskId);
			if (bundle === null) continue;
			retroFound =
				bundle.entries?.some((entry) => isValidRetroEntry(entry, phase)) ??
				false;
			if (retroFound) break;
		}
	}

	if (!retroFound) {
		return JSON.stringify(
			{
				success: false,
				phase,
				status: 'blocked' as const,
				reason: 'RETROSPECTIVE_MISSING',
				message: `Phase ${phase} cannot be completed: no valid retrospective evidence found. Write a retrospective bundle at .swarm/evidence/retro-${phase}/evidence.json with type='retrospective', phase_number=${phase}, verdict='pass' before calling phase_complete.`,
				agentsDispatched: [],
				agentsMissing: [],
				warnings: [
					`Retrospective missing for phase ${phase}. Write a retro bundle with verdict='pass' at .swarm/evidence/retro-${phase}/evidence.json`,
				],
			},
			null,
			2,
		);
	}

	// Build the effective required-agents list
	const effectiveRequired: string[] = [...phaseCompleteConfig.required_agents];
	if (phaseCompleteConfig.require_docs && !effectiveRequired.includes('docs')) {
		effectiveRequired.push('docs');
	}

	// Compute missing agents
	const agentsMissing = effectiveRequired.filter((req) => !allAgents.has(req));

	// Build warnings and determine success based on policy
	const warnings: string[] = [];
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
	const durationMs = now - lastCompletionTimestamp;

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
		session.phaseAgentsDispatched = new Set();
		session.lastPhaseCompleteTimestamp = now;
		session.lastPhaseCompletePhase = phase;
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
export const phase_complete: ToolDefinition = tool({
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
	execute: async (args) => {
		// Parse and validate arguments
		let phaseCompleteArgs: PhaseCompleteArgs;

		try {
			phaseCompleteArgs = {
				phase: Number(args.phase),
				summary: args.summary !== undefined ? String(args.summary) : undefined,
				sessionID:
					args.sessionID !== undefined ? String(args.sessionID) : undefined,
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

		return executePhaseComplete(phaseCompleteArgs);
	},
});
