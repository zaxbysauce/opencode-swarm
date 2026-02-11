import { describe, it, expect } from 'bun:test';
import { AgentOverrideConfigSchema, SwarmConfigSchema, PluginConfigSchema, GuardrailsConfigSchema } from '../../../src/config/schema';

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

  it('rejects max_tool_calls below 10', () => {
    const result = GuardrailsConfigSchema.safeParse({ max_tool_calls: 5 });
    expect(result.success).toBe(false);
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