import { describe, it, expect } from 'bun:test';
import {
  TELEMETRY_SCHEMA_VERSION,
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
  isSessionMetadata,
  isDelegationStart,
  isAgentStatus,
  isGateEvaluation,
  isToolInvocation,
  type SwarmEvent,
} from './index';

describe('TELEMETRY_SCHEMA_VERSION', () => {
  it('should equal 1.0.0', () => {
    expect(TELEMETRY_SCHEMA_VERSION).toBe('1.0.0');
  });
});

describe('Event Schema Parsing', () => {
  it('should parse session_metadata event', () => {
    const event = {
      type: 'session_metadata' as const,
      timestamp: '2024-01-15T10:30:00.000Z',
      sessionId: 'test-session-123',
      swarmDir: '/Users/test/.opencode',
      pid: 12345,
      platform: 'darwin',
      nodeVersion: 'v20.10.0',
    };
    const result = SessionMetadataEventSchema.parse(event);
    expect(result.type).toBe('session_metadata');
    expect(result.swarmDir).toBe('/Users/test/.opencode');
    expect(result.pid).toBe(12345);
    expect(result.platform).toBe('darwin');
    expect(result.nodeVersion).toBe('v20.10.0');
  });

  it('should parse delegation_start event', () => {
    const event = {
      type: 'delegation_start' as const,
      timestamp: '2024-01-15T10:30:00.000Z',
      sessionId: 'test-session-123',
      taskId: 'task-456',
      targetAgent: 'mega_coder',
      prompt: 'Fix the bug in auth.ts',
    };
    const result = DelegationStartEventSchema.parse(event);
    expect(result.type).toBe('delegation_start');
    expect(result.taskId).toBe('task-456');
    expect(result.targetAgent).toBe('mega_coder');
    expect(result.prompt).toBe('Fix the bug in auth.ts');
  });

  it('should parse delegation_end event', () => {
    const event = {
      type: 'delegation_end' as const,
      timestamp: '2024-01-15T10:30:00.000Z',
      sessionId: 'test-session-123',
      taskId: 'task-456',
      targetAgent: 'mega_coder',
      durationMs: 5000,
      verdict: 'pass',
    };
    const result = DelegationEndEventSchema.parse(event);
    expect(result.type).toBe('delegation_end');
    expect(result.durationMs).toBe(5000);
    expect(result.verdict).toBe('pass');
  });

  it('should parse agent_status event', () => {
    const event = {
      type: 'agent_status' as const,
      timestamp: '2024-01-15T10:30:00.000Z',
      sessionId: 'test-session-123',
      agentName: 'mega_coder',
      status: 'active' as const,
      worktreeId: 'worktree-789',
    };
    const result = AgentStatusEventSchema.parse(event);
    expect(result.type).toBe('agent_status');
    expect(result.agentName).toBe('mega_coder');
    expect(result.status).toBe('active');
    expect(result.worktreeId).toBe('worktree-789');
  });

  it('should parse token_usage event', () => {
    const event = {
      type: 'token_usage' as const,
      timestamp: '2024-01-15T10:30:00.000Z',
      sessionId: 'test-session-123',
      agentName: 'mega_coder',
      inputTokens: 1000,
      outputTokens: 500,
      model: 'claude-3-opus',
    };
    const result = TokenUsageEventSchema.parse(event);
    expect(result.type).toBe('token_usage');
    expect(result.inputTokens).toBe(1000);
    expect(result.outputTokens).toBe(500);
    expect(result.model).toBe('claude-3-opus');
  });

  it('should parse tool_invocation event', () => {
    const event = {
      type: 'tool_invocation' as const,
      timestamp: '2024-01-15T10:30:00.000Z',
      sessionId: 'test-session-123',
      toolName: 'write',
      taskId: 'task-456',
      durationMs: 150,
      success: true,
    };
    const result = ToolInvocationEventSchema.parse(event);
    expect(result.type).toBe('tool_invocation');
    expect(result.toolName).toBe('write');
    expect(result.durationMs).toBe(150);
    expect(result.success).toBe(true);
  });

  it('should parse gate_evaluation event', () => {
    const event = {
      type: 'gate_evaluation' as const,
      timestamp: '2024-01-15T10:30:00.000Z',
      sessionId: 'test-session-123',
      taskId: 'task-456',
      gate: 'security',
      verdict: 'pass' as const,
      reason: 'No security issues found',
    };
    const result = GateEvaluationEventSchema.parse(event);
    expect(result.type).toBe('gate_evaluation');
    expect(result.gate).toBe('security');
    expect(result.verdict).toBe('pass');
    expect(result.reason).toBe('No security issues found');
  });

  it('should parse file_reservation event', () => {
    const event = {
      type: 'file_reservation' as const,
      timestamp: '2024-01-15T10:30:00.000Z',
      sessionId: 'test-session-123',
      taskId: 'task-456',
      files: ['src/auth.ts', 'src/config.ts'],
      action: 'reserve' as const,
      worktreeId: 'worktree-789',
    };
    const result = FileReservationEventSchema.parse(event);
    expect(result.type).toBe('file_reservation');
    expect(result.files).toEqual(['src/auth.ts', 'src/config.ts']);
    expect(result.action).toBe('reserve');
  });

  it('should parse phase_transition event', () => {
    const event = {
      type: 'phase_transition' as const,
      timestamp: '2024-01-15T10:30:00.000Z',
      sessionId: 'test-session-123',
      phase: 2,
      transition: 'complete' as const,
      taskCount: 15,
    };
    const result = PhaseTransitionEventSchema.parse(event);
    expect(result.type).toBe('phase_transition');
    expect(result.phase).toBe(2);
    expect(result.transition).toBe('complete');
    expect(result.taskCount).toBe(15);
  });

  it('should parse file_touch event', () => {
    const event = {
      type: 'file_touch' as const,
      timestamp: '2024-01-15T10:30:00.000Z',
      sessionId: 'test-session-123',
      taskId: 'task-456',
      filePath: 'src/index.ts',
      operation: 'write' as const,
    };
    const result = FileTouchEventSchema.parse(event);
    expect(result.type).toBe('file_touch');
    expect(result.filePath).toBe('src/index.ts');
    expect(result.operation).toBe('write');
  });

  it('should parse state_file_update event', () => {
    const event = {
      type: 'state_file_update' as const,
      timestamp: '2024-01-15T10:30:00.000Z',
      sessionId: 'test-session-123',
      filePath: '.swarm/plan.json',
      fileType: 'plan_json' as const,
    };
    const result = StateFileUpdateEventSchema.parse(event);
    expect(result.type).toBe('state_file_update');
    expect(result.filePath).toBe('.swarm/plan.json');
    expect(result.fileType).toBe('plan_json');
  });
});

