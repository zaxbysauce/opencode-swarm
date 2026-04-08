/**
 * Centralized conflict resolution policy.
 * Encapsulates advisory injection and telemetry emission for agent-vs-agent conflicts.
 * Call this whenever: Reviewer rejects coder output repeatedly, Critic returns
 * REPHRASE/RESOLVE and Architect loops, or Test Engineer blocks previously reviewed work.
 */
import { swarmState } from '../state.js';
import { emit } from '../telemetry.js';
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

export function resolveAgentConflict(input: ResolveAgentConflictInput): void {
	const session = swarmState.agentSessions.get(input.sessionID);
	if (!session) return;

	session.pendingAdvisoryMessages ??= [];

	const rejections = input.rejectionCount ?? 0;
	let resolutionPath: AgentConflictDetectedEvent['resolutionPath'];

	if (rejections >= 3) {
		resolutionPath = 'soundingboard';
		session.pendingAdvisoryMessages.push(
			`CONFLICT ESCALATION: ${input.sourceAgent} vs ${input.targetAgent} on task ${
				input.taskId ?? 'unknown'
			}. Three or more failed cycles detected. Route to Critic in SOUNDING_BOARD mode, then simplify before any user escalation.`,
		);
	} else {
		resolutionPath = 'self_resolve';
		session.pendingAdvisoryMessages.push(
			`CONFLICT DETECTED: ${input.sourceAgent} disagrees with ${input.targetAgent} on task ${
				input.taskId ?? 'unknown'
			}. Attempt self-resolution using .swarm/plan.md, .swarm/spec.md, and .swarm/context.md before escalation.`,
		);
	}

	// Emit telemetry — fire and forget, never throws
	const event: AgentConflictDetectedEvent = {
		type: 'agent_conflict_detected',
		timestamp: new Date().toISOString(),
		sessionId: input.sessionID,
		phase: input.phase,
		taskId: input.taskId,
		sourceAgent: input.sourceAgent,
		targetAgent: input.targetAgent,
		conflictType: input.conflictType,
		resolutionPath,
		summary: input.summary,
	};
	emit(
		'agent_conflict_detected' as Parameters<typeof emit>[0],
		event as unknown as Record<string, unknown>,
	);
}
