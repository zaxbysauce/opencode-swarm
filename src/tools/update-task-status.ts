/**
 * Update task status tool for changing the status of individual tasks in a plan.
 * Allows agents to mark tasks as pending, in_progress, completed, or blocked.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { type ToolDefinition, tool } from '@opencode-ai/plugin/tool';
import type { TaskStatus } from '../config/plan-schema';
import { updateTaskStatus } from '../plan/manager';
import { advanceTaskState, getTaskState, swarmState } from '../state';
import { createSwarmTool } from './create-tool';

/**
 * Arguments for the update_task_status tool
 */
export interface UpdateTaskStatusArgs {
	task_id: string;
	status: string;
	working_directory?: string;
}

/**
 * Result from executing update_task_status
 */
export interface UpdateTaskStatusResult {
	success: boolean;
	message: string;
	task_id?: string;
	new_status?: string;
	current_phase?: number;
	errors?: string[];
}

/**
 * Valid task status values
 */
const VALID_STATUSES: TaskStatus[] = [
	'pending',
	'in_progress',
	'completed',
	'blocked',
];

/**
 * Validate that the status is one of the allowed values.
 * @param status - The status to validate
 * @returns Error message if invalid, undefined if valid
 */
export function validateStatus(status: string): string | undefined {
	if (!VALID_STATUSES.includes(status as TaskStatus)) {
		return `Invalid status "${status}". Must be one of: ${VALID_STATUSES.join(', ')}`;
	}
	return undefined;
}

/**
 * Validate that task_id matches the required format (N.M or N.M.P).
 * @param taskId - The task ID to validate
 * @returns Error message if invalid, undefined if valid
 */
export function validateTaskId(taskId: string): string | undefined {
	const taskIdPattern = /^\d+\.\d+(\.\d+)*$/;
	if (!taskIdPattern.test(taskId)) {
		return `Invalid task_id "${taskId}". Must match pattern N.M or N.M.P (e.g., "1.1", "1.2.3")`;
	}
	return undefined;
}

/**
 * Result from checking reviewer gate presence
 */
export interface ReviewerGateResult {
	blocked: boolean;
	reason: string;
}

/**
 * Check if a task has passed required QA gates using the state machine.
 * Requires the task to be in 'tests_run' or 'complete' state, which means
 * both reviewer delegation and test_engineer runs have been recorded.
 * @param taskId - The task ID to check gate state for
 * @param workingDirectory - Optional working directory for plan.json fallback
 * @returns ReviewerGateResult indicating whether the gate is blocked
 */
export function checkReviewerGate(
	taskId: string,
	workingDirectory?: string,
): ReviewerGateResult {
	try {
		// If no active sessions, allow through (test context)
		if (swarmState.agentSessions.size === 0) {
			return { blocked: false, reason: '' };
		}

		// Check each session for state machine state
		for (const [_sessionId, session] of swarmState.agentSessions) {
			const state = getTaskState(session, taskId);

			// If task has reached tests_run or complete state, allow through
			if (state === 'tests_run' || state === 'complete') {
				return { blocked: false, reason: '' };
			}
		}

		// No session has this task in tests_run or complete state
		// Build a debug summary of current task state across all sessions
		const stateEntries: string[] = [];
		for (const [sessionId, session] of swarmState.agentSessions) {
			const state = getTaskState(session, taskId);
			stateEntries.push(`${sessionId}: ${state}`);
		}

		// Issue #81 regression detection: if all sessions are idle, states weren't persisted.
		// No warning or log emitted — silently continue to plan.json fallback check (lines 121-135)
		const allIdle =
			stateEntries.length > 0 &&
			stateEntries.every((e) => e.endsWith(': idle'));
		if (allIdle) {
			// Detection complete — proceed to fallback logic without any output
		}
		// Bug 3 fix: no session has this task in tests_run or complete state.
		// Check plan.json as fallback — covers session restarts where task was
		// completed in a prior session and plan.json is the source of truth.
		try {
			// Use provided workingDirectory if available, otherwise fall back to process.cwd()
			const resolvedDir = workingDirectory ?? process.cwd();
			const planPath = path.join(resolvedDir, '.swarm', 'plan.json');
			const planRaw = fs.readFileSync(planPath, 'utf-8');
			const plan = JSON.parse(planRaw) as {
				phases: Array<{ tasks: Array<{ id: string; status: string }> }>;
			};
			for (const planPhase of plan.phases ?? []) {
				for (const task of planPhase.tasks ?? []) {
					if (task.id === taskId && task.status === 'completed') {
						return { blocked: false, reason: '' };
					}
				}
			}
		} catch {
			// plan.json missing or unreadable — fall through to blocked:true
		}

		const currentStateStr =
			stateEntries.length > 0 ? stateEntries.join(', ') : 'no active sessions';
		return {
			blocked: true,
			reason: `Task ${taskId} has not passed QA gates. Current state: [${currentStateStr}]. Required state: tests_run or complete. Do not write directly to plan files — use update_task_status after running the reviewer and test_engineer agents.`,
		};
	} catch {
		// If state inspection throws, allow through
		return { blocked: false, reason: '' };
	}
}

