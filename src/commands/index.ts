import type { AgentDefinition } from '../agents/index.js';
import {
	COMMAND_REGISTRY,
	type CommandEntry,
	type RegisteredCommand,
	resolveCommand,
	VALID_COMMANDS,
} from './registry.js';

export { handleAcknowledgeSpecDriftCommand } from './acknowledge-spec-drift';
// Re-export individual handlers
export { handleAgentsCommand } from './agents';
export { handleAnalyzeCommand } from './analyze';
export { handleArchiveCommand } from './archive';
export { handleBenchmarkCommand } from './benchmark';
export { handleBrainstormCommand } from './brainstorm';
export { handleCheckpointCommand } from './checkpoint';
export { handleClarifyCommand } from './clarify';
export { handleCloseCommand } from './close';
export { handleConfigCommand } from './config';
export { handleCurateCommand } from './curate';
export { handleDarkMatterCommand } from './dark-matter';
export { handleDiagnoseCommand } from './diagnose';
export { handleDoctorCommand } from './doctor';
export {
	handleEvidenceCommand,
	handleEvidenceSummaryCommand,
} from './evidence';
export { handleExportCommand } from './export';
export { handleFullAutoCommand } from './full-auto';
export { handleHandoffCommand } from './handoff';
export { handleHistoryCommand } from './history';
export {
	handleKnowledgeListCommand,
	handleKnowledgeMigrateCommand,
	handleKnowledgeQuarantineCommand,
	handleKnowledgeRestoreCommand,
} from './knowledge';
export { handlePlanCommand } from './plan';
export { handlePreflightCommand } from './preflight';
export { handlePromoteCommand } from './promote';
export { handleQaGatesCommand } from './qa-gates';
export type {
	CommandContext,
	CommandEntry,
	RegisteredCommand,
} from './registry.js';
// Re-export registry for consumers
export {
	COMMAND_REGISTRY,
	resolveCommand,
	VALID_COMMANDS,
} from './registry.js';
export { handleResetCommand } from './reset';
export { handleResetSessionCommand } from './reset-session';
export { handleRetrieveCommand } from './retrieve';
export { handleRollbackCommand } from './rollback';
export { handleSimulateCommand } from './simulate';
export { handleSpecifyCommand } from './specify';
export { handleStatusCommand } from './status';
export { handleSyncPlanCommand } from './sync-plan';
export { handleTurboCommand } from './turbo';
export { handleWriteRetroCommand } from './write-retro';

export function buildHelpText(): string {
	const lines: string[] = ['## Swarm Commands', ''];

	// Track which compound commands have been shown as subcommands
	const shownAsSubcommand = new Set<string>();

	// First pass: show parent commands and their subcommands
	for (const cmd of VALID_COMMANDS) {
		// Skip if this is a compound command that will be shown under its parent
		if (cmd.includes(' ')) {
			const parent = cmd.split(' ')[0];
			// Check if parent is in VALID_COMMANDS — if so, this compound will be shown under it
			if (VALID_COMMANDS.includes(parent as RegisteredCommand)) {
				shownAsSubcommand.add(cmd);
			}
			continue;
		}

		const entry = COMMAND_REGISTRY[
			cmd as keyof typeof COMMAND_REGISTRY
		] as CommandEntry;
		lines.push(`- \`/swarm ${cmd}\` — ${entry.description}`);

		if (entry.args) {
			lines.push(`  Args: \`${entry.args}\``);
		}
		if (entry.details) {
			lines.push(`  ${entry.details}`);
		}

		// Show subcommands grouped under this parent
		const subcommands = VALID_COMMANDS.filter(
			(sub) => sub.startsWith(`${cmd} `) && sub !== cmd,
		);
		for (const sub of subcommands) {
			const subEntry = COMMAND_REGISTRY[
				sub as keyof typeof COMMAND_REGISTRY
			] as CommandEntry;
			const subName = sub.slice(cmd.length + 1); // e.g. "migrate" from "knowledge migrate"
			lines.push(`  - \`${subName}\` — ${subEntry.description}`);
			if (subEntry.args) {
				lines.push(`    Args: \`${subEntry.args}\``);
			}
			if (subEntry.details) {
				lines.push(`    ${subEntry.details}`);
			}
		}
	}

	// Second pass: show compound commands that don't have a parent in VALID_COMMANDS
	for (const cmd of VALID_COMMANDS) {
		if (!cmd.includes(' ') || shownAsSubcommand.has(cmd)) continue;
		const entry = COMMAND_REGISTRY[
			cmd as keyof typeof COMMAND_REGISTRY
		] as CommandEntry;
		lines.push(`- \`/swarm ${cmd}\` — ${entry.description}`);
		if (entry.args) {
			lines.push(`  Args: \`${entry.args}\``);
		}
		if (entry.details) {
			lines.push(`  ${entry.details}`);
		}
	}

	return lines.join('\n');
}

const HELP_TEXT = buildHelpText();

/**
 * Creates a command.execute.before handler for /swarm commands.
 * Uses factory pattern to close over directory and agents.
 */
export function createSwarmCommandHandler(
	directory: string,
	agents: Record<string, AgentDefinition>,
): (
	input: { command: string; sessionID: string; arguments: string },
	output: { parts: unknown[] },
) => Promise<void> {
	return async (input, output) => {
		// Accept both the generic 'swarm' command and individual shortcut commands
		// like 'swarm-config', 'swarm-status', 'swarm-sync-plan', etc.
		// When a user selects a shortcut from the command picker (e.g. swarm-config),
		// OpenCode sets input.command to the registered key ('swarm-config') and
		// input.arguments to any additional $ARGUMENTS the user typed. Without this
		// check those shortcuts were silently ignored and fell through to the LLM.
		if (input.command !== 'swarm' && !input.command.startsWith('swarm-')) {
			return;
		}

		// Verified: input.arguments receives the expanded $ARGUMENTS from the template.
		// The hook output.parts overrides the LLM response in the UI.
		// Parse arguments
		let tokens: string[];
		if (input.command === 'swarm') {
			// Generic /swarm $ARGUMENTS: arguments contain the full subcommand + args
			tokens = input.arguments.trim().split(/\s+/).filter(Boolean);
		} else {
			// Shortcut command like 'swarm-config': extract subcommand from the key
			// e.g. 'swarm-config' → 'config', 'swarm-sync-plan' → 'sync-plan'
			const subcommand = input.command.slice('swarm-'.length);
			const extraArgs = input.arguments.trim().split(/\s+/).filter(Boolean);
			tokens = [subcommand, ...extraArgs];
		}

		let text: string;

		const resolved = resolveCommand(tokens);

		if (!resolved) {
			text = HELP_TEXT;
		} else {
			text = await resolved.entry.handler({
				directory,
				args: resolved.remainingArgs,
				sessionID: input.sessionID,
				agents,
			});
		}

		// Convert string result to Part[]
		output.parts = [
			{ type: 'text', text } as unknown as (typeof output.parts)[number],
		];
	};
}
