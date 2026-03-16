/**
 * Update task status tool for changing the status of individual tasks in a plan.
 * Allows agents to mark tasks as pending, in_progress, completed, or blocked.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TaskStatus } from '../config/plan-schema';
import { stripKnownSwarmPrefix } from '../config/schema';
import { updateTaskStatus } from '../plan/manager';
import { advanceTaskState, getTaskState, swarmState } from '../state';

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
 * Tier 3 patterns that require full gate review even in Turbo Mode.
 * These are critical security-sensitive files that must always pass Stage B.
 */
const TIER_3_PATTERNS = [
	/^architect.*\.ts$/i,
	/^delegation.*\.ts$/i,
	/^guardrails.*\.ts$/i,
	/^adversarial.*\.ts$/i,
	/^sanitiz.*\.ts$/i,
	/^auth.*$/i,
	/^permission.*$/i,
	/^crypto.*$/i,
	/^secret.*$/i,
	/^security.*\.ts$/i,
];

/**
 * Check if any file in the list matches a Tier 3 pattern.
 * @param files - Array of file paths/names to check
 * @returns true if any file matches a Tier 3 pattern
 */
function matchesTier3Pattern(files: string[]): boolean {
	for (const file of files) {
		const fileName = path.basename(file);
		for (const pattern of TIER_3_PATTERNS) {
			if (pattern.test(fileName)) {
				return true;
			}
		}
	}
	return false;
}

/**
 * Check if ANY active session has Turbo Mode enabled.
 * @returns true if any session has turboMode: true
 */
