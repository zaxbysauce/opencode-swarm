/**
 * Handle /swarm clarify command.
 * Returns a prompt that triggers the architect to enter MODE: CLARIFY-SPEC.
 */
export async function handleClarifyCommand(
	_directory: string,
	args: string[],
): Promise<string> {
	const description = args.join(' ').trim();
	if (description) {
		return `[MODE: CLARIFY-SPEC] ${description}`;
	}
	return '[MODE: CLARIFY-SPEC] Please enter MODE: CLARIFY-SPEC and clarify the existing spec.';
}
