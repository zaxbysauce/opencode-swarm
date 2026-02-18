import { z } from 'zod';
import { ALL_AGENT_NAMES } from './constants';

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
	delegation_gate: z.boolean().default(true),
	delegation_max_chars: z.number().min(500).max(20000).default(4000),
});

export type HooksConfig = z.infer<typeof HooksConfigSchema>;

// Scoring weights configuration
export const ScoringWeightsSchema = z.object({
	phase: z.number().min(0).max(5).default(1.0),
	current_task: z.number().min(0).max(5).default(2.0),
	blocked_task: z.number().min(0).max(5).default(1.5),
	recent_failure: z.number().min(0).max(5).default(2.5),
	recent_success: z.number().min(0).max(5).default(0.5),
	evidence_presence: z.number().min(0).max(5).default(1.0),
	decision_recency: z.number().min(0).max(5).default(1.5),
	dependency_proximity: z.number().min(0).max(5).default(1.0),
});

export type ScoringWeights = z.infer<typeof ScoringWeightsSchema>;

// Decision decay configuration
export const DecisionDecaySchema = z.object({
	mode: z.enum(['linear', 'exponential']).default('exponential'),
	half_life_hours: z.number().min(1).max(168).default(24),
});

export type DecisionDecay = z.infer<typeof DecisionDecaySchema>;

// Token ratios configuration
export const TokenRatiosSchema = z.object({
	prose: z.number().min(0.1).max(1.0).default(0.25),
	code: z.number().min(0.1).max(1.0).default(0.4),
	markdown: z.number().min(0.1).max(1.0).default(0.3),
	json: z.number().min(0.1).max(1.0).default(0.35),
});

export type TokenRatios = z.infer<typeof TokenRatiosSchema>;

// Scoring configuration
export const ScoringConfigSchema = z.object({
	enabled: z.boolean().default(false),
	max_candidates: z.number().min(10).max(500).default(100),
	weights: ScoringWeightsSchema.optional(),
	decision_decay: DecisionDecaySchema.optional(),
	token_ratios: TokenRatiosSchema.optional(),
});

export type ScoringConfig = z.infer<typeof ScoringConfigSchema>;

