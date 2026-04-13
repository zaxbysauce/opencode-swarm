/**
 * Centralized task ID validation (#452 item 2).
 *
 * Two strictness levels exist by design:
 *
 * - **Strict** (`isStrictTaskId`): Only numeric N.M or N.M.P format.
 *   Use for gate-evidence operations where task IDs map to plan phases/tasks.
 *
 * - **Broad** (`isValidTaskId` / `sanitizeTaskId`): Accepts numeric, retrospective
 *   (retro-N), internal tool IDs (sast_scan, etc.), and general alphanumeric.
 *   Use for evidence storage, trajectory logging, and other paths that handle
 *   non-plan task IDs.
 *
 * Both levels reject path traversal, null bytes, control characters, and
 * other unsafe patterns.
 */
/**
 * Strict validation: only numeric N.M or N.M.P format.
 * Use for gate-evidence operations where task IDs correspond to plan phases/tasks.
 */
export declare function isStrictTaskId(taskId: string): boolean;
/**
 * Broad validation: accepts numeric, retrospective, internal tool, and
 * general alphanumeric task IDs.
 * Use for evidence storage, trajectory logging, and non-plan task ID paths.
 */
export declare function isValidTaskId(taskId: string): boolean;
/**
 * Throws if the task ID fails strict validation.
 * Use as a guard at the top of functions that build file paths from task IDs.
 */
export declare function assertStrictTaskId(taskId: string): void;
/**
 * Validates and returns the task ID (broad validation).
 * Throws with a descriptive message if the ID is invalid.
 * Replaces evidence/manager.ts sanitizeTaskId for new callers.
 */
export declare function sanitizeTaskId(taskId: string): string;
/**
 * Validation for tool input: returns error message string if invalid, undefined if valid.
 * Strict numeric format only (for update-task-status, declare-scope, etc.).
 */
export declare function validateTaskIdFormat(taskId: string): string | undefined;
