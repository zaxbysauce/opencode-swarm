import type { AgentDefinition } from '../agents';
/**
 * Structured status data returned by the status service.
 * This can be used by GUI, background flows, or command adapters.
 */
export interface StatusData {
    hasPlan: boolean;
    currentPhase: string;
    completedTasks: number;
    totalTasks: number;
    agentCount: number;
    isLegacy: boolean;
}
/**
 * Get status data from the swarm directory.
 * Returns structured data that can be used by GUI, background flows, or commands.
 */
export declare function getStatusData(directory: string, agents: Record<string, AgentDefinition>): Promise<StatusData>;
/**
 * Format status data as markdown for command output.
 * This is the thin adapter that delegates to the service.
 */
export declare function formatStatusMarkdown(status: StatusData): string;
/**
 * Handle status command - delegates to service and formats output.
 * Kept for backward compatibility - thin adapter.
 */
export declare function handleStatusCommand(directory: string, agents: Record<string, AgentDefinition>): Promise<string>;
