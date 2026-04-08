import type { AgentConflictDetectedEvent } from '../types/events.js';
export interface ResolveAgentConflictInput {
    sessionID: string;
    phase: number;
    taskId?: string;
    sourceAgent: AgentConflictDetectedEvent['sourceAgent'];
    targetAgent: AgentConflictDetectedEvent['targetAgent'];
    conflictType: AgentConflictDetectedEvent['conflictType'];
    rejectionCount?: number;
    summary: string;
}
export declare function resolveAgentConflict(input: ResolveAgentConflictInput): void;
