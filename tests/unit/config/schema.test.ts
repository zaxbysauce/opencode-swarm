import { describe, it, expect } from 'bun:test';
import { AgentOverrideConfigSchema, SwarmConfigSchema, PluginConfigSchema, GuardrailsConfigSchema, ScoringWeightsSchema, DecisionDecaySchema, TokenRatiosSchema, ScoringConfigSchema, ContextBudgetConfigSchema } from '../../../src/config/schema';
import { DEFAULT_SCORING_CONFIG, resolveScoringConfig } from '../../../src/config/constants';

describe('AgentOverrideConfigSchema', () => {
  it('accepts empty object {}', () => {
    const result = AgentOverrideConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({});
    }
  });

  it('accepts valid model string', () => {
    const result = AgentOverrideConfigSchema.safeParse({ model: 'gpt-4' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ model: 'gpt-4' });
    }
  });

  it('accepts temperature at boundaries: 0', () => {
    const result = AgentOverrideConfigSchema.safeParse({ temperature: 0 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ temperature: 0 });
    }
  });

  it('accepts temperature at boundaries: 1', () => {
    const result = AgentOverrideConfigSchema.safeParse({ temperature: 1 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ temperature: 1 });
    }
  });

  it('accepts temperature at boundaries: 2', () => {
    const result = AgentOverrideConfigSchema.safeParse({ temperature: 2 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ temperature: 2 });
    }
  });

  it('rejects temperature below 0', () => {
    const result = AgentOverrideConfigSchema.safeParse({ temperature: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects temperature above 2', () => {
    const result = AgentOverrideConfigSchema.safeParse({ temperature: 3 });
    expect(result.success).toBe(false);
  });

  it('accepts disabled boolean', () => {
    const result = AgentOverrideConfigSchema.safeParse({ disabled: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ disabled: true });
    }
  });

  it('rejects non-string model', () => {
    const result = AgentOverrideConfigSchema.safeParse({ model: 123 });
    expect(result.success).toBe(false);
  });

  it('rejects non-number temperature', () => {
    const result = AgentOverrideConfigSchema.safeParse({ temperature: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('rejects non-boolean disabled', () => {
    const result = AgentOverrideConfigSchema.safeParse({ disabled: 'true' });
    expect(result.success).toBe(false);
  });
});

describe('SwarmConfigSchema', () => {
  it('accepts empty object {}', () => {
    const result = SwarmConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({});
    }
  });

  it('accepts name string', () => {
    const result = SwarmConfigSchema.safeParse({ name: 'Cloud Swarm' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: 'Cloud Swarm' });
    }
  });

  it('accepts agents record with valid overrides', () => {
    const config = {
      agents: {
        architect: { model: 'gpt-4', temperature: 0.7 },
        coder: { disabled: true },
      },
    };
    const result = SwarmConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(config);
    }
  });

  it('rejects invalid agent override values', () => {
    const config = {
      agents: {
        architect: { temperature: 'invalid' },
      },
    };
    const result = SwarmConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });
});

