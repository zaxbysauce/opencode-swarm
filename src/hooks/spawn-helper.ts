import { spawn } from 'node:child_process';

export function spawnAsync(
	command: string[],
	cwd: string,
	timeoutMs: number,
): Promise<{ exitCode: number; stdout: string; stderr: string } | null> {
	return new Promise((resolve) => {
		try {
			const [cmd, ...args] = command;
			const proc = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });

			let stdout = '';
			let stderr = '';
			let done = false;

			proc.stdout.on('data', (d: Buffer) => {
				stdout += d;
			});
			proc.stderr.on('data', (d: Buffer) => {
				stderr += d;
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
