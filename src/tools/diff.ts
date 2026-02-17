import { execSync } from 'node:child_process';
import { type ToolContext, tool } from '@opencode-ai/plugin';

const MAX_DIFF_LINES = 500;
const DIFF_TIMEOUT_MS = 30_000;
const MAX_BUFFER_BYTES = 5 * 1024 * 1024;

const CONTRACT_PATTERNS = [
	/^[+-]\s*export\s+(function|const|class|interface|type|enum|default)\b/,
	/^[+-]\s*(interface|type)\s+\w+/,
	/^[+-]\s*public\s+/,
	/^[+-]\s*(async\s+)?function\s+\w+\s*\(/,
];

const SAFE_REF_PATTERN = /^[a-zA-Z0-9._\-/~^@{}]+$/;
const MAX_REF_LENGTH = 256;
const MAX_PATH_LENGTH = 500;
const SHELL_METACHARACTERS = /[;|&$`(){}<>!'"]/;

function validateBase(base: string): string | null {
	if (base.length > MAX_REF_LENGTH) {
		return `base ref exceeds maximum length of ${MAX_REF_LENGTH}`;
	}
	if (!SAFE_REF_PATTERN.test(base)) {
		return 'base contains invalid characters for git ref';
	}
	return null;
}

function validatePaths(paths: string[] | undefined): string | null {
	if (!paths) return null;
	for (const path of paths) {
		if (!path || path.length === 0) {
			return 'empty path not allowed';
		}
		if (path.length > MAX_PATH_LENGTH) {
			return `path exceeds maximum length of ${MAX_PATH_LENGTH}`;
		}
		if (SHELL_METACHARACTERS.test(path)) {
			return 'path contains shell metacharacters';
		}
	}
	return null;
}

export interface DiffResult {
	files: Array<{ path: string; additions: number; deletions: number }>;
	contractChanges: string[];
	hasContractChanges: boolean;
	summary: string;
}

export interface DiffErrorResult {
	error: string;
	files: [];
	contractChanges: [];
	hasContractChanges: false;
}

export const diff: ReturnType<typeof tool> = tool({
	description:
		'Analyze git diff for changed files, exports, interfaces, and function signatures. Returns structured output with contract change detection.',
	args: {
		base: tool.schema
			.string()
			.optional()
			.describe(
				'Base ref to diff against (default: HEAD). Use "staged" for staged changes, "unstaged" for working tree changes.',
			),
		paths: tool.schema
			.array(tool.schema.string())
			.optional()
			.describe('Optional file paths to restrict diff scope.'),
	},
	async execute(
		args: { base?: string; paths?: string[] },
		_context: ToolContext,
	): Promise<string> {
		try {
			const base = args.base ?? 'HEAD';
			const pathSpec = args.paths?.length ? '-- ' + args.paths.join(' ') : '';

			const baseValidationError = validateBase(base);
			if (baseValidationError) {
				const errorResult: DiffErrorResult = {
					error: `invalid base: ${baseValidationError}`,
					files: [],
					contractChanges: [],
					hasContractChanges: false,
				};
				return JSON.stringify(errorResult, null, 2);
			}

			const pathsValidationError = validatePaths(args.paths);
			if (pathsValidationError) {
				const errorResult: DiffErrorResult = {
					error: `invalid paths: ${pathsValidationError}`,
					files: [],
					contractChanges: [],
					hasContractChanges: false,
				};
				return JSON.stringify(errorResult, null, 2);
			}

			let gitCmd: string;
			if (base === 'staged') {
				gitCmd = 'git --no-pager diff --cached';
			} else if (base === 'unstaged') {
				gitCmd = 'git --no-pager diff';
			} else {
				gitCmd = `git --no-pager diff ${base}`;
			}

			const numstatOutput = execSync(gitCmd + ' --numstat ' + pathSpec, {
				encoding: 'utf-8',
				timeout: DIFF_TIMEOUT_MS,
			});

			const fullDiffOutput = execSync(gitCmd + ' -U3 ' + pathSpec, {
				encoding: 'utf-8',
				timeout: DIFF_TIMEOUT_MS,
				maxBuffer: MAX_BUFFER_BYTES,
			});

			const files: Array<{
				path: string;
				additions: number;
				deletions: number;
			}> = [];
			const numstatLines = numstatOutput.split('\n');
			for (const line of numstatLines) {
				if (!line.trim()) continue;
				const parts = line.split('\t');
				if (parts.length >= 3) {
					const additions = parseInt(parts[0]) || 0;
					const deletions = parseInt(parts[1]) || 0;
					const path = parts[2];
					files.push({ path, additions, deletions });
				}
			}

			const contractChanges: string[] = [];
			const diffLines = fullDiffOutput.split('\n');
			let currentFile = '';

			for (const line of diffLines) {
				const gitLineMatch = line.match(/^diff --git.* b\/(.+)$/);
				if (gitLineMatch) {
					currentFile = gitLineMatch[1];
				}

				for (const pattern of CONTRACT_PATTERNS) {
					if (pattern.test(line)) {
						const trimmed = line.trim();
						if (currentFile) {
							contractChanges.push(`[${currentFile}] ${trimmed}`);
						} else {
							contractChanges.push(trimmed);
						}
						break;
					}
				}
			}

			const hasContractChanges = contractChanges.length > 0;
			const fileCount = files.length;

			const truncated = diffLines.length > MAX_DIFF_LINES;

			const summary = truncated
				? `${fileCount} files changed. Contract changes: ${hasContractChanges ? 'YES' : 'NO'}. (truncated to ${MAX_DIFF_LINES} lines)`
				: `${fileCount} files changed. Contract changes: ${hasContractChanges ? 'YES' : 'NO'}`;

			const result: DiffResult = {
				files,
				contractChanges,
				hasContractChanges,
				summary,
			};

			return JSON.stringify(result, null, 2);
		} catch (e) {
			const errorResult: DiffErrorResult = {
				error:
					e instanceof Error
						? `git diff failed: ${e.constructor.name}`
						: 'git diff failed: unknown error',
				files: [],
				contractChanges: [],
				hasContractChanges: false,
			};
			return JSON.stringify(errorResult, null, 2);
		}
	},
});
