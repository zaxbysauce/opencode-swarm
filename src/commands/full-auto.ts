import { getAgentSession, swarmState } from '../state';

/**
 * Handles the /swarm full-auto command.
 * Toggles Full-Auto Mode on or off for the active session.
 *
 * @param directory - Project directory (unused but kept for consistency with other commands)
 * @param args - Optional argument: "on" | "off" | undefined (toggle behavior)
 * @param sessionID - Session ID for accessing active session state
 * @returns Feedback message about Full-Auto Mode state
 */
export async function handleFullAutoCommand(
	_directory: string,
	args: string[],
	sessionID: string,
): Promise<string> {
	// Check for empty/blank sessionID - CLI context doesn't have session
	if (!sessionID || sessionID.trim() === '') {
		return 'Error: No active session context. Full-Auto Mode requires an active session. Use /swarm-full-auto from within an OpenCode session, or start a session first.';
	}

	// Validate session exists
	const session = getAgentSession(sessionID);
	if (!session) {
		return 'Error: No active session. Full-Auto Mode requires an active session to operate.';
	}

	// Parse the argument
	const arg = args[0]?.toLowerCase();

	let newFullAutoMode: boolean;

	if (arg === 'on') {
		newFullAutoMode = true;
	} else if (arg === 'off') {
		newFullAutoMode = false;
	} else {
		// Toggle behavior when no argument provided
		newFullAutoMode = !session.fullAutoMode;
	}

	// Block activation if config-level full_auto is not enabled
	if (newFullAutoMode && !swarmState.fullAutoEnabledInConfig) {
		return 'Error: Full-Auto Mode cannot be enabled because full_auto.enabled is not set to true in the swarm plugin config. The autonomous oversight hook is inactive without config-level enablement. Set full_auto.enabled = true in your opencode-swarm config and restart.';
	}

	// Update the session state
	session.fullAutoMode = newFullAutoMode;

	// Reset interaction counters when toggling off to ensure clean state on re-enable
	if (!newFullAutoMode) {
		session.fullAutoInteractionCount = 0;
		session.fullAutoDeadlockCount = 0;
		session.fullAutoLastQuestionHash = null;
	}

	return newFullAutoMode ? 'Full-Auto Mode enabled' : 'Full-Auto Mode disabled';
}
