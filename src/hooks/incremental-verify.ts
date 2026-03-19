/**
 * Incremental verification hook — runs a typecheck after each coder Task delegation.
 * Fires in tool.execute.after when input.tool === 'Task' and the delegated agent was 'coder'.
 * Advisory only — never blocks. 30-second hard timeout. Uses directory from context.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { IncrementalVerifyConfig } from '../config/schema';
import { spawnAsync } from './spawn-helper';
export type { IncrementalVerifyConfig };
export { detectTypecheckCommand };

export interface IncrementalVerifyHook {
	toolAfter: (
		input: { tool: string; sessionID: string; args?: unknown },
		output: { output?: unknown; args?: unknown },
	) => Promise<void>;
}

// Module-level dedup — prevents the same SKIPPED advisory from being emitted multiple times per session
const emittedSkipAdvisories = new Set<string>();

/** For test isolation — call in beforeEach/afterEach */
export function resetAdvisoryDedup(): void {
	emittedSkipAdvisories.clear();
}

/**
 * Detect the typecheck/build check command for the project.
 * Returns { command, language } where command is null if no default checker exists,
 * or null overall if no supported language is detected.
 * Checks in order: TypeScript (package.json) → Go (go.mod) → Rust (Cargo.toml)
 * → Python (pyproject.toml/requirements.txt/setup.py) → C# (*.csproj/*.sln)
 * First match wins; package.json presence means Node/Bun project — no fallthrough.
 */
function detectTypecheckCommand(
	projectDir: string,
): { command: string[] | null; language: string } | null {
	// 1. TypeScript / Node.js project
	const pkgPath = path.join(projectDir, 'package.json');
	if (fs.existsSync(pkgPath)) {
		try {
			const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as Record<
				string,
				unknown
			>;
			const scripts = pkg.scripts as Record<string, string> | undefined;

			// Prefer explicit typecheck script
			if (scripts?.typecheck)
				return { command: ['bun', 'run', 'typecheck'], language: 'typescript' };
			if (scripts?.['type-check'])
				return {
					command: ['bun', 'run', 'type-check'],
					language: 'typescript',
				};

			// Check for TypeScript presence
			const deps = {
				...(pkg.dependencies as Record<string, string> | undefined),
				...(pkg.devDependencies as Record<string, string> | undefined),
			};
			if (
				!deps?.typescript &&
				!fs.existsSync(path.join(projectDir, 'tsconfig.json'))
			) {
				return null; // package.json exists but no TS — not a TS project, no fallthrough
			}

			// Fallback: bare tsc --noEmit
			return { command: ['npx', 'tsc', '--noEmit'], language: 'typescript' };
		} catch {
			return null;
		}
	}

	// 2. Go project
	if (fs.existsSync(path.join(projectDir, 'go.mod'))) {
		return { command: ['go', 'vet', './...'], language: 'go' };
	}

	// 3. Rust project
	if (fs.existsSync(path.join(projectDir, 'Cargo.toml'))) {
		return { command: ['cargo', 'check'], language: 'rust' };
	}

	// 4. Python project
	if (
		fs.existsSync(path.join(projectDir, 'pyproject.toml')) ||
		fs.existsSync(path.join(projectDir, 'requirements.txt')) ||
		fs.existsSync(path.join(projectDir, 'setup.py'))
	) {
		return { command: null, language: 'python' };
	}

	// 5. C# project — check for .csproj or .sln in project root
	try {
		const entries = fs.readdirSync(projectDir);
		if (entries.some((f) => f.endsWith('.csproj') || f.endsWith('.sln'))) {
			return {
				command: ['dotnet', 'build', '--no-restore'],
				language: 'csharp',
			};
		}
	} catch {
		// readdirSync failure — skip C# detection
	}

	// No supported language detected
	return null;
}

/**
 * Run a command with a hard timeout. Returns { success, output } or null on timeout/error.
 */
async function runWithTimeout(
	command: string[],
	cwd: string,
	timeoutMs: number,
): Promise<{ exitCode: number; stderr: string } | null> {
	const result = await spawnAsync(command, cwd, timeoutMs);
	if (result === null) return null;
	return { exitCode: result.exitCode, stderr: result.stderr };
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
			let commandToRun: string[] | null = null;

			if (config.command != null) {
				commandToRun = Array.isArray(config.command)
					? config.command
					: config.command.split(' ');
			} else {
				const detected = detectTypecheckCommand(projectDir);
				if (detected === null) {
					return; // No language detected — skip silently
				}
				if (detected.command === null) {
					// Language detected but no default checker available
					const dedupKey = `${input.sessionID}:${detected.language}`;
					if (!emittedSkipAdvisories.has(dedupKey)) {
						emittedSkipAdvisories.add(dedupKey);
						injectMessage(
							input.sessionID,
							`POST-CODER CHECK SKIPPED: ${detected.language} project detected but no default checker available. Set incremental_verify.command in .swarm/config.json to enable.`,
						);
					}
					return;
				}
				commandToRun = detected.command;
			}

			if (commandToRun === null) return; // Safety guard

			// Run with timeout
			const result = await runWithTimeout(
				commandToRun,
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
