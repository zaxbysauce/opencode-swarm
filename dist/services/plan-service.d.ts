/**
 * Structured plan data for a specific phase or full plan.
 */
export interface PlanData {
    hasPlan: boolean;
    fullMarkdown: string;
    requestedPhase: number | null;
    phaseMarkdown: string | null;
    errorMessage: string | null;
    isLegacy: boolean;
}
/**
 * Get plan data from the swarm directory.
 * Returns structured data for GUI, background flows, or commands.
 */
export declare function getPlanData(directory: string, phaseArg?: string | number): Promise<PlanData>;
/**
 * Format plan data as markdown for command output.
 */
export declare function formatPlanMarkdown(planData: PlanData): string;
/**
 * Handle plan command - delegates to service and formats output.
 * Kept for backward compatibility - thin adapter.
 */
export declare function handlePlanCommand(directory: string, args: string[]): Promise<string>;