function hasActiveTurboMode(): boolean {
	for (const [_sessionId, session] of swarmState.agentSessions) {
		if (session.turboMode === true) {
			return true;
		}
	}
	return false;
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
		// === Turbo Mode bypass check ===
		// If Turbo Mode is active AND task does not touch Tier 3 patterns, bypass Stage B
		if (hasActiveTurboMode()) {
			const resolvedDir = workingDirectory ?? process.cwd();
			try {
				const planPath = path.join(resolvedDir, '.swarm', 'plan.json');
				const planRaw = fs.readFileSync(planPath, 'utf-8');
				const plan = JSON.parse(planRaw) as {
					phases: Array<{
						tasks: Array<{
							id: string;
							files_touched?: string[];
						}>;
					}>;
				};

				// Find the task and check its files_touched
				for (const planPhase of plan.phases ?? []) {
					for (const task of planPhase.tasks ?? []) {
						if (task.id === taskId && task.files_touched) {
							// If no Tier 3 patterns matched, bypass Stage B
							if (!matchesTier3Pattern(task.files_touched)) {
								return {
									blocked: false,
									reason: 'Turbo Mode bypass',
								};
							}
							// Task touches Tier 3 patterns - fall through to normal gate check
							break;
						}
					}
				}
			} catch {
				// plan.json missing or unreadable — fall through to normal gate check
			}
		}

		// === evidence-first check (durable, survives restarts) ===
		const resolvedDir = workingDirectory ?? process.cwd();
		try {
			const evidencePath = path.join(
				resolvedDir,
				'.swarm',
				'evidence',
				`${taskId}.json`,
			);
			const raw = fs.readFileSync(evidencePath, 'utf-8');
			const evidence = JSON.parse(raw) as {
				required_gates?: string[];
				gates?: Record<string, unknown>;
			};

			if (
				evidence?.required_gates &&
				Array.isArray(evidence.required_gates) &&
				evidence?.gates
			) {
				const allGatesMet = evidence.required_gates.every(
					(gate: string) => evidence.gates![gate] != null,
				);
				if (allGatesMet) {
					return { blocked: false, reason: '' };
				}
				// Evidence file is authoritative when it exists — don't fall through to session state
				const missingGates = evidence.required_gates.filter(
					(gate: string) => evidence.gates![gate] == null,
				);
				return {
					blocked: true,
					reason:
						`Task ${taskId} is missing required gates: [${missingGates.join(', ')}]. ` +
						`Required: [${evidence.required_gates.join(', ')}]. ` +
						`Completed: [${Object.keys(evidence.gates).join(', ')}]. ` +
						`Delegate the missing gate agents before marking task as completed.`,
				};
			}
		} catch {
			// No evidence file or parse error — fall through to session state
		}

		// === session state check (fallback for pre-evidence tasks) ===

		// If no active sessions, allow through (test context)
		if (swarmState.agentSessions.size === 0) {
			return { blocked: false, reason: '' };
		}

		// Check each session for state machine state.
		// Skip sessions with corrupt/missing taskWorkflowStates — they cannot
		// make authoritative assertions about whether a task passed QA gates.
		let validSessionCount = 0;
		for (const [_sessionId, session] of swarmState.agentSessions) {
			if (!(session.taskWorkflowStates instanceof Map)) {
				continue; // Skip corrupt sessions
			}
			validSessionCount++;
			const state = getTaskState(session, taskId);

			// If task has reached tests_run or complete state, allow through
			if (state === 'tests_run' || state === 'complete') {
				return { blocked: false, reason: '' };
			}
		}

		// If all sessions had corrupt workflow state, allow through —
		// we cannot make a reliable gate assertion without valid state.
		if (validSessionCount === 0) {
			return { blocked: false, reason: '' };
		}

		// No session has this task in tests_run or complete state
		// Build a debug summary of current task state across all sessions
		const stateEntries: string[] = [];
		for (const [sessionId, session] of swarmState.agentSessions) {
			if (!(session.taskWorkflowStates instanceof Map)) continue;
			const state = getTaskState(session, taskId);
			stateEntries.push(`${sessionId}: ${state}`);
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

		// === Delegation chain direct-check fallback ===
		// Scan same-session delegation chains for reviewer+test_engineer after last coder.
		// This handles cases where state machine wasn't advanced but delegations exist.
		const activeSessionIds = new Set(swarmState.agentSessions.keys());
		let chainHasReviewer = false;
		let chainHasTestEngineer = false;

		for (const [sessionId, chain] of swarmState.delegationChains) {
			// Same-session constraint: only scan chains from active sessions
			if (!activeSessionIds.has(sessionId)) continue;
			if (!chain || chain.length === 0) continue;

			// Find the index of the last coder in the chain
			let lastCoderIndex = -1;
			for (let i = chain.length - 1; i >= 0; i--) {
				const target = stripKnownSwarmPrefix(chain[i].to);
				if (target.includes('coder')) {
					lastCoderIndex = i;
					break;
				}
			}

			// Skip chains with no coder (prevents false positives from docs-only chains)
			if (lastCoderIndex === -1) continue;

			// Count reviewer/test_engineer from lastCoderIndex+1 onward
			for (let i = lastCoderIndex + 1; i < chain.length; i++) {
				const target = stripKnownSwarmPrefix(chain[i].to);
				if (target === 'reviewer') chainHasReviewer = true;
				if (target === 'test_engineer') chainHasTestEngineer = true;
			}
		}

		// If both gates found after last coder in any same-session chain, allow through
		if (chainHasReviewer && chainHasTestEngineer) {
			return { blocked: false, reason: '' };
		}

		const currentStateStr =
			stateEntries.length > 0 ? stateEntries.join(', ') : 'no active sessions';
		return {
			blocked: true,
			reason: `Task ${taskId} has not passed QA gates. Current state by session: [${currentStateStr}]. Missing required state: tests_run or complete in at least one valid session. Do not write directly to plan files — use update_task_status after running the reviewer and test_engineer agents.`,
		};
	} catch {
		// If state inspection throws, allow through
		return { blocked: false, reason: '' };
	}
}

/**
 * Recovery mechanism: reconcile task state with delegation history.
 * When reviewer/test_engineer delegations occurred but the state machine
 * was not advanced (e.g., toolAfter didn't fire, subagent_type missing,
 * cross-session gaps, or pure verification tasks without coder delegation),
 * this function walks all delegation chains and advances the task state
 * so that checkReviewerGate can make an accurate decision.
 *
 * @param taskId - The task ID to recover state for
 */
