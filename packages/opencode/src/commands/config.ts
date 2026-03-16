import * as os from 'node:os';
import * as path from 'node:path';
import { loadPluginConfig } from '../config/loader';

/**
 * Get the user's configuration directory (XDG Base Directory spec).
 */
function getUserConfigDir(): string {
	return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
}

/**
 * Handles the /swarm config command.
 * Loads and displays the current resolved plugin configuration.
 */
export async function handleConfigCommand(
	directory: string,
	_args: string[],
): Promise<string> {
	const config = loadPluginConfig(directory);

	const userConfigPath = path.join(
		getUserConfigDir(),
		'opencode',
		'opencode-swarm.json',
	);
	const projectConfigPath = path.join(
		directory,
		'.opencode',
		'opencode-swarm.json',
	);

	const lines = [
		'## Swarm Configuration',
		'',
		'### Config Files',
		`- User: \`${userConfigPath}\``,
		`- Project: \`${projectConfigPath}\``,
		'',
		'### Resolved Config',
		'```json',
		JSON.stringify(config, null, 2),
		'```',
	];

	return lines.join('\n');
}
