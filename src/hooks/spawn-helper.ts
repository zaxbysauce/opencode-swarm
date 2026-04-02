import * as child_process from 'node:child_process';

// Known Node.js package manager binaries that require .cmd extension on Windows.
// Only exact matches are extended — user-configured or other commands are left unchanged.
const WIN32_CMD_BINARIES = new Set(['npm', 'npx', 'pnpm', 'yarn']);

export function spawnAsync(
	command: string[],
	cwd: string,
	timeoutMs: number,
): Promise<{ exitCode: number; stdout: string; stderr: string } | null> {
	return new Promise((resolve) => {
		try {
			const [rawCmd, ...args] = command;
			const cmd =
				process.platform === 'win32' &&
				WIN32_CMD_BINARIES.has(rawCmd) &&
				!rawCmd.includes('.')
					? `${rawCmd}.cmd`
					: rawCmd;
			const proc = child_process.spawn(cmd, args, {
				cwd,
				stdio: ['ignore', 'pipe', 'pipe'],
			});

			let stdout = '';
			let stderr = '';
			let done = false;
			const MAX_OUTPUT = 512 * 1024; // 512KB cap — prevents OOM from infinite-output commands

			proc.stdout.on('data', (d: Buffer) => {
				if (stdout.length < MAX_OUTPUT) {
					stdout += d;
					if (stdout.length >= MAX_OUTPUT) {
						stdout = stdout.slice(0, MAX_OUTPUT);
						try {
							proc.stdout.destroy();
						} catch {
							/* ignore */
						}
					}
				}
			});
			proc.stderr.on('data', (d: Buffer) => {
				if (stderr.length < MAX_OUTPUT) {
					stderr += d;
					if (stderr.length >= MAX_OUTPUT) {
						stderr = stderr.slice(0, MAX_OUTPUT);
						try {
							proc.stderr.destroy();
						} catch {
							/* ignore */
						}
					}
				}
			});

			const timer = setTimeout(() => {
				if (done) return;
				done = true;
				try {
					proc.stdout.destroy();
				} catch {
					/* ignore */
				}
				try {
					proc.stderr.destroy();
				} catch {
					/* ignore */
				}
				try {
					proc.kill();
				} catch {
					/* ignore */
				}
				resolve(null);
			}, timeoutMs);

			proc.on('close', (code: number | null) => {
				if (done) return;
				done = true;
				clearTimeout(timer);
				resolve({ exitCode: code ?? 1, stdout, stderr });
			});
			proc.on('error', () => {
				if (done) return;
				done = true;
				clearTimeout(timer);
				resolve(null);
			});
		} catch {
			resolve(null);
		}
	});
}
