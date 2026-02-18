import { z } from 'zod';
export declare const AgentOverrideConfigSchema: z.ZodObject<{
    model: z.ZodOptional<z.ZodString>;
    temperature: z.ZodOptional<z.ZodNumber>;
    disabled: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type AgentOverrideConfig = z.infer<typeof AgentOverrideConfigSchema>;
export declare const SwarmConfigSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    agents: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        model: z.ZodOptional<z.ZodString>;
        temperature: z.ZodOptional<z.ZodNumber>;
        disabled: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type SwarmConfig = z.infer<typeof SwarmConfigSchema>;
export declare const HooksConfigSchema: z.ZodObject<{
    system_enhancer: z.ZodDefault<z.ZodBoolean>;
    compaction: z.ZodDefault<z.ZodBoolean>;
    agent_activity: z.ZodDefault<z.ZodBoolean>;
    delegation_tracker: z.ZodDefault<z.ZodBoolean>;
    agent_awareness_max_chars: z.ZodDefault<z.ZodNumber>;
    delegation_gate: z.ZodDefault<z.ZodBoolean>;
    delegation_max_chars: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type HooksConfig = z.infer<typeof HooksConfigSchema>;
export declare const ScoringWeightsSchema: z.ZodObject<{
    phase: z.ZodDefault<z.ZodNumber>;
    current_task: z.ZodDefault<z.ZodNumber>;
    blocked_task: z.ZodDefault<z.ZodNumber>;
    recent_failure: z.ZodDefault<z.ZodNumber>;
    recent_success: z.ZodDefault<z.ZodNumber>;
    evidence_presence: z.ZodDefault<z.ZodNumber>;
    decision_recency: z.ZodDefault<z.ZodNumber>;
    dependency_proximity: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type ScoringWeights = z.infer<typeof ScoringWeightsSchema>;
export declare const DecisionDecaySchema: z.ZodObject<{
    mode: z.ZodDefault<z.ZodEnum<{
        linear: "linear";
        exponential: "exponential";
    }>>;
    half_life_hours: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type DecisionDecay = z.infer<typeof DecisionDecaySchema>;
export declare const TokenRatiosSchema: z.ZodObject<{
    prose: z.ZodDefault<z.ZodNumber>;
    code: z.ZodDefault<z.ZodNumber>;
    markdown: z.ZodDefault<z.ZodNumber>;
    json: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type TokenRatios = z.infer<typeof TokenRatiosSchema>;
export declare const ScoringConfigSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    max_candidates: z.ZodDefault<z.ZodNumber>;
    weights: z.ZodOptional<z.ZodObject<{
        phase: z.ZodDefault<z.ZodNumber>;
        current_task: z.ZodDefault<z.ZodNumber>;
        blocked_task: z.ZodDefault<z.ZodNumber>;
        recent_failure: z.ZodDefault<z.ZodNumber>;
        recent_success: z.ZodDefault<z.ZodNumber>;
        evidence_presence: z.ZodDefault<z.ZodNumber>;
        decision_recency: z.ZodDefault<z.ZodNumber>;
        dependency_proximity: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>;
    decision_decay: z.ZodOptional<z.ZodObject<{
        mode: z.ZodDefault<z.ZodEnum<{
            linear: "linear";
            exponential: "exponential";
        }>>;
        half_life_hours: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>;
    token_ratios: z.ZodOptional<z.ZodObject<{
        prose: z.ZodDefault<z.ZodNumber>;
        code: z.ZodDefault<z.ZodNumber>;
        markdown: z.ZodDefault<z.ZodNumber>;
        json: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ScoringConfig = z.infer<typeof ScoringConfigSchema>;
export declare const ContextBudgetConfigSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    warn_threshold: z.ZodDefault<z.ZodNumber>;
    critical_threshold: z.ZodDefault<z.ZodNumber>;
    model_limits: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodNumber>>;
    max_injection_tokens: z.ZodDefault<z.ZodNumber>;
    scoring: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        max_candidates: z.ZodDefault<z.ZodNumber>;
        weights: z.ZodOptional<z.ZodObject<{
            phase: z.ZodDefault<z.ZodNumber>;
            current_task: z.ZodDefault<z.ZodNumber>;
            blocked_task: z.ZodDefault<z.ZodNumber>;
            recent_failure: z.ZodDefault<z.ZodNumber>;
            recent_success: z.ZodDefault<z.ZodNumber>;
            evidence_presence: z.ZodDefault<z.ZodNumber>;
            decision_recency: z.ZodDefault<z.ZodNumber>;
            dependency_proximity: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strip>>;
        decision_decay: z.ZodOptional<z.ZodObject<{
            mode: z.ZodDefault<z.ZodEnum<{
                linear: "linear";
                exponential: "exponential";
            }>>;
            half_life_hours: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strip>>;
        token_ratios: z.ZodOptional<z.ZodObject<{
            prose: z.ZodDefault<z.ZodNumber>;
            code: z.ZodDefault<z.ZodNumber>;
            markdown: z.ZodDefault<z.ZodNumber>;
            json: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ContextBudgetConfig = z.infer<typeof ContextBudgetConfigSchema>;
export declare const EvidenceConfigSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    max_age_days: z.ZodDefault<z.ZodNumber>;
    max_bundles: z.ZodDefault<z.ZodNumber>;
    auto_archive: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export type EvidenceConfig = z.infer<typeof EvidenceConfigSchema>;
export declare const SummaryConfigSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    threshold_bytes: z.ZodDefault<z.ZodNumber>;
    max_summary_chars: z.ZodDefault<z.ZodNumber>;
    max_stored_bytes: z.ZodDefault<z.ZodNumber>;
    retention_days: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type SummaryConfig = z.infer<typeof SummaryConfigSchema>;
export declare const ReviewPassesConfigSchema: z.ZodObject<{
    always_security_review: z.ZodDefault<z.ZodBoolean>;
    security_globs: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type ReviewPassesConfig = z.infer<typeof ReviewPassesConfigSchema>;
export declare const IntegrationAnalysisConfigSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export type IntegrationAnalysisConfig = z.infer<typeof IntegrationAnalysisConfigSchema>;
export declare const DocsConfigSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    doc_patterns: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type DocsConfig = z.infer<typeof DocsConfigSchema>;
export declare const UIReviewConfigSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    trigger_paths: z.ZodDefault<z.ZodArray<z.ZodString>>;
    trigger_keywords: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type UIReviewConfig = z.infer<typeof UIReviewConfigSchema>;
export declare const GuardrailsProfileSchema: z.ZodObject<{
    max_tool_calls: z.ZodOptional<z.ZodNumber>;
    max_duration_minutes: z.ZodOptional<z.ZodNumber>;
    max_repetitions: z.ZodOptional<z.ZodNumber>;
    max_consecutive_errors: z.ZodOptional<z.ZodNumber>;
    warning_threshold: z.ZodOptional<z.ZodNumber>;
    idle_timeout_minutes: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type GuardrailsProfile = z.infer<typeof GuardrailsProfileSchema>;
export declare const DEFAULT_AGENT_PROFILES: Record<string, GuardrailsProfile>;
/** @deprecated Use DEFAULT_AGENT_PROFILES.architect instead */
export declare const DEFAULT_ARCHITECT_PROFILE: {
    max_tool_calls?: number | undefined;
    max_duration_minutes?: number | undefined;
    max_repetitions?: number | undefined;
    max_consecutive_errors?: number | undefined;
    warning_threshold?: number | undefined;
    idle_timeout_minutes?: number | undefined;
};
export declare const GuardrailsConfigSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    max_tool_calls: z.ZodDefault<z.ZodNumber>;
    max_duration_minutes: z.ZodDefault<z.ZodNumber>;
    max_repetitions: z.ZodDefault<z.ZodNumber>;
    max_consecutive_errors: z.ZodDefault<z.ZodNumber>;
    warning_threshold: z.ZodDefault<z.ZodNumber>;
    idle_timeout_minutes: z.ZodDefault<z.ZodNumber>;
    profiles: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        max_tool_calls: z.ZodOptional<z.ZodNumber>;
        max_duration_minutes: z.ZodOptional<z.ZodNumber>;
        max_repetitions: z.ZodOptional<z.ZodNumber>;
        max_consecutive_errors: z.ZodOptional<z.ZodNumber>;
        warning_threshold: z.ZodOptional<z.ZodNumber>;
        idle_timeout_minutes: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type GuardrailsConfig = z.infer<typeof GuardrailsConfigSchema>;
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
export declare function stripKnownSwarmPrefix(name: string): string;
/**
 * Resolve guardrails configuration for a specific agent.
 * Merges the base config with built-in agent-type defaults and
 * any per-agent profile overrides. Merge order: base < built-in < user profile.
 *
 * @param base - The base guardrails configuration
 * @param agentName - Optional agent name to look up profile overrides
 * @returns The effective guardrails configuration for the agent
 */
export declare function resolveGuardrailsConfig(base: GuardrailsConfig, agentName?: string): GuardrailsConfig;
export declare const PluginConfigSchema: z.ZodObject<{
    agents: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        model: z.ZodOptional<z.ZodString>;
        temperature: z.ZodOptional<z.ZodNumber>;
        disabled: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>>;
    swarms: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        name: z.ZodOptional<z.ZodString>;
        agents: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            model: z.ZodOptional<z.ZodString>;
            temperature: z.ZodOptional<z.ZodNumber>;
            disabled: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strip>>>;
    }, z.core.$strip>>>;
    max_iterations: z.ZodDefault<z.ZodNumber>;
    qa_retry_limit: z.ZodDefault<z.ZodNumber>;
    inject_phase_reminders: z.ZodDefault<z.ZodBoolean>;
    hooks: z.ZodOptional<z.ZodObject<{
        system_enhancer: z.ZodDefault<z.ZodBoolean>;
        compaction: z.ZodDefault<z.ZodBoolean>;
        agent_activity: z.ZodDefault<z.ZodBoolean>;
        delegation_tracker: z.ZodDefault<z.ZodBoolean>;
        agent_awareness_max_chars: z.ZodDefault<z.ZodNumber>;
        delegation_gate: z.ZodDefault<z.ZodBoolean>;
        delegation_max_chars: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>;
    context_budget: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        warn_threshold: z.ZodDefault<z.ZodNumber>;
        critical_threshold: z.ZodDefault<z.ZodNumber>;
        model_limits: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodNumber>>;
        max_injection_tokens: z.ZodDefault<z.ZodNumber>;
        scoring: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            max_candidates: z.ZodDefault<z.ZodNumber>;
            weights: z.ZodOptional<z.ZodObject<{
                phase: z.ZodDefault<z.ZodNumber>;
                current_task: z.ZodDefault<z.ZodNumber>;
                blocked_task: z.ZodDefault<z.ZodNumber>;
                recent_failure: z.ZodDefault<z.ZodNumber>;
                recent_success: z.ZodDefault<z.ZodNumber>;
                evidence_presence: z.ZodDefault<z.ZodNumber>;
                decision_recency: z.ZodDefault<z.ZodNumber>;
                dependency_proximity: z.ZodDefault<z.ZodNumber>;
            }, z.core.$strip>>;
            decision_decay: z.ZodOptional<z.ZodObject<{
                mode: z.ZodDefault<z.ZodEnum<{
                    linear: "linear";
                    exponential: "exponential";
                }>>;
                half_life_hours: z.ZodDefault<z.ZodNumber>;
            }, z.core.$strip>>;
            token_ratios: z.ZodOptional<z.ZodObject<{
                prose: z.ZodDefault<z.ZodNumber>;
                code: z.ZodDefault<z.ZodNumber>;
                markdown: z.ZodDefault<z.ZodNumber>;
                json: z.ZodDefault<z.ZodNumber>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    guardrails: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        max_tool_calls: z.ZodDefault<z.ZodNumber>;
        max_duration_minutes: z.ZodDefault<z.ZodNumber>;
        max_repetitions: z.ZodDefault<z.ZodNumber>;
        max_consecutive_errors: z.ZodDefault<z.ZodNumber>;
        warning_threshold: z.ZodDefault<z.ZodNumber>;
        idle_timeout_minutes: z.ZodDefault<z.ZodNumber>;
        profiles: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            max_tool_calls: z.ZodOptional<z.ZodNumber>;
            max_duration_minutes: z.ZodOptional<z.ZodNumber>;
            max_repetitions: z.ZodOptional<z.ZodNumber>;
            max_consecutive_errors: z.ZodOptional<z.ZodNumber>;
            warning_threshold: z.ZodOptional<z.ZodNumber>;
            idle_timeout_minutes: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>>;
    }, z.core.$strip>>;
    evidence: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        max_age_days: z.ZodDefault<z.ZodNumber>;
        max_bundles: z.ZodDefault<z.ZodNumber>;
        auto_archive: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>;
    summaries: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        threshold_bytes: z.ZodDefault<z.ZodNumber>;
        max_summary_chars: z.ZodDefault<z.ZodNumber>;
        max_stored_bytes: z.ZodDefault<z.ZodNumber>;
        retention_days: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>;
    review_passes: z.ZodOptional<z.ZodObject<{
        always_security_review: z.ZodDefault<z.ZodBoolean>;
        security_globs: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    integration_analysis: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>;
    docs: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        doc_patterns: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    ui_review: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        trigger_paths: z.ZodDefault<z.ZodArray<z.ZodString>>;
        trigger_keywords: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type PluginConfig = z.infer<typeof PluginConfigSchema>;
export type { AgentName, PipelineAgentName, QAAgentName, } from './constants';
