/**
 * Declare scope tool for setting the file scope for coder delegations.
 * Implements FR-010: Declare coder scope before delegation.
 * This tool must be called before delegating to coder to enable scope containment checking.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// Note: import from state is removed as it depends on SDK - will be handled in opencode package

/**
 * Arguments for the declare_scope tool
 */
export interface DeclareScopeArgs {
	taskId: string;
	files: string[];
	whitelist?: string[];
	working_directory?: string;
}

/**
 * Result from executing declare_scope
 */
export interface DeclareScopeResult {
	success: boolean;
	message: string;
	taskId?: string;
	fileCount?: number;
	errors?: string[];
}

/**
 * Validate that taskId matches the required format (N.M or N.M.P).
 * @param taskId - The task ID to validate
 * @returns Error message if invalid, undefined if valid
 */
export function validateTaskIdFormat(taskId: string): string | undefined {
	const taskIdPattern = /^\d+\.\d+(\.\d+)*$/;
	if (!taskIdPattern.test(taskId)) {
		return `Invalid taskId "${taskId}". Must match pattern N.M or N.M.P (e.g., "1.1", "1.2.3")`;
	}
	return undefined;
}

/**
 * Validate file entries for security concerns.
 * @param files - Array of file paths to validate
 * @returns Array of error messages, empty if all valid
 */
export function validateFiles(files: string[]): string[] {
	const errors: string[] = [];

	for (const file of files) {
		// Check for null bytes
		if (file.includes('\0')) {
			errors.push(`Invalid file "${file}": null bytes are not allowed`);
		}

		// Check for path traversal
		if (file.includes('..')) {
			errors.push(
				`Invalid file "${file}": path traversal sequences (..) are not allowed`,
			);
		}

		// Check for length limit
		if (file.length > 4096) {
			errors.push(
				`Invalid file "${file}": path exceeds maximum length of 4096 characters`,
			);
		}
	}

	return errors;
}

/**
 * Execute the declare_scope tool.
 * Validates the taskId and files, then sets the declared scope.
 * @param args - The declare scope arguments
 * @param fallbackDir - Fallback directory for plan lookup
 * @returns DeclareScopeResult with success status and details
 */
export async function executeDeclareScope(
	args: DeclareScopeArgs,
	fallbackDir?: string,
): Promise<DeclareScopeResult> {
	// Step 1: Validate taskId format
	const taskIdError = validateTaskIdFormat(args.taskId);
	if (taskIdError) {
		return {
			success: false,
			message: 'Validation failed',
			errors: [taskIdError],
		};
	}

	// Step 2: Validate files array
	if (!Array.isArray(args.files) || args.files.length === 0) {
		return {
			success: false,
			message: 'Validation failed',
			errors: ['files must be a non-empty array'],
		};
	}

	// Validate each file entry
	const fileErrors = validateFiles(args.files);
	if (fileErrors.length > 0) {
		return {
			success: false,
			message: 'Validation failed',
			errors: fileErrors,
		};
	}

	// Validate whitelist entries if provided
	if (args.whitelist) {
		const whitelistErrors = validateFiles(args.whitelist);
		if (whitelistErrors.length > 0) {
			return {
				success: false,
				message: 'Validation failed',
				errors: whitelistErrors,
			};
		}
	}

	// Step 3: Validate working_directory if provided
	let normalizedDir: string | undefined;
	if (args.working_directory != null) {
		// Check for null-byte injection before any processing
		if (args.working_directory.includes('\0')) {
			return {
				success: false,
				message: 'Invalid working_directory: null bytes are not allowed',
				errors: ['Invalid working_directory: null bytes are not allowed'],
			};
		}

		// Check for Windows device paths (e.g., \\.\C:\, \\?\GLOBALROOT\)
		// Applied on all platforms for defense-in-depth (paths may originate from Windows clients)
		{
			const devicePathPattern =
				/^\\\\|^(NUL|CON|AUX|COM[1-9]|LPT[1-9])(\..*)?$/i;
			if (devicePathPattern.test(args.working_directory)) {
				return {
					success: false,
					message:
						'Invalid working_directory: Windows device paths are not allowed',
					errors: [
						'Invalid working_directory: Windows device paths are not allowed',
					],
				};
			}
		}

		// Normalize path first
		normalizedDir = path.normalize(args.working_directory);

		// Check for path traversal sequences
		const pathParts = normalizedDir.split(path.sep);
		if (pathParts.includes('..')) {
			return {
				success: false,
				message:
					'Invalid working_directory: path traversal sequences (..) are not allowed',
				errors: [
					'Invalid working_directory: path traversal sequences (..) are not allowed',
				],
			};
		}

		// Check if directory exists on disk and contains a valid .swarm/plan.json
		const resolvedDir = path.resolve(normalizedDir);
		try {
			const realPath = fs.realpathSync(resolvedDir);
			const planPath = path.join(realPath, '.swarm', 'plan.json');
			if (!fs.existsSync(planPath)) {
				return {
					success: false,
					message: `Invalid working_directory: plan not found in "${realPath}"`,
					errors: [
						`Invalid working_directory: plan not found in "${realPath}"`,
					],
				};
			}
		} catch {
			return {
				success: false,
				message: `Invalid working_directory: path "${resolvedDir}" does not exist or is inaccessible`,
				errors: [
					`Invalid working_directory: path "${resolvedDir}" does not exist or is inaccessible`,
				],
			};
		}
	}

	// Step 4: Resolve target directory
	const directory = normalizedDir ?? fallbackDir ?? process.cwd();

	// Step 5: Check that taskId exists in plan.json
	const planPath = path.resolve(directory, '.swarm', 'plan.json');
	if (!fs.existsSync(planPath)) {
		return {
			success: false,
			message: 'No plan found',
			errors: ['plan.json not found'],
		};
	}

	let planContent: { phases?: { tasks?: { id: string }[] }[] };
	try {
		planContent = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
	} catch {
		return {
			success: false,
			message: 'Failed to parse plan.json',
			errors: ['plan.json is not valid JSON'],
		};
	}

	const allTasks =
		planContent.phases?.flatMap(
			(p: { tasks?: { id: string }[] }) => p.tasks ?? [],
		) ?? [];
	const taskExists = allTasks.some((t: { id: string }) => t.id === args.taskId);

	if (!taskExists) {
		return {
			success: false,
			message: `Task ${args.taskId} not found in plan`,
			errors: [`Task ${args.taskId} does not exist in plan.json`],
		};
	}

	// Note: The state check for task completion status is removed
	// as it depends on the SDK state - handled in opencode package

	// Step 7: Merge files and whitelist (if provided)
	const mergedFiles = [...args.files, ...(args.whitelist ?? [])];

	// Note: Setting declaredCoderScope on sessions is removed
	// as it depends on the SDK state - handled in opencode package

	return {
		success: true,
		message: 'Scope declared successfully',
		taskId: args.taskId,
		fileCount: mergedFiles.length,
	};
}
