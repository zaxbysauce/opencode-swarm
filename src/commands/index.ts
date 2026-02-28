import type { AgentDefinition } from '../agents';
import { loadPluginConfig } from '../config/loader';
import { GuardrailsConfigSchema } from '../config/schema';
import { handleAgentsCommand } from './agents';
import { handleArchiveCommand } from './archive';
import { handleBenchmarkCommand } from './benchmark';
import { handleConfigCommand } from './config';
import { handleDiagnoseCommand } from './diagnose';
import { handleDoctorCommand } from './doctor';
import {
	handleEvidenceCommand,
	handleEvidenceSummaryCommand,
} from './evidence';
import { handleExportCommand } from './export';
import { handleHistoryCommand } from './history';
import { handlePlanCommand } from './plan';
import { handlePreflightCommand } from './preflight';
import { handleResetCommand } from './reset';
import { handleRetrieveCommand } from './retrieve';
import { handleStatusCommand } from './status';
import { handleSyncPlanCommand } from './sync-plan';

// Re-export individual handlers
export { handleAgentsCommand } from './agents';
export { handleArchiveCommand } from './archive';
export { handleBenchmarkCommand } from './benchmark';
export { handleConfigCommand } from './config';
export { handleDiagnoseCommand } from './diagnose';
export { handleDoctorCommand } from './doctor';
export { handleEvidenceCommand } from './evidence';
export { handleExportCommand } from './export';
export { handleHistoryCommand } from './history';
export { handlePlanCommand } from './plan';
export { handlePreflightCommand } from './preflight';
export { handleResetCommand } from './reset';
export { handleRetrieveCommand } from './retrieve';
export { handleStatusCommand } from './status';
export { handleSyncPlanCommand } from './sync-plan';

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
			case 'agents': {
				// Load guardrails config for profile display
				const pluginConfig = loadPluginConfig(directory);
				const guardrailsConfig = pluginConfig?.guardrails
					? GuardrailsConfigSchema.parse(pluginConfig.guardrails)
					: undefined;
				text = handleAgentsCommand(agents, guardrailsConfig);
				break;
			}
			case 'archive':
				text = await handleArchiveCommand(directory, args);
				break;
			case 'history':
				text = await handleHistoryCommand(directory, args);
				break;
			case 'config':
				if (args[0] === 'doctor') {
					// Handle /swarm config doctor
					text = await handleDoctorCommand(directory, args.slice(1));
				} else {
					text = await handleConfigCommand(directory, args);
				}
				break;
			case 'doctor':
				// Also support /swarm doctor as shortcut
				text = await handleDoctorCommand(directory, args);
				break;
			case 'evidence':
				if (args[0] === 'summary') {
					text = await handleEvidenceSummaryCommand(directory);
				} else {
					text = await handleEvidenceCommand(directory, args);
				}
				break;
			case 'diagnose':
				text = await handleDiagnoseCommand(directory, args);
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
			case 'retrieve':
				text = await handleRetrieveCommand(directory, args);
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
