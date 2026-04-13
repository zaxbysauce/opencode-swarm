import type { AgentDefinition } from '../agents/index.js';
import { handleAcknowledgeSpecDriftCommand } from './acknowledge-spec-drift.js';
import { handleAgentsCommand } from './agents.js';
import { handleAnalyzeCommand } from './analyze.js';
import { handleArchiveCommand } from './archive.js';
import { handleBenchmarkCommand } from './benchmark.js';
import { handleBrainstormCommand } from './brainstorm.js';
import { handleCheckpointCommand } from './checkpoint.js';
import { handleClarifyCommand } from './clarify.js';
import { handleCloseCommand } from './close.js';
import { handleConfigCommand } from './config.js';
import { handleCurateCommand } from './curate.js';
import { handleDarkMatterCommand } from './dark-matter.js';
import { handleDiagnoseCommand } from './diagnose.js';
import { handleDoctorCommand, handleDoctorToolsCommand } from './doctor.js';
import {
	handleEvidenceCommand,
	handleEvidenceSummaryCommand,
} from './evidence.js';
import { handleExportCommand } from './export.js';
import { handleFullAutoCommand } from './full-auto.js';
import { handleHandoffCommand } from './handoff.js';
import { handleHistoryCommand } from './history.js';
import {
	handleKnowledgeListCommand,
	handleKnowledgeMigrateCommand,
	handleKnowledgeQuarantineCommand,
	handleKnowledgeRestoreCommand,
} from './knowledge.js';
import { handlePlanCommand } from './plan.js';
import { handlePreflightCommand } from './preflight.js';
import { handlePromoteCommand } from './promote.js';
import { handleQaGatesCommand } from './qa-gates.js';
import { handleResetCommand } from './reset.js';
import { handleResetSessionCommand } from './reset-session.js';
import { handleRetrieveCommand } from './retrieve.js';
import { handleRollbackCommand } from './rollback.js';
import { handleSimulateCommand } from './simulate.js';
import { handleSpecifyCommand } from './specify.js';
import { handleStatusCommand } from './status.js';
import { handleSyncPlanCommand } from './sync-plan.js';
import { handleTurboCommand } from './turbo.js';
import { handleWriteRetroCommand } from './write-retro.js';

export type CommandContext = {
	directory: string;
	args: string[];
	sessionID: string;
	agents: Record<string, AgentDefinition>;
};

export type CommandResult = Promise<string>;

export type CommandEntry = {
	handler: (ctx: CommandContext) => CommandResult;
	/** Human-readable description shown in /swarm help and CLI --help */
	description: string;
	/** If true, this command is only accessible as a sub-key of a parent command */
	subcommandOf?: string;
	/**
	 * 2-3 line behavioral summary: what the command does step-by-step,
	 * side effects, and safety guarantees.
	 */
	details?: string;
	/**
	 * Documents flags and positional arguments. Format: flags comma-separated with
	 * double-dash prefix, positional args in angle brackets.
	 * Example: args: '--dry-run, --confirm, <phase-number>'
	 */
	args?: string;
};

