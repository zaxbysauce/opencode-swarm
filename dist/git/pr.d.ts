/**
 * Sanitize input string to prevent command injection
 * Removes or escapes shell metacharacters
 */
export declare function sanitizeInput(input: string): string;
/**
 * Check if gh CLI is available
 */
export declare function isGhAvailable(cwd: string): boolean;
/**
 * Check if authenticated with gh
 */
export declare function isAuthenticated(cwd: string): boolean;
/**
 * Create evidence.md summary
 */
export declare function generateEvidenceMd(cwd: string): string;
/**
 * Create a pull request
 */
export declare function createPullRequest(cwd: string, title: string, body?: string, baseBranch?: string): Promise<{
    url: string;
    number: number;
}>;
/**
 * Commit and push current changes
 */
export declare function commitAndPush(cwd: string, message: string): void;