describe('PluginConfigSchema', () => {
  it('accepts empty object {} and applies defaults (max_iterations=5, qa_retry_limit=3, inject_phase_reminders=true)', () => {
    const result = PluginConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        max_iterations: 5,
        qa_retry_limit: 3,
        inject_phase_reminders: true,
      });
    }
  });

  it('accepts valid full config', () => {
    const config = {
      agents: {
        architect: { model: 'gpt-4', temperature: 0.7 },
        coder: { disabled: true },
      },
      swarms: {
        cloud: {
          name: 'Cloud Swarm',
          agents: {
            architect: { model: 'gpt-4' },
          },
        },
        local: {
          name: 'Local Swarm',
          agents: {
            coder: { model: 'claude-3' },
          },
        },
      },
      max_iterations: 8,
      qa_retry_limit: 5,
      inject_phase_reminders: false,
    };
    const result = PluginConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(config);
    }
  });

  it('rejects max_iterations below 1', () => {
    const result = PluginConfigSchema.safeParse({ max_iterations: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects max_iterations above 10', () => {
    const result = PluginConfigSchema.safeParse({ max_iterations: 11 });
    expect(result.success).toBe(false);
  });

  it('accepts max_iterations at boundary: 1', () => {
    const result = PluginConfigSchema.safeParse({ max_iterations: 1 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.max_iterations).toBe(1);
    }
  });

  it('accepts max_iterations at boundary: 10', () => {
    const result = PluginConfigSchema.safeParse({ max_iterations: 10 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.max_iterations).toBe(10);
    }
  });

  it('rejects qa_retry_limit below 1', () => {
    const result = PluginConfigSchema.safeParse({ qa_retry_limit: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects qa_retry_limit above 10', () => {
    const result = PluginConfigSchema.safeParse({ qa_retry_limit: 11 });
    expect(result.success).toBe(false);
  });

  it('accepts qa_retry_limit at boundary: 1', () => {
    const result = PluginConfigSchema.safeParse({ qa_retry_limit: 1 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.qa_retry_limit).toBe(1);
    }
  });

  it('accepts qa_retry_limit at boundary: 10', () => {
    const result = PluginConfigSchema.safeParse({ qa_retry_limit: 10 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.qa_retry_limit).toBe(10);
    }
  });

  it('rejects non-boolean inject_phase_reminders', () => {
    const result = PluginConfigSchema.safeParse({ inject_phase_reminders: 'true' });
    expect(result.success).toBe(false);
  });

  it('accepts swarms record', () => {
    const config = {
      swarms: {
        default: {
          name: 'Default Swarm',
          agents: {
            architect: { model: 'gpt-4' },
          },
        },
        cloud: {
          name: 'Cloud Swarm',
          agents: {
            coder: { disabled: true },
          },
        },
      },
    };
    const result = PluginConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.swarms).toEqual(config.swarms);
      expect(result.data.max_iterations).toBe(5); // Default applied
      expect(result.data.qa_retry_limit).toBe(3); // Default applied
      expect(result.data.inject_phase_reminders).toBe(true); // Default applied
    }
  });
});

describe('GuardrailsConfigSchema', () => {
  it('accepts empty object and applies all defaults', () => {
    const result = GuardrailsConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
      expect(result.data.max_tool_calls).toBe(200);
      expect(result.data.max_duration_minutes).toBe(30);
      expect(result.data.max_repetitions).toBe(10);
      expect(result.data.max_consecutive_errors).toBe(5);
      expect(result.data.warning_threshold).toBe(0.75);
    }
  });

  it('accepts partial config and merges defaults', () => {
    const result = GuardrailsConfigSchema.safeParse({ max_tool_calls: 100 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.max_tool_calls).toBe(100);
      expect(result.data.enabled).toBe(true); // Default
      expect(result.data.max_duration_minutes).toBe(30); // Default
      expect(result.data.max_repetitions).toBe(10); // Default
      expect(result.data.max_consecutive_errors).toBe(5); // Default
      expect(result.data.warning_threshold).toBe(0.75); // Default
    }
  });

  it('rejects max_tool_calls below 0', () => {
    const result = GuardrailsConfigSchema.safeParse({ max_tool_calls: -1 });
    expect(result.success).toBe(false);
  });

  it('allows max_tool_calls of 0 (unlimited)', () => {
    const result = GuardrailsConfigSchema.safeParse({ max_tool_calls: 0 });
    expect(result.success).toBe(true);
    expect(result.data?.max_tool_calls).toBe(0);
  });

  it('rejects max_tool_calls above 1000', () => {
    const result = GuardrailsConfigSchema.safeParse({ max_tool_calls: 1001 });
    expect(result.success).toBe(false);
  });

  it('rejects warning_threshold below 0.1', () => {
    const result = GuardrailsConfigSchema.safeParse({ warning_threshold: 0.05 });
    expect(result.success).toBe(false);
  });

  it('rejects warning_threshold above 0.9', () => {
    const result = GuardrailsConfigSchema.safeParse({ warning_threshold: 0.95 });
    expect(result.success).toBe(false);
  });

  it('accepts all boundary values (minimums)', () => {
    const result = GuardrailsConfigSchema.safeParse({
      max_tool_calls: 10,
      max_duration_minutes: 1,
      max_repetitions: 3,
      max_consecutive_errors: 2,
      warning_threshold: 0.1,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.max_tool_calls).toBe(10);
      expect(result.data.max_duration_minutes).toBe(1);
      expect(result.data.max_repetitions).toBe(3);
      expect(result.data.max_consecutive_errors).toBe(2);
      expect(result.data.warning_threshold).toBe(0.1);
    }
  });

  it('accepts all boundary values (maximums)', () => {
    const result = GuardrailsConfigSchema.safeParse({
      max_tool_calls: 1000,
      max_duration_minutes: 120,
      max_repetitions: 50,
      max_consecutive_errors: 20,
      warning_threshold: 0.9,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.max_tool_calls).toBe(1000);
      expect(result.data.max_duration_minutes).toBe(120);
      expect(result.data.max_repetitions).toBe(50);
      expect(result.data.max_consecutive_errors).toBe(20);
      expect(result.data.warning_threshold).toBe(0.9);
    }
  });
});

