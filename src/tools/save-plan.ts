/**
 * Save plan tool for persisting validated implementation plans.
 * Allows the Architect agent to save structured plans to .swarm/plan.json and .swarm/plan.md.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { type ToolDefinition, tool } from '@opencode-ai/plugin/tool';
import {
	ExecutionProfileSchema,
	type Phase,
	type Plan,
	type Task,
	type TaskStatus,
} from '../config/plan-schema';
import { tryAcquireLock } from '../parallel/file-locks.js';
import { writeCheckpoint } from '../plan/checkpoint';
import {
	appendLedgerEvent,
	computePlanHash,
	takeSnapshotEvent,
} from '../plan/ledger';
import { loadPlanJsonOnly, savePlan } from '../plan/manager';
import { swarmState } from '../state';
import { createSwarmTool } from './create-tool';

/**
 * Arguments for the save_plan tool
 */
export interface SavePlanArgs {
	title: string;
	swarm_id: string;
	phases: Array<{
		id: number;
		name: string;
		tasks: Array<{
			id: string;
			description: string;
			size?: 'small' | 'medium' | 'large';
			depends?: string[];
			acceptance?: string;
		}>;
	}>;
	working_directory?: string;
	/**
	 * When true, all task statuses are reset to 'pending' and existing completed
	 * statuses are NOT preserved.  Use this when creating a fresh revision of a
	 * plan where prior completion state should no longer apply (e.g., re-planning
	 * after a failed phase).  Defaults to false (existing statuses preserved).
	 */
	reset_statuses?: boolean;
	/**
	 * Architect-facing concurrency controls for this plan.
	 * When execution_profile.locked is true the profile is immutable — subsequent
	 * save_plan calls that try to change it will be rejected (fail-closed).
	 * Omit to leave the current profile unchanged.
	 */
	execution_profile?: {
		parallelization_enabled?: boolean;
		max_concurrent_tasks?: number;
		council_parallel?: boolean;
		locked?: boolean;
	};
}

/**
 * Result from executing save_plan
 */
export interface SavePlanResult {
	success: boolean;
	message: string;
	plan_path?: string;
	phases_count?: number;
	tasks_count?: number;
	errors?: string[];
	warnings?: string[];
	recovery_guidance?: string;
	/** The resolved execution_profile that was persisted, if any. */
	execution_profile?: {
		parallelization_enabled: boolean;
		max_concurrent_tasks: number;
		council_parallel: boolean;
		locked: boolean;
	};
}

/**
 * Detect template placeholder content (e.g., [task], [Project], [description], [N]).
 * These patterns indicate the LLM reproduced template examples literally rather than
 * filling in real content from the specification.
 * @param args - The save plan arguments to validate
 * @returns Array of issue strings describing found placeholders
 */
export function detectPlaceholderContent(args: SavePlanArgs): string[] {
	const issues: string[] = [];
	// Pattern matches strings like [task], [Project], [description], [N]
	// - starts with [
	// - contains at least one word character
	// - ends with ]
	const placeholderPattern = /^\[\w[\w\s]*\]$/;

	// Check title
	if (placeholderPattern.test(args.title.trim())) {
		issues.push(
			`Plan title appears to be a template placeholder: "${args.title}"`,
		);
	}

	// Check each phase name
	for (const phase of args.phases) {
		if (placeholderPattern.test(phase.name.trim())) {
			issues.push(
				`Phase ${phase.id} name appears to be a template placeholder: "${phase.name}"`,
			);
		}

		// Check each task description
		for (const task of phase.tasks) {
			if (placeholderPattern.test(task.description.trim())) {
				issues.push(
					`Task ${task.id} description appears to be a template placeholder: "${task.description}"`,
				);
			}
		}
	}

	return issues;
}

/**
 * Validate target workspace path.
 * Rejects missing, empty, whitespace-only, and traversal-style paths.
 * @param target - The target workspace path to validate
 * @param source - Description of the source (for error messages)
 * @returns Error message if invalid, undefined if valid
 */