/**
 * Execute the update_task_status tool.
 * Validates the task_id and status, then updates the task status in the plan.
 * @param args - The update task status arguments
 * @returns UpdateTaskStatusResult with success status and details
 */
export async function executeUpdateTaskStatus(
	args: UpdateTaskStatusArgs,
	fallbackDir?: string,
): Promise<UpdateTaskStatusResult> {
	// Step 1: Validate status
	const statusError = validateStatus(args.status);
	if (statusError) {
		return {
			success: false,
			message: 'Validation failed',
			errors: [statusError],
		};
	}

	// Step 2: Validate task_id format
	const taskIdError = validateTaskId(args.task_id);
	if (taskIdError) {
		return {
			success: false,
			message: 'Validation failed',
			errors: [taskIdError],
		};
	}

	// Seed the task state machine: when transitioning to in_progress, advance idle → coder_delegated
	// This is required so that delegation-gate.ts can later advance the task to reviewer_run and tests_run
	if (args.status === 'in_progress') {
		for (const [_sessionId, session] of swarmState.agentSessions) {
			const currentState = getTaskState(session, args.task_id);
			if (currentState === 'idle') {
				try {
					advanceTaskState(session, args.task_id, 'coder_delegated');
				} catch {
					// Non-fatal: session may not support state advancement
				}
			}
		}
	}

	// Step 3: Validate working_directory if provided (must be before reviewer gate check)
	let normalizedDir: string | undefined;
	let directory: string;

	if (args.working_directory != null) {
		// Check for null-byte injection before any processing
		if (args.working_directory.includes('\0')) {
			return {
				success: false,
				message: 'Invalid working_directory: null bytes are not allowed',
			};
		}

		// Check for Windows device paths (e.g., \\.\C:\, \\?\GLOBALROOT\)
		if (process.platform === 'win32') {
			const devicePathPattern =
				/^\\\\|^(NUL|CON|AUX|COM[1-9]|LPT[1-9])(\..*)?$/i;
			if (devicePathPattern.test(args.working_directory)) {
				return {
					success: false,
					message:
						'Invalid working_directory: Windows device paths are not allowed',
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
		// Use path.resolve to properly resolve the path before checking existence
		// Use a carefully crafted path to avoid Windows path quirks
		const resolvedDir = path.resolve(normalizedDir);

		// Additional check: verify the resolved path is within the expected workspace
		// This prevents Windows from interpreting certain paths as valid
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
			// Use realPath as the validated directory
			directory = realPath;
		} catch {
			return {
				success: false,
				message: `Invalid working_directory: path "${resolvedDir}" does not exist or is inaccessible`,
				errors: [
					`Invalid working_directory: path "${resolvedDir}" does not exist or is inaccessible`,
				],
			};
		}
	} else {
		// No working_directory provided, use fallback or process.cwd()
		directory = fallbackDir ?? process.cwd();
	}

	// State machine check: task must have reached tests_run or complete state
	// Uses the validated directory for plan.json fallback resolution
	if (args.status === 'completed') {
		const reviewerCheck = checkReviewerGate(args.task_id, directory);
		if (reviewerCheck.blocked) {
			return {
				success: false,
				message:
					'Gate check failed: reviewer delegation required before marking task as completed',
				errors: [reviewerCheck.reason],
			};
		}
	}

	// Step 4: Update the task status
	try {
		const updatedPlan = await updateTaskStatus(
			directory,
			args.task_id,
			args.status as TaskStatus,
		);
		return {
			success: true,
			message: 'Task status updated successfully',
			task_id: args.task_id,
			new_status: args.status,
			current_phase: updatedPlan.current_phase,
		};
	} catch (error) {
		return {
			success: false,
			message: 'Failed to update task status',
			errors: [String(error)],
		};
	}
}

/**
 * Tool definition for update_task_status
 */
export const update_task_status: ToolDefinition = createSwarmTool({
	description:
		'Update the status of a specific task in the implementation plan. ' +
		'Task status can be one of: pending, in_progress, completed, blocked.',
	args: {
		task_id: tool.schema
			.string()
			.min(1)
			.regex(/^\d+\.\d+(\.\d+)*$/, 'Task ID must be in N.M or N.M.P format')
			.describe('Task ID in N.M format, e.g. "1.1", "1.2.3"'),
		status: tool.schema
			.enum(['pending', 'in_progress', 'completed', 'blocked'])
			.describe(
				'New status for the task: pending, in_progress, completed, or blocked',
			),
		working_directory: tool.schema
			.string()
			.optional()
			.describe('Working directory where the plan is located'),
	},
	execute: async (args: unknown, _directory: string) => {
		return JSON.stringify(
			await executeUpdateTaskStatus(args as UpdateTaskStatusArgs, _directory),
			null,
			2,
		);
	},
});
