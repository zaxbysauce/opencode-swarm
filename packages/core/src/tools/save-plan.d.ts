/**
 * Save plan tool for persisting validated implementation plans.
 * Allows the Architect agent to save structured plans to .swarm/plan.json and .swarm/plan.md.
 */
/**
 * Arguments for the save_plan tool
 */
export interface SavePlanArgs {
    title: string;
    swarm_id: string;
    phases: Array<{
        id: number;
        name: string;
        tasks: Array<{
            id: string;
            description: string;
            size?: 'small' | 'medium' | 'large';
            depends?: string[];
            acceptance?: string;
        }>;
    }>;
    working_directory?: string;
}
/**
 * Result from executing save_plan
 */
export interface SavePlanResult {
    success: boolean;
    message: string;
    plan_path?: string;
    phases_count?: number;
    tasks_count?: number;
    errors?: string[];
    recovery_guidance?: string;
}
/**
 * Detect template placeholder content (e.g., [task], [Project], [description], [N]).
 * These patterns indicate the LLM reproduced template examples literally rather than
 * filling in real content from the specification.
 * @param args - The save plan arguments to validate
 * @returns Array of issue strings describing found placeholders
 */
export declare function detectPlaceholderContent(args: SavePlanArgs): string[];
/**
 * Validate target workspace path.
 * Rejects missing, empty, whitespace-only, and traversal-style paths.
 * @param target - The target workspace path to validate
 * @param source - Description of the source (for error messages)
 * @returns Error message if invalid, undefined if valid
 */
export declare function validateTargetWorkspace(target: string | undefined, source: string): string | undefined;
/**
 * Execute the save_plan tool.
 * Validates for placeholder content, builds a Plan object, and saves to disk.
 * @param args - The save plan arguments
 * @returns SavePlanResult with success status and details
 */
export declare function executeSavePlan(args: SavePlanArgs, fallbackDir?: string): Promise<SavePlanResult>;
