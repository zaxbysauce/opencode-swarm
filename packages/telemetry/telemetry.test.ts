/**
 * Telemetry Schema Tests
 * Tests the Zod schemas and type guards for all telemetry event types
 */
import { describe, expect, test } from 'bun:test';
import {
  SwarmEventBaseSchema,
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
  SwarmEventSchema,
  TELEMETRY_SCHEMA_VERSION,
} from './src/index';

import {
  isSessionMetadata,
  isDelegationStart,
  isDelegationEnd,
  isAgentStatus,
  isTokenUsage,
  isToolInvocation,
  isGateEvaluation,
  isFileReservation,
  isPhaseTransition,
  isFileTouch,
  isStateFileUpdate,
  isParallelWaveStart,
  isParallelWaveEnd,
} from './src/index';

const baseEvent = {
  timestamp: new Date().toISOString(),
  sessionId: 'test-session-123',
  version: TELEMETRY_SCHEMA_VERSION,
};

describe('Telemetry Schema - Version', () => {
  test('TELEMETRY_SCHEMA_VERSION is exported and valid', () => {
    expect(TELEMETRY_SCHEMA_VERSION).toBe('1.0.0');
  });

  test('SwarmEventBaseSchema has default version', () => {
    const result = SwarmEventBaseSchema.parse({
      type: 'test',
      timestamp: new Date().toISOString(),
      sessionId: 'test-session-123',
    });
    expect(result.version).toBe('1.0.0');
  });
});

describe('Telemetry Schema - SessionMetadataEvent', () => {
  test('parses valid session_metadata event', () => {
    const event = {
      type: 'session_metadata',
      timestamp: new Date().toISOString(),
      sessionId: 'session-123',
      version: '1.0.0',
      swarmDir: '/home/user/.opencode',
      pid: 12345,
      platform: 'linux',
      nodeVersion: 'v20.0.0',
    };
    const result = SessionMetadataEventSchema.parse(event);
    expect(result.type).toBe('session_metadata');
    expect(result.swarmDir).toBe('/home/user/.opencode');
    expect(result.pid).toBe(12345);
  });

  test('rejects session_metadata with missing required fields', () => {
    const event = {
      type: 'session_metadata',
      timestamp: new Date().toISOString(),
      sessionId: 'session-123',
    };
    expect(() => SessionMetadataEventSchema.parse(event)).toThrow();
  });
});

describe('Telemetry Schema - DelegationStartEvent', () => {
  test('parses valid delegation_start event', () => {
    const event = {
      type: 'delegation_start',
      timestamp: new Date().toISOString(),
      sessionId: 'session-123',
      version: '1.0.0',
      taskId: 'task-456',
      targetAgent: 'mega_coder',
      prompt: 'Fix the bug',
    };
    const result = DelegationStartEventSchema.parse(event);
    expect(result.type).toBe('delegation_start');
    expect(result.targetAgent).toBe('mega_coder');
    expect(result.taskId).toBe('task-456');
  });

  test('parses delegation_start with nullable taskId', () => {
    const event = {
      type: 'delegation_start',
      timestamp: new Date().toISOString(),
      sessionId: 'session-123',
      version: '1.0.0',
      taskId: null,
      targetAgent: 'mega_coder',
    };
    const result = DelegationStartEventSchema.parse(event);
    expect(result.taskId).toBeNull();
  });
});

describe('Telemetry Schema - DelegationEndEvent', () => {
  test('parses valid delegation_end event', () => {
    const event = {
      type: 'delegation_end',
      timestamp: new Date().toISOString(),
      sessionId: 'session-123',
      version: '1.0.0',
      taskId: 'task-456',
      targetAgent: 'mega_coder',
      durationMs: 5000,
      verdict: 'success',
    };
    const result = DelegationEndEventSchema.parse(event);
    expect(result.type).toBe('delegation_end');
    expect(result.durationMs).toBe(5000);
  });
});

