/**
 * Save plan tool for persisting validated implementation plans.
 * Allows the Architect agent to save structured plans to .swarm/plan.json and .swarm/plan.md.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { type ToolDefinition, tool } from '@opencode-ai/plugin/tool';
import type { Phase, Plan, Task, TaskStatus } from '../config/plan-schema';
import { tryAcquireLock } from '../parallel/file-locks.js';
import { writeCheckpoint } from '../plan/checkpoint';
import { takeSnapshotEvent } from '../plan/ledger';
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

	// Step 2.5: Read current plan for status preservation (merge mode)
	// This ensures all task statuses are preserved across plan revisions,
	// not just tasks that happen to share the same ID with the incoming plan.
	const dir = targetWorkspace as string;
	const existingStatusMap: Map<string, TaskStatus> = new Map();
	try {
		const existing = await loadPlanJsonOnly(dir);
		if (existing) {
			for (const phase of existing.phases) {
				for (const task of phase.tasks) {
					existingStatusMap.set(task.id, task.status);
				}
			}
		}
	} catch {
		// First plan write or unreadable — proceed with all-pending
	}

	// Step 3: Build the Plan object from args
	const plan: Plan = {
		schema_version: '1.0.0',
		title: args.title,
		swarm: args.swarm_id,
		migration_status: 'native',
		current_phase: args.phases[0]?.id,
		specMtime,
		specHash,
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
			await savePlan(dir, plan);
			// Take an explicit snapshot after every save_plan call.
			// This ensures replayFromLedger always has a complete plan baseline to work from.
			const savedPlan = await loadPlanJsonOnly(dir);
			if (savedPlan) {
				await takeSnapshotEvent(dir, savedPlan).catch(() => {});
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
	},
	execute: async (args: unknown, _directory: string) => {
		return JSON.stringify(
			await executeSavePlan(args as SavePlanArgs, _directory),
			null,
			2,
		);
	},
});
