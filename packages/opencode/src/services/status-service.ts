// Bridge module - adapts local OpenCode agent definition type to core service
import type { AgentDefinition as OpenCodeAgentDefinition } from '../agents';
import {
	formatStatusMarkdown,
	getStatusData as coreGetStatusData,
	handleStatusCommand as coreHandleStatusCommand,
	type StatusData,
} from '@opencode-swarm/core';

/**
 * Get status data - adapts local OpenCode agents to core type.
 * The core service only uses Object.keys(agents).length for counting,
 * so a safe cast is acceptable.
 */
export async function getStatusData(
	directory: string,
	agents: Record<string, OpenCodeAgentDefinition>,
): Promise<StatusData> {
	// Cast to core agent type - core only counts keys
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return coreGetStatusData(directory, agents as any);
}

/**
 * Handle status command - adapts local OpenCode agents to core type.
 * The core service only uses Object.keys(agents).length for counting,
 * so a safe cast is acceptable.
 */
export async function handleStatusCommand(
	directory: string,
	agents: Record<string, OpenCodeAgentDefinition>,
): Promise<string> {
	// Cast to core agent type - core only counts keys
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return coreHandleStatusCommand(directory, agents as any);
}

// Re-export type and pure formatting function (no type adaptation needed)
export { formatStatusMarkdown, type StatusData };