describe('Telemetry Schema - AgentStatusEvent', () => {
  test('parses valid agent_status event with active status', () => {
    const event = {
      type: 'agent_status',
      timestamp: new Date().toISOString(),
      sessionId: 'session-123',
      version: '1.0.0',
      agentName: 'mega_coder',
      status: 'active',
    };
    const result = AgentStatusEventSchema.parse(event);
    expect(result.status).toBe('active');
  });

  test('parses agent_status with optional worktreeId', () => {
    const event = {
      type: 'agent_status',
      timestamp: new Date().toISOString(),
      sessionId: 'session-123',
      version: '1.0.0',
      agentName: 'mega_coder',
      status: 'idle',
      worktreeId: 'worktree-abc',
    };
    const result = AgentStatusEventSchema.parse(event);
    expect(result.worktreeId).toBe('worktree-abc');
  });

  test('rejects invalid agent status', () => {
    const event = {
      type: 'agent_status',
      timestamp: new Date().toISOString(),
      sessionId: 'session-123',
      version: '1.0.0',
      agentName: 'mega_coder',
      status: 'invalid_status',
    };
    expect(() => AgentStatusEventSchema.parse(event)).toThrow();
  });
});

describe('Telemetry Schema - TokenUsageEvent', () => {
  test('parses valid token_usage event', () => {
    const event = {
      type: 'token_usage',
      timestamp: new Date().toISOString(),
      sessionId: 'session-123',
      version: '1.0.0',
      agentName: 'mega_coder',
      inputTokens: 1000,
      outputTokens: 500,
      model: 'claude-3-opus',
    };
    const result = TokenUsageEventSchema.parse(event);
    expect(result.inputTokens).toBe(1000);
    expect(result.outputTokens).toBe(500);
  });

  test('rejects negative token counts', () => {
    const event = {
      type: 'token_usage',
      timestamp: new Date().toISOString(),
      sessionId: 'session-123',
      version: '1.0.0',
      agentName: 'mega_coder',
      inputTokens: -100,
      outputTokens: 500,
    };
    expect(() => TokenUsageEventSchema.parse(event)).toThrow();
  });
});

describe('Telemetry Schema - ToolInvocationEvent', () => {
  test('parses valid tool_invocation event', () => {
    const event = {
      type: 'tool_invocation',
      timestamp: new Date().toISOString(),
      sessionId: 'session-123',
      version: '1.0.0',
      toolName: 'Read',
      taskId: 'task-456',
      durationMs: 150,
      success: true,
    };
    const result = ToolInvocationEventSchema.parse(event);
    expect(result.toolName).toBe('Read');
    expect(result.success).toBe(true);
  });
});

describe('Telemetry Schema - GateEvaluationEvent', () => {
  test('parses valid gate_evaluation event with pass verdict', () => {
    const event = {
      type: 'gate_evaluation',
      timestamp: new Date().toISOString(),
      sessionId: 'session-123',
      version: '1.0.0',
      taskId: 'task-456',
      gate: 'lint',
      verdict: 'pass',
      reason: 'All checks passed',
    };
    const result = GateEvaluationEventSchema.parse(event);
    expect(result.verdict).toBe('pass');
  });

  test('parses gate_evaluation with fail verdict', () => {
    const event = {
      type: 'gate_evaluation',
      timestamp: new Date().toISOString(),
      sessionId: 'session-123',
      version: '1.0.0',
      taskId: 'task-456',
      gate: 'test',
      verdict: 'fail',
    };
    const result = GateEvaluationEventSchema.parse(event);
    expect(result.verdict).toBe('fail');
  });

  test('parses gate_evaluation with skip verdict', () => {
    const event = {
      type: 'gate_evaluation',
      timestamp: new Date().toISOString(),
      sessionId: 'session-123',
      version: '1.0.0',
      taskId: 'task-456',
      gate: 'security',
      verdict: 'skip',
    };
    const result = GateEvaluationEventSchema.parse(event);
    expect(result.verdict).toBe('skip');
  });

  test('rejects invalid verdict', () => {
    const event = {
      type: 'gate_evaluation',
      timestamp: new Date().toISOString(),
      sessionId: 'session-123',
      version: '1.0.0',
      taskId: 'task-456',
      gate: 'lint',
      verdict: 'invalid',
    };
    expect(() => GateEvaluationEventSchema.parse(event)).toThrow();
  });
});

