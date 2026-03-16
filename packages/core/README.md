# @opencode-swarm/core

Core orchestration and parallel execution planning for OpenCode Swarm.

## Installation

```bash
npm install @opencode-swarm/core
```

## Usage

```typescript
import { ExecutionCoordinator } from '@opencode-swarm/core';

const coordinator = new ExecutionCoordinator('/path/to/project');

// Plan parallel execution from a plan file
const plan = coordinator.planParallelExecution('/path/to/plan.json');

console.log(`Estimated waves: ${plan.estimatedWaves}`);
console.log('Tasks requiring serial execution:', plan.serialFallbacks);

// Each wave contains tasks that can run in parallel
for (const [i, wave] of plan.waves.entries()) {
  console.log(`Wave ${i}:`, wave.map(t => t.id).join(', '));
}
```

## API

### ExecutionCoordinator

Coordinator for parallel execution planning and dispatch.

#### constructor(swarmDir: string)

Creates a new coordinator instance.

- **Parameters:**
  - `swarmDir` - Path to the Swarm project directory

#### planParallelExecution(planPath: string): ExecutionPlan

Analyzes a plan file and creates an execution plan with wave-based parallelism.

- **Parameters:**
  - `planPath` - Path to the plan.json file

- **Returns:** `ExecutionPlan` with waves, estimated count, and serial fallbacks

#### dispatchAgent(taskId: string, agent: string, worktreeId?: string): AgentHandle

Dispatches an agent to execute a specific task.

> **Note:** This is a stub method. Full implementation targeted for v7.3.

- **Parameters:**
  - `taskId` - Task identifier
  - `agent` - Agent name
  - `worktreeId` - Optional worktree for isolation

- **Throws:** `Error` - Parallel execution not yet implemented

#### awaitCompletion(handles: AgentHandle[]): Promise<void>

Waits for all dispatched agents to complete.

> **Note:** This is a stub method. Full implementation targeted for v7.3.

- **Throws:** `Error` - Parallel execution not yet implemented

#### mergeResults(handles: AgentHandle[]): Promise<MergeOutcome>

Merges results from multiple agent executions.

> **Note:** This is a stub method. Full implementation targeted for v7.3.

- **Throws:** `Error` - Parallel execution not yet implemented

### Interfaces

#### ExecutionPlan

```typescript
interface ExecutionPlan {
  waves: TaskNode[][];
  estimatedWaves: number;
  serialFallbacks: string[];
}
```

| Field | Type | Description |
|-------|------|-------------|
| `waves` | `TaskNode[][]` | Array of task waves (each wave can run in parallel) |
| `estimatedWaves` | `number` | Estimated number of waves |
| `serialFallbacks` | `string[]` | Tasks that cannot be parallelized due to circular dependencies |

#### AgentHandle

```typescript
interface AgentHandle {
  taskId: string;
  agent: string;
  worktreeId?: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  result?: unknown;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `taskId` | `string` | Task identifier |
| `agent` | `string` | Agent name |
| `worktreeId` | `string?` | Worktree identifier for isolation |
| `status` | `'pending' \| 'running' \| 'complete' \| 'failed'` | Current execution status |
| `result` | `unknown?` | Task result when complete |

#### ConflictInfo

```typescript
interface ConflictInfo {
  file: string;
  agents: string[];
  type: 'edit_edit' | 'edit_delete' | 'delete_edit';
}
```

| Field | Type | Description |
|-------|------|-------------|
| `file` | `string` | Conflicting file path |
| `agents` | `string[]` | Agents that touched this file |
| `type` | `'edit_edit' \| 'edit_delete' \| 'delete_edit'` | Type of conflict |

#### MergeOutcome

```typescript
interface MergeOutcome {
  success: boolean;
  conflicts: ConflictInfo[];
  mergedFiles: string[];
}
```

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | Whether merge was successful |
| `conflicts` | `ConflictInfo[]` | File conflicts that occurred |
| `mergedFiles` | `string[]` | Files that were successfully merged |

## Dependencies

- `@opencode-swarm/telemetry` - Event schemas for telemetry

## See Also

- [Main README](../README.md)
- [@opencode-swarm/telemetry](../telemetry/README.md)
