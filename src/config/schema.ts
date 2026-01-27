import { z } from 'zod';

// Agent override configuration
export const AgentOverrideConfigSchema = z.object({
	model: z.string().optional(),
	temperature: z.number().min(0).max(2).optional(),
	disabled: z.boolean().optional(),
});

export type AgentOverrideConfig = z.infer<typeof AgentOverrideConfigSchema>;

// Preset schema (maps agent names to overrides)
export const PresetSchema = z.record(z.string(), AgentOverrideConfigSchema);

export type Preset = z.infer<typeof PresetSchema>;

// Swarm mode
export const SwarmModeSchema = z.enum(['remote', 'hybrid']);

export type SwarmMode = z.infer<typeof SwarmModeSchema>;

// Main plugin configuration
export const PluginConfigSchema = z.object({
	// Preset selection
	preset: z.string().optional(),
	presets: z.record(z.string(), PresetSchema).optional(),

	// Per-agent overrides (including _sme and _qa category defaults)
	agents: z.record(z.string(), AgentOverrideConfigSchema).optional(),

	// Pipeline settings
	max_iterations: z.number().min(1).max(10).default(5),
	output_dir: z.string().optional(),

	// Swarm execution mode
	swarm_mode: SwarmModeSchema.default('remote'),

	// Local model endpoints (for hybrid mode)
	gpu_url: z.string().optional(),
	gpu_model: z.string().optional(),
	npu_url: z.string().optional(),
	npu_model: z.string().optional(),

	// Fallback model chains
	global_fallback_models: z.array(z.string()).optional(),

	// Feature flags
	auto_detect_domains: z.boolean().default(true),
	inject_phase_reminders: z.boolean().default(true),
});

export type PluginConfig = z.infer<typeof PluginConfigSchema>;

// Re-export types from constants
export type {
	AgentName,
	SMEAgentName,
	QAAgentName,
	PipelineAgentName,
} from './constants';