describe('Telemetry Schema - FileReservationEvent', () => {
  test('parses valid file_reservation event with reserve action', () => {
    const event = {
      type: 'file_reservation',
      timestamp: new Date().toISOString(),
      sessionId: 'session-123',
      version: '1.0.0',
      taskId: 'task-456',
      files: ['src/index.ts', 'src/utils.ts'],
      action: 'reserve',
    };
    const result = FileReservationEventSchema.parse(event);
    expect(result.action).toBe('reserve');
    expect(result.files).toEqual(['src/index.ts', 'src/utils.ts']);
  });

  test('parses file_reservation with release action', () => {
    const event = {
      type: 'file_reservation',
      timestamp: new Date().toISOString(),
      sessionId: 'session-123',
      version: '1.0.0',
      taskId: 'task-456',
      files: ['src/index.ts'],
      action: 'release',
    };
    const result = FileReservationEventSchema.parse(event);
    expect(result.action).toBe('release');
  });

  test('parses file_reservation with optional worktreeId', () => {
    const event = {
      type: 'file_reservation',
      timestamp: new Date().toISOString(),
      sessionId: 'session-123',
      version: '1.0.0',
      taskId: 'task-456',
      files: ['src/index.ts'],
      action: 'reserve',
      worktreeId: 'worktree-xyz',
    };
    const result = FileReservationEventSchema.parse(event);
    expect(result.worktreeId).toBe('worktree-xyz');
  });
});

describe('Telemetry Schema - PhaseTransitionEvent', () => {
  test('parses valid phase_transition event with start', () => {
    const event = {
      type: 'phase_transition',
      timestamp: new Date().toISOString(),
      sessionId: 'session-123',
      version: '1.0.0',
      phase: 1,
      transition: 'start',
      taskCount: 10,
    };
    const result = PhaseTransitionEventSchema.parse(event);
    expect(result.phase).toBe(1);
    expect(result.transition).toBe('start');
  });

  test('parses phase_transition with complete', () => {
    const event = {
      type: 'phase_transition',
      timestamp: new Date().toISOString(),
      sessionId: 'session-123',
      version: '1.0.0',
      phase: 2,
      transition: 'complete',
    };
    const result = PhaseTransitionEventSchema.parse(event);
    expect(result.transition).toBe('complete');
  });

  test('rejects non-positive phase number', () => {
    const event = {
      type: 'phase_transition',
      timestamp: new Date().toISOString(),
      sessionId: 'session-123',
      version: '1.0.0',
      phase: 0,
      transition: 'start',
    };
    expect(() => PhaseTransitionEventSchema.parse(event)).toThrow();
  });
});

describe('Telemetry Schema - FileTouchEvent', () => {
  test('parses valid file_touch event with write operation', () => {
    const event = {
      type: 'file_touch',
      timestamp: new Date().toISOString(),
      sessionId: 'session-123',
      version: '1.0.0',
      taskId: 'task-456',
      filePath: 'src/new-file.ts',
      operation: 'write',
    };
    const result = FileTouchEventSchema.parse(event);
    expect(result.operation).toBe('write');
  });

  test('parses file_touch with nullable taskId', () => {
    const event = {
      type: 'file_touch',
      timestamp: new Date().toISOString(),
      sessionId: 'session-123',
      version: '1.0.0',
      taskId: null,
      filePath: 'src/new-file.ts',
      operation: 'delete',
    };
    const result = FileTouchEventSchema.parse(event);
    expect(result.taskId).toBeNull();
  });

  test('rejects invalid operation', () => {
    const event = {
      type: 'file_touch',
      timestamp: new Date().toISOString(),
      sessionId: 'session-123',
      version: '1.0.0',
      taskId: 'task-456',
      filePath: 'src/new-file.ts',
      operation: 'invalid',
    };
    expect(() => FileTouchEventSchema.parse(event)).toThrow();
  });
});

