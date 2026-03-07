import type { AgentDefinition } from '../agents';
import { handleAgentsCommand } from './agents';
import { handleAnalyzeCommand } from './analyze';
import { handleArchiveCommand } from './archive';
import { handleBenchmarkCommand } from './benchmark';
import { handleClarifyCommand } from './clarify';
import { handleConfigCommand } from './config';
import { handleDarkMatterCommand } from './dark-matter';
import { handleDiagnoseCommand } from './diagnose';
import { handleDoctorCommand } from './doctor';
import {
	handleEvidenceCommand,
	handleEvidenceSummaryCommand,
} from './evidence';
import { handleExportCommand } from './export';
import { handleHandoffCommand } from './handoff';
import { handleHistoryCommand } from './history';
import {
	handleKnowledgeListCommand,
	handleKnowledgeMigrateCommand,
	handleKnowledgeQuarantineCommand,
	handleKnowledgeRestoreCommand,
} from './knowledge';
import { handlePlanCommand } from './plan';
import { handlePreflightCommand } from './preflight';
import { handlePromoteCommand } from './promote';
import { handleResetCommand } from './reset';
import { handleRetrieveCommand } from './retrieve';
import { handleRollbackCommand } from './rollback';
import { handleSimulateCommand } from './simulate';
import { handleSpecifyCommand } from './specify';
import { handleStatusCommand } from './status';
import { handleSyncPlanCommand } from './sync-plan';
import { handleWriteRetroCommand } from './write_retro';

// Re-export individual handlers
export { handleAgentsCommand } from './agents';
export { handleAnalyzeCommand } from './analyze';
export { handleArchiveCommand } from './archive';
export { handleBenchmarkCommand } from './benchmark';
export { handleClarifyCommand } from './clarify';
export { handleConfigCommand } from './config';
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
export { handleResetCommand } from './reset';
export { handleRetrieveCommand } from './retrieve';
export { handleRollbackCommand } from './rollback';
export { handleSimulateCommand } from './simulate';
export { handleSpecifyCommand } from './specify';
export { handleStatusCommand } from './status';
export { handleSyncPlanCommand } from './sync-plan';
export { handleWriteRetroCommand } from './write_retro';

const HELP_TEXT = [
	'## Swarm Commands',
	'',
	'- `/swarm status` — Show current swarm state',
	'- `/swarm plan [phase]` — Show plan (optionally filter by phase number)',
	'- `/swarm agents` — List registered agents',
	'- `/swarm history` — Show completed phases summary',
	'- `/swarm config` — Show current resolved configuration',
	'- `/swarm config doctor` — Run config doctor checks',
	'- `/swarm evidence [taskId]` — Show evidence bundles',
	'- `/swarm evidence summary` — Generate evidence summary with completion ratio and blockers',
	'- `/swarm archive [--dry-run]` — Archive old evidence bundles',
	'- `/swarm diagnose` — Run health check on swarm state',
	'- `/swarm preflight` — Run preflight automation checks',
	'- `/swarm sync-plan` — Ensure plan.json and plan.md are synced',
	'- `/swarm benchmark [--cumulative] [--ci-gate]` — Show performance metrics',
	'- `/swarm export` — Export plan and context as JSON',
	'- `/swarm reset --confirm` — Clear swarm state files',
	'- `/swarm retrieve <id>` — Retrieve full output from a summary',
	'- `/swarm rollback <phase>` — Restore swarm state to a checkpoint',
	'- `/swarm clarify [topic]` — Clarify and refine an existing feature specification',
	'- `/swarm analyze` — Analyze spec.md vs plan.md for requirement coverage gaps',
	'- `/swarm specify [description]` — Generate or import a feature specification',
	'- `/swarm dark-matter` — Detect hidden file couplings via co-change NPMI analysis',
	'- `/swarm simulate [--target <glob>]` — Dry-run impact analysis of proposed changes',
	'- `/swarm knowledge quarantine <id> [reason]` — Move a knowledge entry to quarantine',
	'- `/swarm knowledge restore <id>` — Restore a quarantined knowledge entry',
	'- `/swarm knowledge migrate` — Migrate knowledge entries to the current format',
	'- `/swarm promote "<lesson>" | --category <cat> | --from-swarm <id> — Manually promote lesson to hive knowledge',
	'- `/swarm handoff` — Prepare state for clean model switch (new session)',
	'- `/swarm write-retro <json>` — Write a retrospective evidence bundle for a completed phase',
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
		const [subcommand, ...args] = tokens;

		let text: string;

		switch (subcommand) {
			case 'status':
				text = await handleStatusCommand(directory, agents);
				break;
			case 'plan':
				text = await handlePlanCommand(directory, args);
				break;
			case 'promote':
				text = await handlePromoteCommand(directory, args);
				break;
			case 'preflight':
				text = await handlePreflightCommand(directory, args);
				break;
			case 'sync-plan':
				text = await handleSyncPlanCommand(directory, args);
				break;
			case 'benchmark':
				text = await handleBenchmarkCommand(directory, args);
				break;
			case 'export':
				text = await handleExportCommand(directory, args);
				break;
			case 'reset':
				text = await handleResetCommand(directory, args);
				break;
			case 'rollback':
				text = await handleRollbackCommand(directory, args);
				break;
			case 'retrieve':
				text = await handleRetrieveCommand(directory, args);
				break;
			case 'clarify':
				text = await handleClarifyCommand(directory, args);
				break;
			case 'analyze':
				text = await handleAnalyzeCommand(directory, args);
				break;
			case 'simulate':
				text = await handleSimulateCommand(directory, args);
				break;
			case 'specify':
				text = await handleSpecifyCommand(directory, args);
				break;
			case 'dark-matter':
				text = await handleDarkMatterCommand(directory, args);
				break;
			case 'write-retro':
				text = await handleWriteRetroCommand(directory, args);
				break;
			case 'knowledge': {
				const subcommand = args[0];

				if (subcommand === 'quarantine') {
					text = await handleKnowledgeQuarantineCommand(
						directory,
						args.slice(1),
					);
				} else if (subcommand === 'restore') {
					text = await handleKnowledgeRestoreCommand(directory, args.slice(1));
				} else if (subcommand === 'migrate') {
					text = await handleKnowledgeMigrateCommand(directory, args.slice(1));
				} else {
					// Default: list knowledge entries
					text = await handleKnowledgeListCommand(directory, args.slice(1));
				}
				break;
			}
			case 'agents':
				text = await handleAgentsCommand(agents);
				break;
			case 'history':
				text = await handleHistoryCommand(directory, args);
				break;
			case 'config': {
				if (args[0] === 'doctor') {
					text = await handleDoctorCommand(directory, args.slice(1));
				} else {
					text = await handleConfigCommand(directory, args);
				}
				break;
			}
			case 'evidence': {
				if (args[0] === 'summary') {
					text = await handleEvidenceSummaryCommand(directory);
				} else {
					text = await handleEvidenceCommand(directory, args);
				}
				break;
			}
			case 'archive':
				text = await handleArchiveCommand(directory, args);
				break;
			case 'diagnose':
				text = await handleDiagnoseCommand(directory, args);
				break;
			case 'handoff':
				text = await handleHandoffCommand(directory, args);
				break;
			default:
				text = HELP_TEXT;
				break;
		}

		// Convert string result to Part[]
		output.parts = [
			{ type: 'text', text } as unknown as (typeof output.parts)[number],
		];
	};
}
