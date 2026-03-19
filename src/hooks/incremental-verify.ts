/**
 * Incremental verification hook — runs a typecheck after each coder Task delegation.
 * Fires in tool.execute.after when input.tool === 'Task' and the delegated agent was 'coder'.
 * Advisory only — never blocks. 30-second hard timeout. Uses directory from context.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { IncrementalVerifyConfig } from '../config/schema';
export type { IncrementalVerifyConfig };

export interface IncrementalVerifyHook {
	toolAfter: (
		input: { tool: string; sessionID: string; args?: unknown },
		output: { output?: unknown; args?: unknown },
	) => Promise<void>;
}

/**
 * Detect the typecheck command from package.json scripts.
 * Returns ['bun', 'run', 'typecheck'] if a typecheck script exists,
 * otherwise returns ['npx', 'tsc', '--noEmit'] as fallback,
 * or null if TypeScript is not present in the project.
 */
function detectTypecheckCommand(projectDir: string): string[] | null {
	const pkgPath = path.join(projectDir, 'package.json');
	if (!fs.existsSync(pkgPath)) return null;

	try {
		const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as Record<
			string,
			unknown
		>;
		const scripts = pkg.scripts as Record<string, string> | undefined;

		// Prefer explicit typecheck script
		if (scripts?.typecheck) return ['bun', 'run', 'typecheck'];
		if (scripts?.['type-check']) return ['bun', 'run', 'type-check'];

		// Check for TypeScript presence
		const deps = {
			...(pkg.dependencies as Record<string, string> | undefined),
			...(pkg.devDependencies as Record<string, string> | undefined),
		};
		if (
			!deps?.typescript &&
			!fs.existsSync(path.join(projectDir, 'tsconfig.json'))
		) {
			return null; // No TypeScript — skip entirely
		}

		// Fallback: bare tsc --noEmit
		return ['npx', 'tsc', '--noEmit'];
	} catch {
		return null;
	}
}

/**
 * Run a command with a hard timeout. Returns { success, output } or null on timeout/error.
 */
async function runWithTimeout(
	command: string[],
	cwd: string,
	timeoutMs: number,
): Promise<{ exitCode: number; stderr: string } | null> {
	try {
		const proc = Bun.spawn(command, {
			cwd,
			stdout: 'pipe',
			stderr: 'pipe',
		});

		const timeoutHandle = setTimeout(() => {
			try {
				proc.kill();
			} catch {
				/* ignore */
			}
		}, timeoutMs);

		try {
			const [exitCode, stderr] = await Promise.all([
				proc.exited,
				new Response(proc.stderr).text(),
			]);
			return { exitCode, stderr };
		} finally {
			clearTimeout(timeoutHandle);
		}
	} catch {
		return null;
	}
}

export function createIncrementalVerifyHook(
	config: IncrementalVerifyConfig,
	projectDir: string,
	injectMessage: (sessionId: string, message: string) => void,
): IncrementalVerifyHook {
	return {
		toolAfter: async (input, output) => {
			if (!config.enabled) return;
			if (input.tool !== 'Task') return;

			// Identify which agent was delegated to
			const args = (input.args ?? output.args) as
				| Record<string, unknown>
				| undefined;
			const subagentType =
				typeof args?.subagent_type === 'string' ? args.subagent_type : '';

			// Normalise: strip known swarm prefix (e.g. 'mega_coder' → 'coder')
			const agentName = subagentType.replace(/^[^_]+_/, '');
			if (
				!config.triggerAgents.includes(agentName) &&
				!config.triggerAgents.includes(subagentType)
			) {
				return;
			}

			// Determine typecheck command
			const command =
				config.command != null
					? config.command.split(' ')
					: detectTypecheckCommand(projectDir);

			if (!command) return; // No TypeScript detected — skip

			// Run with timeout
			const result = await runWithTimeout(
				command,
				projectDir,
				config.timeoutMs,
			);

			if (result === null) {
				// Timeout or spawn error — silently skip
				return;
			}

			if (result.exitCode === 0) {
				injectMessage(
					input.sessionID,
					'POST-CODER CHECK PASSED: No type errors.',
				);
			} else {
				const errorSummary = result.stderr.slice(0, 800); // cap output
				injectMessage(
					input.sessionID,
					`POST-CODER CHECK FAILED: Type errors detected after coder delegation. Address these before proceeding.\n${errorSummary}`,
				);
			}
		},
	};
}