describe('ScoringWeightsSchema', () => {
  it('accepts empty object and applies all defaults', () => {
    const result = ScoringWeightsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phase).toBe(1.0);
      expect(result.data.current_task).toBe(2.0);
      expect(result.data.blocked_task).toBe(1.5);
      expect(result.data.recent_failure).toBe(2.5);
      expect(result.data.recent_success).toBe(0.5);
      expect(result.data.evidence_presence).toBe(1.0);
      expect(result.data.decision_recency).toBe(1.5);
      expect(result.data.dependency_proximity).toBe(1.0);
    }
  });

  it('accepts partial config and merges defaults', () => {
    const result = ScoringWeightsSchema.safeParse({ phase: 2.0, current_task: 3.0 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phase).toBe(2.0);
      expect(result.data.current_task).toBe(3.0);
      expect(result.data.blocked_task).toBe(1.5); // Default
      expect(result.data.recent_failure).toBe(2.5); // Default
    }
  });

  it('accepts weight at minimum boundary (0)', () => {
    const result = ScoringWeightsSchema.safeParse({ phase: 0 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phase).toBe(0);
    }
  });

  it('accepts weight at maximum boundary (5)', () => {
    const result = ScoringWeightsSchema.safeParse({ phase: 5 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phase).toBe(5);
    }
  });

  it('rejects weight below minimum (0)', () => {
    const result = ScoringWeightsSchema.safeParse({ phase: -0.1 });
    expect(result.success).toBe(false);
  });

  it('rejects weight above maximum (5)', () => {
    const result = ScoringWeightsSchema.safeParse({ phase: 5.1 });
    expect(result.success).toBe(false);
  });
});

