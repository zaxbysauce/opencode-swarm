/**
 * Preflight Automation Service
 *
 * Runs automated preflight checks for release readiness:
 * - lint check
 * - tests check (sane verification scope)
 * - secrets check
 * - evidence completeness check
 * - version consistency check
 *
 * Returns deterministic structured result with per-check status + overall verdict.
 * Callable by background flow (from preflight.requested events).
 */
/** Preflight check types */
export type PreflightCheckType = 'lint' | 'tests' | 'secrets' | 'evidence' | 'version';
/** Individual check status */
export interface PreflightCheckResult {
    type: PreflightCheckType;
    status: 'pass' | 'fail' | 'skip' | 'error';
    message: string;
    details?: Record<string, unknown>;
    durationMs?: number;
}
/** Preflight report structure */
export interface PreflightReport {
    id: string;
    timestamp: number;
    phase: number;
    overall: 'pass' | 'fail' | 'skipped';
    checks: PreflightCheckResult[];
    totalDurationMs: number;
    message: string;
}
/** Preflight configuration */
export interface PreflightConfig {
    /** Timeout per check in ms (default 60s, min 5s, max 300s) */
    checkTimeoutMs?: number;
    /** Skip tests check (default false) */
    skipTests?: boolean;
    /** Skip secrets check (default false) */
    skipSecrets?: boolean;
    /** Skip evidence check (default false) */
    skipEvidence?: boolean;
    /** Skip version check (default false) */
    skipVersion?: boolean;
    /** Test scope (default 'convention' for faster preflight) */
    testScope?: 'all' | 'convention' | 'graph';
    /** Linter to use (default 'biome') */
    linter?: 'biome' | 'eslint';
}
/**
 * Run all preflight checks
 */
export declare function runPreflight(dir: string, phase: number, config?: PreflightConfig): Promise<PreflightReport>;
/**
 * Format preflight report as markdown
 */
export declare function formatPreflightMarkdown(report: PreflightReport): string;
/**
 * Handle preflight command - thin adapter for CLI
 */
export declare function handlePreflightCommand(directory: string, _args: string[]): Promise<string>;
