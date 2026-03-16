export declare function validateBase(base: string): string | null;
export declare function validatePaths(paths: string[] | undefined): string | null;
export interface DiffResult {
    files: Array<{
        path: string;
        additions: number;
        deletions: number;
    }>;
    contractChanges: string[];
    hasContractChanges: boolean;
    summary: string;
}
export interface DiffErrorResult {
    error: string;
    files: [];
    contractChanges: [];
    hasContractChanges: false;
}
/**
 * Run diff analysis
 */
export declare function runDiff(args: {
    base?: string;
    paths?: string[];
}, directory: string): Promise<DiffResult | DiffErrorResult>;