// The registry is the single source of truth.
// Adding a command here automatically makes it available in both
// the in-session hook AND the standalone CLI run() entry point.
export const COMMAND_REGISTRY = {
	'acknowledge-spec-drift': {
		handler: (ctx) =>
			handleAcknowledgeSpecDriftCommand(ctx.directory, ctx.args),
		description:
			'Acknowledge that the spec has drifted from the plan and suppress further warnings',
		args: '',
	},
	status: {
		handler: (ctx) => handleStatusCommand(ctx.directory, ctx.agents),
		description: 'Show current swarm state',
	},
	plan: {
		handler: (ctx) => handlePlanCommand(ctx.directory, ctx.args),
		description: 'Show plan (optionally filter by phase number)',
	},
	agents: {
		// handleAgentsCommand is synchronous — wrap in Promise.resolve
		handler: (ctx) =>
			Promise.resolve(handleAgentsCommand(ctx.agents, undefined)),
		description: 'List registered agents',
	},
	history: {
		handler: (ctx) => handleHistoryCommand(ctx.directory, ctx.args),
		description: 'Show completed phases summary',
	},
	config: {
		handler: (ctx) => handleConfigCommand(ctx.directory, ctx.args),
		description: 'Show current resolved configuration',
	},
	'config doctor': {
		handler: (ctx) => handleDoctorCommand(ctx.directory, ctx.args),
		description: 'Run config doctor checks',
		subcommandOf: 'config',
	},
	// Alias for TUI shortcut 'swarm-config-doctor' which extracts subcommand as 'config-doctor' (dash).
	// Without this alias the shortcut resolves to null and shows help text instead of running the command.
	'config-doctor': {
		handler: (ctx) => handleDoctorCommand(ctx.directory, ctx.args),
		description: 'Run config doctor checks',
		subcommandOf: 'config',
	},
	'doctor tools': {
		handler: (ctx) => handleDoctorToolsCommand(ctx.directory, ctx.args),
		description: 'Run tool registration coherence check',
	},
	diagnose: {
		handler: (ctx) => handleDiagnoseCommand(ctx.directory, ctx.args),
		description: 'Run health check on swarm state',
	},
	preflight: {
		handler: (ctx) => handlePreflightCommand(ctx.directory, ctx.args),
		description: 'Run preflight automation checks',
	},
	'sync-plan': {
		handler: (ctx) => handleSyncPlanCommand(ctx.directory, ctx.args),
		description: 'Ensure plan.json and plan.md are synced',
		args: '',
	},
	benchmark: {
		handler: (ctx) => handleBenchmarkCommand(ctx.directory, ctx.args),
		description: 'Show performance metrics [--cumulative] [--ci-gate]',
		args: '--cumulative, --ci-gate',
	},
	export: {
		handler: (ctx) => handleExportCommand(ctx.directory, ctx.args),
		description: 'Export plan and context as JSON',
		args: '',
		details:
			'Exports the current plan and context as JSON to stdout. Useful for piping to external tools or debugging swarm state.',
	},
	evidence: {
		handler: (ctx) => handleEvidenceCommand(ctx.directory, ctx.args),
		description: 'Show evidence bundles [taskId]',
		args: '<taskId>',
		details:
			'Displays review results, test verdicts, and other evidence bundles for the given task ID (e.g., "2.1").',
	},
	'evidence summary': {
		handler: (ctx) => handleEvidenceSummaryCommand(ctx.directory),
		description: 'Generate evidence summary with completion ratio and blockers',
		subcommandOf: 'evidence',
		args: '',
		details:
			'Generates a summary showing completion ratio across all tasks, lists blockers, and identifies missing evidence.',
	},
	// Alias for TUI shortcut 'swarm-evidence-summary' which extracts subcommand as 'evidence-summary' (dash).
	// Without this alias the shortcut resolves to null and shows help text instead of running the command.
	'evidence-summary': {
		handler: (ctx) => handleEvidenceSummaryCommand(ctx.directory),
		description: 'Generate evidence summary with completion ratio and blockers',
		subcommandOf: 'evidence',
		args: '',
		details:
			'Generates a summary showing completion ratio across all tasks, lists blockers, and identifies missing evidence.',
	},
	archive: {
		handler: (ctx) => handleArchiveCommand(ctx.directory, ctx.args),
		description: 'Archive old evidence bundles [--dry-run]',
		details:
			'Archives evidence bundles older than max_age_days (config, default 90) or beyond max_bundles cap (config, default 1000). --dry-run previews which bundles would be archived without deleting them. Applies two-tier retention: age-based first, then count-based on oldest remaining.',
		args: '--dry-run',
	},
	curate: {
		handler: (ctx) => handleCurateCommand(ctx.directory, ctx.args),
		description: 'Run knowledge curation and hive promotion review',
		args: '',
	},
	'dark-matter': {
		handler: (ctx) => handleDarkMatterCommand(ctx.directory, ctx.args),
		description: 'Detect hidden file couplings via co-change NPMI analysis',
		args: '--threshold <number>, --min-commits <number>',
	},
	close: {
		handler: (ctx) => handleCloseCommand(ctx.directory, ctx.args),
		description:
			'Use /swarm close to close the swarm project and archive evidence',
		details:
			'Idempotent 4-stage terminal finalization: (1) finalize writes retrospectives for in-progress phases, (2) archive creates timestamped bundle of swarm artifacts and evidence, (3) clean removes active-state files for a clean slate, (4) align performs safe git ff-only to main. Resets agent sessions and delegation chains. Reads .swarm/close-lessons.md for explicit lessons and runs curation.',
		args: '--prune-branches',
	},
	simulate: {
		handler: (ctx) => handleSimulateCommand(ctx.directory, ctx.args),
		description:
			'Dry-run hidden coupling analysis with configurable thresholds',
		args: '--threshold <number>, --min-commits <number>',
	},
	analyze: {
		handler: (ctx) => handleAnalyzeCommand(ctx.directory, ctx.args),
		description: 'Analyze spec.md vs plan.md for requirement coverage gaps',
		args: '',
	},
	clarify: {
		handler: (ctx) => handleClarifyCommand(ctx.directory, ctx.args),
		description: 'Clarify and refine an existing feature specification',
		args: '[description-text]',
	},
	specify: {
		handler: (ctx) => handleSpecifyCommand(ctx.directory, ctx.args),
		description: 'Generate or import a feature specification [description]',
		args: '[description-text]',
	},
	brainstorm: {
		handler: (ctx) => handleBrainstormCommand(ctx.directory, ctx.args),
		description:
			'Enter architect MODE: BRAINSTORM — structured seven-phase planning workflow [topic]',
		args: '[topic-text]',
		details:
			'Triggers the architect to run the brainstorm workflow: CONTEXT SCAN, single-question DIALOGUE, APPROACHES, DESIGN SECTIONS, SPEC WRITE + SELF-REVIEW, QA GATE SELECTION, TRANSITION. Use for new plans where requirements need to be drawn out before writing spec.md / plan.md.',
	},
	'qa-gates': {
		handler: (ctx) =>
			handleQaGatesCommand(ctx.directory, ctx.args, ctx.sessionID),
		description:
			'View or modify QA gate profile for the current plan [enable|override <gate>...]',
		args: '[show|enable|override] <gate>...',
		details:
			'show: display spec-level, session-override, and effective QA gates for the current plan. enable: persist gate(s) into the locked-once profile (architect; rejected after critic approval lock). override: session-only ratchet-tighter enable. Valid gates: reviewer, test_engineer, council_mode, sme_enabled, critic_pre_plan, hallucination_guard, sast_enabled.',
	},
	promote: {
		handler: (ctx) => handlePromoteCommand(ctx.directory, ctx.args),
		description: 'Manually promote lesson to hive knowledge',
		details:
			'Promotes a lesson directly to hive knowledge (--category flag sets category) or references an existing swarm lesson by ID (--from-swarm). Validates lesson text before promotion. Either direct text or --from-swarm ID is required.',
		args: '--category <category>, --from-swarm <lesson-id>, <lesson-text>',
	},
	reset: {
		handler: (ctx) => handleResetCommand(ctx.directory, ctx.args),
		description: 'Clear swarm state files [--confirm]',
		details:
			'DELETES plan.md, context.md, and summaries/ directory from .swarm/. Stops background automation and clears in-memory queues. SAFETY: requires --confirm flag — without it, displays a warning and tips to export first.',
		args: '--confirm (required)',
	},
	'reset-session': {
		handler: (ctx) => handleResetSessionCommand(ctx.directory, ctx.args),
		description:
			'Clear session state while preserving plan, evidence, and knowledge',
		details:
			'Deletes only .swarm/session/state.json and any other session files. Clears in-memory agent sessions and delegation chains. Preserves plan, evidence, and knowledge for cross-session continuity.',
		args: '',
	},
	rollback: {
		handler: (ctx) => handleRollbackCommand(ctx.directory, ctx.args),
		description: 'Restore swarm state to a checkpoint <phase>',
		details:
			'Restores .swarm/ state by directly overwriting files from a checkpoint directory (checkpoints/phase-<N>). Writes rollback event to events.jsonl. Without phase argument, lists available checkpoints. Partial failures are reported but processing continues.',
		args: '<phase-number>',
	},
	retrieve: {
		handler: (ctx) => handleRetrieveCommand(ctx.directory, ctx.args),
		description: 'Retrieve full output from a summary <id>',
		args: '<summary-id>',
		details:
			'Loads the full tool output that was previously summarized (referenced by IDs like S1, S2). Use when you need the complete output instead of the truncated summary.',
	},
	handoff: {
		handler: (ctx) => handleHandoffCommand(ctx.directory, ctx.args),
		description: 'Prepare state for clean model switch (new session)',
		args: '',
		details:
			'Generates handoff.md with full session state snapshot, including plan progress, recent decisions, and agent delegation history. Prepended to the next session prompt for seamless model switches.',
	},
	turbo: {
		handler: (ctx) =>
			handleTurboCommand(ctx.directory, ctx.args, ctx.sessionID),
		description: 'Toggle Turbo Mode for the active session [on|off]',
		args: 'on, off',
		details:
			'Toggles Turbo Mode which skips non-critical QA gates for faster iteration. When enabled, the architect can proceed without waiting for all automated checks. Session-scoped — resets on new session. Use "on" or "off" to set explicitly, or toggle with no argument.',
	},
	'full-auto': {
		handler: (ctx) =>
			handleFullAutoCommand(ctx.directory, ctx.args, ctx.sessionID),
		description: 'Toggle Full-Auto Mode for the active session [on|off]',
		args: 'on, off',
		details:
			'Toggles Full-Auto Mode which enables autonomous execution without confirmation prompts. When enabled, the architect proceeds through implementation steps automatically. Session-scoped — resets on new session. Use "on" or "off" to set explicitly, or toggle with no argument.',
	},
	'write-retro': {
		handler: (ctx) => handleWriteRetroCommand(ctx.directory, ctx.args),
		description:
			'Write a retrospective evidence bundle for a completed phase <json>',
		details:
			'Writes retrospective evidence bundle to .swarm/evidence/retro-{phase}/evidence.json. Required JSON: phase, summary, task_count, task_complexity, total_tool_calls, coder_revisions, reviewer_rejections, test_failures, security_findings, integration_issues. Optional: lessons_learned (max 5), top_rejection_reasons, task_id, metadata.',
		args: '<json: {phase, summary, task_count, task_complexity, ...}>',
	},
	'knowledge migrate': {
		handler: (ctx) => handleKnowledgeMigrateCommand(ctx.directory, ctx.args),
		description: 'Migrate knowledge entries to the current format',
		subcommandOf: 'knowledge',
		details:
			'One-time migration from .swarm/context.md SME cache to .swarm/knowledge.jsonl. Skips if sentinel file .swarm/.knowledge-migrated exists, if context.md is absent, or if context.md is empty. Reports entries migrated, dropped (validation/dedup), and total processed.',
		args: '<directory>',
	},
	'knowledge quarantine': {
		handler: (ctx) => handleKnowledgeQuarantineCommand(ctx.directory, ctx.args),
		description: 'Move a knowledge entry to quarantine <id> [reason]',
		subcommandOf: 'knowledge',
		details:
			'Moves a knowledge entry to quarantine with optional reason string (defaults to "Quarantined via /swarm knowledge quarantine command"). Validates entry ID format (1-64 alphanumeric/hyphen/underscore). Quarantined entries are excluded from knowledge queries.',
		args: '<entry-id> [reason]',
	},
	'knowledge restore': {
		handler: (ctx) => handleKnowledgeRestoreCommand(ctx.directory, ctx.args),
		description: 'Restore a quarantined knowledge entry <id>',
		subcommandOf: 'knowledge',
		details:
			'Restores a quarantined knowledge entry back to the active knowledge store by ID. Validates entry ID format (1-64 alphanumeric/hyphen/underscore). Entry must currently be in quarantine state.',
		args: '<entry-id>',
	},
	knowledge: {
		handler: (ctx) => handleKnowledgeListCommand(ctx.directory, ctx.args),
		description: 'List knowledge entries',
	},
	checkpoint: {
		handler: (ctx) => handleCheckpointCommand(ctx.directory, ctx.args),
		description:
			'Manage project checkpoints [save|restore|delete|list] <label>',
		details:
			'save: creates named snapshot of current .swarm/ state. restore: soft-resets to checkpoint by overwriting current .swarm/ files. delete: removes named checkpoint. list: shows all checkpoints with timestamps. All subcommands require a label except list.',
		args: '<save|restore|delete|list> <label>',
	},
} as const satisfies Record<string, CommandEntry>;

export type RegisteredCommand = keyof typeof COMMAND_REGISTRY;

export const VALID_COMMANDS = Object.keys(
	COMMAND_REGISTRY,
) as RegisteredCommand[];

/**
 * Resolves compound commands like "evidence summary" and "config doctor".
 * Tries a two-token compound key first, then falls back to a single-token key.
 */
export function resolveCommand(
	tokens: string[],
): { entry: CommandEntry; remainingArgs: string[] } | null {
	if (tokens.length === 0) return null;

	// Try two-token compound key first (e.g. "evidence summary")
	// Use Object.hasOwn to avoid prototype pollution via keys like "__proto__"
	if (tokens.length >= 2) {
		const compound = `${tokens[0]} ${tokens[1]}` as RegisteredCommand;
		if (Object.hasOwn(COMMAND_REGISTRY, compound)) {
			return {
				entry: COMMAND_REGISTRY[compound],
				remainingArgs: tokens.slice(2),
			};
		}
	}

	// Fall back to single-token key
	const key = tokens[0] as RegisteredCommand;
	if (Object.hasOwn(COMMAND_REGISTRY, key)) {
		return {
			entry: COMMAND_REGISTRY[key],
			remainingArgs: tokens.slice(1),
		};
	}

	return null;
}
