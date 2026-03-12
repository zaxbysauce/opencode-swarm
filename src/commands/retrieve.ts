import { loadFullOutput } from '../summaries/manager';

/**
 * Handles the /swarm retrieve command.
 * Loads full tool output from .swarm/summaries/{id}.json and returns it.
 */

export async function handleRetrieveCommand(
	directory: string,
	args: string[],
): Promise<string> {
	// Extract ID from args
	const summaryId = args[0];

	if (!summaryId) {
		return [
			'## Swarm Retrieve',
			'',
			'Usage: `/swarm retrieve <id>`',
			'',
			'Example: `/swarm retrieve S1`',
			'',
			'Retrieves the full output that was replaced by a summary.',
		].join('\n');
	}

	try {
		const fullOutput = await loadFullOutput(directory, summaryId);

		if (fullOutput === null) {
			return `## Summary Not Found\n\nNo stored output found for ID \`${summaryId}\`.\n\nUse a valid summary ID (e.g., S1, S2, S3).`;
		}

		return fullOutput;
	} catch (error) {
		return `## Retrieve Failed\n\n${error instanceof Error ? error.message : String(error)}`;
	}
}
