import { readSwarmFileAsync } from '../hooks/utils';
import { loadPlanJsonOnly } from '../plan/manager';

/**
 * Handles the /swarm export command.
 * Exports plan.md and context.md as a portable JSON object.
 */
export async function handleExportCommand(
	directory: string,
	_args: string[],
): Promise<string> {
	const planStructured = await loadPlanJsonOnly(directory);
	const planContent = await readSwarmFileAsync(directory, 'plan.md');
	const contextContent = await readSwarmFileAsync(directory, 'context.md');

	const exportData = {
		version: '4.5.0',
		exported: new Date().toISOString(),
		plan: planStructured || planContent, // structured Plan object if available, else markdown
		context: contextContent,
	};

	const lines = [
		'## Swarm Export',
		'',
		'```json',
		JSON.stringify(exportData, null, 2),
		'```',
	];

	return lines.join('\n');
}
