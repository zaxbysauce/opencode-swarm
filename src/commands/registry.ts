import type { AgentDefinition } from '../agents/index.js';
import { handleAgentsCommand } from './agents.js';
import { handleAnalyzeCommand } from './analyze.js';
import { handleArchiveCommand } from './archive.js';
import { handleBenchmarkCommand } from './benchmark.js';
import { handleCheckpointCommand } from './checkpoint.js';
import { handleClarifyCommand } from './clarify.js';
import { handleConfigCommand } from './config.js';
import { handleCurateCommand } from './curate.js';
import { handleDarkMatterCommand } from './dark-matter.js';
import { handleDiagnoseCommand } from './diagnose.js';
import { handleDoctorCommand } from './doctor.js';
import {
	handleEvidenceCommand,
	handleEvidenceSummaryCommand,
} from './evidence.js';
import { handleExportCommand } from './export.js';
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
};

// The registry is the single source of truth.
// Adding a command here automatically makes it available in both
// the in-session hook AND the standalone CLI run() entry point.
export const COMMAND_REGISTRY = {
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
	},
	benchmark: {
		handler: (ctx) => handleBenchmarkCommand(ctx.directory, ctx.args),
		description: 'Show performance metrics [--cumulative] [--ci-gate]',
	},
	export: {
		handler: (ctx) => handleExportCommand(ctx.directory, ctx.args),
		description: 'Export plan and context as JSON',
	},
	evidence: {
		handler: (ctx) => handleEvidenceCommand(ctx.directory, ctx.args),
		description: 'Show evidence bundles [taskId]',
	},
	'evidence summary': {
		handler: (ctx) => handleEvidenceSummaryCommand(ctx.directory),
		description: 'Generate evidence summary with completion ratio and blockers',
		subcommandOf: 'evidence',
	},
	archive: {
		handler: (ctx) => handleArchiveCommand(ctx.directory, ctx.args),
		description: 'Archive old evidence bundles [--dry-run]',
	},
	curate: {
		handler: (ctx) => handleCurateCommand(ctx.directory, ctx.args),
		description: 'Run knowledge curation and hive promotion review',
	},
	'dark-matter': {
		handler: (ctx) => handleDarkMatterCommand(ctx.directory, ctx.args),
		description: 'Detect hidden file couplings via co-change NPMI analysis',
	},
	simulate: {
		handler: (ctx) => handleSimulateCommand(ctx.directory, ctx.args),
		description:
			'Dry-run impact analysis of proposed changes [--target <glob>]',
	},
	analyze: {
		handler: (ctx) => handleAnalyzeCommand(ctx.directory, ctx.args),
		description: 'Analyze spec.md vs plan.md for requirement coverage gaps',
	},
	clarify: {
		handler: (ctx) => handleClarifyCommand(ctx.directory, ctx.args),
		description: 'Clarify and refine an existing feature specification',
	},
	specify: {
		handler: (ctx) => handleSpecifyCommand(ctx.directory, ctx.args),
		description: 'Generate or import a feature specification [description]',
	},
	promote: {
		handler: (ctx) => handlePromoteCommand(ctx.directory, ctx.args),
		description: 'Manually promote lesson to hive knowledge',
	},
	reset: {
		handler: (ctx) => handleResetCommand(ctx.directory, ctx.args),
		description: 'Clear swarm state files [--confirm]',
	},
	'reset-session': {
		handler: (ctx) => handleResetSessionCommand(ctx.directory, ctx.args),
		description:
			'Clear session state while preserving plan, evidence, and knowledge',
	},
	rollback: {
		handler: (ctx) => handleRollbackCommand(ctx.directory, ctx.args),
		description: 'Restore swarm state to a checkpoint <phase>',
	},
	retrieve: {
		handler: (ctx) => handleRetrieveCommand(ctx.directory, ctx.args),
		description: 'Retrieve full output from a summary <id>',
	},
	handoff: {
		handler: (ctx) => handleHandoffCommand(ctx.directory, ctx.args),
		description: 'Prepare state for clean model switch (new session)',
	},
	turbo: {
		handler: (ctx) =>
			handleTurboCommand(ctx.directory, ctx.args, ctx.sessionID),
		description: 'Toggle Turbo Mode for the active session [on|off]',
	},
	'write-retro': {
		handler: (ctx) => handleWriteRetroCommand(ctx.directory, ctx.args),
		description:
			'Write a retrospective evidence bundle for a completed phase <json>',
	},
	'knowledge migrate': {
		handler: (ctx) => handleKnowledgeMigrateCommand(ctx.directory, ctx.args),
		description: 'Migrate knowledge entries to the current format',
		subcommandOf: 'knowledge',
	},
	'knowledge quarantine': {
		handler: (ctx) => handleKnowledgeQuarantineCommand(ctx.directory, ctx.args),
		description: 'Move a knowledge entry to quarantine <id> [reason]',
		subcommandOf: 'knowledge',
	},
	'knowledge restore': {
		handler: (ctx) => handleKnowledgeRestoreCommand(ctx.directory, ctx.args),
		description: 'Restore a quarantined knowledge entry <id>',
		subcommandOf: 'knowledge',
	},
	knowledge: {
		handler: (ctx) => handleKnowledgeListCommand(ctx.directory, ctx.args),
		description: 'List knowledge entries',
	},
	checkpoint: {
		handler: (ctx) => handleCheckpointCommand(ctx.directory, ctx.args),
		description:
			'Manage project checkpoints [save|restore|delete|list] <label>',
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