describe('Telemetry Schema - StateFileUpdateEvent', () => {
  test('parses valid state_file_update event with plan_json', () => {
    const event = {
      type: 'state_file_update',
      timestamp: new Date().toISOString(),
      sessionId: 'session-123',
      version: '1.0.0',
      filePath: '.swarm/plan.json',
      fileType: 'plan_json',
    };
    const result = StateFileUpdateEventSchema.parse(event);
    expect(result.fileType).toBe('plan_json');
  });

  test('parses state_file_update with all fileType values', () => {
    const fileTypes = ['plan_json', 'plan_md', 'context_md', 'evidence', 'other'] as const;
    for (const fileType of fileTypes) {
      const event = {
        type: 'state_file_update',
        timestamp: new Date().toISOString(),
        sessionId: 'session-123',
        version: '1.0.0',
        filePath: '.swarm/test',
        fileType,
      };
      const result = StateFileUpdateEventSchema.parse(event);
      expect(result.fileType).toBe(fileType);
    }
  });
});

// Task 4.2: Parallel telemetry event types
describe('Telemetry Schema - ParallelWaveStartEvent', () => {
  test('parses valid parallel_wave_start event', () => {
    const event = {
      type: 'parallel_wave_start',
      timestamp: new Date().toISOString(),
      sessionId: 'session-123',
      version: '1.0.0',
      waveIndex: 0,
      totalWaves: 3,
      taskIds: ['task-1', 'task-2', 'task-3'],
    };
    const result = ParallelWaveStartEventSchema.parse(event);
    expect(result.type).toBe('parallel_wave_start');
    expect(result.waveIndex).toBe(0);
    expect(result.totalWaves).toBe(3);
    expect(result.taskIds).toEqual(['task-1', 'task-2', 'task-3']);
  });

  test('parses parallel_wave_start with non-zero waveIndex', () => {
    const event = {
      type: 'parallel_wave_start',
      timestamp: new Date().toISOString(),
      sessionId: 'session-123',
      version: '1.0.0',
      waveIndex: 2,
      totalWaves: 5,
      taskIds: ['task-10', 'task-11'],
    };
    const result = ParallelWaveStartEventSchema.parse(event);
    expect(result.waveIndex).toBe(2);
  });

  test('rejects negative waveIndex', () => {
    const event = {
      type: 'parallel_wave_start',
      timestamp: new Date().toISOString(),
      sessionId: 'session-123',
      version: '1.0.0',
      waveIndex: -1,
      totalWaves: 3,
      taskIds: ['task-1'],
    };
    expect(() => ParallelWaveStartEventSchema.parse(event)).toThrow();
  });

  test('rejects non-positive totalWaves', () => {
    const event = {
      type: 'parallel_wave_start',
      timestamp: new Date().toISOString(),
      sessionId: 'session-123',
      version: '1.0.0',
      waveIndex: 0,
      totalWaves: 0,
      taskIds: ['task-1'],
    };
    expect(() => ParallelWaveStartEventSchema.parse(event)).toThrow();
  });
});

