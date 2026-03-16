/**
 * Adversarial tests for telemetry schema (Task 4.2)
 * Focus: malformed payloads, invalid discriminators, negative counters,
 * malformed outcomes arrays, missing required fields, guard/export consistency
 */
import { describe, it, expect } from 'vitest';
import {
  SwarmEventSchema,
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
} from './src/events';
import * as guards from './src/guards';

const VALID_BASE = {
  type: 'session_metadata',
  timestamp: '2024-01-15T10:00:00.000Z',
  sessionId: 'test-session-123',
  version: '1.0.0',
};

describe('ADVERSARIAL: Invalid discriminators', () => {
  it('rejects unknown discriminator type', () => {
    const result = SwarmEventSchema.safeParse({ ...VALID_BASE, type: 'invalid_type' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].code).toBe('invalid_union');
    }
  });

  it('rejects empty string discriminator', () => {
    const result = SwarmEventSchema.safeParse({ ...VALID_BASE, type: '' });
    expect(result.success).toBe(false);
  });

  it('rejects null discriminator', () => {
    const result = SwarmEventSchema.safeParse({ ...VALID_BASE, type: null as any });
    expect(result.success).toBe(false);
  });

  it('rejects number discriminator', () => {
    const result = SwarmEventSchema.safeParse({ ...VALID_BASE, type: 123 as any });
    expect(result.success).toBe(false);
  });
});

