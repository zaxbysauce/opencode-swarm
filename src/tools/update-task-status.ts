/**
 * Update task status tool for changing the status of individual tasks in a plan.
 * Allows agents to mark tasks as pending, in_progress, completed, or blocked.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { type ToolDefinition, tool } from '@opencode-ai/plugin/tool';
import { loadPluginConfig } from '../config/loader';
import type { TaskStatus } from '../config/plan-schema';
import { stripKnownSwarmPrefix } from '../config/schema';
import { readTaskEvidenceRaw } from '../gate-evidence.js';
import { validateDiffScope } from '../hooks/diff-scope';
import { tryAcquireLock } from '../parallel/file-locks.js';
import { updateTaskStatus } from '../plan/manager';
import {
	advanceTaskState,
	getTaskState,
	hasActiveTurboMode,
	swarmState,
} from '../state';
import { telemetry } from '../telemetry.js';
import { validateTaskIdFormat as _validateTaskIdFormat } from '../validation/task-id';
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
	/** Present when the call failed due to lock contention. Instructs the caller to retry. */
	recovery_guidance?: string;
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
	const result = _validateTaskIdFormat(taskId);
	if (result) {
		// Preserve original error message format expected by callers
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
			const resolvedDir = workingDirectory!;
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
			const evidence = readTaskEvidenceRaw(resolvedDir, taskId);

			if (evidence === null) {
				// No evidence file (ENOENT) — fall through to session state
			} else if (
				evidence.required_gates &&
				Array.isArray(evidence.required_gates) &&
				evidence.gates
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
				telemetry.gateFailed(
					'',
					'qa_gate',
					taskId,
					`Missing gates: [${missingGates.join(', ')}]`,
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
		} catch (error) {
			// Malformed JSON, permission error, or other non-ENOENT issue — BLOCK
			console.warn(
				`[gate-evidence] Evidence file for task ${taskId} is corrupt or unreadable:`,
				error instanceof Error ? error.message : String(error),
			);
			telemetry.gateFailed(
				'',
				'qa_gate',
				taskId,
				`Evidence file corrupt or unreadable`,
			);
			return {
				blocked: true,
				reason:
					`Evidence file for task ${taskId} is corrupt or unreadable. ` +
					`Fix the file at .swarm/evidence/${taskId}.json or delete it to fall through to session state.`,
			};
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
			const resolvedDir = workingDirectory!;
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

		// Final fallback: scan delegation chains directly for reviewer+test_engineer.
		// This covers cases where:
		// - Session was restarted (in-memory state lost)
		// - Pure-verification/code-organization tasks with no coder delegation
		// - toolAfter hook didn't fire (subagent_type not captured)
		// Uses the same unscoped scan as recoverTaskStateFromDelegations.
		{
			let hasReviewer = false;
			let hasTestEngineer = false;

			// Pass 1: task-scoped scan
			for (const [sessionId, chain] of swarmState.delegationChains) {
				const session = swarmState.agentSessions.get(sessionId);
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

			// Pass 2: unscoped fallback when no task-scoped sessions found
			if (!hasReviewer && !hasTestEngineer) {
				for (const [, chain] of swarmState.delegationChains) {
					let lastCoderIndex = -1;
					for (let i = chain.length - 1; i >= 0; i--) {
						const target = stripKnownSwarmPrefix(chain[i].to);
						if (target === 'coder') {
							lastCoderIndex = i;
							break;
						}
					}
					const searchStart = lastCoderIndex === -1 ? 0 : lastCoderIndex + 1;
					for (let i = searchStart; i < chain.length; i++) {
						const target = stripKnownSwarmPrefix(chain[i].to);
						if (target === 'reviewer') hasReviewer = true;
						if (target === 'test_engineer') hasTestEngineer = true;
					}
				}
			}

			// If both reviewer and test_engineer are confirmed in delegation chains, allow through
			if (hasReviewer && hasTestEngineer) {
				return { blocked: false, reason: '' };
			}
		}

		const currentStateStr =
			stateEntries.length > 0 ? stateEntries.join(', ') : 'no active sessions';
		telemetry.gateFailed(
			'',
			'qa_gate',
			taskId,
			`Missing state: tests_run or complete`,
		);
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
 * Wrapper around checkReviewerGate that appends a diff-scope advisory warning.
 * Keeps checkReviewerGate synchronous for backward compatibility.
 * @param taskId - The task ID to check gate state for
 * @param workingDirectory - Optional working directory for plan.json fallback
 * @returns ReviewerGateResult with optional scope warning appended to reason
 */
export async function checkReviewerGateWithScope(
	taskId: string,
	workingDirectory?: string,
): Promise<ReviewerGateResult> {
	const result = checkReviewerGate(taskId, workingDirectory);
	const scopeWarning = await validateDiffScope(taskId, workingDirectory!).catch(
		() => null,
	);
	if (!scopeWarning) return result;
	return {
		...result,
		reason: result.reason ? `${result.reason}\n${scopeWarning}` : scopeWarning,
	};
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
	let hasReviewer = false;
	let hasTestEngineer = false;

	// Pass 1 (task-scoped): scan only sessions explicitly associated with this task.
	// This is the authoritative path — covers normal coder→reviewer→test_engineer flows.
	for (const [sessionId, chain] of swarmState.delegationChains) {
		const session = swarmState.agentSessions.get(sessionId);
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

	// Pass 2 (unscoped fallback): when no task-scoped sessions were found,
	// scan ALL delegation chains. This covers pure-verification tasks and
	// code-organization tasks where no coder delegation occurred, so
	// currentTaskId / lastCoderDelegationTaskId were never set to this taskId.
	// Safety: only scan delegations that occurred after the last coder delegation
	// in each chain (or from the start if no coder delegation exists), to avoid
	// attributing reviewer/test_engineer from a prior task to this one.
	if (!hasReviewer && !hasTestEngineer) {
		for (const [, chain] of swarmState.delegationChains) {
			// Find the last coder delegation index in this chain
			let lastCoderIndex = -1;
			for (let i = chain.length - 1; i >= 0; i--) {
				const target = stripKnownSwarmPrefix(chain[i].to);
				if (target === 'coder') {
					lastCoderIndex = i;
					break;
				}
			}
			// Scan from after the last coder delegation (or from start if no coder)
			const searchStart = lastCoderIndex === -1 ? 0 : lastCoderIndex + 1;
			for (let i = searchStart; i < chain.length; i++) {
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
 * Result of the council-gate check used when transitioning to 'completed'.
 *
 * - When council.enabled is false, {blocked:false} is always returned (no regression).
 * - When council.enabled is true, requires evidence.gates.council to exist and
 *   its verdict to be APPROVE or CONCERNS. A missing gate or REJECT verdict blocks.
 */
export interface CouncilGateResult {
	blocked: boolean;
	reason: string;
}

/**
 * Check the council gate for a completion transition. Pure — reads config and
 * evidence only, no state mutation. Exported for focused unit testing.
 *
 * @param workingDirectory - Validated project root (contains .swarm/evidence/)
 * @param taskId - Task ID in N.M or N.M.P format
 */
export function checkCouncilGate(
	workingDirectory: string,
	taskId: string,
): CouncilGateResult {
	let councilEnabled = false;
	try {
		const config = loadPluginConfig(workingDirectory);
		councilEnabled = config.council?.enabled === true;
	} catch {
		// Config load failure — treat council as disabled (no regression)
		return { blocked: false, reason: '' };
	}

	if (!councilEnabled) {
		return { blocked: false, reason: '' };
	}

	let evidence: ReturnType<typeof readTaskEvidenceRaw>;
	try {
		evidence = readTaskEvidenceRaw(workingDirectory, taskId);
	} catch {
		// Corrupt evidence — let the existing gate loop / downstream checks handle
		return {
			blocked: true,
			reason:
				'council gate required but not yet run — architect must call convene_council before advancing this task',
		};
	}

	const councilGate = evidence?.gates?.council as
		| { verdict?: string }
		| undefined;
	if (!councilGate) {
		return {
			blocked: true,
			reason:
				'council gate required but not yet run — architect must call convene_council before advancing this task',
		};
	}

	if (councilGate.verdict === 'REJECT') {
		return {
			blocked: true,
			reason:
				'council gate blocked advancement — resolve requiredFixes and re-run convene_council',
		};
	}

	// APPROVE or CONCERNS → allow
	return { blocked: false, reason: '' };
}

/**
 * Execute the update_task_status tool.
 * Validates the task_id and status, then updates the task status in the plan.
 * Uses file locking on plan.json to prevent concurrent writes from corrupting the plan.
 * Only one concurrent call wins the lock; others return success: false with recovery_guidance: "retry".
 * @param args - The update task status arguments
 * @param fallbackDir - Fallback working directory if args.working_directory is not provided
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

		// Check for Windows device paths (e.g., \\.\C:\, \\?\GLOBALROOT\, UNC paths)
		// Applied on all platforms for defense-in-depth (paths may originate from Windows clients)
		{
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
		// No working_directory provided, use fallbackDir from createSwarmTool
		if (!fallbackDir) {
			return {
				success: false,
				message: 'No working_directory provided and fallbackDir is undefined',
				errors: ['Cannot resolve directory for task status update'],
			};
		}
		directory = fallbackDir;
	}

	// Write minimal gate-tracking evidence to persist across session restarts.
	// Placed AFTER directory validation so we only write under the validated workspace.
	if (args.status === 'in_progress') {
		try {
			const evidencePath = path.join(
				directory,
				'.swarm',
				'evidence',
				`${args.task_id}.json`,
			);
			fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
			// Atomic create: use wx flag to fail if file already exists (no TOCTOU race)
			const fd = fs.openSync(evidencePath, 'wx');
			let writeOk = false;
			try {
				fs.writeSync(
					fd,
					JSON.stringify(
						{
							task_id: args.task_id,
							required_gates: ['reviewer', 'test_engineer'],
							gates: {},
							started_at: new Date().toISOString(),
						},
						null,
						2,
					),
				);
				writeOk = true;
			} finally {
				fs.closeSync(fd);
				// Remove partial/empty file on write failure to avoid a permanently broken gate file
				if (!writeOk) {
					try {
						fs.unlinkSync(evidencePath);
					} catch {
						/* best-effort cleanup */
					}
				}
			}
		} catch {
			/* Advisory only — EEXIST (file already exists) or other errors never block status update */
		}
	}

	// State machine check: task must have reached tests_run or complete state
	// Uses the validated directory for plan.json fallback resolution
	if (args.status === 'completed') {
		// Recovery: reconcile task state with delegation history before gate check.
		// This handles cases where the delegation-gate toolAfter hook did not
		// advance the state (missing subagent_type, cross-session gaps, pure
		// verification tasks without coder delegation, etc.).
		recoverTaskStateFromDelegations(args.task_id);

		// Check if the phase requires reviewer — non-code phases (acceptance, docs) may not
		let phaseRequiresReviewer = true;
		try {
			const planPath = path.join(directory, '.swarm', 'plan.json');
			const planRaw = fs.readFileSync(planPath, 'utf-8');
			const plan: {
				phases: Array<{
					id: number;
					tasks: Array<{ id: string }>;
					required_agents?: string[];
				}>;
			} = JSON.parse(planRaw);
			const taskPhase = plan.phases.find((p) =>
				p.tasks.some((t) => t.id === args.task_id),
			);
			if (
				taskPhase?.required_agents &&
				!taskPhase.required_agents.includes('reviewer')
			) {
				phaseRequiresReviewer = false;
			}
		} catch {
			// plan.json missing or unreadable — default to requiring reviewer
		}

		if (phaseRequiresReviewer) {
			const reviewerCheck = await checkReviewerGateWithScope(
				args.task_id,
				directory,
			);
			if (reviewerCheck.blocked) {
				return {
					success: false,
					message:
						'Gate check failed: reviewer delegation required before marking task as completed',
					errors: [reviewerCheck.reason],
				};
			}
		}

		// Council gate check — enforced only when council.enabled is true.
		// Placed after reviewer gate so existing failures surface first and
		// no council behavior activates when the feature is off (no regression).
		const councilCheck = checkCouncilGate(directory, args.task_id);
		if (councilCheck.blocked) {
			return {
				success: false,
				message: councilCheck.reason,
				errors: [councilCheck.reason],
			};
		}
	}

	// Step 4: Update the task status with file lock to prevent concurrent writes
	const lockTaskId = `update-task-status-${args.task_id}-${Date.now()}`;
	const planFilePath = 'plan.json';
	// Derive agent from swarmState session context, fallback to 'update-task-status' sentinel
	let agentName = 'update-task-status';
	for (const [, agent] of swarmState.activeAgent) {
		agentName = agent;
		break; // Use first active agent found
	}
	let lockResult: Awaited<ReturnType<typeof tryAcquireLock>> | undefined;
	try {
		lockResult = await tryAcquireLock(
			directory,
			planFilePath,
			agentName,
			lockTaskId,
		);
	} catch (error) {
		return {
			success: false,
			message: 'Failed to acquire lock for task status update',
			errors: [error instanceof Error ? error.message : String(error)],
		};
	}
	if (!lockResult.acquired) {
		return {
			success: false,
			message: `Task status write blocked: plan.json is locked by ${lockResult.existing?.agent ?? 'another agent'} (task: ${lockResult.existing?.taskId ?? 'unknown'})`,
			errors: [
				'Concurrent plan write detected — retry after the current write completes',
			],
			recovery_guidance:
				'Wait a moment and retry update_task_status. The lock will expire automatically if the holding agent fails.',
		};
	}
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
		// Lock will be released in finally block
		return {
			success: false,
			message: 'Failed to update task status',
			errors: [error instanceof Error ? error.message : String(error)],
		} as UpdateTaskStatusResult;
	} finally {
		if (lockResult?.acquired && lockResult.lock._release) {
			try {
				await lockResult.lock._release();
			} catch (releaseError) {
				// Log but don't propagate - original error/context takes precedence
				console.error(
					'[update-task-status] Lock release failed:',
					releaseError,
				);
			}
		}
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