describe('DecisionDecaySchema', () => {
  it('accepts empty object and applies all defaults', () => {
    const result = DecisionDecaySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mode).toBe('exponential');
      expect(result.data.half_life_hours).toBe(24);
    }
  });

  it('accepts valid mode "linear"', () => {
    const result = DecisionDecaySchema.safeParse({ mode: 'linear' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mode).toBe('linear');
      expect(result.data.half_life_hours).toBe(24); // Default
    }
  });

  it('accepts valid mode "exponential"', () => {
    const result = DecisionDecaySchema.safeParse({ mode: 'exponential' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mode).toBe('exponential');
    }
  });

  it('rejects invalid mode', () => {
    const result = DecisionDecaySchema.safeParse({ mode: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('accepts half_life_hours at minimum boundary (1)', () => {
    const result = DecisionDecaySchema.safeParse({ half_life_hours: 1 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.half_life_hours).toBe(1);
    }
  });

  it('accepts half_life_hours at maximum boundary (168)', () => {
    const result = DecisionDecaySchema.safeParse({ half_life_hours: 168 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.half_life_hours).toBe(168);
    }
  });

  it('rejects half_life_hours below minimum (1)', () => {
    const result = DecisionDecaySchema.safeParse({ half_life_hours: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects half_life_hours above maximum (168)', () => {
    const result = DecisionDecaySchema.safeParse({ half_life_hours: 169 });
    expect(result.success).toBe(false);
  });
});

describe('TokenRatiosSchema', () => {
  it('accepts empty object and applies all defaults', () => {
    const result = TokenRatiosSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.prose).toBe(0.25);
      expect(result.data.code).toBe(0.40);
      expect(result.data.markdown).toBe(0.30);
      expect(result.data.json).toBe(0.35);
    }
  });

  it('accepts partial config and merges defaults', () => {
    const result = TokenRatiosSchema.safeParse({ prose: 0.5, code: 0.6 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.prose).toBe(0.5);
      expect(result.data.code).toBe(0.6);
      expect(result.data.markdown).toBe(0.30); // Default
      expect(result.data.json).toBe(0.35); // Default
    }
  });

  it('accepts ratio at minimum boundary (0.1)', () => {
    const result = TokenRatiosSchema.safeParse({ prose: 0.1 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.prose).toBe(0.1);
    }
  });

  it('accepts ratio at maximum boundary (1.0)', () => {
    const result = TokenRatiosSchema.safeParse({ prose: 1.0 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.prose).toBe(1.0);
    }
  });

  it('rejects ratio below minimum (0.1)', () => {
    const result = TokenRatiosSchema.safeParse({ prose: 0.05 });
    expect(result.success).toBe(false);
  });

  it('rejects ratio above maximum (1.0)', () => {
    const result = TokenRatiosSchema.safeParse({ prose: 1.1 });
    expect(result.success).toBe(false);
  });
});

describe('ScoringConfigSchema', () => {
  it('accepts empty object and applies all defaults', () => {
    const result = ScoringConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(false);
      expect(result.data.max_candidates).toBe(100);
      expect(result.data.weights).toBeUndefined();
      expect(result.data.decision_decay).toBeUndefined();
      expect(result.data.token_ratios).toBeUndefined();
    }
  });

  it('accepts enabled: true', () => {
    const result = ScoringConfigSchema.safeParse({ enabled: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
      expect(result.data.max_candidates).toBe(100); // Default
    }
  });

  it('accepts max_candidates at minimum boundary (10)', () => {
    const result = ScoringConfigSchema.safeParse({ max_candidates: 10 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.max_candidates).toBe(10);
    }
  });

  it('accepts max_candidates at maximum boundary (500)', () => {
    const result = ScoringConfigSchema.safeParse({ max_candidates: 500 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.max_candidates).toBe(500);
    }
  });

  it('rejects max_candidates below minimum (10)', () => {
    const result = ScoringConfigSchema.safeParse({ max_candidates: 9 });
    expect(result.success).toBe(false);
  });

  it('rejects max_candidates above maximum (500)', () => {
    const result = ScoringConfigSchema.safeParse({ max_candidates: 501 });
    expect(result.success).toBe(false);
  });

  it('accepts nested weights config', () => {
    const result = ScoringConfigSchema.safeParse({
      weights: { phase: 2.0, current_task: 3.0 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.weights?.phase).toBe(2.0);
      expect(result.data.weights?.current_task).toBe(3.0);
    }
  });

  it('accepts nested decision_decay config', () => {
    const result = ScoringConfigSchema.safeParse({
      decision_decay: { mode: 'linear', half_life_hours: 48 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.decision_decay?.mode).toBe('linear');
      expect(result.data.decision_decay?.half_life_hours).toBe(48);
    }
  });

  it('accepts nested token_ratios config', () => {
    const result = ScoringConfigSchema.safeParse({
      token_ratios: { prose: 0.5, code: 0.6 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.token_ratios?.prose).toBe(0.5);
      expect(result.data.token_ratios?.code).toBe(0.6);
    }
  });

  it('accepts full scoring config', () => {
    const result = ScoringConfigSchema.safeParse({
      enabled: true,
      max_candidates: 50,
      weights: {
        phase: 1.5,
        current_task: 2.5,
        blocked_task: 1.0,
        recent_failure: 3.0,
        recent_success: 0.25,
        evidence_presence: 1.2,
        decision_recency: 2.0,
        dependency_proximity: 0.8,
      },
      decision_decay: {
        mode: 'exponential',
        half_life_hours: 12,
      },
      token_ratios: {
        prose: 0.3,
        code: 0.5,
        markdown: 0.25,
        json: 0.4,
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
      expect(result.data.max_candidates).toBe(50);
      expect(result.data.weights?.phase).toBe(1.5);
      expect(result.data.decision_decay?.half_life_hours).toBe(12);
      expect(result.data.token_ratios?.code).toBe(0.5);
    }
  });
});

describe('ContextBudgetConfigSchema with scoring', () => {
  it('accepts context_budget without scoring block', () => {
    const result = ContextBudgetConfigSchema.safeParse({
      enabled: true,
      max_injection_tokens: 2000,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
      expect(result.data.max_injection_tokens).toBe(2000);
      expect(result.data.scoring).toBeUndefined();
    }
  });

  it('accepts context_budget with scoring block', () => {
    const result = ContextBudgetConfigSchema.safeParse({
      enabled: true,
      scoring: {
        enabled: true,
        max_candidates: 200,
        weights: { phase: 1.5 },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scoring?.enabled).toBe(true);
      expect(result.data.scoring?.max_candidates).toBe(200);
      expect(result.data.scoring?.weights?.phase).toBe(1.5);
    }
  });
});

describe('DEFAULT_SCORING_CONFIG', () => {
  it('has correct default values', () => {
    expect(DEFAULT_SCORING_CONFIG.enabled).toBe(false);
    expect(DEFAULT_SCORING_CONFIG.max_candidates).toBe(100);
    expect(DEFAULT_SCORING_CONFIG.weights.phase).toBe(1.0);
    expect(DEFAULT_SCORING_CONFIG.weights.current_task).toBe(2.0);
    expect(DEFAULT_SCORING_CONFIG.weights.blocked_task).toBe(1.5);
    expect(DEFAULT_SCORING_CONFIG.weights.recent_failure).toBe(2.5);
    expect(DEFAULT_SCORING_CONFIG.weights.recent_success).toBe(0.5);
    expect(DEFAULT_SCORING_CONFIG.weights.evidence_presence).toBe(1.0);
    expect(DEFAULT_SCORING_CONFIG.weights.decision_recency).toBe(1.5);
    expect(DEFAULT_SCORING_CONFIG.weights.dependency_proximity).toBe(1.0);
    expect(DEFAULT_SCORING_CONFIG.decision_decay.mode).toBe('exponential');
    expect(DEFAULT_SCORING_CONFIG.decision_decay.half_life_hours).toBe(24);
    expect(DEFAULT_SCORING_CONFIG.token_ratios.prose).toBe(0.25);
    expect(DEFAULT_SCORING_CONFIG.token_ratios.code).toBe(0.40);
    expect(DEFAULT_SCORING_CONFIG.token_ratios.markdown).toBe(0.30);
    expect(DEFAULT_SCORING_CONFIG.token_ratios.json).toBe(0.35);
  });
});

describe('resolveScoringConfig', () => {
  it('returns DEFAULT_SCORING_CONFIG when userConfig is undefined', () => {
    const result = resolveScoringConfig(undefined);
    expect(result).toEqual(DEFAULT_SCORING_CONFIG);
  });

  it('returns DEFAULT_SCORING_CONFIG when userConfig is empty object', () => {
    const result = resolveScoringConfig({} as any);
    expect(result.enabled).toBe(false);
    expect(result.max_candidates).toBe(100);
    expect(result.weights.phase).toBe(1.0);
  });

  it('merges partial user config with defaults', () => {
    const userConfig = {
      enabled: true,
      max_candidates: 200,
    };
    const result = resolveScoringConfig(userConfig as any);
    expect(result.enabled).toBe(true);
    expect(result.max_candidates).toBe(200);
    // Should keep defaults for unspecified fields
    expect(result.weights.phase).toBe(1.0);
    expect(result.weights.current_task).toBe(2.0);
    expect(result.decision_decay.mode).toBe('exponential');
    expect(result.token_ratios.code).toBe(0.40);
  });

  it('deep merges nested weights config', () => {
    const userConfig = {
      weights: {
        phase: 3.0,
        current_task: 4.0,
      },
    };
    const result = resolveScoringConfig(userConfig as any);
    expect(result.weights.phase).toBe(3.0);
    expect(result.weights.current_task).toBe(4.0);
    // Should keep defaults for unspecified weight fields
    expect(result.weights.blocked_task).toBe(1.5);
    expect(result.weights.recent_failure).toBe(2.5);
    expect(result.weights.recent_success).toBe(0.5);
    expect(result.weights.evidence_presence).toBe(1.0);
    expect(result.weights.decision_recency).toBe(1.5);
    expect(result.weights.dependency_proximity).toBe(1.0);
    // Should keep defaults for other sections
    expect(result.enabled).toBe(false);
    expect(result.decision_decay.half_life_hours).toBe(24);
  });

  it('deep merges nested decision_decay config', () => {
    const userConfig = {
      decision_decay: {
        mode: 'linear' as const,
      },
    };
    const result = resolveScoringConfig(userConfig as any);
    expect(result.decision_decay.mode).toBe('linear');
    expect(result.decision_decay.half_life_hours).toBe(24); // Default
    // Should keep defaults for other sections
    expect(result.enabled).toBe(false);
    expect(result.weights.phase).toBe(1.0);
  });

  it('deep merges nested token_ratios config', () => {
    const userConfig = {
      token_ratios: {
        prose: 0.5,
        code: 0.6,
      },
    };
    const result = resolveScoringConfig(userConfig as any);
    expect(result.token_ratios.prose).toBe(0.5);
    expect(result.token_ratios.code).toBe(0.6);
    expect(result.token_ratios.markdown).toBe(0.30); // Default
    expect(result.token_ratios.json).toBe(0.35); // Default
  });

  it('merges full user config completely', () => {
    const userConfig = {
      enabled: true,
      max_candidates: 50,
      weights: {
        phase: 2.0,
        current_task: 3.0,
        blocked_task: 2.0,
        recent_failure: 1.0,
        recent_success: 0.25,
        evidence_presence: 1.5,
        decision_recency: 2.0,
        dependency_proximity: 0.5,
      },
      decision_decay: {
        mode: 'linear' as const,
        half_life_hours: 12,
      },
      token_ratios: {
        prose: 0.3,
        code: 0.5,
        markdown: 0.25,
        json: 0.4,
      },
    };
    const result = resolveScoringConfig(userConfig as any);
    expect(result.enabled).toBe(true);
    expect(result.max_candidates).toBe(50);
    expect(result.weights.phase).toBe(2.0);
    expect(result.weights.current_task).toBe(3.0);
    expect(result.decision_decay.mode).toBe('linear');
    expect(result.decision_decay.half_life_hours).toBe(12);
    expect(result.token_ratios.prose).toBe(0.3);
    expect(result.token_ratios.code).toBe(0.5);
  });
});