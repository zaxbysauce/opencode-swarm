/**
 * Shared utility for resolving working_directory across swarm tools.
 *
 * Tools that read .swarm/ state (plan.json, evidence/) must resolve paths
 * relative to the actual project root, not process.cwd(). When the MCP host's
 * CWD differs from the project root (e.g. CWD=RAGAPPv2, project=RAGAPPv3),
 * tools that lack a working_directory parameter silently read stale data from
 * the wrong directory.
 *
 * This helper provides consistent validation and resolution, matching the
 * pattern already used by save_plan and update_task_status.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ResolveResult {
	success: true;
	directory: string;
}

export interface ResolveError {
	success: false;
	message: string;
}

/**
 * Resolve the effective working directory for a swarm tool.
 *
 * Priority: explicit working_directory param > injected directory (from createSwarmTool).
 *
 * When working_directory is provided, it is validated for:
 * - Null-byte injection
 * - Path traversal sequences (..)
 * - Windows device paths
 * - Existence on disk
 *
 * @param workingDirectory - Explicit working_directory from tool args (caller-controlled)
 * @param fallbackDirectory - Injected directory from createSwarmTool (ctx.directory ?? process.cwd())
 */
export function resolveWorkingDirectory(
	workingDirectory: string | undefined | null,
	fallbackDirectory: string,
): ResolveResult | ResolveError {
	if (workingDirectory == null || workingDirectory === '') {
		// No explicit override — use the injected directory from createSwarmTool
		return { success: true, directory: fallbackDirectory };
	}

	// Null-byte injection check
	if (workingDirectory.includes('\0')) {
		return {
			success: false,
			message: 'Invalid working_directory: null bytes are not allowed',
		};
	}

	// Windows device path check
	if (process.platform === 'win32') {
		const devicePathPattern = /^\\\\|^(NUL|CON|AUX|COM[1-9]|LPT[1-9])(\..*)?$/i;
		if (devicePathPattern.test(workingDirectory)) {
			return {
				success: false,
				message:
					'Invalid working_directory: Windows device paths are not allowed',
			};
		}
	}

	// Normalize and check for traversal
	const normalizedDir = path.normalize(workingDirectory);
	const pathParts = normalizedDir.split(path.sep);
	if (pathParts.includes('..')) {
		return {
			success: false,
			message:
				'Invalid working_directory: path traversal sequences (..) are not allowed',
		};
	}

	// Resolve and verify existence
	const resolvedDir = path.resolve(normalizedDir);
	try {
		const realPath = fs.realpathSync(resolvedDir);
		return { success: true, directory: realPath };
	} catch {
		return {
			success: false,
			message: `Invalid working_directory: path "${resolvedDir}" does not exist or is inaccessible`,
		};
	}
}
