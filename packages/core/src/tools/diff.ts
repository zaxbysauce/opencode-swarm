import { execFileSync } from 'node:child_process';

const MAX_DIFF_LINES = 500;
const DIFF_TIMEOUT_MS = 30_000;
const MAX_BUFFER_BYTES = 5 * 1024 * 1024;

const CONTRACT_PATTERNS = [
	/^[+-]\s*export\s+(function|const|class|interface|type|default)\b/,
	/^[+-]\s*(interface|type)\s+\w+/,
	/^[+-]\s*public\s+/,
	/^[+-]\s*(async\s+)?function\s+\w+\s*\(/,
];

const SAFE_REF_PATTERN = /^[a-zA-Z0-9._\-/~^@{}]+$/;
const MAX_REF_LENGTH = 256;
const MAX_PATH_LENGTH = 500;
const SHELL_METACHARACTERS = /[;|&$`(){}<>!'"]/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally matches ASCII control characters for input sanitization
const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/;

export function validateBase(base: string): string | null {
	if (base.length > MAX_REF_LENGTH) {
		return `base ref exceeds maximum length of ${MAX_REF_LENGTH}`;
	}
	if (!SAFE_REF_PATTERN.test(base)) {
		return 'base contains invalid characters for git ref';
	}
	return null;
}

export function validatePaths(paths: string[] | undefined): string | null {
	if (!paths) return null;
	for (const p of paths) {
		if (!p || p.length === 0) {
			return 'empty path not allowed';
		}
		if (p.length > MAX_PATH_LENGTH) {
			return `path exceeds maximum length of ${MAX_PATH_LENGTH}`;
		}
		if (SHELL_METACHARACTERS.test(p)) {
			return 'path contains shell metacharacters';
		}
		if (p.startsWith('-')) {
			return 'path cannot start with "-" (option-like arguments not allowed)';
		}
		if (CONTROL_CHAR_PATTERN.test(p)) {
			return 'path contains control characters';
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

/**
 * Run diff analysis
 */
export async function runDiff(
	args: { base?: string; paths?: string[] },
	directory: string,
): Promise<DiffResult | DiffErrorResult> {
	try {
		if (
			!directory ||
			typeof directory !== 'string' ||
			directory.trim() === ''
		) {
			return {
				error: 'project directory is required but was not provided',
				files: [],
				contractChanges: [],
				hasContractChanges: false,
			};
		}
		const base = args.base ?? 'HEAD';

		const baseValidationError = validateBase(base);
		if (baseValidationError) {
			return {
				error: `invalid base: ${baseValidationError}`,
				files: [],
				contractChanges: [],
				hasContractChanges: false,
			};
		}

		const pathsValidationError = validatePaths(args.paths);
		if (pathsValidationError) {
			return {
				error: `invalid paths: ${pathsValidationError}`,
				files: [],
				contractChanges: [],
				hasContractChanges: false,
			};
		}

		let gitArgs: string[];
		if (base === 'staged') {
			gitArgs = ['--no-pager', 'diff', '--cached'];
		} else if (base === 'unstaged') {
			gitArgs = ['--no-pager', 'diff'];
		} else {
			gitArgs = ['--no-pager', 'diff', base];
		}

		const numstatArgs = [...gitArgs, '--numstat'];
		const fullDiffArgs = [...gitArgs, '-U3'];

		if (args.paths?.length) {
			numstatArgs.push('--', ...args.paths);
			fullDiffArgs.push('--', ...args.paths);
		}

		const numstatOutput = execFileSync('git', numstatArgs, {
			encoding: 'utf-8',
			timeout: DIFF_TIMEOUT_MS,
			maxBuffer: MAX_BUFFER_BYTES,
			cwd: directory,
		});

		const fullDiffOutput = execFileSync('git', fullDiffArgs, {
			encoding: 'utf-8',
			timeout: DIFF_TIMEOUT_MS,
			maxBuffer: MAX_BUFFER_BYTES,
			cwd: directory,
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
				const additions = parseInt(parts[0], 10) || 0;
				const deletions = parseInt(parts[1], 10) || 0;
				const filePath = parts[2];
				files.push({ path: filePath, additions, deletions });
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

		return {
			files,
			contractChanges,
			hasContractChanges,
			summary,
		};
	} catch (e) {
		return {
			error:
				e instanceof Error
					? `git diff failed: ${e.message}`
					: 'git diff failed: unknown error',
			files: [],
			contractChanges: [],
			hasContractChanges: false,
		};
	}
}