describe('SwarmEventSchema (Discriminated Union)', () => {
  it('should parse session_metadata via union', () => {
    const event = {
      type: 'session_metadata' as const,
      timestamp: '2024-01-15T10:30:00.000Z',
      sessionId: 'test-session-123',
      version: '1.0.0',
      swarmDir: '/test',
      pid: 123,
      platform: 'linux',
      nodeVersion: 'v20.0.0',
    };
    const result = SwarmEventSchema.parse(event);
    expect(result.type).toBe('session_metadata');
  });

  it('should parse delegation_start via union', () => {
    const event = {
      type: 'delegation_start' as const,
      timestamp: '2024-01-15T10:30:00.000Z',
      sessionId: 'test-session-123',
      version: '1.0.0',
      taskId: 'task-1',
      targetAgent: 'mega_coder',
    };
    const result = SwarmEventSchema.parse(event);
    expect(result.type).toBe('delegation_start');
  });

  it('should parse gate_evaluation via union', () => {
    const event = {
      type: 'gate_evaluation' as const,
      timestamp: '2024-01-15T10:30:00.000Z',
      sessionId: 'test-session-123',
      version: '1.0.0',
      taskId: 'task-1',
      gate: 'test',
      verdict: 'pass' as const,
    };
    const result = SwarmEventSchema.parse(event);
    expect(result.type).toBe('gate_evaluation');
    expect((result as { verdict: 'pass' }).verdict).toBe('pass');
  });

  it('should parse phase_transition via union', () => {
    const event = {
      type: 'phase_transition' as const,
      timestamp: '2024-01-15T10:30:00.000Z',
      sessionId: 'test-session-123',
      version: '1.0.0',
      phase: 3,
      transition: 'start' as const,
    };
    const result = SwarmEventSchema.parse(event);
    expect(result.type).toBe('phase_transition');
    expect((result as { phase: number }).phase).toBe(3);
  });

  it('should parse state_file_update via union', () => {
    const event = {
      type: 'state_file_update' as const,
      timestamp: '2024-01-15T10:30:00.000Z',
      sessionId: 'test-session-123',
      version: '1.0.0',
      filePath: '.swarm/context.md',
      fileType: 'context_md' as const,
    };
    const result = SwarmEventSchema.parse(event);
    expect(result.type).toBe('state_file_update');
    expect((result as { fileType: 'context_md' }).fileType).toBe('context_md');
  });
});

