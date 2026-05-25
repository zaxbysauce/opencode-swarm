/**
 * Edge case handling utilities for Bubblewrap sandbox.
 *
 * This module provides functions to detect and prevent:
 * - Symlink escape attacks
 * - /proc/self/fd access
 * - io_uring bypass
 * - Namespace escape
 * - Hard-link creation
 * - Rename/move across scope boundary
 * - mmap interception
 */

import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Check whether a path is a symlink and resolves to a location outside
 * any of the configured scope paths.
 *
 * @param path        - The path to check (may be a symlink)
 * @param scopePaths  - Array of absolute scope paths
 * @returns true if the path is a symlink that escapes the sandbox
 */
export function detectSymlinkEscape(
	path: string,
	scopePaths: string[],
): boolean {
	try {
		// Check if the path itself is a symlink
		if (!lstatSync(path).isSymbolicLink()) {
			return false;
		}

		// Resolve the symlink to its real path
		const resolvedPath = realpathSync(path);

		// Check if the resolved path is outside all scope paths
		for (const scopePath of scopePaths) {
			const normalizedScope = resolve(scopePath);
			// resolvedPath must be inside normalizedScope
			if (
				resolvedPath.startsWith(`${normalizedScope}/`) ||
				resolvedPath === normalizedScope
			) {
				return false;
			}
		}

		// If we get here, the symlink points outside all scope paths
		return true;
	} catch {
		// Path doesn't exist or cannot be stat'd — not an escape via existing symlink
		return false;
	}
}

/**
 * Check whether a path is under /proc/self/fd/, which provides
 * file descriptor access that can bypass normal path checks.
 *
 * @param path - The path to check
 * @returns true if the path is under /proc/self/fd/
 */
export function detectProcFdAccess(path: string): boolean {
	const normalizedPath = resolve(path);
	return normalizedPath.startsWith('/proc/self/fd/');
}

/**
 * Detect whether io_uring is active on the system, which can be used
 * to perform I/O operations that bypass the seccomp filter.
 *
 * Note: This is a detection function only — it does not prevent io_uring usage.
 * Bubblewrap's --unshare-all combined with seccomp filtering can mitigate this.
 *
 * @returns true if io_uring appears to be active
 */
export function detectIoUringBypass(): boolean {
	try {
		// Check for io_uring device node
		if (existsSync('/dev/io_uring')) {
			return true;
		}

		// Check for io_uring syscall support via /proc
		const procSysKernelPath = '/proc/sys/kernel/io_uring';
		if (existsSync(procSysKernelPath)) {
			// If the proc file exists, io_uring may be available
			return true;
		}

		return false;
	} catch {
		return false;
	}
}

/**
 * Detect whether the current process is already running inside a user namespace.
 *
 * When a process is already inside a user namespace (rather than the initial
 * namespace), it may have different privileges and isolation properties than
 * expected. This can affect the security assumptions of a bubblewrap sandbox.
 *
 * @returns true if the current process is already inside a non-initial user namespace
 */
export function detectNamespaceEscape(): boolean {
	try {
		// Read the user namespace ID of the current process
		const selfNsPath = '/proc/self/ns/user';
		if (!existsSync(selfNsPath)) {
			// No user namespace support
			return false;
		}

		// Read the user namespace ID of the parent process (bash)
		// If they differ, we are already inside a user namespace
		const parentNsPath = `/proc/${process.ppid.toString()}/ns/user`;
		if (!existsSync(parentNsPath)) {
			// Cannot determine parent namespace — assume safe
			return false;
		}

		// Compare the inode numbers of the namespace symlinks
		// If they differ, the current process is in a different namespace than its parent
		const selfStat = lstatSync(selfNsPath);
		const parentStat = lstatSync(parentNsPath);

		// Inodes identify the namespace; different inodes = different namespaces
		return selfStat.ino !== parentStat.ino;
	} catch {
		return false;
	}
}

/**
 * Check whether a path operation would create a hard link that escapes
 * the sandbox scope.
 *
 * Hard links allow a file to have multiple directory entries, potentially
 * bypassing scope restrictions on where files can be created.
 *
 * @param path       - The target path for the hard link operation
 * @param scopePaths - Array of absolute scope paths
 * @returns true if hard link creation would escape the scope
 */
export function detectHardLinkCreation(
	path: string,
	scopePaths: string[],
): boolean {
	try {
		const normalizedPath = resolve(path);

		// Check if the target path is outside all scope paths
		for (const scopePath of scopePaths) {
			const normalizedScope = resolve(scopePath);
			if (
				normalizedPath.startsWith(`${normalizedScope}/`) ||
				normalizedPath === normalizedScope
			) {
				return false;
			}
		}

		// Path is outside all scopes — hard link would escape
		return true;
	} catch {
		return false;
	}
}

/**
 * Check whether a rename or move operation crosses a scope boundary.
 *
 * Moving a file from inside a scope path to outside violates containment.
 *
 * @param oldPath    - The original path
 * @param newPath    - The destination path after rename/move
 * @param scopePaths - Array of absolute scope paths
 * @returns true if the rename crosses a scope boundary
 */
export function detectRenameAcrossBoundary(
	oldPath: string,
	newPath: string,
	scopePaths: string[],
): boolean {
	const normalizedOld = resolve(oldPath);
	const normalizedNew = resolve(newPath);

	// Check if oldPath is inside a scope
	let oldPathInScope = false;
	for (const scopePath of scopePaths) {
		const normalizedScope = resolve(scopePath);
		if (
			normalizedOld.startsWith(`${normalizedScope}/`) ||
			normalizedOld === normalizedScope
		) {
			oldPathInScope = true;
			break;
		}
	}

	// If old path wasn't in scope, no boundary crossing can occur
	if (!oldPathInScope) {
		return false;
	}

	// Check if newPath is outside all scopes
	for (const scopePath of scopePaths) {
		const normalizedScope = resolve(scopePath);
		if (
			normalizedNew.startsWith(`${normalizedScope}/`) ||
			normalizedNew === normalizedScope
		) {
			// newPath is in scope — no boundary crossing
			return false;
		}
	}

	// oldPath was in scope but newPath is outside — boundary crossing detected
	return true;
}

/**
 * Check whether a path pattern suggests mmap interception attempts.
 *
 * mmap can be used to map device files or anonymous memory that bypasses
 * normal file-based access controls.
 *
 * @param path - The path being accessed
 * @returns true if the path suggests mmap interception
 */
export function detectMmapInterception(path: string): boolean {
	const normalizedPath = resolve(path).toLowerCase();

	// Check for device files that could be mmap'd
	const suspiciousPrefixes = ['/dev/', '/proc/', '/sys/'];
	for (const prefix of suspiciousPrefixes) {
		if (normalizedPath.startsWith(prefix)) {
			return true;
		}
	}

	// Check for specific suspicious device files
	const suspiciousDevices = ['/dev/mem', '/dev/kmem', '/dev/fuse'];

	for (const device of suspiciousDevices) {
		if (normalizedPath === device) {
			return true;
		}
	}

	return false;
}
