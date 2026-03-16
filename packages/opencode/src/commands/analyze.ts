/**
 * Handle /swarm analyze command.
 * Returns a prompt that triggers the critic to enter MODE: ANALYZE.
 */
export async function handleAnalyzeCommand(
	_directory: string,
	args: string[],
): Promise<string> {
	const description = args.join(' ').trim();
	if (description) {
		return `[MODE: ANALYZE] ${description}`;
	}
	return '[MODE: ANALYZE] Please analyze the spec against the plan using MODE: ANALYZE.';
}
