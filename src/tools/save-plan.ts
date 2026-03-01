/**
 * Save plan tool for persisting validated implementation plans.
 * Allows the Architect agent to save structured plans to .swarm/plan.json and .swarm/plan.md.
 */

import * as path from 'node:path';
import { type ToolDefinition, tool } from '@opencode-ai/plugin/tool';
import type { Phase, Plan, Task } from '../config/plan-schema';
import { savePlan } from '../plan/manager';

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
 * Execute the save_plan tool.
 * Validates for placeholder content, builds a Plan object, and saves to disk.
 * @param args - The save plan arguments
 * @returns SavePlanResult with success status and details
 */
export async function executeSavePlan(
	args: SavePlanArgs,
): Promise<SavePlanResult> {
	// Step 1: Detect placeholder content
	const placeholderIssues = detectPlaceholderContent(args);
	if (placeholderIssues.length > 0) {
		return {
			success: false,
			message: 'Plan rejected: contains template placeholder content',
			errors: placeholderIssues,
		};
	}

	// Step 2: Build the Plan object from args
	const plan: Plan = {
		schema_version: '1.0.0',
		title: args.title,
		swarm: args.swarm_id,
		migration_status: 'native',
		current_phase: args.phases[0]?.id,
		phases: args.phases.map((phase): Phase => {
			return {
				id: phase.id,
				name: phase.name,
				status: 'pending',
				tasks: phase.tasks.map((task): Task => {
					return {
						id: task.id,
						phase: phase.id,
						status: 'pending',
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

	// Step 3: Determine working directory
	const dir = args.working_directory ?? process.cwd();

	// Step 4: Save the plan
	try {
		await savePlan(dir, plan);
		return {
			success: true,
			message: 'Plan saved successfully',
			plan_path: path.join(dir, '.swarm', 'plan.json'),
			phases_count: plan.phases.length,
			tasks_count: tasksCount,
		};
	} catch (error) {
		return {
			success: false,
			message: 'Failed to save plan',
			errors: [String(error)],
		};
	}
}

/**
 * Tool definition for save_plan
 */
export const save_plan: ToolDefinition = tool({
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
						.positive()
						.describe('Phase number, starting at 1'),
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
			.describe('Working directory (defaults to process.cwd())'),
	},
	execute: async (args) => {
		return JSON.stringify(await executeSavePlan(args as SavePlanArgs), null, 2);
	},
});
