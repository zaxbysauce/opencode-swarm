import { type ToolContext, tool } from '@opencode-ai/plugin';
import { loadFullOutput, sanitizeSummaryId } from '../summaries/manager';

const RETRIEVE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export const retrieve_summary: ReturnType<typeof tool> = tool({
	description:
		'Retrieve the full content of a stored tool output summary by its ID (e.g. S1, S2). Use this when a prior tool output was summarized and you need the full content.',
	args: {
		id: tool.schema
			.string()
			.describe(
				'The summary ID to retrieve (e.g. S1, S2, S99). Must match pattern S followed by digits.',
			),
	},
	async execute(args: { id: string }, context: ToolContext): Promise<string> {
		const directory = context.directory;

		// Validate ID format and security constraints
		let sanitizedId: string;
		try {
			sanitizedId = sanitizeSummaryId(args.id);
		} catch {
			return 'Error: invalid summary ID format. Expected format: S followed by digits (e.g. S1, S2, S99).';
		}

		// Retrieve the full output
		let fullOutput: string | null;
		try {
			fullOutput = await loadFullOutput(directory, sanitizedId);
		} catch {
			return 'Error: failed to retrieve summary.';
		}

		if (fullOutput === null) {
			return `Summary \`${sanitizedId}\` not found. Use a valid summary ID (e.g. S1, S2).`;
		}

		// Enforce size limit
		if (fullOutput.length > RETRIEVE_MAX_BYTES) {
			return `Error: summary content exceeds maximum size limit (10 MB).`;
		}

		return fullOutput;
	},
});
