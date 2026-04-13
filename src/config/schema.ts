import { z } from 'zod';
import { ALL_AGENT_NAMES } from './constants';

// Known Swarm prefixes for multi-tenant/variant agent names
// These are stripped to get the canonical agent name
const KNOWN_SWARM_PREFIXES = [
	'paid',
	'local',
	'cloud',
	'enterprise',
	'mega',
	'default',
	'custom',
	'team',
	'project',
	'swarm',
	'synthetic',
];

// Supported separators between prefix and agent name
const SEPARATORS = ['_', '-', ' '];

/**
 * Strips known Swarm prefixes from agent names to get the canonical agent name.
 *
 * Strategy:
 * 1. First try stripping known prefixes from the front (e.g., 'paid_architect' -> 'architect')
 * 2. If that doesn't yield a known agent, check if the name ENDS with a known agent name
 *    (e.g., 'not-an-architect' -> 'architect', 'team-alpha-reviewer' -> 'reviewer')
 *
 * Supports underscore, hyphen, and space separators.
 * Case-insensitive matching, but returns the canonical lowercase agent name.
 *
 * @param agentName - The potentially prefixed agent name
 * @returns The canonical agent name, or the original if no known agent found
 */
export function stripKnownSwarmPrefix(agentName: string): string {
	if (!agentName) return agentName;

	const normalized = agentName.toLowerCase();

	// Strategy 1: Strip known prefixes from the front
	let stripped = normalized;
	let previous = '';

	while (stripped !== previous) {
		previous = stripped;
		for (const prefix of KNOWN_SWARM_PREFIXES) {
			for (const sep of SEPARATORS) {
				const prefixWithSep = prefix + sep;
				if (stripped.startsWith(prefixWithSep)) {
					stripped = stripped.slice(prefixWithSep.length);
					break;
				}
			}
			if (stripped !== previous) break;
		}
	}

	// Check if stripped result is a known agent name
	if ((ALL_AGENT_NAMES as readonly string[]).includes(stripped)) {
		return stripped;
	}

	// Strategy 2: Check if the name ENDS with a known agent name (with separator)
	for (const agent of ALL_AGENT_NAMES) {
		for (const sep of SEPARATORS) {
			const suffix = sep + agent;
			if (normalized.endsWith(suffix)) {
				return agent;
			}
		}
		// Also check if it exactly equals an agent name (already handled but for completeness)
		if (normalized === agent) {
			return agent;
		}
	}

	// Return original if no known agent found
	return agentName;
}