describe('Telemetry Schema - ParallelWaveEndEvent', () => {
  test('parses valid parallel_wave_end event', () => {
    const event = {
      type: 'parallel_wave_end',
      timestamp: new Date().toISOString(),
      sessionId: 'session-123',
      version: '1.0.0',
      waveIndex: 0,
      outcomes: [
        { taskId: 'task-1', success: true },
        { taskId: 'task-2', success: false },
        { taskId: 'task-3', success: true },
      ],
      mergeConflicts: 1,
    };
    const result = ParallelWaveEndEventSchema.parse(event);
    expect(result.type).toBe('parallel_wave_end');
    expect(result.waveIndex).toBe(0);
    expect(result.outcomes).toHaveLength(3);
    expect(result.outcomes[0].success).toBe(true);
    expect(result.mergeConflicts).toBe(1);
  });

  test('parses parallel_wave_end with empty outcomes', () => {
    const event = {
      type: 'parallel_wave_end',
      timestamp: new Date().toISOString(),
      sessionId: 'session-123',
      version: '1.0.0',
      waveIndex: 1,
      outcomes: [],
      mergeConflicts: 0,
    };
    const result = ParallelWaveEndEventSchema.parse(event);
    expect(result.outcomes).toEqual([]);
  });

  test('rejects negative mergeConflicts', () => {
    const event = {
      type: 'parallel_wave_end',
      timestamp: new Date().toISOString(),
      sessionId: 'session-123',
      version: '1.0.0',
      waveIndex: 0,
      outcomes: [{ taskId: 'task-1', success: true }],
      mergeConflicts: -1,
    };
    expect(() => ParallelWaveEndEventSchema.parse(event)).toThrow();
  });
});

describe('Telemetry Schema - SwarmEventSchema (discriminated union)', () => {
  test('parses all 13 event types via discriminated union', () => {
    const events = [
      { ...baseEvent, type: 'session_metadata', swarmDir: '/test', pid: 1, platform: 'linux', nodeVersion: 'v20' },
      { ...baseEvent, type: 'delegation_start', taskId: 't1', targetAgent: 'coder' },
      { ...baseEvent, type: 'delegation_end', taskId: 't1', targetAgent: 'coder', durationMs: 100 },
      { ...baseEvent, type: 'agent_status', agentName: 'coder', status: 'active' },
      { ...baseEvent, type: 'token_usage', agentName: 'coder', inputTokens: 10, outputTokens: 5 },
      { ...baseEvent, type: 'tool_invocation', toolName: 'Read', taskId: 't1', success: true },
      { ...baseEvent, type: 'gate_evaluation', taskId: 't1', gate: 'lint', verdict: 'pass' },
      { ...baseEvent, type: 'file_reservation', taskId: 't1', files: ['a.ts'], action: 'reserve' },
      { ...baseEvent, type: 'phase_transition', phase: 1, transition: 'start' },
      { ...baseEvent, type: 'file_touch', taskId: 't1', filePath: 'a.ts', operation: 'write' },
      { ...baseEvent, type: 'state_file_update', filePath: 'a.json', fileType: 'plan_json' },
      { ...baseEvent, type: 'parallel_wave_start', waveIndex: 0, totalWaves: 2, taskIds: ['t1'] },
      { ...baseEvent, type: 'parallel_wave_end', waveIndex: 0, outcomes: [{ taskId: 't1', success: true }], mergeConflicts: 0 },
    ];

    for (const event of events) {
      const result = SwarmEventSchema.parse(event);
      expect(result.type).toBe(event.type);
    }
  });

  test('rejects event with unknown type in discriminated union', () => {
    const event = {
      ...baseEvent,
      type: 'unknown_event_type',
      someField: 'value',
    };
    expect(() => SwarmEventSchema.parse(event)).toThrow();
  });
});

