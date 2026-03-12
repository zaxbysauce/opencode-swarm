/**
 * Handle /swarm specify command.
 * Returns a prompt that triggers the architect to enter MODE: SPECIFY.
 */
export async function handleSpecifyCommand(
	_directory: string,
	args: string[],
): Promise<string> {
	const description = args.join(' ').trim();
	if (description) {
		return `[MODE: SPECIFY] ${description}`;
	}
	return '[MODE: SPECIFY] Please enter MODE: SPECIFY and generate a spec for this project.';
}