// Agent override configuration
export const AgentOverrideConfigSchema = z.object({
	model: z.string().optional(),
	temperature: z.number().min(0).max(2).optional(),
	disabled: z.boolean().optional(),
	fallback_models: z.array(z.string()).max(3).optional(),
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
	tracked_agents: z.array(z.string()).default(['architect']),
	scoring: ScoringConfigSchema.optional(),
	enforce: z.boolean().default(true),
	prune_target: z.number().min(0).max(1).default(0.7),
	preserve_last_n_turns: z.number().min(0).max(100).default(4),
	recent_window: z.number().min(1).max(100).default(10),
	enforce_on_agent_switch: z.boolean().default(true),
	tool_output_mask_threshold: z.number().min(100).max(100000).default(2000),
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

// Gate configuration (new local-only quality/anti-slop flags)
export const GateFeatureSchema = z.object({
	enabled: z.boolean().default(true),
});

export type GateFeature = z.infer<typeof GateFeatureSchema>;

// Placeholder scan configuration (extends GateFeatureSchema with placeholder-specific settings)
export const PlaceholderScanConfigSchema = GateFeatureSchema.extend({
	deny_patterns: z
		.array(z.string())
		.default([
			'TODO',
			'FIXME',
			'TBD',
			'XXX',
			'placeholder',
			'stub',
			'wip',
			'not implemented',
		]),
	allow_globs: z
		.array(z.string())
		.default([
			'docs/**',
			'examples/**',
			'tests/**',
			'**/*.test.*',
			'**/*.spec.*',
			'**/mocks/**',
			'**/__tests__/**',
		]),
	max_allowed_findings: z.number().min(0).default(0),
});

export type PlaceholderScanConfig = z.infer<typeof PlaceholderScanConfigSchema>;

// Quality budget configuration (extends GateFeatureSchema with quality thresholds)
export const QualityBudgetConfigSchema = GateFeatureSchema.extend({
	max_complexity_delta: z.number().default(5),
	max_public_api_delta: z.number().default(10),
	max_duplication_ratio: z.number().default(0.05),
	min_test_to_code_ratio: z.number().default(0.3),
	enforce_on_globs: z.array(z.string()).default(['src/**']),
	exclude_globs: z
		.array(z.string())
		.default(['docs/**', 'tests/**', '**/*.test.*']),
});

export type QualityBudgetConfig = z.infer<typeof QualityBudgetConfigSchema>;

export const GateConfigSchema = z.object({
	syntax_check: GateFeatureSchema.default({ enabled: true }),
	placeholder_scan: PlaceholderScanConfigSchema.default({
		enabled: true,
		deny_patterns: [
			'TODO',
			'FIXME',
			'TBD',
			'XXX',
			'placeholder',
			'stub',
			'wip',
			'not implemented',
		],
		allow_globs: [
			'docs/**',
			'examples/**',
			'tests/**',
			'**/*.test.*',
			'**/*.spec.*',
			'**/mocks/**',
			'**/__tests__/**',
		],
		max_allowed_findings: 0,
	}),
	sast_scan: GateFeatureSchema.default({ enabled: true }),
	sbom_generate: GateFeatureSchema.default({ enabled: true }),
	build_check: GateFeatureSchema.default({ enabled: true }),
	quality_budget: QualityBudgetConfigSchema,
});

export type GateConfig = z.infer<typeof GateConfigSchema>;

// Pipeline configuration (parallel execution settings)
export const PipelineConfigSchema = z.object({
	parallel_precheck: z.boolean().default(true),
});

export type PipelineConfig = z.infer<typeof PipelineConfigSchema>;

// Phase complete configuration (phase completion gate settings)
export const PhaseCompleteConfigSchema = z.object({
	enabled: z.boolean().default(true),
	required_agents: z
		.array(z.enum(['coder', 'reviewer', 'test_engineer']))
		.default(['coder', 'reviewer', 'test_engineer']),
	require_docs: z.boolean().default(true),
	policy: z.enum(['enforce', 'warn']).default('enforce'),
	regression_sweep: z
		.object({
			enforce: z.boolean().default(false),
		})
		.optional(),
});

export type PhaseCompleteConfig = z.infer<typeof PhaseCompleteConfigSchema>;

// Summary configuration (reversible summaries for oversized tool outputs)
export const SummaryConfigSchema = z.object({
	enabled: z.boolean().default(true),
	threshold_bytes: z.number().min(1024).max(1048576).default(102400),
	max_summary_chars: z.number().min(100).max(5000).default(1000),
	max_stored_bytes: z.number().min(10240).max(104857600).default(10485760),
	retention_days: z.number().min(1).max(365).default(7),
	exempt_tools: z
		.array(z.string())
		.default(['retrieve_summary', 'task', 'read']),
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

// Adversarial detection configuration (same-model adversarial detection)
export const AdversarialDetectionConfigSchema = z.object({
	enabled: z.boolean().default(true),
	policy: z.enum(['warn', 'gate', 'ignore']).default('warn'),
	pairs: z
		.array(z.tuple([z.string(), z.string()]))
		.default([['coder', 'reviewer']]),
});

export type AdversarialDetectionConfig = z.infer<
	typeof AdversarialDetectionConfigSchema
>;

// Adversarial testing configuration (cross-model adversarial testing for task evaluation)
// Uses .default({}) with inner field defaults to preserve current all-task adversarial behavior when config is absent
export type AdversarialTestingConfig = {
	enabled: boolean;
	scope: 'all' | 'security-only';
};

const AdversarialTestingConfigSchemaBase = z.object({
	enabled: z.boolean().default(true),
	scope: z.enum(['all', 'security-only']).default('all'),
});

export const AdversarialTestingConfigSchema: z.ZodType<AdversarialTestingConfig> =
	AdversarialTestingConfigSchemaBase.default(() => ({
		enabled: true,
		scope: 'all' as const,
	}));

// Integration analysis configuration
export const IntegrationAnalysisConfigSchema = z.object({
	enabled: z.boolean().default(true),
});

export type IntegrationAnalysisConfig = z.infer<
	typeof IntegrationAnalysisConfigSchema
>;

// Documentation synthesizer configuration
export const DocsConfigSchema = z.object({
	enabled: z.boolean().default(true),
	doc_patterns: z
		.array(z.string())
		.default([
			'README.md',
			'CONTRIBUTING.md',
			'docs/**/*.md',
			'docs/**/*.rst',
			'**/CHANGELOG.md',
		]),
});

export type DocsConfig = z.infer<typeof DocsConfigSchema>;

// UI/UX review configuration (designer agent — opt-in)
export const UIReviewConfigSchema = z.object({
	enabled: z.boolean().default(false),
	trigger_paths: z
		.array(z.string())
		.default([
			'**/pages/**',
			'**/components/**',
			'**/views/**',
			'**/screens/**',
			'**/ui/**',
			'**/layouts/**',
		]),
	trigger_keywords: z
		.array(z.string())
		.default([
			'new page',
			'new screen',
			'new component',
			'redesign',
			'layout change',
			'form',
			'modal',
			'dialog',
			'dropdown',
			'sidebar',
			'navbar',
			'dashboard',
			'landing page',
			'signup',
			'login form',
			'settings page',
			'profile page',
		]),
});

export type UIReviewConfig = z.infer<typeof UIReviewConfigSchema>;

// Compaction advisory configuration (soft hints at tool-call thresholds)
export const CompactionAdvisoryConfigSchema = z.object({
	enabled: z.boolean().default(true),
	thresholds: z
		.array(z.number().int().min(10).max(500))
		.default([50, 75, 100, 125, 150]),
	message: z
		.string()
		.default(
			'[SWARM HINT] Session has ' +
				'$' +
				'{totalToolCalls} tool calls. Consider compacting at next phase boundary to maintain context quality.',
		),
});

export type CompactionAdvisoryConfig = z.infer<
	typeof CompactionAdvisoryConfigSchema
>;

// Lint configuration
export const LintConfigSchema = z.object({
	enabled: z.boolean().default(true),
	mode: z.enum(['check', 'fix']).default('check'),
	linter: z.enum(['biome', 'eslint', 'auto']).default('auto'),
	patterns: z
		.array(z.string())
		.default([
			'**/*.{ts,tsx,js,jsx,mjs,cjs}',
			'**/biome.json',
			'**/biome.jsonc',
		]),
	exclude: z
		.array(z.string())
		.default([
			'**/node_modules/**',
			'**/dist/**',
			'**/.git/**',
			'**/coverage/**',
			'**/*.min.js',
		]),
});

export type LintConfig = z.infer<typeof LintConfigSchema>;

// Secretscan configuration
export const SecretscanConfigSchema = z.object({
	enabled: z.boolean().default(true),
	patterns: z
		.array(z.string())
		.default([
			'**/*.{env,properties,yml,yaml,json,js,ts}',
			'**/.env*',
			'**/secrets/**',
			'**/credentials/**',
			'**/config/**/*.ts',
			'**/config/**/*.js',
		]),
	exclude: z
		.array(z.string())
		.default([
			'**/node_modules/**',
			'**/dist/**',
			'**/.git/**',
			'**/coverage/**',
			'**/test/**',
			'**/tests/**',
			'**/__tests__/**',
			'**/*.test.ts',
			'**/*.test.js',
			'**/*.spec.ts',
			'**/*.spec.js',
		]),
	extensions: z
		.array(z.string())
		.default([
			'.env',
			'.properties',
			'.yml',
			'.yaml',
			'.json',
			'.js',
			'.ts',
			'.py',
			'.rb',
			'.go',
			'.java',
			'.cs',
			'.php',
		]),
});

export type SecretscanConfig = z.infer<typeof SecretscanConfigSchema>;

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
	docs: {
		max_tool_calls: 200,
		max_duration_minutes: 30,
		warning_threshold: 0.75,
	},
	designer: {
		max_tool_calls: 150,
		max_duration_minutes: 20,
		warning_threshold: 0.75,
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
	no_op_warning_threshold: z.number().min(1).max(100).default(15),
	max_coder_revisions: z.number().int().min(1).max(20).default(5),
	runaway_output_max_turns: z.number().int().min(1).max(20).default(5),
	qa_gates: z
		.object({
			required_tools: z
				.array(z.string().min(1))
				.default([
					'diff',
					'syntax_check',
					'placeholder_scan',
					'lint',
					'pre_check_batch',
				]),
			require_reviewer_test_engineer: z.boolean().default(true),
		})
		.optional(),
	profiles: z.record(z.string(), GuardrailsProfileSchema).optional(),
	block_destructive_commands: z.boolean().default(true),
});

export type GuardrailsConfig = z.infer<typeof GuardrailsConfigSchema>;

// ─── Watchdog configuration ───────────────────────────────────────────────
export const WatchdogConfigSchema = z.object({
	/** Enable scope-guard hook. Blocks non-architect agents writing outside declared scope. Default: true */
	scope_guard: z.boolean().default(true),
	/** Allow scope-guard to be skipped in turbo mode. Default: false (NOT skippable) */
	skip_in_turbo: z.boolean().default(false),
	/** Enable delegation-ledger hook. Injects DELEGATION SUMMARY on architect resume. Default: true */
	delegation_ledger: z.boolean().default(true),
});

export type WatchdogConfig = z.infer<typeof WatchdogConfigSchema>;

// ─── Self-review configuration ────────────────────────────────────────────
export const SelfReviewConfigSchema = z.object({
	/** Enable self-review advisory after task marked in_progress. Default: true */
	enabled: z.boolean().default(true),
	/** Skip self-review advisory in turbo mode. Default: true */
	skip_in_turbo: z.boolean().default(true),
});
export type SelfReviewConfig = z.infer<typeof SelfReviewConfigSchema>;

/**
 * Resolves guardrails configuration for a specific agent.
 *
 * Resolution order (later values override earlier):
 * 1. Base config values
 * 2. Built-in agent profile defaults from DEFAULT_AGENT_PROFILES (known agents only)
 * 3. User profile overrides - checks in order:
 *    a. config.profiles[originalAgentName] (e.g., 'paid_coder')
 *    b. config.profiles[canonicalName] (e.g., 'coder')
 *
 * For prefixed agent names (e.g., 'local_coder'), strips prefixes using stripKnownSwarmPrefix.
 * Unknown agent names get base config + user profile (NOT architect defaults - prevents bypass).
 *
 * @param config - The base guardrails configuration
 * @param agentName - Optional agent name to resolve profile for
 * @returns Resolved configuration object
 */
export function resolveGuardrailsConfig(
	config: GuardrailsConfig,
	agentName?: string,
): GuardrailsConfig {
	// No agent name provided - return base config as-is
	if (!agentName) {
		return config;
	}

	// Strip prefixes to get canonical agent name
	const canonicalName = stripKnownSwarmPrefix(agentName);

	// Check if this is a known agent (has built-in profile)
	const hasBuiltInProfile = canonicalName in DEFAULT_AGENT_PROFILES;

	// Check for user profile - try original name first, then canonical name
	// This allows users to define profiles for specific prefixed variants or custom agents
	const userProfile =
		config.profiles?.[agentName] ?? config.profiles?.[canonicalName];

	// Unknown agents: base config + user profile (NOT built-in defaults - prevents bypass)
	if (!hasBuiltInProfile) {
		if (userProfile) {
			return { ...config, ...userProfile };
		}
		return config;
	}

	// Known agents: Get built-in profile
	const builtInProfile = DEFAULT_AGENT_PROFILES[canonicalName];

	// Merge: base config -> built-in profile -> user profile
	const resolved: GuardrailsConfig = {
		...config,
		...builtInProfile,
		...(userProfile || {}),
	};

	return resolved;
}

// Tool filter configuration - controls which tools each agent is allowed to use
// Enables role-scoped tool filtering for plugin-defined agent whitelists
export const ToolFilterConfigSchema = z.object({
	// Enable or disable tool filtering globally
	// When true, agents are restricted to their allowed tool lists
	enabled: z.boolean().default(true),
	// Per-agent tool whitelist overrides
	// Keys are agent names (e.g., "architect", "coder", "reviewer")
	// Values are arrays of allowed tool names
	// Empty array denies all tools for that agent
	// When not specified, agents use default tool assignments
	overrides: z.record(z.string(), z.array(z.string())).default({}),
});

// Type alias for downstream usage
export type ToolFilterConfig = z.infer<typeof ToolFilterConfigSchema>;

// Plan cursor configuration - controls compressed plan summary injection
// Enables efficient context management by injecting concise plan cursor instead of full plan
export const PlanCursorConfigSchema = z.object({
	// Enable or disable plan cursor injection
	// When true, injects compressed plan cursor instead of full phase markdown
	enabled: z.boolean().default(true),
	// Maximum tokens for plan cursor output
	// Typical 10-phase plan should fit under this limit
	max_tokens: z.number().min(500).max(4000).default(1500),
	// Number of lookahead tasks to include in cursor
	// Shows upcoming tasks beyond current task
	lookahead_tasks: z.number().min(0).max(5).default(2),
});

// Type alias for downstream usage
export type PlanCursorConfig = z.infer<typeof PlanCursorConfigSchema>;

// Checkpoint configuration
export const CheckpointConfigSchema = z
	.object({
		enabled: z.boolean().default(true),
		auto_checkpoint_threshold: z.number().int().min(1).max(20).default(3),
	})
	.strict();

export type CheckpointConfig = z.infer<typeof CheckpointConfigSchema>;

// Automation mode enum: controls background-first automation rollout
// - manual: No background automation, all actions via slash commands (v6.6 behavior)
// - hybrid: Background automation for safe operations, slash commands for sensitive ones
// - auto: Full background automation (v6.7 target, not yet fully implemented)
export const AutomationModeSchema = z.enum(['manual', 'hybrid', 'auto']);

export type AutomationMode = z.infer<typeof AutomationModeSchema>;

// Per-capability feature flags for v6.7 automation features
// evidence_auto_summaries, plan_sync, decision_drift_detection default to true (v6.8); phase_preflight defaults to false (triggers actions)
export const AutomationCapabilitiesSchema = z.object({
	// Enable background plan synchronization with external state
	plan_sync: z.boolean().default(true),
	// Enable phase preflight checks before agent execution
	phase_preflight: z.boolean().default(false),
	// Run config doctor on startup to validate/fix configuration
	config_doctor_on_startup: z.boolean().default(false),
	// Enable auto-fix for config doctor (requires config_doctor_on_startup)
	// SECURITY: Defaults to false - autofix requires explicit opt-in
	config_doctor_autofix: z.boolean().default(false),
	// Generate automatic summaries for evidence bundles
	evidence_auto_summaries: z.boolean().default(true),
	// Detect drift between planned and actual decisions
	decision_drift_detection: z.boolean().default(true),
});

export type AutomationCapabilities = z.infer<
	typeof AutomationCapabilitiesSchema
>;

// Top-level automation configuration for v6.7 background-first rollout
// Mode defaults to 'manual' for conservative backward compatibility
const AutomationConfigSchemaBase = z.object({
	mode: AutomationModeSchema.default('manual'),
	capabilities: AutomationCapabilitiesSchema.default({
		plan_sync: true,
		phase_preflight: false,
		config_doctor_on_startup: false,
		config_doctor_autofix: false,
		evidence_auto_summaries: true,
		decision_drift_detection: true,
	}),
});

export type AutomationConfig = z.infer<typeof AutomationConfigSchemaBase>;

// Schema for optional automation field - applies defaults when field is present
export const AutomationConfigSchema: z.ZodType<AutomationConfig> =
	AutomationConfigSchemaBase;

// Knowledge base configuration (v6.17 two-tier cross-project knowledge)
export const KnowledgeConfigSchema = z.object({
	/** Enable/disable the knowledge system entirely */
	enabled: z.boolean().default(true),
	/** Maximum entries to keep in the swarm (per-project) knowledge store */
	swarm_max_entries: z.number().min(1).max(10000).default(100),
	/** Maximum entries to keep in the hive (cross-project) knowledge store */
	hive_max_entries: z.number().min(1).max(100000).default(200),
	/** Days after which a swarm entry is eligible for auto-promotion to hive */
	auto_promote_days: z.number().min(1).max(3650).default(90),
	/** Maximum number of knowledge entries to inject into context per phase */
	max_inject_count: z.number().min(0).max(50).default(5),
	/** Maximum total chars for the entire injection block (preamble + lessons + run memory + rejected warnings). Default: 2000 */
	inject_char_budget: z.number().min(200).max(10_000).default(2_000),
	context_budget_threshold: z.number().int().positive().optional(),
	/** Maximum display chars per lesson at injection time — truncation only, stored lesson is never modified. Default: 120 */
	max_lesson_display_chars: z.number().min(40).max(280).default(120),
	/** Jaccard bigram threshold for near-duplicate detection (0-1) */
	dedup_threshold: z.number().min(0).max(1).default(0.6),
	/** Scope tags to include when filtering lessons for injection */
	scope_filter: z.array(z.string()).default(['global']),
	/** Enable hive (cross-project) tier for reading and promotion */
	hive_enabled: z.boolean().default(true),
	/** Maximum rejected lessons to retain in the rejected log */
	rejected_max_entries: z.number().min(1).max(1000).default(20),
	/** Enable structural/content/semantic validation on new lessons */
	validation_enabled: z.boolean().default(true),
	/** Confidence threshold above which a lesson is treated as evergreen */
	evergreen_confidence: z.number().min(0).max(1).default(0.9),
	/** Utility score above which a lesson is retained without review */
	evergreen_utility: z.number().min(0).max(1).default(0.8),
	/** Utility score below which a lesson is flagged for potential removal */
	low_utility_threshold: z.number().min(0).max(1).default(0.3),
	/** Minimum retrieval events required before utility scoring is applied */
	min_retrievals_for_utility: z.number().min(1).max(100).default(3),
	/** Schema version for the knowledge store format */
	schema_version: z.number().int().min(1).default(1),
	/** Weighted scoring: multiplier for encounters from the source project */
	same_project_weight: z.number().min(0).max(5).default(1.0),
	/** Weighted scoring: multiplier for encounters from other projects */
	cross_project_weight: z.number().min(0).max(5).default(0.5),
	/** Weighted scoring: minimum encounter score floor */
	min_encounter_score: z.number().min(0).max(1).default(0.1),
	/** Weighted scoring: initial score for newly promoted hive entries */
	initial_encounter_score: z.number().min(0).max(5).default(1.0),
	/** Weighted scoring: score increment per encounter */
	encounter_increment: z.number().min(0).max(1).default(0.1),
	/** Weighted scoring: maximum encounter score cap */
	max_encounter_score: z.number().min(1).max(20).default(10.0),
});

export type KnowledgeConfig = z.infer<typeof KnowledgeConfigSchema>;

// Curator configuration (phase context consolidation and drift detection)
export const CuratorConfigSchema = z.object({
	/** Enable curator mode. Default: true */
	enabled: z.boolean().default(true),
	/** Run CURATOR_INIT at session start. Default: true (when curator enabled) */
	init_enabled: z.boolean().default(true),
	/** Run CURATOR_PHASE at phase boundaries. Default: true (when curator enabled) */
	phase_enabled: z.boolean().default(true),
	/** Maximum tokens for curator summary. Default: 2000 */
	max_summary_tokens: z.number().min(500).max(8000).default(2000),
	/** Minimum confidence for knowledge entries to include in curator context. Default: 0.7 */
	min_knowledge_confidence: z.number().min(0).max(1).default(0.7),
	/** Include compliance report in phase digest. Default: true */
	compliance_report: z.boolean().default(true),
	/** Suppress TUI warnings from curator (emit events.jsonl only). Default: true */
	suppress_warnings: z.boolean().default(true),
	/** Maximum chars for drift report summary injected into architect context. Default: 500 */
	drift_inject_max_chars: z.number().min(100).max(2000).default(500),
	/** Timeout in ms for curator LLM delegation calls (session create + prompt + response).
	 *  Must cover ephemeral session creation overhead plus full model response time.
	 *  Default: 300000 (5 minutes). Increase for slower models; decrease for fast local models. */
	llm_timeout_ms: z.number().int().min(5000).max(600000).default(300_000),
});

export type CuratorConfig = z.infer<typeof CuratorConfigSchema>;

// Slop detector configuration (v6.29)
export const SlopDetectorConfigSchema = z.object({
	enabled: z.boolean().default(true),
	classThreshold: z.number().int().min(1).default(3),
	commentStripThreshold: z.number().int().min(1).default(5),
	diffLineThreshold: z.number().int().min(10).default(200),
	importHygieneThreshold: z.number().int().min(1).default(2),
});

export type SlopDetectorConfig = z.infer<typeof SlopDetectorConfigSchema>;

// Incremental verification configuration (v6.29)
export const IncrementalVerifyConfigSchema = z.object({
	enabled: z.boolean().default(true),
	command: z
		.union([z.string(), z.array(z.string())])
		.nullable()
		.default(null),
	timeoutMs: z.number().int().min(1000).max(300000).default(30000),
	triggerAgents: z.array(z.string()).default(['coder']),
});

export type IncrementalVerifyConfig = z.infer<
	typeof IncrementalVerifyConfigSchema
>;

// Compaction service configuration (v6.29)
export const CompactionConfigSchema = z.object({
	enabled: z.boolean().default(true),
	observationThreshold: z.number().min(1).max(99).default(40),
	reflectionThreshold: z.number().min(1).max(99).default(60),
	emergencyThreshold: z.number().min(1).max(99).default(80),
	preserveLastNTurns: z.number().int().min(1).default(5),
});

export type CompactionConfig = z.infer<typeof CompactionConfigSchema>;

// Agent authority rule - describes per-agent file write authority
export const AgentAuthorityRuleSchema = z.object({
	readOnly: z.boolean().optional(),
	blockedExact: z.array(z.string()).optional(),
	allowedExact: z.array(z.string()).optional(),
	blockedPrefix: z.array(z.string()).optional(),
	allowedPrefix: z.array(z.string()).optional(),
	blockedZones: z
		.array(
			z.enum(['production', 'test', 'config', 'generated', 'docs', 'build']),
		)
		.optional(),
	blockedGlobs: z.array(z.string()).optional(),
	allowedGlobs: z.array(z.string()).optional(),
});

export type AgentAuthorityRule = z.infer<typeof AgentAuthorityRuleSchema>;

// Authority configuration - top-level authority config
export const AuthorityConfigSchema = z.object({
	enabled: z.boolean().default(true),
	rules: z.record(z.string(), AgentAuthorityRuleSchema).default({}),
});

export type AuthorityConfig = z.infer<typeof AuthorityConfigSchema>;

// Work Complete Council configuration
// v1 — off by default. When enabled, the architect convenes a parallel four-member
// verification gate (critic, reviewer, sme, test_engineer) before update_task_status
// may advance a task to complete.
export const CouncilConfigSchema = z
	.object({
		enabled: z.boolean().default(false),
		maxRounds: z.number().int().min(1).max(10).default(3),
		parallelTimeoutMs: z.number().int().min(5_000).max(120_000).default(30_000),
		vetoPriority: z.boolean().default(true),
		requireAllMembers: z
			.boolean()
			.default(false)
			.describe(
				'When true, convene_council rejects if fewer than 5 member verdicts are provided.',
			),
		escalateOnMaxRounds: z
			.string()
			.optional()
			.describe(
				'Optional webhook URL or handler name invoked when maxRounds is reached without APPROVE. Declared for forward compatibility; no behavior is implemented yet.',
			),
	})
	.strict();

export type CouncilConfig = z.infer<typeof CouncilConfigSchema>;

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
	pipeline: PipelineConfigSchema.optional(),

	// Phase complete settings
	phase_complete: PhaseCompleteConfigSchema.optional(),

	// QA workflow settings
	qa_retry_limit: z.number().min(1).max(10).default(3),

	// Performance mode — controls optional hook execution overhead
	execution_mode: z.enum(['strict', 'balanced', 'fast']).default('balanced'),

	// Feature flags
	inject_phase_reminders: z.boolean().default(true),

	// Hook configuration
	hooks: HooksConfigSchema.optional(),

	// Quality gate configuration (v6.9 anti-slop features)
	gates: GateConfigSchema.optional(),

	// Context budget configuration
	context_budget: ContextBudgetConfigSchema.optional(),

	// Guardrails configuration
	guardrails: GuardrailsConfigSchema.optional(),

	// Watchdog configuration (scope-guard + delegation-ledger)
	watchdog: WatchdogConfigSchema.optional(),

	// Self-review configuration (advisory after coder delegation)
	self_review: SelfReviewConfigSchema.optional(),

	// Tool filter configuration - controls which tools each agent is allowed to use
	tool_filter: ToolFilterConfigSchema.optional(),

	// Authority configuration - per-agent file write authority rules
	authority: AuthorityConfigSchema.optional(),

	// Plan cursor configuration - controls compressed plan summary injection
	plan_cursor: PlanCursorConfigSchema.optional(),

	// Evidence configuration
	evidence: EvidenceConfigSchema.optional(),

	// Summary configuration
	summaries: SummaryConfigSchema.optional(),

	// Review passes configuration (dual-pass security review)
	review_passes: ReviewPassesConfigSchema.optional(),

	// Adversarial detection configuration (same-model checker detection)
	adversarial_detection: AdversarialDetectionConfigSchema.optional(),

	// Adversarial testing configuration (cross-model adversarial testing)
	adversarial_testing: AdversarialTestingConfigSchema.optional(),

	// Integration analysis configuration
	integration_analysis: IntegrationAnalysisConfigSchema.optional(),

	// Documentation synthesizer configuration
	docs: DocsConfigSchema.optional(),

	// UI/UX review configuration (designer agent)
	ui_review: UIReviewConfigSchema.optional(),

	// Compaction advisory configuration
	compaction_advisory: CompactionAdvisoryConfigSchema.optional(),

	// Lint configuration
	lint: LintConfigSchema.optional(),

	// Secretscan configuration
	secretscan: SecretscanConfigSchema.optional(),

	// Checkpoint configuration
	checkpoint: CheckpointConfigSchema.optional(),

	// Automation configuration (v6.7 background-first rollout)
	// Controls background automation mode and per-feature toggles
	automation: AutomationConfigSchema.optional(),

	// Knowledge base configuration (v6.17 two-tier cross-project knowledge)
	knowledge: KnowledgeConfigSchema.optional(),

	// Curator configuration (phase context consolidation and drift detection)
	curator: CuratorConfigSchema.optional(),

	// Tool output truncation configuration
	tool_output: z
		.object({
			truncation_enabled: z.boolean().default(true),
			max_lines: z.number().min(10).max(500).default(150),
			per_tool: z.record(z.string(), z.number()).optional(),
			truncation_tools: z
				.array(z.string())
				.optional()
				.describe(
					'Tools to apply output truncation to. Defaults to diff, symbols, bash, shell, test_runner, lint, pre_check_batch, complexity_hotspots, pkg_audit, sbom_generate, schema_drift.',
				),
		})
		.optional(),

	// Slop detector configuration (v6.29)
	slop_detector: SlopDetectorConfigSchema.optional(),

	// TODO gate configuration (v6.32)
	todo_gate: z
		.object({
			enabled: z.boolean().default(true),
			max_high_priority: z
				.number()
				.int()
				.min(-1)
				.default(0)
				.describe(
					'Max new high-priority TODOs (FIXME/HACK/XXX) before warning. 0 = warn on any. Set to -1 to disable.',
				),
			block_on_threshold: z
				.boolean()
				.default(false)
				.describe(
					'If true, block phase completion when threshold exceeded. Default: advisory only.',
				),
		})
		.optional(),

	// Incremental verification configuration (v6.29)
	incremental_verify: IncrementalVerifyConfigSchema.optional(),

	// Compaction service configuration (v6.29)
	compaction_service: CompactionConfigSchema.optional(),

	// Work Complete Council configuration — parallel four-member verification gate (off by default)
	council: CouncilConfigSchema.optional(),

	// Turbo mode — bypasses reviewer/test gates for rapid iteration (v6.40)
	turbo_mode: z.boolean().default(false).optional(),

	// Full-auto mode — autonomous multi-agent orchestration with critic oversight
	full_auto: z
		.object({
			enabled: z.boolean().default(false),
			critic_model: z.string().optional(),
			max_interactions_per_phase: z.number().int().min(5).max(200).default(50),
			deadlock_threshold: z.number().int().min(2).max(10).default(3),
			escalation_mode: z.enum(['pause', 'terminate']).default('pause'),
		})
		.optional()
		.default({
			enabled: false,
			max_interactions_per_phase: 50,
			deadlock_threshold: 3,
			escalation_mode: 'pause',
		}),
});

export type PluginConfig = z.infer<typeof PluginConfigSchema>;

// Re-export types from constants
export type {
	AgentName,
	PipelineAgentName,
	QAAgentName,
} from './constants';