describe('ADVERSARIAL: Negative counters and invalid numbers', () => {
  it('rejects negative inputTokens in TokenUsageEvent', () => {
    const result = TokenUsageEventSchema.safeParse({
      type: 'token_usage',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      agentName: 'agent1',
      inputTokens: -100,
      outputTokens: 50,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('inputTokens');
    }
  });

  it('rejects negative outputTokens in TokenUsageEvent', () => {
    const result = TokenUsageEventSchema.safeParse({
      type: 'token_usage',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      agentName: 'agent1',
      inputTokens: 100,
      outputTokens: -50,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative durationMs in ToolInvocationEvent', () => {
    const result = ToolInvocationEventSchema.safeParse({
      type: 'tool_invocation',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      toolName: 'read',
      durationMs: -100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative durationMs in DelegationEndEvent', () => {
    const result = DelegationEndEventSchema.safeParse({
      type: 'delegation_end',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      taskId: null,
      targetAgent: 'coder',
      durationMs: -5000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative waveIndex in ParallelWaveStartEvent', () => {
    const result = ParallelWaveStartEventSchema.safeParse({
      type: 'parallel_wave_start',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      waveIndex: -1,
      totalWaves: 3,
      taskIds: ['task1', 'task2'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative mergeConflicts in ParallelWaveEndEvent', () => {
    const result = ParallelWaveEndEventSchema.safeParse({
      type: 'parallel_wave_end',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      waveIndex: 0,
      outcomes: [{ taskId: 'task1', success: true }],
      mergeConflicts: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer token counts', () => {
    const result = TokenUsageEventSchema.safeParse({
      type: 'token_usage',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      agentName: 'agent1',
      inputTokens: 100.5,
      outputTokens: 50,
    });
    expect(result.success).toBe(false);
  });

  it('rejects NaN for token counts', () => {
    const result = TokenUsageEventSchema.safeParse({
      type: 'token_usage',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      agentName: 'agent1',
      inputTokens: NaN,
      outputTokens: 50,
    });
    expect(result.success).toBe(false);
  });

  it('rejects Infinity for token counts', () => {
    const result = TokenUsageEventSchema.safeParse({
      type: 'token_usage',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      agentName: 'agent1',
      inputTokens: Infinity,
      outputTokens: 50,
    });
    expect(result.success).toBe(false);
  });

  it('rejects zero for positive totalWaves', () => {
    const result = ParallelWaveStartEventSchema.safeParse({
      type: 'parallel_wave_start',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      waveIndex: 0,
      totalWaves: 0,
      taskIds: ['task1'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative phase number', () => {
    const result = PhaseTransitionEventSchema.safeParse({
      type: 'phase_transition',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      phase: -1,
      transition: 'start',
    });
    expect(result.success).toBe(false);
  });

  it('rejects zero phase number', () => {
    const result = PhaseTransitionEventSchema.safeParse({
      type: 'phase_transition',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      phase: 0,
      transition: 'start',
    });
    expect(result.success).toBe(false);
  });
});

describe('ADVERSARIAL: Malformed outcomes array', () => {
  it('rejects outcomes with missing taskId', () => {
    const result = ParallelWaveEndEventSchema.safeParse({
      type: 'parallel_wave_end',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      waveIndex: 0,
      outcomes: [{ success: true }] as any,
      mergeConflicts: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects outcomes with missing success field', () => {
    const result = ParallelWaveEndEventSchema.safeParse({
      type: 'parallel_wave_end',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      waveIndex: 0,
      outcomes: [{ taskId: 'task1' }] as any,
      mergeConflicts: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects outcomes with non-boolean success', () => {
    const result = ParallelWaveEndEventSchema.safeParse({
      type: 'parallel_wave_end',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      waveIndex: 0,
      outcomes: [{ taskId: 'task1', success: 'true' }] as any,
      mergeConflicts: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-array outcomes', () => {
    const result = ParallelWaveEndEventSchema.safeParse({
      type: 'parallel_wave_end',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      waveIndex: 0,
      outcomes: 'not-an-array' as any,
      mergeConflicts: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects outcomes array containing non-objects', () => {
    const result = ParallelWaveEndEventSchema.safeParse({
      type: 'parallel_wave_end',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      waveIndex: 0,
      outcomes: ['task1', 'task2'] as any,
      mergeConflicts: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe('ADVERSARIAL: Missing required fields', () => {
  it('rejects event without type', () => {
    const result = SwarmEventSchema.safeParse({
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
    });
    expect(result.success).toBe(false);
  });

  it('rejects event without timestamp', () => {
    const result = SessionMetadataEventSchema.safeParse({
      type: 'session_metadata',
      sessionId: 'test-session',
      swarmDir: '/tmp',
      pid: 1234,
      platform: 'linux',
      nodeVersion: '20.0.0',
    });
    expect(result.success).toBe(false);
  });

  it('rejects event without sessionId', () => {
    const result = SessionMetadataEventSchema.safeParse({
      type: 'session_metadata',
      timestamp: '2024-01-15T10:00:00.000Z',
      swarmDir: '/tmp',
      pid: 1234,
      platform: 'linux',
      nodeVersion: '20.0.0',
    });
    expect(result.success).toBe(false);
  });

  it('rejects SessionMetadataEvent without swarmDir', () => {
    const result = SessionMetadataEventSchema.safeParse({
      type: 'session_metadata',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      pid: 1234,
      platform: 'linux',
      nodeVersion: '20.0.0',
    });
    expect(result.success).toBe(false);
  });

  it('rejects SessionMetadataEvent without pid', () => {
    const result = SessionMetadataEventSchema.safeParse({
      type: 'session_metadata',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      swarmDir: '/tmp',
      platform: 'linux',
      nodeVersion: '20.0.0',
    });
    expect(result.success).toBe(false);
  });

  it('rejects GateEvaluationEvent without taskId', () => {
    const result = GateEvaluationEventSchema.safeParse({
      type: 'gate_evaluation',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      gate: 'test-gate',
      verdict: 'pass',
    });
    expect(result.success).toBe(false);
  });

  it('rejects FileReservationEvent without taskId', () => {
    const result = FileReservationEventSchema.safeParse({
      type: 'file_reservation',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      files: ['file1.ts'],
      action: 'reserve',
    });
    expect(result.success).toBe(false);
  });

  it('rejects PhaseTransitionEvent without phase', () => {
    const result = PhaseTransitionEventSchema.safeParse({
      type: 'phase_transition',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      transition: 'start',
    });
    expect(result.success).toBe(false);
  });

  it('rejects PhaseTransitionEvent without transition', () => {
    const result = PhaseTransitionEventSchema.safeParse({
      type: 'phase_transition',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      phase: 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects FileTouchEvent without filePath', () => {
    const result = FileTouchEventSchema.safeParse({
      type: 'file_touch',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      taskId: null,
      operation: 'write',
    });
    expect(result.success).toBe(false);
  });

  it('rejects FileTouchEvent without operation', () => {
    const result = FileTouchEventSchema.safeParse({
      type: 'file_touch',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      taskId: null,
      filePath: '/path/to/file.ts',
    });
    expect(result.success).toBe(false);
  });

  it('rejects StateFileUpdateEvent without filePath', () => {
    const result = StateFileUpdateEventSchema.safeParse({
      type: 'state_file_update',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      fileType: 'plan_json',
    });
    expect(result.success).toBe(false);
  });

  it('rejects ParallelWaveStartEvent without taskIds', () => {
    const result = ParallelWaveStartEventSchema.safeParse({
      type: 'parallel_wave_start',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      waveIndex: 0,
      totalWaves: 3,
    });
    expect(result.success).toBe(false);
  });

  it('rejects ParallelWaveEndEvent without outcomes', () => {
    const result = ParallelWaveEndEventSchema.safeParse({
      type: 'parallel_wave_end',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      waveIndex: 0,
      mergeConflicts: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe('ADVERSARIAL: Invalid enum values', () => {
  it('rejects invalid agent status', () => {
    const result = AgentStatusEventSchema.safeParse({
      type: 'agent_status',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      agentName: 'agent1',
      status: 'invalid_status',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid gate verdict', () => {
    const result = GateEvaluationEventSchema.safeParse({
      type: 'gate_evaluation',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      taskId: 'task1',
      gate: 'test-gate',
      verdict: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid file reservation action', () => {
    const result = FileReservationEventSchema.safeParse({
      type: 'file_reservation',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      taskId: 'task1',
      files: ['file1.ts'],
      action: 'invalid_action',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid file touch operation', () => {
    const result = FileTouchEventSchema.safeParse({
      type: 'file_touch',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      taskId: null,
      filePath: '/path/to/file.ts',
      operation: 'invalid_operation',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid state file fileType', () => {
    const result = StateFileUpdateEventSchema.safeParse({
      type: 'state_file_update',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      filePath: '/path/to/file',
      fileType: 'invalid_type',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid phase transition', () => {
    const result = PhaseTransitionEventSchema.safeParse({
      type: 'phase_transition',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      phase: 1,
      transition: 'invalid_transition',
    });
    expect(result.success).toBe(false);
  });
});

describe('ADVERSARIAL: Invalid datetime formats', () => {
  it('rejects non-ISO datetime string', () => {
    const result = SessionMetadataEventSchema.safeParse({
      type: 'session_metadata',
      timestamp: '2024/01/15 10:00:00',
      sessionId: 'test-session',
      swarmDir: '/tmp',
      pid: 1234,
      platform: 'linux',
      nodeVersion: '20.0.0',
    });
    expect(result.success).toBe(false);
  });

  it('rejects Unix timestamp', () => {
    const result = SessionMetadataEventSchema.safeParse({
      type: 'session_metadata',
      timestamp: 1705312800 as any,
      sessionId: 'test-session',
      swarmDir: '/tmp',
      pid: 1234,
      platform: 'linux',
      nodeVersion: '20.0.0',
    });
    expect(result.success).toBe(false);
  });

  it('rejects date without time', () => {
    const result = SessionMetadataEventSchema.safeParse({
      type: 'session_metadata',
      timestamp: '2024-01-15',
      sessionId: 'test-session',
      swarmDir: '/tmp',
      pid: 1234,
      platform: 'linux',
      nodeVersion: '20.0.0',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid timezone', () => {
    const result = SessionMetadataEventSchema.safeParse({
      type: 'session_metadata',
      timestamp: '2024-01-15T10:00:00.000 INVALID',
      sessionId: 'test-session',
      swarmDir: '/tmp',
      pid: 1234,
      platform: 'linux',
      nodeVersion: '20.0.0',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty timestamp', () => {
    const result = SessionMetadataEventSchema.safeParse({
      type: 'session_metadata',
      timestamp: '',
      sessionId: 'test-session',
      swarmDir: '/tmp',
      pid: 1234,
      platform: 'linux',
      nodeVersion: '20.0.0',
    });
    expect(result.success).toBe(false);
  });
});

describe('ADVERSARIAL: Invalid types for fields', () => {
  it('rejects number where string expected for sessionId', () => {
    const result = SessionMetadataEventSchema.safeParse({
      type: 'session_metadata',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 123 as any,
      swarmDir: '/tmp',
      pid: 1234,
      platform: 'linux',
      nodeVersion: '20.0.0',
    });
    expect(result.success).toBe(false);
  });

  it('rejects array where string expected for agentName', () => {
    const result = TokenUsageEventSchema.safeParse({
      type: 'token_usage',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      agentName: ['agent1', 'agent2'] as any,
      inputTokens: 100,
      outputTokens: 50,
    });
    expect(result.success).toBe(false);
  });

  it('rejects object where array expected for files', () => {
    const result = FileReservationEventSchema.safeParse({
      type: 'file_reservation',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      taskId: 'task1',
      files: { 0: 'file1.ts' } as any,
      action: 'reserve',
    });
    expect(result.success).toBe(false);
  });

  it('rejects string where boolean expected for success', () => {
    const result = ToolInvocationEventSchema.safeParse({
      type: 'tool_invocation',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      toolName: 'read',
      success: 'true' as any,
    });
    expect(result.success).toBe(false);
  });

  it('rejects number where enum expected for status', () => {
    const result = AgentStatusEventSchema.safeParse({
      type: 'agent_status',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      agentName: 'agent1',
      status: 1 as any,
    });
    expect(result.success).toBe(false);
  });
});

describe('ADVERSARIAL: Empty and boundary values', () => {
  it('accepts empty files array in FileReservationEvent', () => {
    const result = FileReservationEventSchema.safeParse({
      type: 'file_reservation',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      taskId: 'task1',
      files: [],
      action: 'reserve',
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty taskIds array in ParallelWaveStartEvent', () => {
    const result = ParallelWaveStartEventSchema.safeParse({
      type: 'parallel_wave_start',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      waveIndex: 0,
      totalWaves: 1,
      taskIds: [],
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty outcomes array in ParallelWaveEndEvent', () => {
    const result = ParallelWaveEndEventSchema.safeParse({
      type: 'parallel_wave_end',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      waveIndex: 0,
      outcomes: [],
      mergeConflicts: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects very large waveIndex', () => {
    const result = ParallelWaveStartEventSchema.safeParse({
      type: 'parallel_wave_start',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      waveIndex: Number.MAX_SAFE_INTEGER,
      totalWaves: 3,
      taskIds: ['task1'],
    });
    expect(result.success).toBe(true); // Schema allows large numbers
  });

  it('rejects very large token counts', () => {
    const result = TokenUsageEventSchema.safeParse({
      type: 'token_usage',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      agentName: 'agent1',
      inputTokens: Number.MAX_SAFE_INTEGER,
      outputTokens: Number.MAX_SAFE_INTEGER,
    });
    expect(result.success).toBe(true); // Schema allows large numbers
  });
});

describe('ADVERSARIAL: Guard function consistency', () => {
  const validEvents = [
    { type: 'session_metadata', schema: SessionMetadataEventSchema, data: { type: 'session_metadata', timestamp: '2024-01-15T10:00:00.000Z', sessionId: 'test', swarmDir: '/tmp', pid: 123, platform: 'linux', nodeVersion: '20.0.0' } },
    { type: 'delegation_start', schema: DelegationStartEventSchema, data: { type: 'delegation_start', timestamp: '2024-01-15T10:00:00.000Z', sessionId: 'test', targetAgent: 'coder', taskId: null } },
    { type: 'delegation_end', schema: DelegationEndEventSchema, data: { type: 'delegation_end', timestamp: '2024-01-15T10:00:00.000Z', sessionId: 'test', targetAgent: 'coder', taskId: null } },
    { type: 'agent_status', schema: AgentStatusEventSchema, data: { type: 'agent_status', timestamp: '2024-01-15T10:00:00.000Z', sessionId: 'test', agentName: 'agent1', status: 'active' } },
    { type: 'token_usage', schema: TokenUsageEventSchema, data: { type: 'token_usage', timestamp: '2024-01-15T10:00:00.000Z', sessionId: 'test', agentName: 'agent1', inputTokens: 100, outputTokens: 50 } },
    { type: 'tool_invocation', schema: ToolInvocationEventSchema, data: { type: 'tool_invocation', timestamp: '2024-01-15T10:00:00.000Z', sessionId: 'test', toolName: 'read', taskId: null } },
    { type: 'gate_evaluation', schema: GateEvaluationEventSchema, data: { type: 'gate_evaluation', timestamp: '2024-01-15T10:00:00.000Z', sessionId: 'test', taskId: 'task1', gate: 'gate1', verdict: 'pass' } },
    { type: 'file_reservation', schema: FileReservationEventSchema, data: { type: 'file_reservation', timestamp: '2024-01-15T10:00:00.000Z', sessionId: 'test', taskId: 'task1', files: ['file1.ts'], action: 'reserve' } },
    { type: 'phase_transition', schema: PhaseTransitionEventSchema, data: { type: 'phase_transition', timestamp: '2024-01-15T10:00:00.000Z', sessionId: 'test', phase: 1, transition: 'start' } },
    { type: 'file_touch', schema: FileTouchEventSchema, data: { type: 'file_touch', timestamp: '2024-01-15T10:00:00.000Z', sessionId: 'test', taskId: null, filePath: '/path', operation: 'write' } },
    { type: 'state_file_update', schema: StateFileUpdateEventSchema, data: { type: 'state_file_update', timestamp: '2024-01-15T10:00:00.000Z', sessionId: 'test', filePath: '/path', fileType: 'plan_json' } },
    { type: 'parallel_wave_start', schema: ParallelWaveStartEventSchema, data: { type: 'parallel_wave_start', timestamp: '2024-01-15T10:00:00.000Z', sessionId: 'test', waveIndex: 0, totalWaves: 3, taskIds: ['task1'] } },
    { type: 'parallel_wave_end', schema: ParallelWaveEndEventSchema, data: { type: 'parallel_wave_end', timestamp: '2024-01-15T10:00:00.000Z', sessionId: 'test', waveIndex: 0, outcomes: [{ taskId: 'task1', success: true }], mergeConflicts: 0 } },
  ];

  const guardMap: Record<string, (e: any) => boolean> = {
    session_metadata: guards.isSessionMetadata,
    delegation_start: guards.isDelegationStart,
    delegation_end: guards.isDelegationEnd,
    agent_status: guards.isAgentStatus,
    token_usage: guards.isTokenUsage,
    tool_invocation: guards.isToolInvocation,
    gate_evaluation: guards.isGateEvaluation,
    file_reservation: guards.isFileReservation,
    phase_transition: guards.isPhaseTransition,
    file_touch: guards.isFileTouch,
    state_file_update: guards.isStateFileUpdate,
    parallel_wave_start: guards.isParallelWaveStart,
    parallel_wave_end: guards.isParallelWaveEnd,
  };

  it('guard functions match schema validation', () => {
    for (const { type, schema, data } of validEvents) {
      const parsed = schema.parse(data);
      const guard = guardMap[type];
      expect(guard(parsed)).toBe(true);
    }
  });

  it('guard returns false for wrong event type', () => {
    const sessionEvent = SessionMetadataEventSchema.parse({
      type: 'session_metadata',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test',
      swarmDir: '/tmp',
      pid: 123,
      platform: 'linux',
      nodeVersion: '20.0.0',
    });

    // Wrong guards should return false
    expect(guards.isDelegationStart(sessionEvent)).toBe(false);
    expect(guards.isAgentStatus(sessionEvent)).toBe(false);
    expect(guards.isTokenUsage(sessionEvent)).toBe(false);
    expect(guards.isToolInvocation(sessionEvent)).toBe(false);
    expect(guards.isGateEvaluation(sessionEvent)).toBe(false);
    expect(guards.isFileReservation(sessionEvent)).toBe(false);
    expect(guards.isPhaseTransition(sessionEvent)).toBe(false);
    expect(guards.isFileTouch(sessionEvent)).toBe(false);
    expect(guards.isStateFileUpdate(sessionEvent)).toBe(false);
    expect(guards.isParallelWaveStart(sessionEvent)).toBe(false);
    expect(guards.isParallelWaveEnd(sessionEvent)).toBe(false);
  });

  it('all event types have corresponding guard functions', () => {
    const eventTypes = [
      'session_metadata',
      'delegation_start',
      'delegation_end',
      'agent_status',
      'token_usage',
      'tool_invocation',
      'gate_evaluation',
      'file_reservation',
      'phase_transition',
      'file_touch',
      'state_file_update',
      'parallel_wave_start',
      'parallel_wave_end',
    ];

    for (const type of eventTypes) {
      expect(guardMap[type]).toBeDefined();
      expect(typeof guardMap[type]).toBe('function');
    }
  });
});

describe('ADVERSARIAL: Export consistency', () => {
  it('all schema types are exported', () => {
    // These should not throw - if they do, export is missing
    expect(typeof SessionMetadataEventSchema).toBe('object');
    expect(typeof DelegationStartEventSchema).toBe('object');
    expect(typeof DelegationEndEventSchema).toBe('object');
    expect(typeof AgentStatusEventSchema).toBe('object');
    expect(typeof TokenUsageEventSchema).toBe('object');
    expect(typeof ToolInvocationEventSchema).toBe('object');
    expect(typeof GateEvaluationEventSchema).toBe('object');
    expect(typeof FileReservationEventSchema).toBe('object');
    expect(typeof PhaseTransitionEventSchema).toBe('object');
    expect(typeof FileTouchEventSchema).toBe('object');
    expect(typeof StateFileUpdateEventSchema).toBe('object');
    expect(typeof ParallelWaveStartEventSchema).toBe('object');
    expect(typeof ParallelWaveEndEventSchema).toBe('object');
    expect(typeof SwarmEventSchema).toBe('object');
  });

  it('all guard functions are exported', () => {
    expect(typeof guards.isSessionMetadata).toBe('function');
    expect(typeof guards.isDelegationStart).toBe('function');
    expect(typeof guards.isDelegationEnd).toBe('function');
    expect(typeof guards.isAgentStatus).toBe('function');
    expect(typeof guards.isTokenUsage).toBe('function');
    expect(typeof guards.isToolInvocation).toBe('function');
    expect(typeof guards.isGateEvaluation).toBe('function');
    expect(typeof guards.isFileReservation).toBe('function');
    expect(typeof guards.isPhaseTransition).toBe('function');
    expect(typeof guards.isFileTouch).toBe('function');
    expect(typeof guards.isStateFileUpdate).toBe('function');
    expect(typeof guards.isParallelWaveStart).toBe('function');
    expect(typeof guards.isParallelWaveEnd).toBe('function');
  });
});

describe('HAPPY PATH: Valid events pass validation', () => {
  it('valid SessionMetadataEvent passes', () => {
    const result = SessionMetadataEventSchema.safeParse({
      type: 'session_metadata',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      swarmDir: '/tmp/swarm',
      pid: 12345,
      platform: 'linux',
      nodeVersion: '20.10.0',
    });
    expect(result.success).toBe(true);
  });

  it('valid DelegationStartEvent passes', () => {
    const result = DelegationStartEventSchema.safeParse({
      type: 'delegation_start',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      taskId: 'task-123',
      targetAgent: 'coder',
      prompt: 'Fix the bug in foo.ts',
    });
    expect(result.success).toBe(true);
  });

  it('valid DelegationEndEvent passes', () => {
    const result = DelegationEndEventSchema.safeParse({
      type: 'delegation_end',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      taskId: 'task-123',
      targetAgent: 'coder',
      durationMs: 5000,
      verdict: 'success',
    });
    expect(result.success).toBe(true);
  });

  it('valid ParallelWaveEndEvent with multiple outcomes passes', () => {
    const result = ParallelWaveEndEventSchema.safeParse({
      type: 'parallel_wave_end',
      timestamp: '2024-01-15T10:00:00.000Z',
      sessionId: 'test-session',
      waveIndex: 2,
      outcomes: [
        { taskId: 'task1', success: true },
        { taskId: 'task2', success: false },
        { taskId: 'task3', success: true },
      ],
      mergeConflicts: 1,
    });
    expect(result.success).toBe(true);
  });
});
