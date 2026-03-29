import * as child_process from 'node:child_process';
import { type ToolContext, tool } from '@opencode-ai/plugin';
import { type ASTDiffResult, computeASTDiff } from '../diff/ast-diff.js';
import { createSwarmTool } from './create-tool';

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
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally matches ASCII control characters for input sanitization
const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/;

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
		if (path.startsWith('-')) {
			return 'path cannot start with "-" (option-like arguments not allowed)';
		}
		if (CONTROL_CHAR_PATTERN.test(path)) {
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
	astDiffs?: ASTDiffResult[];
}

export interface DiffErrorResult {
	error: string;
	files: [];
	contractChanges: [];
	hasContractChanges: false;
}

export const diff: ReturnType<typeof createSwarmTool> = createSwarmTool({
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
		args: unknown,
		directory: string,
		_ctx?: ToolContext,
	): Promise<string> {
		const typedArgs = args as { base?: string; paths?: string[] };
		try {
			if (
				!directory ||
				typeof directory !== 'string' ||
				directory.trim() === ''
			) {
				const errorResult: DiffErrorResult = {
					error: 'project directory is required but was not provided',
					files: [],
					contractChanges: [],
					hasContractChanges: false,
				};
				return JSON.stringify(errorResult, null, 2);
			}
			const base = typedArgs.base ?? 'HEAD';

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

			const pathsValidationError = validatePaths(typedArgs.paths);
			if (pathsValidationError) {
				const errorResult: DiffErrorResult = {
					error: `invalid paths: ${pathsValidationError}`,
					files: [],
					contractChanges: [],
					hasContractChanges: false,
				};
				return JSON.stringify(errorResult, null, 2);
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

			if (typedArgs.paths?.length) {
				numstatArgs.push('--', ...typedArgs.paths);
				fullDiffArgs.push('--', ...typedArgs.paths);
			}

			const numstatOutput = child_process.execFileSync('git', numstatArgs, {
				encoding: 'utf-8',
				timeout: DIFF_TIMEOUT_MS,
				maxBuffer: MAX_BUFFER_BYTES,
				cwd: directory,
			});

			const fullDiffOutput = child_process.execFileSync('git', fullDiffArgs, {
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

			// Try AST diff for richer structural analysis on each changed file
			const astDiffs: ASTDiffResult[] = [];
			for (const file of files) {
				try {
					// Get old content from base ref and new content from working tree
					let oldContent: string;
					let newContent: string;
					if (base === 'staged') {
						oldContent = child_process.execFileSync(
							'git',
							['show', `HEAD:${file.path}`],
							{
								encoding: 'utf-8',
								timeout: 5000,
								cwd: directory,
							},
						);
						newContent = child_process.execFileSync(
							'git',
							['show', `:${file.path}`],
							{
								encoding: 'utf-8',
								timeout: 5000,
								cwd: directory,
							},
						);
					} else if (base === 'unstaged') {
						oldContent = child_process.execFileSync(
							'git',
							['show', `:${file.path}`],
							{
								encoding: 'utf-8',
								timeout: 5000,
								cwd: directory,
							},
						);
						newContent = child_process.execFileSync(
							'git',
							['show', `HEAD:${file.path}`],
							{
								encoding: 'utf-8',
								timeout: 5000,
								cwd: directory,
							},
						);
						// For unstaged: old = index, new = working tree (read from disk)
						const fsModule = await import('node:fs');
						const pathModule = await import('node:path');
						newContent = fsModule.readFileSync(
							pathModule.join(directory, file.path),
							'utf-8',
						);
					} else {
						oldContent = child_process.execFileSync(
							'git',
							['show', `${base}:${file.path}`],
							{
								encoding: 'utf-8',
								timeout: 5000,
								cwd: directory,
							},
						);
						newContent = child_process.execFileSync(
							'git',
							['show', `HEAD:${file.path}`],
							{
								encoding: 'utf-8',
								timeout: 5000,
								cwd: directory,
							},
						);
					}
					const astResult = await computeASTDiff(
						file.path,
						oldContent,
						newContent,
					);
					if (astResult && astResult.changes.length > 0) {
						astDiffs.push(astResult);
					}
				} catch {
					// AST diff not available for this file — git diff is sufficient
				}
			}

			const truncated = diffLines.length > MAX_DIFF_LINES;

			const summary = truncated
				? `${fileCount} files changed. Contract changes: ${hasContractChanges ? 'YES' : 'NO'}. (truncated to ${MAX_DIFF_LINES} lines)`
				: `${fileCount} files changed. Contract changes: ${hasContractChanges ? 'YES' : 'NO'}`;

			const result: DiffResult = {
				files,
				contractChanges,
				hasContractChanges,
				summary,
				...(astDiffs.length > 0 ? { astDiffs } : {}),
			};

			return JSON.stringify(result, null, 2);
		} catch (e) {
			const errorResult: DiffErrorResult = {
				error:
					e instanceof Error
						? `git diff failed: ${e.message}`
						: 'git diff failed: unknown error',
				files: [],
				contractChanges: [],
				hasContractChanges: false,
			};
			return JSON.stringify(errorResult, null, 2);
		}
	},
});
