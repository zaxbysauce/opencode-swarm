import * as fs from 'node:fs';
import * as path from 'node:path';

const STARTER_CONTENT = '{}\n';

/**
 * Creates .opencode/opencode-swarm.json in the given directory if it does not
 * already exist. Uses an atomic exclusive write (flag 'wx') so concurrent
 * plugin loads never double-write or corrupt the file.
 *
 * Non-fatal: any fs error (permissions, disk full, etc.) is swallowed so the
 * plugin continues with its default or global config.
 */
export function writeProjectConfigIfNew(
	directory: string,
	quiet = false,
): void {
	try {
		const opencodeDir = path.join(directory, '.opencode');
		const dest = path.join(opencodeDir, 'opencode-swarm.json');

		if (!fs.existsSync(opencodeDir)) {
			fs.mkdirSync(opencodeDir, { recursive: true });
		}

		try {
			fs.writeFileSync(dest, STARTER_CONTENT, {
				encoding: 'utf-8',
				flag: 'wx',
			});
			if (!quiet) {
				console.warn(
					'[opencode-swarm] Created .opencode/opencode-swarm.json — ' +
						'edit it to customize agent LLMs for this project, or commit it to share settings with your team',
				);
			}
		} catch (_writeErr) {
			// EEXIST means the file already exists — skip silently.
			// All other write errors (EACCES, ENOSPC, etc.) are also non-fatal.
		}
	} catch {
		// mkdirSync failure or any other unexpected error — non-fatal.
	}
}