describe('Type Guards', () => {
  it('isSessionMetadata returns true for session_metadata', () => {
    const event: SwarmEvent = {
      type: 'session_metadata',
      timestamp: '2024-01-15T10:30:00.000Z',
      sessionId: 'test-session-123',
      version: '1.0.0',
      swarmDir: '/test',
      pid: 123,
      platform: 'linux',
      nodeVersion: 'v20.0.0',
    };
    expect(isSessionMetadata(event)).toBe(true);
  });

  it('isSessionMetadata returns false for other types', () => {
    const event: SwarmEvent = {
      type: 'delegation_start',
      timestamp: '2024-01-15T10:30:00.000Z',
      sessionId: 'test-session-123',
      version: '1.0.0',
      taskId: 'task-1',
      targetAgent: 'mega_coder',
    };
    expect(isSessionMetadata(event)).toBe(false);
  });

  it('isDelegationStart returns true for delegation_start', () => {
    const event: SwarmEvent = {
      type: 'delegation_start',
      timestamp: '2024-01-15T10:30:00.000Z',
      sessionId: 'test-session-123',
      version: '1.0.0',
      taskId: 'task-1',
      targetAgent: 'mega_coder',
    };
    expect(isDelegationStart(event)).toBe(true);
  });

  it('isDelegationStart returns false for other types', () => {
    const event: SwarmEvent = {
      type: 'agent_status',
      timestamp: '2024-01-15T10:30:00.000Z',
      sessionId: 'test-session-123',
      version: '1.0.0',
      agentName: 'mega_coder',
      status: 'active',
    };
    expect(isDelegationStart(event)).toBe(false);
  });

  it('isAgentStatus returns true for agent_status', () => {
    const event: SwarmEvent = {
      type: 'agent_status',
      timestamp: '2024-01-15T10:30:00.000Z',
      sessionId: 'test-session-123',
      version: '1.0.0',
      agentName: 'mega_coder',
      status: 'active',
    };
    expect(isAgentStatus(event)).toBe(true);
  });

  it('isAgentStatus returns false for other types', () => {
    const event: SwarmEvent = {
      type: 'tool_invocation',
      timestamp: '2024-01-15T10:30:00.000Z',
      sessionId: 'test-session-123',
      version: '1.0.0',
      toolName: 'read',
      taskId: null,
    };
    expect(isAgentStatus(event)).toBe(false);
  });

  it('isGateEvaluation returns true for gate_evaluation', () => {
    const event: SwarmEvent = {
      type: 'gate_evaluation',
      timestamp: '2024-01-15T10:30:00.000Z',
      sessionId: 'test-session-123',
      version: '1.0.0',
      taskId: 'task-1',
      gate: 'security',
      verdict: 'pass',
    };
    expect(isGateEvaluation(event)).toBe(true);
  });

  it('isToolInvocation returns true for tool_invocation', () => {
    const event: SwarmEvent = {
      type: 'tool_invocation',
      timestamp: '2024-01-15T10:30:00.000Z',
      sessionId: 'test-session-123',
      version: '1.0.0',
      toolName: 'write',
      taskId: 'task-1',
    };
    expect(isToolInvocation(event)).toBe(true);
  });
});

