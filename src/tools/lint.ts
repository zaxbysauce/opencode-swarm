import * as path from 'node:path';
import { tool } from '@opencode-ai/plugin';

// ============ Constants ============
export const MAX_OUTPUT_BYTES = 512_000; // 512KB max output
export const MAX_COMMAND_LENGTH = 500;
export const SUPPORTED_LINTERS = ['biome', 'eslint'] as const;
export type SupportedLinter = (typeof SUPPORTED_LINTERS)[number];

// ============ Response Types ============
export interface LintSuccessResult {
	success: true;
	mode: 'fix' | 'check';
	linter: SupportedLinter;
	command: string[];
	exitCode: number;
	output: string;
	message?: string;
}

export interface LintErrorResult {
	success: false;
	mode: 'fix' | 'check';
	linter?: SupportedLinter;
	command?: string[];
	exitCode?: number;
	output?: string;
	error: string;
	message?: string;
}

export type LintResult = LintSuccessResult | LintErrorResult;

// ============ Validation ============
export function containsPathTraversal(str: string): boolean {
	return /\.\.[/\\]/.test(str);
}

export function containsControlChars(str: string): boolean {
	return /[\0\t\r\n]/.test(str);
}

export function validateArgs(args: unknown): args is { mode: 'fix' | 'check' } {
	if (typeof args !== 'object' || args === null) return false;
	const obj = args as Record<string, unknown>;
	if (obj.mode !== 'fix' && obj.mode !== 'check') return false;
	return true;
}

// ============ Platform Utilities ============
export function getLinterCommand(
	linter: SupportedLinter,
	mode: 'fix' | 'check',
): string[] {
	const isWindows = process.platform === 'win32';

	// Get path to local node_modules/.bin
	const binDir = path.join(process.cwd(), 'node_modules', '.bin');
	const biomeBin = isWindows
		? path.join(binDir, 'biome.EXE')
		: path.join(binDir, 'biome');
	const eslintBin = isWindows
		? path.join(binDir, 'eslint.cmd')
		: path.join(binDir, 'eslint');

	switch (linter) {
		case 'biome':
			// Use local biome directly (not npx) to ensure consistent version
			if (mode === 'fix') {
				return isWindows
					? [biomeBin, 'check', '--write', '.']
					: [biomeBin, 'check', '--write', '.'];
			}
			return isWindows ? [biomeBin, 'check', '.'] : [biomeBin, 'check', '.'];
		case 'eslint':
			// eslint .  or  eslint . --fix
			if (mode === 'fix') {
				return isWindows
					? [eslintBin, '.', '--fix']
					: [eslintBin, '.', '--fix'];
			}
			return isWindows ? [eslintBin, '.'] : [eslintBin, '.'];
	}
}

// ============ Linter Detection ============
export async function detectAvailableLinter(): Promise<SupportedLinter | null> {
	// Timeout for linter detection (in ms)
	const DETECT_TIMEOUT = 2000;

	// Try biome first (fastest, recommended)
	try {
		const biomeProc = Bun.spawn(['npx', 'biome', '--version'], {
			stdout: 'pipe',
			stderr: 'pipe',
		});

		// Race with timeout
		const biomeExit = biomeProc.exited;
		const timeout = new Promise<'timeout'>((resolve) =>
			setTimeout(() => resolve('timeout'), DETECT_TIMEOUT),
		);

		const result = await Promise.race([biomeExit, timeout]);
		if (result === 'timeout') {
			biomeProc.kill();
			// biome not available or timed out
		} else if (biomeProc.exitCode === 0) {
			return 'biome';
		}
	} catch {
		// biome not available
	}

	// Try eslint
	try {
		const eslintProc = Bun.spawn(['npx', 'eslint', '--version'], {
			stdout: 'pipe',
			stderr: 'pipe',
		});

		// Race with timeout
		const eslintExit = eslintProc.exited;
		const timeout = new Promise<'timeout'>((resolve) =>
			setTimeout(() => resolve('timeout'), DETECT_TIMEOUT),
		);

		const result = await Promise.race([eslintExit, timeout]);
		if (result === 'timeout') {
			eslintProc.kill();
			// eslint not available or timed out
		} else if (eslintProc.exitCode === 0) {
			return 'eslint';
		}
	} catch {
		// eslint not available
	}

	return null;
}

// ============ Lint Execution ============
export async function runLint(
	linter: SupportedLinter,
	mode: 'fix' | 'check',
): Promise<LintResult> {
	const command = getLinterCommand(linter, mode);

	// Validate command length for safety
	const commandStr = command.join(' ');
	if (commandStr.length > MAX_COMMAND_LENGTH) {
		return {
			success: false,
			mode,
			linter,
			command,
			error: 'Command exceeds maximum allowed length',
		};
	}

	try {
		const proc = Bun.spawn(command, {
			stdout: 'pipe',
			stderr: 'pipe',
		});

		const [stdout, stderr] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
		]);

		const exitCode = await proc.exited;

		// Combine stdout and stderr, truncate if needed
		let output = stdout;
		if (stderr) {
			output += (output ? '\n' : '') + stderr;
		}

		// Truncate output if too large
		if (output.length > MAX_OUTPUT_BYTES) {
			output = `${output.slice(0, MAX_OUTPUT_BYTES)}\n... (output truncated)`;
		}

		const result: LintSuccessResult = {
			success: true,
			mode,
			linter,
			command,
			exitCode,
			output,
		};

		// Add helpful message based on results
		if (exitCode === 0) {
			result.message = `${linter} ${mode} completed successfully with no issues`;
		} else if (mode === 'fix') {
			result.message = `${linter} fix completed with exit code ${exitCode}. Run check mode to see remaining issues.`;
		} else {
			result.message = `${linter} check found issues (exit code ${exitCode}).`;
		}

		return result;
	} catch (error) {
		return {
			success: false,
			mode,
			linter,
			command,
			error:
				error instanceof Error
					? `Execution failed: ${error.message}`
					: 'Execution failed: unknown error',
		};
	}
}

// ============ Tool Definition ============
export const lint: ReturnType<typeof tool> = tool({
	description:
		'Run project linter in check or fix mode. Supports biome and eslint. Returns JSON with success status, exit code, and output for architect pre-reviewer gate. Use check mode for CI/linting and fix mode to automatically apply fixes.',
	args: {
		mode: tool.schema
			.enum(['fix', 'check'])
			.describe(
				'Linting mode: "check" for read-only lint check, "fix" to automatically apply fixes',
			),
	},
	async execute(args: unknown, _context: unknown): Promise<string> {
		// Validate arguments
		if (!validateArgs(args)) {
			const errorResult: LintErrorResult = {
				success: false,
				mode: 'check',
				error: 'Invalid arguments: mode must be "fix" or "check"',
			};
			return JSON.stringify(errorResult, null, 2);
		}

		const { mode } = args;

		// Detect available linter
		const linter = await detectAvailableLinter();

		if (!linter) {
			const errorResult: LintErrorResult = {
				success: false,
				mode,
				error: 'No linter found. Install biome or eslint to use this tool.',
				message: 'Run: npm install -D @biomejs/biome eslint',
			};
			return JSON.stringify(errorResult, null, 2);
		}

		// Run the linter
		const result = await runLint(linter, mode);
		return JSON.stringify(result, null, 2);
	},
});
