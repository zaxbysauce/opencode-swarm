import type { AgentDefinition } from '../agents/index.js';
import {
	COMMAND_REGISTRY,
	resolveCommand,
	VALID_COMMANDS,
} from './registry.js';

// Re-export individual handlers
export { handleAgentsCommand } from './agents';
export { handleAnalyzeCommand } from './analyze';
export { handleArchiveCommand } from './archive';
export { handleBenchmarkCommand } from './benchmark';
export { handleCheckpointCommand } from './checkpoint';
export { handleClarifyCommand } from './clarify';
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
export { handleWriteRetroCommand } from './write_retro';

const HELP_TEXT = [
	'## Swarm Commands',
	'',
	...VALID_COMMANDS.filter((cmd) => !cmd.includes(' ')).map(
		(cmd) => `- \`/swarm ${cmd}\` — ${COMMAND_REGISTRY[cmd].description}`,
	),
].join('\n');

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
		// Ignore non-swarm commands
		if (input.command !== 'swarm') {
			return;
		}

		// Verified: input.arguments receives the expanded $ARGUMENTS from the template.
		// The hook output.parts overrides the LLM response in the UI.
		// Parse arguments
		const tokens = input.arguments.trim().split(/\s+/).filter(Boolean);

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
