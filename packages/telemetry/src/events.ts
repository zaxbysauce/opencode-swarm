import { z } from 'zod';
import { TELEMETRY_SCHEMA_VERSION } from './version';

export const SwarmEventBaseSchema = z.object({
	type: z.string(),
	timestamp: z.string().datetime(),
	sessionId: z.string(),
	version: z.string().default(TELEMETRY_SCHEMA_VERSION),
});
export type SwarmEventBase = z.infer<typeof SwarmEventBaseSchema>;

// 1. session_metadata — emitted once on EventWriter construction
export const SessionMetadataEventSchema = SwarmEventBaseSchema.extend({
	type: z.literal('session_metadata'),
	swarmDir: z.string(),
	pid: z.number().int(),
	platform: z.string(),
	nodeVersion: z.string(),
});
export type SessionMetadataEvent = z.infer<typeof SessionMetadataEventSchema>;

// 2. delegation_start — emitted when architect delegates to a subagent
export const DelegationStartEventSchema = SwarmEventBaseSchema.extend({
	type: z.literal('delegation_start'),
	taskId: z.string().nullable(),
	targetAgent: z.string(),
	prompt: z.string().optional(),
});
export type DelegationStartEvent = z.infer<typeof DelegationStartEventSchema>;

// 3. delegation_end — emitted when subagent delegation completes
export const DelegationEndEventSchema = SwarmEventBaseSchema.extend({
	type: z.literal('delegation_end'),
	taskId: z.string().nullable(),
	targetAgent: z.string(),
	durationMs: z.number().int().nonnegative().optional(),
	verdict: z.string().optional(),
});
export type DelegationEndEvent = z.infer<typeof DelegationEndEventSchema>;

// 4. agent_status — emitted on agent session start/activity
export const AgentStatusEventSchema = SwarmEventBaseSchema.extend({
	type: z.literal('agent_status'),
	agentName: z.string(),
	status: z.enum(['active', 'idle', 'complete']),
	worktreeId: z.string().optional(),
});
export type AgentStatusEvent = z.infer<typeof AgentStatusEventSchema>;

// 5. token_usage — emitted to track LLM token consumption
export const TokenUsageEventSchema = SwarmEventBaseSchema.extend({
	type: z.literal('token_usage'),
	agentName: z.string(),
	inputTokens: z.number().int().nonnegative(),
	outputTokens: z.number().int().nonnegative(),
	model: z.string().optional(),
});
export type TokenUsageEvent = z.infer<typeof TokenUsageEventSchema>;

// 6. tool_invocation — emitted when a tool is called
export const ToolInvocationEventSchema = SwarmEventBaseSchema.extend({
	type: z.literal('tool_invocation'),
	toolName: z.string(),
	taskId: z.string().nullable(),
	durationMs: z.number().int().nonnegative().optional(),
	success: z.boolean().optional(),
});
export type ToolInvocationEvent = z.infer<typeof ToolInvocationEventSchema>;

// 7. gate_evaluation — emitted when a QA gate is evaluated
export const GateEvaluationEventSchema = SwarmEventBaseSchema.extend({
	type: z.literal('gate_evaluation'),
	taskId: z.string(),
	gate: z.string(),
	verdict: z.enum(['pass', 'fail', 'skip']),
	reason: z.string().optional(),
});
export type GateEvaluationEvent = z.infer<typeof GateEvaluationEventSchema>;

// 8. file_reservation — emitted when a file scope is declared/locked
export const FileReservationEventSchema = SwarmEventBaseSchema.extend({
	type: z.literal('file_reservation'),
	taskId: z.string(),
	files: z.array(z.string()),
	action: z.enum(['reserve', 'release']),
	worktreeId: z.string().optional(),
});
export type FileReservationEvent = z.infer<typeof FileReservationEventSchema>;

// 9. phase_transition — emitted on phase start/complete
export const PhaseTransitionEventSchema = SwarmEventBaseSchema.extend({
	type: z.literal('phase_transition'),
	phase: z.number().int().positive(),
	transition: z.enum(['start', 'complete']),
	taskCount: z.number().int().nonnegative().optional(),
});
export type PhaseTransitionEvent = z.infer<typeof PhaseTransitionEventSchema>;

// 10. file_touch — emitted when a file is modified by a coder task
export const FileTouchEventSchema = SwarmEventBaseSchema.extend({
	type: z.literal('file_touch'),
	taskId: z.string().nullable(),
	filePath: z.string(),
	operation: z.enum(['write', 'delete', 'rename']),
});
export type FileTouchEvent = z.infer<typeof FileTouchEventSchema>;

// 11. state_file_update — emitted when .swarm/ state files are written
export const StateFileUpdateEventSchema = SwarmEventBaseSchema.extend({
	type: z.literal('state_file_update'),
	filePath: z.string(),
	fileType: z.enum(['plan_json', 'plan_md', 'context_md', 'evidence', 'other']),
});
export type StateFileUpdateEvent = z.infer<typeof StateFileUpdateEventSchema>;

// 12. parallel_wave_start — emitted when a parallel wave of tasks begins
export const ParallelWaveStartEventSchema = SwarmEventBaseSchema.extend({
	type: z.literal('parallel_wave_start'),
	waveIndex: z.number().int().nonnegative(),
	totalWaves: z.number().int().positive(),
	taskIds: z.array(z.string()),
});
export type ParallelWaveStartEvent = z.infer<
	typeof ParallelWaveStartEventSchema
>;

// 13. parallel_wave_end — emitted when a parallel wave of tasks completes
export const ParallelWaveEndEventSchema = SwarmEventBaseSchema.extend({
	type: z.literal('parallel_wave_end'),
	waveIndex: z.number().int().nonnegative(),
	outcomes: z.array(
		z.object({
			taskId: z.string(),
			success: z.boolean(),
		}),
	),
	mergeConflicts: z.number().int().nonnegative(),
});
export type ParallelWaveEndEvent = z.infer<typeof ParallelWaveEndEventSchema>;

// Discriminated union of all event types
export const SwarmEventSchema = z.discriminatedUnion('type', [
	SessionMetadataEventSchema,
	DelegationStartEventSchema,
	DelegationEndEventSchema,
	AgentStatusEventSchema,
	TokenUsageEventSchema,
	ToolInvocationEventSchema,
	GateEvaluationEventSchema,
	FileReservationEventSchema,
	PhaseTransitionEventSchema,
	FileTouchEventSchema,
	StateFileUpdateEventSchema,
	ParallelWaveStartEventSchema,
	ParallelWaveEndEventSchema,
]);
export type SwarmEvent = z.infer<typeof SwarmEventSchema>;
