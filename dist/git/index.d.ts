import { createBranch, isGitRepo } from './branch.js';
import { isAuthenticated, isGhAvailable } from './pr.js';
export interface PRWorkflowOptions {
    title: string;
    body?: string;
    branch?: string;
}
export interface PRWorkflowResult {
    success: boolean;
    url?: string;
    number?: number;
    error?: string;
}
/**
 * Full PR workflow: create branch → commit → push → create PR
 */
export declare function runPRWorkflow(cwd: string, options: PRWorkflowOptions): Promise<PRWorkflowResult>;
/**
 * Generate evidence summary without creating PR
 */
export declare function prepareEvidence(cwd: string): string;
export { isGhAvailable, isAuthenticated, isGitRepo, createBranch };