describe('Telemetry Guards - Type guards work correctly', () => {
  test('isSessionMetadata returns true for session_metadata', () => {
    const event = { ...baseEvent, type: 'session_metadata', swarmDir: '/test', pid: 1, platform: 'linux', nodeVersion: 'v20' };
    expect(isSessionMetadata(event)).toBe(true);
    expect(isDelegationStart(event)).toBe(false);
  });

  test('isDelegationStart returns true for delegation_start', () => {
    const event = { ...baseEvent, type: 'delegation_start', taskId: 't1', targetAgent: 'coder' };
    expect(isDelegationStart(event)).toBe(true);
    expect(isDelegationEnd(event)).toBe(false);
  });

  test('isDelegationEnd returns true for delegation_end', () => {
    const event = { ...baseEvent, type: 'delegation_end', taskId: 't1', targetAgent: 'coder' };
    expect(isDelegationEnd(event)).toBe(true);
  });

  test('isAgentStatus returns true for agent_status', () => {
    const event = { ...baseEvent, type: 'agent_status', agentName: 'coder', status: 'active' };
    expect(isAgentStatus(event)).toBe(true);
  });

  test('isTokenUsage returns true for token_usage', () => {
    const event = { ...baseEvent, type: 'token_usage', agentName: 'coder', inputTokens: 10, outputTokens: 5 };
    expect(isTokenUsage(event)).toBe(true);
  });

  test('isToolInvocation returns true for tool_invocation', () => {
    const event = { ...baseEvent, type: 'tool_invocation', toolName: 'Read' };
    expect(isToolInvocation(event)).toBe(true);
  });

  test('isGateEvaluation returns true for gate_evaluation', () => {
    const event = { ...baseEvent, type: 'gate_evaluation', taskId: 't1', gate: 'lint', verdict: 'pass' };
    expect(isGateEvaluation(event)).toBe(true);
  });

  test('isFileReservation returns true for file_reservation', () => {
    const event = { ...baseEvent, type: 'file_reservation', taskId: 't1', files: ['a.ts'], action: 'reserve' };
    expect(isFileReservation(event)).toBe(true);
  });

  test('isPhaseTransition returns true for phase_transition', () => {
    const event = { ...baseEvent, type: 'phase_transition', phase: 1, transition: 'start' };
    expect(isPhaseTransition(event)).toBe(true);
  });

  test('isFileTouch returns true for file_touch', () => {
    const event = { ...baseEvent, type: 'file_touch', taskId: 't1', filePath: 'a.ts', operation: 'write' };
    expect(isFileTouch(event)).toBe(true);
  });

  test('isStateFileUpdate returns true for state_file_update', () => {
    const event = { ...baseEvent, type: 'state_file_update', filePath: 'a.json', fileType: 'plan_json' };
    expect(isStateFileUpdate(event)).toBe(true);
  });

  test('isParallelWaveStart returns true for parallel_wave_start', () => {
    const event = { ...baseEvent, type: 'parallel_wave_start', waveIndex: 0, totalWaves: 2, taskIds: ['t1'] };
    expect(isParallelWaveStart(event)).toBe(true);
    expect(isParallelWaveEnd(event)).toBe(false);
  });

  test('isParallelWaveEnd returns true for parallel_wave_end', () => {
    const event = { ...baseEvent, type: 'parallel_wave_end', waveIndex: 0, outcomes: [{ taskId: 't1', success: true }], mergeConflicts: 0 };
    expect(isParallelWaveEnd(event)).toBe(true);
  });
});

describe('Edge Cases - Boundary conditions', () => {
  test('empty taskIds array for parallel_wave_start', () => {
    const event = {
      type: 'parallel_wave_start',
      timestamp: new Date().toISOString(),
      sessionId: 'session-123',
      version: '1.0.0',
      waveIndex: 0,
      totalWaves: 1,
      taskIds: [],
    };
    const result = ParallelWaveStartEventSchema.parse(event);
    expect(result.taskIds).toEqual([]);
  });

  test('large mergeConflicts count', () => {
    const event = {
      type: 'parallel_wave_end',
      timestamp: new Date().toISOString(),
      sessionId: 'session-123',
      version: '1.0.0',
      waveIndex: 0,
      outcomes: [{ taskId: 't1', success: true }],
      mergeConflicts: 999999,
    };
    const result = ParallelWaveEndEventSchema.parse(event);
    expect(result.mergeConflicts).toBe(999999);
  });

  test('optional fields can be undefined', () => {
    const event = {
      type: 'delegation_start',
      timestamp: new Date().toISOString(),
      sessionId: 'session-123',
      version: '1.0.0',
      taskId: null,
      // prompt is optional
      targetAgent: 'coder',
    };
    const result = DelegationStartEventSchema.parse(event);
    expect(result.targetAgent).toBe('coder');
  });
});
