/**
 * Structured history data for a single phase.
 */
export interface PhaseHistoryData {
    id: number;
    name: string;
    status: 'complete' | 'in_progress' | 'pending' | 'blocked';
    statusText: string;
    statusIcon: string;
    completedTasks: number;
    totalTasks: number;
    tasksDisplay: string;
}
/**
 * Structured history data returned by the history service.
 */
export interface HistoryData {
    hasPlan: boolean;
    phases: PhaseHistoryData[];
    isLegacy: boolean;
}
/**
 * Get history data from the swarm directory.
 * Returns structured data for GUI, background flows, or commands.
 */
export declare function getHistoryData(directory: string): Promise<HistoryData>;
/**
 * Format history data as markdown for command output.
 */
export declare function formatHistoryMarkdown(history: HistoryData): string;
/**
 * Handle history command - delegates to service and formats output.
 * Kept for backward compatibility - thin adapter.
 */
export declare function handleHistoryCommand(directory: string, _args: string[]): Promise<string>;