export function validateTargetWorkspace(
	target: string | undefined,
	source: string,
): string | undefined {
	// Reject missing
	if (target === undefined || target === null) {
		return `Target workspace is required: ${source} not provided`;
	}

	// Reject empty or whitespace-only
	const trimmed = target.trim();
	if (trimmed.length === 0) {
		return `Target workspace cannot be empty or whitespace: ${source}`;
	}

	// Reject path traversal patterns
	const normalized = trimmed.replace(/\\/g, '/');
	if (normalized.includes('..')) {
		return `Target workspace cannot contain path traversal: ${source} contains ".."`;
	}

	return undefined;
}

/**
 * Execute the save_plan tool.
 * Validates for placeholder content, builds a Plan object, and saves to disk.
 * @param args - The save plan arguments
 * @returns SavePlanResult with success status and details
 */
export async function executeSavePlan(
	args: SavePlanArgs,
	fallbackDir?: string,
): Promise<SavePlanResult> {
	// Step 0: Validate phase IDs and task ID formats
	const validationErrors: string[] = [];

	// Validate phase IDs (must be positive integers)
	for (const phase of args.phases) {
		if (!Number.isInteger(phase.id) || phase.id <= 0) {
			validationErrors.push(
				`Phase ${phase.id} has invalid id: must be a positive integer`,
			);
		}

		// Validate task ID formats (must match /^\d+\.\d+(\.\d+)*$/)
		const taskIdPattern = /^\d+\.\d+(\.\d+)*$/;
		for (const task of phase.tasks) {
			if (!taskIdPattern.test(task.id)) {
				validationErrors.push(
					`Task '${task.id}' in phase ${phase.id} has invalid id format: must match N.M pattern (e.g. '1.1', '2.3')`,
				);
			}
		}
	}

	if (validationErrors.length > 0) {
		return {
			success: false,
			message: 'Plan rejected: invalid phase or task IDs',
			errors: validationErrors,
			recovery_guidance:
				'Phase IDs must be positive integers: 1, 2, 3 (not 0, -1, or decimals). ' +
				'Task IDs must use N.M format: "1.1", "2.3", "3.1". ' +
				'Call save_plan again with corrected ids. ' +
				'Never write .swarm/plan.json or .swarm/plan.md directly.',
		};
	}

	// Step 1: Detect placeholder content
	const placeholderIssues = detectPlaceholderContent(args);
	if (placeholderIssues.length > 0) {
		return {
			success: false,
			message: 'Plan rejected: contains template placeholder content',
			errors: placeholderIssues,
			recovery_guidance:
				'Use save_plan with corrected inputs to create or restructure plans. Never write .swarm/plan.json or .swarm/plan.md directly.',
		};
	}

	// Step 2: Validate target workspace - do NOT fall back to process.cwd()
	const targetWorkspace = args.working_directory ?? fallbackDir;
	const workspaceError = validateTargetWorkspace(
		targetWorkspace,
		args.working_directory ? 'working_directory' : 'fallbackDir',
	);
	if (workspaceError) {
		return {
			success: false,
			message:
				'Target workspace validation failed: provide working_directory parameter to save_plan',
			errors: [workspaceError],
			recovery_guidance:
				'Use save_plan with corrected inputs to create or restructure plans. Never write .swarm/plan.json or .swarm/plan.md directly.',
		};
	}

	// Step 2.x: SPEC GATE - verify .swarm/spec.md exists and capture its hash/mtime
	let specMtime: string | undefined;
	let specHash: string | undefined;
	if (process.env.SWARM_SKIP_SPEC_GATE !== '1') {
		const specPath = path.join(targetWorkspace as string, '.swarm', 'spec.md');
		try {
			const stat = await fs.promises.stat(specPath);
			specMtime = stat.mtime.toISOString();
			const content = await fs.promises.readFile(specPath, 'utf8');
			specHash = crypto.createHash('sha256').update(content).digest('hex');
		} catch {
			return {
				success: false,
				message:
					'SPEC_REQUIRED: .swarm/spec.md must exist before saving a plan. Run /swarm specify first.',
				errors: ['Missing .swarm/spec.md in workspace'],
				recovery_guidance:
					'Create or restore .swarm/spec.md before saving a plan. Never write .swarm/plan.json or .swarm/plan.md directly.',
			};
		}
	}

	// Step 2.5: Read current plan for status preservation (merge mode) and
	// locked execution_profile enforcement.
	// Status merge: ensures all task statuses are preserved across plan revisions.
	// When args.reset_statuses is true the map is intentionally left empty.
	// Profile enforcement: if the existing plan has a locked execution_profile,
	// reject any attempt to change it (fail-closed).
	const dir = targetWorkspace as string;
	const existingStatusMap: Map<string, TaskStatus> = new Map();
	let preservedExecutionProfile: Plan['execution_profile'];
	{
		let existing: Awaited<ReturnType<typeof loadPlanJsonOnly>> = null;
		try {
			existing = await loadPlanJsonOnly(dir);
		} catch {
			// First plan write or unreadable — proceed with defaults
		}

		if (existing) {
			// Status map (skip when resetting)
			if (!args.reset_statuses) {
				for (const phase of existing.phases) {
					for (const task of phase.tasks) {
						existingStatusMap.set(task.id, task.status);
					}
				}
			}

			// Locked execution_profile enforcement — fail closed (unless reset_statuses clears it)
			if (existing.execution_profile?.locked) {
				if (args.execution_profile !== undefined && !args.reset_statuses) {
					// Caller is trying to change a locked profile without reset → reject
					return {
						success: false,
						message:
							'EXECUTION_PROFILE_LOCKED: The execution_profile for this plan is locked and cannot be changed.',
						errors: [
							'execution_profile.locked is true — to change the profile you must first unlock it via a separate plan revision that explicitly sets locked: false, or reset the plan with reset_statuses.',
						],
						recovery_guidance:
							'Remove the execution_profile field from this save_plan call to preserve the locked profile, ' +
							'or use reset_statuses: true to start fresh (this clears the lock). ' +
							'Never modify execution_profile directly in plan.json.',
					};
				}
				// When reset_statuses is true, clear the lock (fresh start).
				// Otherwise preserve the locked profile unchanged.
				if (!args.reset_statuses) {
					preservedExecutionProfile = existing.execution_profile;
				}
			} else {
				// Profile is not locked — carry it forward if no new one provided
				preservedExecutionProfile = existing.execution_profile;
			}
		}
	}

	// Step 3: Resolve the effective execution_profile for this save.
	// Precedence: incoming args.execution_profile > preserved existing profile > undefined.
	// The locked-profile guard above already rejected the case where args.execution_profile
	// is provided for a locked plan, so reaching here with args.execution_profile set means
	// the plan is NOT locked (or is brand new).
	let resolvedProfile: Plan['execution_profile'] = preservedExecutionProfile;
	if (args.execution_profile !== undefined) {
		// Merge incoming profile fields over the preserved base (if any)
		const base = preservedExecutionProfile ?? {};
		const merged = { ...base, ...args.execution_profile };
		const parsed = ExecutionProfileSchema.safeParse(merged);
		if (!parsed.success) {
			return {
				success: false,
				message: 'Invalid execution_profile: schema validation failed',
				errors: parsed.error.issues.map(
					(i) => `${i.path.join('.')}: ${i.message}`,
				),
				recovery_guidance:
					'Check execution_profile fields: parallelization_enabled (boolean), ' +
					'max_concurrent_tasks (integer 1-64), council_parallel (boolean), locked (boolean).',
			};
		}
		resolvedProfile = parsed.data;
	}

	// Step 4: Build the Plan object from args
	const plan: Plan = {
		schema_version: '1.0.0',
		title: args.title,
		swarm: args.swarm_id,
		migration_status: 'native',
		current_phase: args.phases[0]?.id,
		specMtime,
		specHash,
		...(resolvedProfile !== undefined
			? { execution_profile: resolvedProfile }
			: {}),
		phases: args.phases.map((phase): Phase => {
			return {
				id: phase.id,
				name: phase.name,
				status: 'pending',
				tasks: phase.tasks.map((task): Task => {
					return {
						id: task.id,
						phase: phase.id,
						status: existingStatusMap.get(task.id) ?? 'pending',
						size: task.size ?? 'small',
						description: task.description,
						depends: task.depends ?? [],
						acceptance: task.acceptance,
						files_touched: [],
					};
				}),
			};
		}),
	};

	// Count total tasks
	const tasksCount = plan.phases.reduce(
		(acc, phase) => acc + phase.tasks.length,
		0,
	);

	// Step 4: Save the plan using validated target workspace
	const lockTaskId = `save-plan-${Date.now()}`;
	const planFilePath = 'plan.json';
	try {
		// Acquire file lock to prevent concurrent plan writes
		const lockResult = await tryAcquireLock(
			dir,
			planFilePath,
			'architect',
			lockTaskId,
		);
		if (!lockResult.acquired) {
			return {
				success: false,
				message: `Plan write blocked: file is locked by ${lockResult.existing?.agent ?? 'another agent'} (task: ${lockResult.existing?.taskId ?? 'unknown'})`,
				errors: [
					'Concurrent plan write detected — retry after the current write completes',
				],
				recovery_guidance:
					'Wait a moment and retry save_plan. The lock will expire automatically if the holding agent fails.',
			};
		}
		try {
			// When reset_statuses is requested, bypass the preserveCompletedStatuses
			// guard in savePlan so that the caller's intent (all tasks → pending) is
			// fully honoured.  The existingStatusMap was already left empty above, but
			// savePlan has its own independent guard that would re-read disk and
			// silently restore 'completed' statuses — so we must also disable it here.
			await savePlan(dir, plan, {
				preserveCompletedStatuses: !args.reset_statuses,
			});
			// Take an explicit snapshot after every save_plan call.
			// This ensures replayFromLedger always has a complete plan baseline to work from.
			const savedPlan = await loadPlanJsonOnly(dir);
			if (savedPlan) {
				await takeSnapshotEvent(dir, savedPlan).catch(() => {});
			}
			// Append execution_profile ledger events when the profile changed.
			// execution_profile_set tracks every profile write; execution_profile_locked
			// is appended once when the profile transitions to locked state.
			if (resolvedProfile !== undefined && savedPlan) {
				const planId = `${plan.swarm}-${plan.title}`.replace(
					/[^a-zA-Z0-9-_]/g,
					'_',
				);
				const planHashAfter = computePlanHash(savedPlan);
				const profileChanged =
					JSON.stringify(resolvedProfile) !==
					JSON.stringify(preservedExecutionProfile);
				if (profileChanged) {
					await appendLedgerEvent(
						dir,
						{
							event_type: 'execution_profile_set',
							source: 'save_plan',
							plan_id: planId,
							payload: { execution_profile: resolvedProfile },
						},
						{ planHashAfter },
					).catch(() => {});
				}
				// Append locked event when the profile was just locked
				const wasAlreadyLocked = preservedExecutionProfile?.locked === true;
				if (resolvedProfile.locked && !wasAlreadyLocked) {
					await appendLedgerEvent(
						dir,
						{
							event_type: 'execution_profile_locked',
							source: 'save_plan',
							plan_id: planId,
						},
						{ planHashAfter },
					).catch(() => {});
				}
			}
			// Write root-level checkpoint artifact (non-blocking)
			await writeCheckpoint(dir).catch(() => {});
			// Advisory: write marker file for unauthorized-write detection
			try {
				const markerPath = path.join(dir, '.swarm', '.plan-write-marker');
				const marker = JSON.stringify({
					source: 'save_plan',
					timestamp: new Date().toISOString(),
					phases_count: plan.phases.length,
					tasks_count: tasksCount,
				});
				await fs.promises.writeFile(markerPath, marker, 'utf8');
			} catch {
				// Advisory only - marker write failure does not affect plan save
			}
			// Advisory: check if critic review has occurred in any session
			const warnings: string[] = [];
			let criticReviewFound = false;
			for (const [, session] of swarmState.agentSessions) {
				if (
					session.phaseAgentsDispatched?.has('critic') ||
					session.lastCompletedPhaseAgentsDispatched?.has('critic')
				) {
					criticReviewFound = true;
					break;
				}
			}
			if (!criticReviewFound) {
				warnings.push(
					'No critic review detected before plan save. Consider delegating to critic for plan validation.',
				);
			}

			return {
				success: true,
				message: 'Plan saved successfully',
				plan_path: path.join(dir, '.swarm', 'plan.json'),
				phases_count: plan.phases.length,
				tasks_count: tasksCount,
				...(resolvedProfile !== undefined
					? { execution_profile: resolvedProfile }
					: {}),
				...(warnings.length > 0 ? { warnings } : {}),
			};
		} finally {
			if (lockResult.acquired && lockResult.lock._release) {
				await lockResult.lock._release().catch(() => {});
			}
		}
	} catch (error) {
		return {
			success: false,
			message:
				'Failed to save plan: retry with save_plan after resolving the error above',
			errors: [error instanceof Error ? error.message : String(error)],
			recovery_guidance:
				'Use save_plan with corrected inputs to create or restructure plans. Never write .swarm/plan.json or .swarm/plan.md directly.',
		};
	}
}

