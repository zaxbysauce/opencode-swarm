import { z } from 'zod';

// Agent override configuration
export const AgentOverrideConfigSchema = z.object({
	model: z.string().optional(),
	temperature: z.number().min(0).max(2).optional(),
	disabled: z.boolean().optional(),
});

export type AgentOverrideConfig = z.infer<typeof AgentOverrideConfigSchema>;

// Swarm configuration (a complete set of agent overrides)
export const SwarmConfigSchema = z.object({
	name: z.string().optional(), // Display name (e.g., "Cloud", "Local")
	agents: z.record(z.string(), AgentOverrideConfigSchema).optional(),
});

export type SwarmConfig = z.infer<typeof SwarmConfigSchema>;

// Hook feature flags
export const HooksConfigSchema = z.object({
	system_enhancer: z.boolean().default(true),
	compaction: z.boolean().default(true),
	agent_activity: z.boolean().default(true),
	delegation_tracker: z.boolean().default(false),
	agent_awareness_max_chars: z.number().min(50).max(2000).default(300),
});

export type HooksConfig = z.infer<typeof HooksConfigSchema>;

// Context budget configuration
export const ContextBudgetConfigSchema = z.object({
	enabled: z.boolean().default(true),
	warn_threshold: z.number().min(0).max(1).default(0.7),
	critical_threshold: z.number().min(0).max(1).default(0.9),
	model_limits: z
		.record(z.string(), z.number().min(1000))
		.default({ default: 128000 }),
});

export type ContextBudgetConfig = z.infer<typeof ContextBudgetConfigSchema>;

// Evidence retention configuration
export const EvidenceConfigSchema = z.object({
	enabled: z.boolean().default(true),
	max_age_days: z.number().min(1).max(365).default(90),
	max_bundles: z.number().min(10).max(10000).default(1000),
	auto_archive: z.boolean().default(false),
});

export type EvidenceConfig = z.infer<typeof EvidenceConfigSchema>;

// Guardrails configuration
export const GuardrailsConfigSchema = z.object({
	enabled: z.boolean().default(true),
	max_tool_calls: z.number().min(10).max(1000).default(200),
	max_duration_minutes: z.number().min(1).max(120).default(30),
	max_repetitions: z.number().min(3).max(50).default(10),
	max_consecutive_errors: z.number().min(2).max(20).default(5),
	warning_threshold: z.number().min(0.1).max(0.9).default(0.5),
});

export type GuardrailsConfig = z.infer<typeof GuardrailsConfigSchema>;

// Main plugin configuration
export const PluginConfigSchema = z.object({
	// Legacy: Per-agent overrides (default swarm)
	agents: z.record(z.string(), AgentOverrideConfigSchema).optional(),

	// Multiple swarms support
	// Keys are swarm IDs (e.g., "cloud", "local", "fast")
	// First swarm or one named "default" becomes the primary architect
	swarms: z.record(z.string(), SwarmConfigSchema).optional(),

	// Pipeline settings
	max_iterations: z.number().min(1).max(10).default(5),

	// QA workflow settings
	qa_retry_limit: z.number().min(1).max(10).default(3),

	// Feature flags
	inject_phase_reminders: z.boolean().default(true),

	// Hook configuration
	hooks: HooksConfigSchema.optional(),

	// Context budget configuration
	context_budget: ContextBudgetConfigSchema.optional(),

	// Guardrails configuration
	guardrails: GuardrailsConfigSchema.optional(),

	// Evidence configuration
	evidence: EvidenceConfigSchema.optional(),
});

export type PluginConfig = z.infer<typeof PluginConfigSchema>;

// Re-export types from constants
export type {
	AgentName,
	PipelineAgentName,
	QAAgentName,
} from './constants';
