// Event schemas and types
export {
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
} from './events';

export type {
  SwarmEventBase,
  SessionMetadataEvent,
  DelegationStartEvent,
  DelegationEndEvent,
  AgentStatusEvent,
  TokenUsageEvent,
  ToolInvocationEvent,
  GateEvaluationEvent,
  FileReservationEvent,
  PhaseTransitionEvent,
  FileTouchEvent,
  StateFileUpdateEvent,
  ParallelWaveStartEvent,
  ParallelWaveEndEvent,
  SwarmEvent,
} from './events';

// Type guards
export {
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
} from './guards';

// Version
export { TELEMETRY_SCHEMA_VERSION } from './version';