/**
 * Tool definition for save_plan
 */
export const save_plan: ToolDefinition = createSwarmTool({
	description:
		'Save a structured implementation plan to .swarm/plan.json and .swarm/plan.md. ' +
		'Task descriptions and phase names MUST contain real content from the spec — ' +
		'bracket placeholders like [task] or [Project] will be rejected.',
	args: {
		title: tool.schema
			.string()
			.min(1)
			.describe(
				'Plan title — the REAL project name from the spec. NOT a placeholder like [Project].',
			),
		swarm_id: tool.schema
			.string()
			.min(1)
			.describe('Swarm identifier (e.g. "mega")'),
		phases: tool.schema
			.array(
				tool.schema.object({
					id: tool.schema
						.number()
						.int()
						.min(1)
						.describe(
							'Phase number — a positive integer starting at 1. Use 1, 2, 3, etc.',
						),
					name: tool.schema
						.string()
						.min(1)
						.describe('Descriptive phase name derived from the spec'),
					tasks: tool.schema
						.array(
							tool.schema.object({
								id: tool.schema
									.string()
									.min(1)
									.regex(
										/^\d+\.\d+(\.\d+)*$/,
										'Task ID must be in N.M format, e.g. "1.1"',
									)
									.describe('Task ID in N.M format, e.g. "1.1", "2.3"'),
								description: tool.schema
									.string()
									.min(1)
									.describe(
										'Specific task description from the spec. NOT a placeholder like [task].',
									),
								size: tool.schema
									.enum(['small', 'medium', 'large'])
									.optional()
									.describe('Task size estimate (default: small)'),
								depends: tool.schema
									.array(tool.schema.string())
									.optional()
									.describe(
										'Task IDs this task depends on, e.g. ["1.1", "1.2"]',
									),
								acceptance: tool.schema
									.string()
									.optional()
									.describe('Acceptance criteria for this task'),
							}),
						)
						.min(1)
						.describe('Tasks in this phase'),
				}),
			)
			.min(1)
			.describe('Implementation phases'),
		working_directory: tool.schema
			.string()
			.optional()
			.describe('Working directory (explicit path, required - no fallback)'),
		reset_statuses: tool.schema
			.boolean()
			.optional()
			.describe(
				'When true, reset ALL task statuses to pending regardless of prior completion state. ' +
					'Use only when deliberately re-planning a phase from scratch. ' +
					'Default false (preserves existing task statuses across plan revisions).',
			),
		execution_profile: tool.schema
			.object({
				parallelization_enabled: tool.schema
					.boolean()
					.optional()
					.describe(
						'When true, enables parallel task dispatch for this plan. Default false (serial).',
					),
				max_concurrent_tasks: tool.schema
					.number()
					.int()
					.min(1)
					.max(64)
					.optional()
					.describe(
						'Maximum tasks that may run concurrently when parallelization is enabled. Default 1.',
					),
				council_parallel: tool.schema
					.boolean()
					.optional()
					.describe(
						'When true, council review phases may run in parallel. Default false.',
					),
				locked: tool.schema
					.boolean()
					.optional()
					.describe(
						'When true, locks the profile — future save_plan calls that include ' +
							'execution_profile will be rejected (fail-closed). ' +
							'Unlock by resetting the plan (reset_statuses: true).',
					),
			})
			.optional()
			.describe(
				'Architect-facing concurrency controls. Once locked, cannot be changed without resetting. ' +
					'Omit to preserve the existing profile.',
			),
	},
	execute: async (args: unknown, _directory: string) => {
		return JSON.stringify(
			await executeSavePlan(args as SavePlanArgs, _directory),
			null,
			2,
		);
	},
});
