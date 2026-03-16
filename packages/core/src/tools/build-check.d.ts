/**
 * Build Check Tool
 *
 * Discovers and runs build commands for various ecosystems in a project directory.
 */
import type { EvidenceVerdict } from '../config/evidence-schema';
export declare const DEFAULT_TIMEOUT_MS = 300000;
export declare const MAX_OUTPUT_BYTES: number;
export declare const MAX_OUTPUT_LINES = 100;
export interface BuildCheckInput {
    /** Scope: 'changed' or 'all' */
    scope: 'changed' | 'all';
    /** List of changed files when scope is 'changed' */
    changed_files?: string[];
    /** Mode: 'build', 'typecheck', or 'both' (default: 'both') */
    mode?: 'build' | 'typecheck' | 'both';
}
export interface BuildRun {
    kind: 'build' | 'typecheck' | 'test';
    command: string;
    cwd: string;
    exit_code: number;
    duration_ms: number;
    stdout_tail: string;
    stderr_tail: string;
}
export interface BuildCheckResult {
    verdict: EvidenceVerdict;
    runs: BuildRun[];
    summary: {
        files_scanned: number;
        runs_count: number;
        failed_count: number;
        skipped_reason?: string;
    };
}
/**
 * Truncate output to last maxLines lines, but not more than maxBytes
 */
export declare function truncateOutput(output: string, maxLines?: number, maxBytes?: number): string;
/**
 * Parse command to determine its kind
 */
export declare function getCommandKind(command: string): 'build' | 'typecheck' | 'test';
/**
 * Run build check: discover and execute build commands
 */
export declare function runBuildCheck(workingDir: string, input: BuildCheckInput): Promise<BuildCheckResult>;
/**
 * Run build check with evidence saving (for plugin wrapper)
 */
export declare function runBuildCheckWithEvidence(workingDir: string, input: BuildCheckInput): Promise<string>;
