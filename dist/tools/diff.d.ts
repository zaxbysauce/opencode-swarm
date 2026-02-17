import { tool } from '@opencode-ai/plugin';
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
export declare const diff: ReturnType<typeof tool>;
