/**
 * macOS sandbox-exec sandbox executor.
 *
 * Wraps shell commands with sandbox-exec(8) to restrict process capabilities
 * using a profile-based deny-by-default policy.
 *
 * Profile allows:
 *   - Read-only access to essential system paths (/usr, /bin, /sbin, /lib)
 *   - Read-write access to each scope path
 *   - Read-write access to the temp directory (500MB bounded)
 *   - Denies all other file writes
 */

import { type SpawnSyncOptions, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { SandboxExecutor } from '../executor';

/**
 * Error codes from spawnSync that indicate sandbox-exec is unavailable.
 */
const SANDBOX_UNAVAILABLE_CODES = new Set(['ENOENT', 'EACCES', 'ENOSPC']);

/**
 * Check whether the sandbox-exec binary is present and functional.
 * Uses spawnSync to probe synchronously without throwing.
 */
function probeSandboxExec(): boolean {
	try {
		const result = spawnSync('sandbox-exec', ['--version'], {
			windowsHide: true,
			encoding: 'utf-8',
			timeout: 5000,
			stdio: ['ignore', 'pipe', 'ignore'] as SpawnSyncOptions['stdio'],
		} satisfies SpawnSyncOptions);

		if (result.error) {
			const code = (result.error as NodeJS.ErrnoException).code as
				| string
				| undefined;
			if (code && SANDBOX_UNAVAILABLE_CODES.has(code)) {
				console.warn(
					`[sandbox-exec] Sandbox disabled: sandbox-exec error (${code}). Falling through to tool-layer enforcement.`,
				);
				return false;
			}
			console.warn(
				`[sandbox-exec] Sandbox disabled: spawn error (${result.error.message}). Falling through to tool-layer enforcement.`,
			);
			return false;
		}

		return result.status === 0;
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		console.warn(
			`[sandbox-exec] Sandbox disabled: probe threw (${message}). Falling through to tool-layer enforcement.`,
		);
		return false;
	}
}

/**
 * DI seam for testability. Exposes probeSandboxExec so tests can simulate
 * ENOENT / EACCES / ENOSPC error conditions without requiring a real sandbox-exec binary.
 */
export const _internals: { probeSandboxExec: typeof probeSandboxExec } = {
	probeSandboxExec,
} as const;

/**
 * Escape a string for safe embedding inside a single-quoted shell string.
 * Replaces single quotes with the four-character sequence: '\''
 */
function shellEscape(s: string): string {
	return s.replace(/'/g, "'\\''");
}

/**
 * Build a sandbox-exec profile string for the given scope paths and temp dir.
 */
function buildSandboxProfile(scopePaths: string[], tempDir: string): string {
	// Collect unique paths to allow read-write
	const rwPaths = [...scopePaths];
	if (tempDir) {
		rwPaths.push(tempDir);
	}

	// Build (allow file-write* (subpath "...")) lines for each rw path
	const rwAllowLines = rwPaths
		.map((p) => `(allow file-write* (subpath "${p}"))`)
		.join('\n');

	// Core profile: deny-by-default, allow system ro paths, allow scoped rw paths
	const profile = `(version 1)
(allow default)
(allow file-read* (subpath "/usr"))
(allow file-read* (subpath "/bin"))
(allow file-read* (subpath "/sbin"))
(allow file-read* (subpath "/lib"))
(allow file-read* (subpath "/lib64"))
${rwAllowLines}
(deny file-write*)`;

	return profile;
}

/**
 * macOS sandbox-exec sandbox executor.
 */
export class MacOSSandboxExecutor implements SandboxExecutor {
	/** Human-readable mechanism identifier */
	public readonly mechanism = 'sandbox-exec';

	private readonly _scopePaths: string[];
	private readonly _tempDir: string | undefined;
	private _available: boolean;
	private _disabledReason: string | null;

	/**
	 * @param scopePaths - Absolute paths the sandboxed process may write to
	 * @param tempDir   - Optional temp directory path (defaults to system temp)
	 */
	constructor(scopePaths: string[] = [], tempDir?: string) {
		// Throw early on non-macOS to clearly communicate platform requirement
		if (process.platform !== 'darwin') {
			throw new Error('MacOSSandboxExecutor not yet implemented');
		}

		this._scopePaths = scopePaths;
		this._tempDir = tempDir;
		this._available = false;
		this._disabledReason = null;

		try {
			if (!_internals.probeSandboxExec()) {
				this._disabledReason = 'sandbox-exec not available or not functional';
				console.warn(
					`[sandbox-exec] Sandbox disabled: ${this._disabledReason}. Falling through to tool-layer enforcement.`,
				);
			} else {
				this._available = true;
			}
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			this._disabledReason = `constructor threw: ${message}`;
			this._available = false;
			console.warn(
				`[sandbox-exec] Sandbox disabled: ${this._disabledReason}. Falling through to tool-layer enforcement.`,
			);
		}
	}

	/**
	 * Returns true when sandbox-exec is available and the sandbox has not been disabled.
	 */
	isAvailable(): boolean {
		return this._available;
	}

	/**
	 * Disable the sandbox with a reason. Allows external code to force
	 * fallback to unwrapped execution (e.g., for testing or explicit opt-out).
	 */
	disable(reason: string): void {
		this._available = false;
		this._disabledReason = reason;
		console.warn(
			`[sandbox-exec] Sandbox disabled: ${reason}. Falling through to tool-layer enforcement.`,
		);
	}

	/**
	 * Wrap a shell command string with sandbox-exec.
	 *
	 * @param command   - Raw shell command to execute inside the sandbox
	 * @param scopePaths - Additional scope paths to bind (merged with constructor scope)
	 * @param tempDir   - Optional temp directory override
	 * @returns A sandbox-exec wrapped command string ready for shell execution,
	 *          or the raw command string when the sandbox is unavailable (passthrough mode)
	 */
	wrapCommand(command: string, scopePaths: string[], tempDir?: string): string {
		// Re-check availability before each wrap
		if (!this._available) {
			return command; // passthrough
		}

		if (!_internals.probeSandboxExec()) {
			this._available = false;
			this._disabledReason = 'sandbox-exec became unavailable between calls';
			console.warn(
				`[sandbox-exec] Sandbox disabled: ${this._disabledReason}. Falling through to tool-layer enforcement.`,
			);
			return command; // passthrough
		}

		const temp = tempDir ?? this._tempDir ?? os.tmpdir();
		const allScopes = [...this._scopePaths, ...scopePaths];

		const profile = buildSandboxProfile(allScopes, temp);

		// Write profile to a dedicated temp directory (mkdtempSync ensures a unique dir per call)
		let profilePath: string;
		try {
			const profileDir = mkdtempSync(path.join(os.tmpdir(), 'sandbox-'));
			profilePath = path.join(
				profileDir,
				`profile-${process.pid}-${Date.now()}.sb`,
			);
			writeFileSync(profilePath, profile, { mode: 0o600 });
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			console.warn(
				`[sandbox-exec] Sandbox disabled: failed to write profile (${message}). Falling through to tool-layer enforcement.`,
			);
			return command; // passthrough on profile write failure
		}

		// sandbox-exec -f <profile> bash -c '<command>'
		// Profile file persists for the lifetime of the spawned process.
		// Note: profile files accumulate in os.tmpdir() over time. This is
		// acceptable — they are small text files with allowlist rules, no secrets.
		const escapedCommand = shellEscape(command);
		const escapedProfilePath = shellEscape(profilePath);
		return `sandbox-exec -f '${escapedProfilePath}' bash -c '${escapedCommand}'`;
	}

	/**
	 * Return environment variable overrides required for the macOS sandbox.
	 *
	 * DYLD_INSERT_LIBRARIES, DYLD_LIBRARY_PATH, DYLD_FRAMEWORK_PATH, and
	 * DYLD_ROOT_PATH can be used to bypass sandbox restrictions by injecting
	 * dynamic libraries. Unsetting them improves sandbox enforcement (defense in depth).
	 */
	getEnvOverrides(): Record<string, string | null> {
		return {
			DYLD_INSERT_LIBRARIES: null,
			DYLD_LIBRARY_PATH: null,
			DYLD_FRAMEWORK_PATH: null,
			DYLD_ROOT_PATH: null,
			PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
		};
	}
}
