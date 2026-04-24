/**
 * Structured export data.
 */
export interface ExportData {
    version: string;
    exported: string;
    plan: unknown;
    context: string | null;
    /** The plan's execution_profile, if set. Consumers must honour locked profiles. */
    execution_profile?: {
        parallelization_enabled: boolean;
        max_concurrent_tasks: number;
        council_parallel: boolean;
        locked: boolean;
    } | null;
}
/**
 * Get export data from the swarm directory.
 * Returns structured data for GUI, background flows, or commands.
 */
export declare function getExportData(directory: string): Promise<ExportData>;
/**
 * Format export data as markdown with JSON code block for command output.
 */
export declare function formatExportMarkdown(exportData: ExportData): string;
/**
 * Handle export command - delegates to service and formats output.
 * Kept for backward compatibility - thin adapter.
 */
export declare function handleExportCommand(directory: string, _args: string[]): Promise<string>;
