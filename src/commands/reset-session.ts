import * as fs from 'node:fs';
import { validateSwarmPath } from '../hooks/utils';
import { swarmState } from '../state';

/**
 * Handles the /swarm reset-session command.
 * Deletes only the session state file (.swarm/session/state.json)
 * and clears in-memory agent sessions. Preserves plan, evidence,
 * and knowledge for continuity across sessions.
 */
export async function handleResetSessionCommand(
	directory: string,
	_args: string[],
): Promise<string> {
	const results: string[] = [];

	// Delete session state file
	try {
		const statePath = validateSwarmPath(directory, 'session/state.json');
		if (fs.existsSync(statePath)) {
			fs.unlinkSync(statePath);
			results.push('✅ Deleted .swarm/session/state.json');
		} else {
			results.push('⏭️ state.json not found (already clean)');
		}
	} catch {
		results.push('❌ Failed to delete state.json');
	}

	// Clear in-memory agent sessions
	const sessionCount = swarmState.agentSessions.size;
	swarmState.agentSessions.clear();
	results.push(`✅ Cleared ${sessionCount} in-memory agent session(s)`);

	return [
		'## Session State Reset',
		'',
		...results,
		'',
		'Session state cleared. Plan, evidence, and knowledge preserved.',
		'',
		'**Next step:** Start a new OpenCode session. The plugin will initialize fresh session state on startup.',
	].join('\n');
}
