import type {
  AgentStatusEvent, DelegationEndEvent, DelegationStartEvent,
  FileReservationEvent, FileTouchEvent, GateEvaluationEvent,
  ParallelWaveEndEvent, ParallelWaveStartEvent,
  PhaseTransitionEvent, SessionMetadataEvent, StateFileUpdateEvent,
  SwarmEvent, TokenUsageEvent, ToolInvocationEvent,
} from './events';

export function isSessionMetadata(e: SwarmEvent): e is SessionMetadataEvent {
  return e.type === 'session_metadata';
}
export function isDelegationStart(e: SwarmEvent): e is DelegationStartEvent {
  return e.type === 'delegation_start';
}
export function isDelegationEnd(e: SwarmEvent): e is DelegationEndEvent {
  return e.type === 'delegation_end';
}
export function isAgentStatus(e: SwarmEvent): e is AgentStatusEvent {
  return e.type === 'agent_status';
}
export function isTokenUsage(e: SwarmEvent): e is TokenUsageEvent {
  return e.type === 'token_usage';
}
export function isToolInvocation(e: SwarmEvent): e is ToolInvocationEvent {
  return e.type === 'tool_invocation';
}
export function isGateEvaluation(e: SwarmEvent): e is GateEvaluationEvent {
  return e.type === 'gate_evaluation';
}
export function isFileReservation(e: SwarmEvent): e is FileReservationEvent {
  return e.type === 'file_reservation';
}
export function isPhaseTransition(e: SwarmEvent): e is PhaseTransitionEvent {
  return e.type === 'phase_transition';
}
export function isFileTouch(e: SwarmEvent): e is FileTouchEvent {
  return e.type === 'file_touch';
}
export function isStateFileUpdate(e: SwarmEvent): e is StateFileUpdateEvent {
  return e.type === 'state_file_update';
}
export function isParallelWaveStart(e: SwarmEvent): e is ParallelWaveStartEvent {
  return e.type === 'parallel_wave_start';
}
export function isParallelWaveEnd(e: SwarmEvent): e is ParallelWaveEndEvent {
  return e.type === 'parallel_wave_end';
}
