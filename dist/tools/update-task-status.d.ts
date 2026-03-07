/**
 * Update task status tool for changing the status of individual tasks in a plan.
 * Allows agents to mark tasks as pending, in_progress, completed, or blocked.
 */
import { type ToolDefinition } from '@opencode-ai/plugin/tool';
/**
 * Arguments for the update_task_status tool
 */
export interface UpdateTaskStatusArgs {
    task_id: string;
    status: string;
    working_directory?: string;
}
/**
 * Result from executing update_task_status
 */
export interface UpdateTaskStatusResult {
    success: boolean;
    message: string;
    task_id?: string;
    new_status?: string;
    current_phase?: number;
    errors?: string[];
}
/**
 * Validate that the status is one of the allowed values.
 * @param status - The status to validate
 * @returns Error message if invalid, undefined if valid
 */
export declare function validateStatus(status: string): string | undefined;
/**
 * Validate that task_id matches the required format (N.M or N.M.P).
 * @param taskId - The task ID to validate
 * @returns Error message if invalid, undefined if valid
 */
export declare function validateTaskId(taskId: string): string | undefined;
/**
 * Execute the update_task_status tool.
 * Validates the task_id and status, then updates the task status in the plan.
 * @param args - The update task status arguments
 * @returns UpdateTaskStatusResult with success status and details
 */
export declare function executeUpdateTaskStatus(args: UpdateTaskStatusArgs, fallbackDir?: string): Promise<UpdateTaskStatusResult>;
/**
 * Tool definition for update_task_status
 */
export declare const update_task_status: ToolDefinition;
