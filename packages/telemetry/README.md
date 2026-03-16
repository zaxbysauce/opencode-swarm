# @opencode-swarm/telemetry

Event schemas, type guards, and telemetry infrastructure for OpenCode Swarm.

## Installation

```bash
npm install @opencode-swarm/telemetry
```

## Usage

```typescript
import {
  SwarmEventSchema,
  ParallelWaveStartEventSchema,
  isParallelWaveStart,
  TELEMETRY_SCHEMA_VERSION,
} from '@opencode-swarm/telemetry';

// Validate an event
const event = {
  type: 'parallel_wave_start',
  timestamp: new Date().toISOString(),
  sessionId: 'abc123',
  version: TELEMETRY_SCHEMA_VERSION,
  waveIndex: 0,
  totalWaves: 3,
  taskIds: ['1.1', '1.2', '1.3'],
};

const parsed = ParallelWaveStartEventSchema.parse(event);

// Type guard usage
function handleEvent(event: unknown) {
  if (isParallelWaveStart(event)) {
    console.log(`Wave ${event.waveIndex} starting with ${event.taskIds.length} tasks`);
  }
}
```

## Event Types

| Event | Description |
|-------|-------------|
| `session_metadata` | Session initialization (once on startup) |
| `delegation_start` | Architect delegates to a subagent |
| `delegation_end` | Subagent delegation completes |
| `agent_status` | Agent activity (active/idle/complete) |
| `token_usage` | LLM token consumption tracking |
| `tool_invocation` | Tool call events |
| `gate_evaluation` | QA gate results (pass/fail/skip) |
| `file_reservation` | File scope declaration/locking |
| `phase_transition` | Phase start/complete events |
| `file_touch` | File modifications by coder tasks |
| `state_file_update` | Writes to `.swarm/` state files |
| `parallel_wave_start` | Parallel execution wave begins |
| `parallel_wave_end` | Parallel execution wave completes |

## Schema Reference

### ParallelWaveStartEvent

Emitted when a parallel wave of tasks begins execution.

```typescript
{
  type: 'parallel_wave_start';
  timestamp: string;        // ISO 8601 datetime
  sessionId: string;
  version: string;          // TELEMETRY_SCHEMA_VERSION
  waveIndex: number;        // 0-based wave number
  totalWaves: number;       // Total waves in plan
  taskIds: string[];        // Tasks in this wave
}
```

### ParallelWaveEndEvent

Emitted when a parallel wave of tasks completes.

```typescript
{
  type: 'parallel_wave_end';
  timestamp: string;
  sessionId: string;
  version: string;
  waveIndex: number;
  outcomes: {
    taskId: string;
    success: boolean;
  }[];
  mergeConflicts: number;   // Count of merge conflicts
}
```

## Type Guards

| Guard | Returns true for |
|-------|------------------|
| `isSessionMetadata` | `SessionMetadataEvent` |
| `isDelegationStart` | `DelegationStartEvent` |
| `isDelegationEnd` | `DelegationEndEvent` |
| `isAgentStatus` | `AgentStatusEvent` |
| `isTokenUsage` | `TokenUsageEvent` |
| `isToolInvocation` | `ToolInvocationEvent` |
| `isGateEvaluation` | `GateEvaluationEvent` |
| `isFileReservation` | `FileReservationEvent` |
| `isPhaseTransition` | `PhaseTransitionEvent` |
| `isFileTouch` | `FileTouchEvent` |
| `isStateFileUpdate` | `StateFileUpdateEvent` |
| `isParallelWaveStart` | `ParallelWaveStartEvent` |
| `isParallelWaveEnd` | `ParallelWaveEndEvent` |

## Constants

| Constant | Value |
|----------|-------|
| `TELEMETRY_SCHEMA_VERSION` | `'1.0.0'` |

## Dependencies

- `zod` - Schema validation

## See Also

- [Main README](../README.md)
- [@opencode-swarm/core](../core/README.md)
