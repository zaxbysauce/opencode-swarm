import { z } from 'zod';

// Task status enum
export const TaskStatusSchema = z.enum([
	'pending',
	'in_progress',
	'completed',
	'blocked',
	'closed',
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

// Task size enum
export const TaskSizeSchema = z.enum(['small', 'medium', 'large']);
export type TaskSize = z.infer<typeof TaskSizeSchema>;

// Phase status enum
export const PhaseStatusSchema = z.enum([
	'pending',
	'in_progress',
	'complete',
	'completed', // Alias for 'complete' - both accepted
	'blocked',
	'closed',
]);
export type PhaseStatus = z.infer<typeof PhaseStatusSchema>;

/**
 * Normalize phase status - 'completed' maps to 'complete'.
 * @param status - The phase status to normalize
 * @returns Normalized status ('completed' becomes 'complete')
 */
export function normalizePhaseStatus(status: PhaseStatus): PhaseStatus {
	if (status === 'completed') {
		return 'complete';
	}
	return status;
}

/**
 * Check if a phase status represents completion.
 * @param status - The phase status to check
 * @returns true if status is 'complete' or 'completed'
 */
export function isPhaseComplete(status: PhaseStatus): boolean {
	return status === 'complete' || status === 'completed';
}

// Migration status enum (set when plan was converted from legacy plan.md)
export const MigrationStatusSchema = z.enum([
	'native',
	'migrated',
	'migration_failed',
]);
export type MigrationStatus = z.infer<typeof MigrationStatusSchema>;

// Task schema
export const TaskSchema = z.object({
	id: z.string(), // e.g. "1.1", "2.3"
	phase: z.number().int().min(1), // phase number this task belongs to
	status: TaskStatusSchema.default('pending'),
	size: TaskSizeSchema.default('small'),
	description: z.string().min(1),
	depends: z.array(z.string()).default([]), // task IDs, e.g. ["1.1", "1.2"]
	acceptance: z.string().optional(), // acceptance criteria
	files_touched: z.array(z.string()).default([]), // files modified by this task
	evidence_path: z.string().optional(), // path to evidence directory
	blocked_reason: z.string().optional(), // why task is blocked
});
export type Task = z.infer<typeof TaskSchema>;

// Phase schema
export const PhaseSchema = z.object({
	id: z.number().int().min(1),
	name: z.string().min(1),
	status: PhaseStatusSchema.default('pending'),
	tasks: z.array(TaskSchema).default([]),
	required_agents: z.array(z.string()).optional(),
});
export type Phase = z.infer<typeof PhaseSchema>;

// Plan schema (top-level)
export const PlanSchema = z.object({
	schema_version: z.literal('1.0.0'),
	title: z.string().min(1),
	swarm: z.string().min(1),
	current_phase: z.number().int().min(1).optional(),
	phases: z.array(PhaseSchema).min(1),
	migration_status: MigrationStatusSchema.optional(), // only set when migrated from legacy
	specMtime: z.string().optional(), // ISO 8601 timestamp of when .swarm/spec.md was last modified
	specHash: z.string().optional(), // SHA-256 hex of .swarm/spec.md content
});
export type Plan = z.infer<typeof PlanSchema>;

/**
 * Runtime plan with spec staleness tracking.
 * Extends Plan with runtime-only fields that are not persisted.
 */
export type RuntimePlan = Plan & {
	_specStale?: boolean;
	_specStaleReason?: string;
};

/**
 * Find the first phase that is in progress.
 * @param phases - Array of phases
 * @returns Phase number of first in-progress phase, or first phase if none
 */
export function findFirstActivePhase(phases: Phase[]): number | undefined {
	const inProgressPhase = phases.find((p) => p.status === 'in_progress');
	if (inProgressPhase) {
		return inProgressPhase.id;
	}
	return phases[0]?.id;
}

/**
 * Get the current phase from a plan, with fallback inference.
 * @param plan - The plan object
 * @returns The current phase number, or inferred value, or 1 as last resort
 */
export function getCurrentPhase(plan: Plan): number {
	return plan.current_phase ?? findFirstActivePhase(plan.phases) ?? 1;
}