describe('Invalid Event Parsing', () => {
  it('should reject event with missing required field (session_metadata without swarmDir)', () => {
    const event = {
      type: 'session_metadata' as const,
      timestamp: '2024-01-15T10:30:00.000Z',
      sessionId: 'test-session-123',
      pid: 123,
      platform: 'linux',
      nodeVersion: 'v20.0.0',
    };
    expect(() => SessionMetadataEventSchema.parse(event)).toThrow();
  });

  it('should reject event with wrong type literal', () => {
    const event = {
      type: 'invalid_type' as const,
      timestamp: '2024-01-15T10:30:00.000Z',
      sessionId: 'test-session-123',
      swarmDir: '/test',
      pid: 123,
      platform: 'linux',
      nodeVersion: 'v20.0.0',
    };
    expect(() => SessionMetadataEventSchema.parse(event)).toThrow();
  });

  it('should reject gate_evaluation with invalid verdict', () => {
    const event = {
      type: 'gate_evaluation' as const,
      timestamp: '2024-01-15T10:30:00.000Z',
      sessionId: 'test-session-123',
      taskId: 'task-1',
      gate: 'security',
      verdict: 'invalid_verdict' as const,
    };
    expect(() => GateEvaluationEventSchema.parse(event)).toThrow();
  });

  it('should reject agent_status with invalid status enum', () => {
    const event = {
      type: 'agent_status' as const,
      timestamp: '2024-01-15T10:30:00.000Z',
      sessionId: 'test-session-123',
      agentName: 'mega_coder',
      status: 'invalid_status' as const,
    };
    expect(() => AgentStatusEventSchema.parse(event)).toThrow();
  });

  it('should reject file_touch with invalid operation', () => {
    const event = {
      type: 'file_touch' as const,
      timestamp: '2024-01-15T10:30:00.000Z',
      sessionId: 'test-session-123',
      taskId: 'task-1',
      filePath: 'src/test.ts',
      operation: 'invalid_op' as const,
    };
    expect(() => FileTouchEventSchema.parse(event)).toThrow();
  });

  it('should reject state_file_update with invalid fileType', () => {
    const event = {
      type: 'state_file_update' as const,
      timestamp: '2024-01-15T10:30:00.000Z',
      sessionId: 'test-session-123',
      filePath: '.swarm/test.json',
      fileType: 'invalid_type' as const,
    };
    expect(() => StateFileUpdateEventSchema.parse(event)).toThrow();
  });

  it('should reject event with invalid datetime format', () => {
    const event = {
      type: 'session_metadata' as const,
      timestamp: 'not-a-date',
      sessionId: 'test-session-123',
      swarmDir: '/test',
      pid: 123,
      platform: 'linux',
      nodeVersion: 'v20.0.0',
    };
    expect(() => SessionMetadataEventSchema.parse(event)).toThrow();
  });

  it('should reject SwarmEventSchema with unknown type', () => {
    const event = {
      type: 'unknown_event_type' as const,
      timestamp: '2024-01-15T10:30:00.000Z',
      sessionId: 'test-session-123',
    };
    expect(() => SwarmEventSchema.parse(event)).toThrow();
  });
});

describe('Edge Cases', () => {
  it('should handle optional fields as undefined', () => {
    const event = {
      type: 'delegation_start' as const,
      timestamp: '2024-01-15T10:30:00.000Z',
      sessionId: 'test-session-123',
      taskId: null,
      targetAgent: 'mega_coder',
    };
    const result = DelegationStartEventSchema.parse(event);
    expect(result.taskId).toBeNull();
    expect(result.prompt).toBeUndefined();
  });

  it('should use default version if not provided', () => {
    const event = {
      type: 'session_metadata' as const,
      timestamp: '2024-01-15T10:30:00.000Z',
      sessionId: 'test-session-123',
      swarmDir: '/test',
      pid: 123,
      platform: 'linux',
      nodeVersion: 'v20.0.0',
    };
    const result = SessionMetadataEventSchema.parse(event);
    expect(result.version).toBe('1.0.0');
  });

  it('should allow empty files array in file_reservation', () => {
    const event = {
      type: 'file_reservation' as const,
      timestamp: '2024-01-15T10:30:00.000Z',
      sessionId: 'test-session-123',
      taskId: 'task-1',
      files: [],
      action: 'release' as const,
    };
    const result = FileReservationEventSchema.parse(event);
    expect(result.files).toEqual([]);
  });
});