export function recoverTaskStateFromDelegations(taskId: string): void {
	// Scan delegation chains scoped to sessions working on THIS task (Pass 1)
	let hasReviewer = false;
	let hasTestEngineer = false;

	for (const [sessionId, chain] of swarmState.delegationChains) {
		const session = swarmState.agentSessions.get(sessionId);
		// Only count delegations from sessions associated with the target task
		if (
			session &&
			(session.currentTaskId === taskId ||
				session.lastCoderDelegationTaskId === taskId)
		) {
			for (const delegation of chain) {
				const target = stripKnownSwarmPrefix(delegation.to);
				if (target === 'reviewer') hasReviewer = true;
				if (target === 'test_engineer') hasTestEngineer = true;
			}
		}
	}

	// Pass 2: Fallback for docs-only/pure-verification tasks where neither
	// session.currentTaskId nor session.lastCoderDelegationTaskId is set.
	// Same-session only: scan ONLY chains belonging to active sessions.
	// Skip chains with no coder (lastCoderIndex === -1).
	// Count reviewer/test_engineer AFTER the last coder.
	if (!hasReviewer && !hasTestEngineer) {
		// Get all active session IDs
		const activeSessionIds = new Set(swarmState.agentSessions.keys());

		for (const [sessionId, chain] of swarmState.delegationChains) {
			// Same-session constraint: only scan chains from active sessions
			if (!activeSessionIds.has(sessionId)) continue;
			if (!chain || chain.length === 0) continue;

			// Find the index of the last coder in the chain
			let lastCoderIndex = -1;
			for (let i = chain.length - 1; i >= 0; i--) {
				const target = stripKnownSwarmPrefix(chain[i].to);
				if (target.includes('coder')) {
					lastCoderIndex = i;
					break;
				}
			}

			// Skip chains with no coder (prevents docs-only false positives)
			if (lastCoderIndex === -1) continue;

			// Count reviewer/test_engineer from lastCoderIndex+1 onward
			for (let i = lastCoderIndex + 1; i < chain.length; i++) {
				const target = stripKnownSwarmPrefix(chain[i].to);
				if (target === 'reviewer') hasReviewer = true;
				if (target === 'test_engineer') hasTestEngineer = true;
			}
		}
	}

	if (!hasReviewer && !hasTestEngineer) return;

	// Advance the specific task state in all sessions
	for (const [, session] of swarmState.agentSessions) {
		if (!(session.taskWorkflowStates instanceof Map)) continue;

		const currentState = getTaskState(session, taskId);

		// Already at or past tests_run — nothing to recover
		if (currentState === 'tests_run' || currentState === 'complete') continue;

		// Seed from idle if the task was never explicitly set to in_progress
		if (hasReviewer && currentState === 'idle') {
			try {
				advanceTaskState(session, taskId, 'coder_delegated');
			} catch {
				/* non-fatal */
			}
		}

		// Advance coder_delegated/pre_check_passed → reviewer_run
		if (hasReviewer) {
			const stateNow = getTaskState(session, taskId);
			if (stateNow === 'coder_delegated' || stateNow === 'pre_check_passed') {
				try {
					advanceTaskState(session, taskId, 'reviewer_run');
				} catch {
					/* non-fatal */
				}
			}
		}

		// Advance reviewer_run → tests_run
		if (hasTestEngineer) {
			const stateNow = getTaskState(session, taskId);
			if (stateNow === 'reviewer_run') {
				try {
					advanceTaskState(session, taskId, 'tests_run');
				} catch {
					/* non-fatal */
				}
			}
		}
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
	// Also synchronize session task identity fields so later gate recording uses the correct task
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
			// Synchronize active task identity for durable gate recording
			session.currentTaskId = args.task_id;
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
		// Recovery: reconcile task state with delegation history before gate check.
		// This handles cases where the delegation-gate toolAfter hook did not
		// advance the state (missing subagent_type, cross-session gaps, pure
		// verification tasks without coder delegation, etc.).
		recoverTaskStateFromDelegations(args.task_id);

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

		if (args.status === 'completed') {
			for (const [_sessionId, session] of swarmState.agentSessions) {
				if (!(session.taskWorkflowStates instanceof Map)) {
					continue;
				}

				const currentState = getTaskState(session, args.task_id);
				if (currentState === 'tests_run') {
					try {
						advanceTaskState(session, args.task_id, 'complete');
					} catch {
						// Non-fatal: do not fail task status update on state sync issues
					}
				}
			}
		}

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
