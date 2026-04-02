/** Project Identity Management for opencode-swarm.
 * Handles creation and retrieval of project identity files.
 */

import * as child_process from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { getPlatformConfigDir } from '../hooks/knowledge-store.js';

// ============================================================================
// Types
// ============================================================================

export interface ProjectIdentity {
	projectHash: string;
	projectName: string;
	repoUrl?: string;
	absolutePath: string;
	createdAt: string;
	swarmVersion: string;
}

// ============================================================================
// Path Resolution
// ============================================================================

/**
 * Get identity file path for a project hash.
 * Path: {platform-config-dir}/projects/{projectHash}/identity.json
 */
export function resolveIdentityPath(projectHash: string): string {
	const platformDir = getPlatformConfigDir();
	return path.join(platformDir, 'projects', projectHash, 'identity.json');
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Derive a deterministic project hash from a directory.
 * Uses git remote URL if available, otherwise falls back to absolute path.
 */
function _deriveProjectHash(directory: string): string {
	const absolutePath = path.resolve(directory);
	let hashInput: string;

	try {
		// Try to get git remote URL
		const remoteUrl = child_process
			.execSync('git remote get-url origin', {
				cwd: directory,
				encoding: 'utf-8',
				stdio: ['pipe', 'pipe', 'ignore'],
			})
			.trim();
		hashInput = remoteUrl.length > 0 ? remoteUrl : absolutePath;
	} catch {
		// No git remote, fall back to absolute path
		hashInput = absolutePath;
	}

	const hash = createHash('sha256').update(hashInput).digest('hex');
	return hash.slice(0, 12);
}

/**
 * Get the swarm version from package.json
 */
async function getSwarmVersion(directory?: string): Promise<string> {
	if (!directory) {
		throw new Error(
			'[identity] No directory provided — ctx.directory is required',
		);
	}
	const baseDir = directory;
	try {
		// Find package.json in the opencode-swarm package
		const packageJsonPath = path.join(
			baseDir,
			'node_modules',
			'opencode-swarm',
			'package.json',
		);

		// Try package.json in node_modules first
		if (existsSync(packageJsonPath)) {
			const content = await readFile(packageJsonPath, 'utf-8');
			const pkg = JSON.parse(content);
			return pkg.version || 'unknown';
		}

		// Fall back to local package.json
		const localPackageJsonPath = path.join(baseDir, 'package.json');
		if (existsSync(localPackageJsonPath)) {
			const content = await readFile(localPackageJsonPath, 'utf-8');
			const pkg = JSON.parse(content);
			return pkg.version || 'unknown';
		}

		return 'unknown';
	} catch {
		return 'unknown';
	}
}

/**
 * Get git remote URL for a directory
 */
function getGitRemoteUrl(directory: string): string | undefined {
	try {
		const remoteUrl = child_process
			.execSync('git remote get-url origin', {
				cwd: directory,
				encoding: 'utf-8',
				stdio: ['pipe', 'pipe', 'ignore'],
			})
			.trim();
		return remoteUrl;
	} catch {
		return undefined;
	}
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Read existing identity.json or return null if it doesn't exist.
 */
export async function readProjectIdentity(
	projectHash: string,
): Promise<ProjectIdentity | null> {
	const identityPath = resolveIdentityPath(projectHash);

	if (!existsSync(identityPath)) {
		return null;
	}

	try {
		const content = await readFile(identityPath, 'utf-8');
		const identity = JSON.parse(content) as ProjectIdentity;
		return identity;
	} catch {
		// If file is corrupted or invalid JSON, return null
		return null;
	}
}

/**
 * Create or update identity.json for a project.
 * Uses atomic write pattern (write to temp file, then rename).
 */
export async function writeProjectIdentity(
	directory: string,
	projectHash: string,
	projectName: string,
): Promise<ProjectIdentity> {
	const identityPath = resolveIdentityPath(projectHash);
	const identityDir = path.dirname(identityPath);

	// Ensure directory exists
	await mkdir(identityDir, { recursive: true });

	// Get repository URL (optional)
	const repoUrl = getGitRemoteUrl(directory);

	// Get absolute path
	const absolutePath = path.resolve(directory);

	// Get current timestamp
	const createdAt = new Date().toISOString();

	// Get swarm version
	const swarmVersion = await getSwarmVersion(directory);

	const identity: ProjectIdentity = {
		projectHash,
		projectName,
		repoUrl,
		absolutePath,
		createdAt,
		swarmVersion,
	};

	// Atomic write: write to temp file first, then rename
	const tempPath = `${identityPath}.tmp.${Date.now()}.${process.pid}`;
	await writeFile(tempPath, JSON.stringify(identity, null, 2), 'utf-8');

	// Rename temp file to actual path (atomic on most filesystems)
	await rename(tempPath, identityPath);

	return identity;
}
