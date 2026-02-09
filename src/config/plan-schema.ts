import { z } from 'zod';

// Task status enum
export const TaskStatusSchema = z.enum([
	'pending',
	'in_progress',
	'completed',
	'blocked',
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
	'blocked',
]);
export type PhaseStatus = z.infer<typeof PhaseStatusSchema>;

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
});
export type Phase = z.infer<typeof PhaseSchema>;

// Plan schema (top-level)
export const PlanSchema = z.object({
	schema_version: z.literal('1.0.0'),
	title: z.string().min(1),
	swarm: z.string().min(1),
	current_phase: z.number().int().min(1),
	phases: z.array(PhaseSchema).min(1),
	migration_status: MigrationStatusSchema.optional(), // only set when migrated from legacy
});
export type Plan = z.infer<typeof PlanSchema>;