// Context budget configuration
export const ContextBudgetConfigSchema = z.object({
	enabled: z.boolean().default(true),
	warn_threshold: z.number().min(0).max(1).default(0.7),
	critical_threshold: z.number().min(0).max(1).default(0.9),
	model_limits: z
		.record(z.string(), z.number().min(1000))
		.default({ default: 128000 }),
	max_injection_tokens: z.number().min(100).max(50000).default(4000),
	scoring: ScoringConfigSchema.optional(),
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

// Summary configuration (reversible summaries for oversized tool outputs)
export const SummaryConfigSchema = z.object({
	enabled: z.boolean().default(true),
	threshold_bytes: z.number().min(1024).max(1048576).default(20480),
	max_summary_chars: z.number().min(100).max(5000).default(1000),
	max_stored_bytes: z.number().min(10240).max(104857600).default(10485760),
	retention_days: z.number().min(1).max(365).default(7),
});

export type SummaryConfig = z.infer<typeof SummaryConfigSchema>;

// Review passes configuration (dual-pass security review)
export const ReviewPassesConfigSchema = z.object({
	always_security_review: z.boolean().default(false),
	security_globs: z
		.array(z.string())
		.default([
			'**/auth/**',
			'**/api/**',
			'**/crypto/**',
			'**/security/**',
			'**/middleware/**',
			'**/session/**',
			'**/token/**',
		]),
});

export type ReviewPassesConfig = z.infer<typeof ReviewPassesConfigSchema>;

// Integration analysis configuration
export const IntegrationAnalysisConfigSchema = z.object({
	enabled: z.boolean().default(true),
});

export type IntegrationAnalysisConfig = z.infer<
	typeof IntegrationAnalysisConfigSchema
>;

// Guardrails profile (per-agent overrides - all fields optional)
export const GuardrailsProfileSchema = z.object({
	max_tool_calls: z.number().min(0).max(1000).optional(),
	max_duration_minutes: z.number().min(0).max(480).optional(),
	max_repetitions: z.number().min(3).max(50).optional(),
	max_consecutive_errors: z.number().min(2).max(20).optional(),
	warning_threshold: z.number().min(0.1).max(0.9).optional(),
	idle_timeout_minutes: z.number().min(5).max(240).optional(),
});

export type GuardrailsProfile = z.infer<typeof GuardrailsProfileSchema>;

export const DEFAULT_AGENT_PROFILES: Record<string, GuardrailsProfile> = {
	architect: {
		max_tool_calls: 0,
		max_duration_minutes: 0,
		max_consecutive_errors: 8,
		warning_threshold: 0.75,
	},
	coder: {
		max_tool_calls: 400,
		max_duration_minutes: 45,
		warning_threshold: 0.85,
	},
	test_engineer: {
		max_tool_calls: 400,
		max_duration_minutes: 45,
		warning_threshold: 0.85,
	},
	explorer: {
		max_tool_calls: 150,
		max_duration_minutes: 20,
		warning_threshold: 0.75,
	},
	reviewer: {
		max_tool_calls: 200,
		max_duration_minutes: 30,
		warning_threshold: 0.65,
	},
	critic: {
		max_tool_calls: 200,
		max_duration_minutes: 30,
		warning_threshold: 0.65,
	},
	sme: {
		max_tool_calls: 200,
		max_duration_minutes: 30,
		warning_threshold: 0.65,
	},
};

/** @deprecated Use DEFAULT_AGENT_PROFILES.architect instead */
export const DEFAULT_ARCHITECT_PROFILE = DEFAULT_AGENT_PROFILES.architect;

// Guardrails configuration
export const GuardrailsConfigSchema = z.object({
	enabled: z.boolean().default(true),
	max_tool_calls: z.number().min(0).max(1000).default(200),
	max_duration_minutes: z.number().min(0).max(480).default(30),
	max_repetitions: z.number().min(3).max(50).default(10),
	max_consecutive_errors: z.number().min(2).max(20).default(5),
	warning_threshold: z.number().min(0.1).max(0.9).default(0.75),
	idle_timeout_minutes: z.number().min(5).max(240).default(60),
	profiles: z.record(z.string(), GuardrailsProfileSchema).optional(),
});

export type GuardrailsConfig = z.infer<typeof GuardrailsConfigSchema>;

/**
 * Normalize an agent name for comparison (lowercase + consistent separators).
 * Converts hyphens and spaces to underscores for consistent matching.
 */
function normalizeAgentName(name: string): string {
	return name.toLowerCase().replace(/[-\s]+/g, '_');
}

/**
 * Strip any swarm prefix from an agent name to get the base agent name.
 * Works with any swarm name by checking if the name (or suffix after removing
 * a prefix) matches a known agent name from ALL_AGENT_NAMES.
 *
 * Normalization handles:
 * - Case-insensitive matching (e.g., "PAID_ARCHITECT" → "architect")
 * - Multiple separators: underscore, hyphen, space (e.g., "paid-architect", "paid architect")
 *
 * Examples: 'local_architect' → 'architect', 'enterprise_coder' → 'coder',
 *           'paid-architect' → 'architect', 'PAID_ARCHITECT' → 'architect',
 *           'architect' → 'architect', 'unknown_thing' → 'unknown_thing'
 *
 * @param name - The agent name (possibly prefixed)
 * @returns The base agent name if recognized, or the original name
 */
export function stripKnownSwarmPrefix(name: string): string {
	if (!name) return name;
	// If the name itself is a known agent name (exact match), return as-is
	if ((ALL_AGENT_NAMES as readonly string[]).includes(name)) return name;
	// Normalize the input name for flexible matching
	const normalized = normalizeAgentName(name);
	// Check each known agent name
	for (const agentName of ALL_AGENT_NAMES) {
		const normalizedAgent = normalizeAgentName(agentName);
		// Direct normalized match (name IS a known agent)
		if (normalized === normalizedAgent) return agentName;
		// Suffix match: check if normalized name ends with _<knownAgentName>
		// This handles underscore, hyphen, and space separators uniformly
		// after normalization to underscore
		if (normalized.endsWith('_' + normalizedAgent)) {
			return agentName;
		}
	}
	return name;
}

/**
 * Resolve guardrails configuration for a specific agent.
 * Merges the base config with built-in agent-type defaults and
 * any per-agent profile overrides. Merge order: base < built-in < user profile.
 *
 * @param base - The base guardrails configuration
 * @param agentName - Optional agent name to look up profile overrides
 * @returns The effective guardrails configuration for the agent
 */
export function resolveGuardrailsConfig(
	base: GuardrailsConfig,
	agentName?: string,
): GuardrailsConfig {
	if (!agentName) {
		return base;
	}

	// Strip known swarm prefixes to get the base agent name
	const baseName = stripKnownSwarmPrefix(agentName);

	// Belt-and-suspenders: if no built-in profile matches, do NOT fall back to architect
	// (that would exempt unknown agents from guardrails). Unknown agents get base config.
	const builtInLookup = DEFAULT_AGENT_PROFILES[baseName];

	// Layer 1: Apply built-in defaults for the agent (if known)
	const builtIn = builtInLookup;

	// Layer 2: Apply user-defined profile overrides (highest priority)
	// Check base name first, then original name for backwards compatibility
	const userProfile = base.profiles?.[baseName] ?? base.profiles?.[agentName];

	if (!builtIn && !userProfile) {
		return base;
	}

	return { ...base, ...builtIn, ...userProfile };
}

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

	// Summary configuration
	summaries: SummaryConfigSchema.optional(),

	// Review passes configuration (dual-pass security review)
	review_passes: ReviewPassesConfigSchema.optional(),

	// Integration analysis configuration
	integration_analysis: IntegrationAnalysisConfigSchema.optional(),

	// Internal: tracks whether config was loaded from file or is fallback defaults
	_loadedFromFile: z.boolean().default(false),
});

export type PluginConfig = z.infer<typeof PluginConfigSchema>;

// Re-export types from constants
export type {
	AgentName,
	PipelineAgentName,
	QAAgentName,
} from './constants';
