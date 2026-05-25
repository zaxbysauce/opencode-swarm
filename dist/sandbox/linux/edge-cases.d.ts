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
/**
 * Check whether a path is a symlink and resolves to a location outside
 * any of the configured scope paths.
 *
 * @param path        - The path to check (may be a symlink)
 * @param scopePaths  - Array of absolute scope paths
 * @returns true if the path is a symlink that escapes the sandbox
 */
export declare function detectSymlinkEscape(path: string, scopePaths: string[]): boolean;
/**
 * Check whether a path is under /proc/self/fd/, which provides
 * file descriptor access that can bypass normal path checks.
 *
 * @param path - The path to check
 * @returns true if the path is under /proc/self/fd/
 */
export declare function detectProcFdAccess(path: string): boolean;
/**
 * Detect whether io_uring is active on the system, which can be used
 * to perform I/O operations that bypass the seccomp filter.
 *
 * Note: This is a detection function only — it does not prevent io_uring usage.
 * Bubblewrap's --unshare-all combined with seccomp filtering can mitigate this.
 *
 * @returns true if io_uring appears to be active
 */
export declare function detectIoUringBypass(): boolean;
/**
 * Detect whether the current process is already running inside a user namespace.
 *
 * When a process is already inside a user namespace (rather than the initial
 * namespace), it may have different privileges and isolation properties than
 * expected. This can affect the security assumptions of a bubblewrap sandbox.
 *
 * @returns true if the current process is already inside a non-initial user namespace
 */
export declare function detectNamespaceEscape(): boolean;
/**
 * Check whether a path operation would create a hard link that escapes
 * the sandbox scope.
 *
 * Hard links can allow a file inside the sandbox to be linked to a location
 * outside the sandbox, potentially bypassing containment.
 *
 * @param path        - The path being linked to
 * @param scopePaths  - Array of absolute scope paths
 * @returns true if creating a hard link at path would escape the sandbox
 */
export declare function detectHardLinkEscape(path: string, scopePaths: string[]): boolean;
/**
 * Alias for detectHardLinkEscape for API compatibility.
 * @param path        - The path being linked to
 * @param scopePaths  - Array of absolute scope paths
 * @returns true if creating a hard link at path would escape the sandbox
 */
export declare function detectHardLinkCreation(path: string, scopePaths: string[]): boolean;
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
export declare function detectRenameAcrossBoundary(oldPath: string, newPath: string, scopePaths: string[]): boolean;
/**
 * Check whether a path pattern suggests mmap interception attempts.
 *
 * mmap can be used to map device files or anonymous memory that bypasses
 * normal file-based access controls.
 *
 * @param path - The path being accessed
 * @returns true if the path suggests mmap interception
 */
export declare function detectMmapInterception(path: string): boolean;
