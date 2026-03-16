import { getAgentSession } from '../state';

/**
 * Handles the /swarm turbo command.
 * Toggles Turbo Mode on or off for the active session.
 *
 * @param directory - Project directory (unused but kept for consistency with other commands)
 * @param args - Optional argument: "on" | "off" | undefined (toggle behavior)
 * @param sessionID - Session ID for accessing active session state
 * @returns Feedback message about Turbo Mode state
 */
export async function handleTurboCommand(
	_directory: string,
	args: string[],
	sessionID: string,
): Promise<string> {
	// Check for empty/blank sessionID - CLI context doesn't have session
	if (!sessionID || sessionID.trim() === '') {
		return 'Error: No active session context. Turbo Mode requires an active session. Use /swarm turbo from within an OpenCode session, or start a session first.';
	}

	// Validate session exists
	const session = getAgentSession(sessionID);
	if (!session) {
		return 'Error: No active session. Turbo Mode requires an active session to operate.';
	}

	// Parse the argument
	const arg = args[0]?.toLowerCase();

	let newTurboMode: boolean;
	let feedback: string;

	if (arg === 'on') {
		newTurboMode = true;
		feedback = 'Turbo Mode enabled';
	} else if (arg === 'off') {
		newTurboMode = false;
		feedback = 'Turbo Mode disabled';
	} else {
		// Toggle behavior when no argument provided
		newTurboMode = !session.turboMode;
		feedback = newTurboMode ? 'Turbo Mode enabled' : 'Turbo Mode disabled';
	}

	// Update the session state
	session.turboMode = newTurboMode;

	return feedback;
}
