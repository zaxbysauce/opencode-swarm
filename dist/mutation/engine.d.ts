export type MutationOutcome = 'killed' | 'survived' | 'timeout' | 'error' | 'equivalent' | 'skipped';
export interface MutationPatch {
    id: string;
    filePath: string;
    functionName: string;
    mutationType: string;
    patch: string;
    lineNumber?: number;
}
export interface MutationResult {
    patchId: string;
    filePath: string;
    functionName: string;
    mutationType: string;
    outcome: MutationOutcome;
    testOutput?: string;
    durationMs: number;
    error?: string;
}
export interface MutationReport {
    totalMutants: number;
    killed: number;
    survived: number;
    timeout: number;
    equivalent: number;
    skipped: number;
    errors: number;
    killRate: number;
    adjustedKillRate: number;
    perFunction: Map<string, {
        killed: number;
        survived: number;
        total: number;
        equivalent: number;
        skipped: number;
        killRate: number;
    }>;
    results: MutationResult[];
    durationMs: number;
    budgetMs: number;
    budgetExceeded: boolean;
    timestamp: string;
}
export declare const MAX_MUTATIONS_PER_FUNCTION = 10;
/**
 * Build the argument array for `git apply` with cross-platform whitespace
 * tolerance.  `--ignore-whitespace` makes git ignore CRLF/LF differences in
 * context lines, which is required on Windows where `core.autocrlf=true`
 * causes checked-out files to use CRLF while LLM-generated patches use LF.
 * The flag is a no-op on macOS and Linux (files already use LF).
 */
export declare function buildGitApplyArgs(patchFile: string): string[];
/**
 * Build the argument array for `git apply -R` (revert) with the same
 * cross-platform whitespace tolerance as `buildGitApplyArgs`.
 */
export declare function buildGitRevertArgs(patchFile: string): string[];
export declare function executeMutation(patch: MutationPatch, testCommand: string[], _testFiles: string[], workingDir: string): Promise<MutationResult>;
export declare function computeReport(results: MutationResult[], durationMs: number, budgetMs?: number): MutationReport;
export declare function executeMutationSuite(patches: MutationPatch[], testCommand: string[], testFiles: string[], workingDir: string, budgetMs?: number, onProgress?: (completed: number, total: number, result: MutationResult) => void, sourceFiles?: Map<string, string>): Promise<MutationReport>;
