import { tool } from '@opencode-ai/plugin';
export declare const MAX_OUTPUT_BYTES = 512000;
export declare const MAX_COMMAND_LENGTH = 500;
export declare const DEFAULT_TIMEOUT_MS = 60000;
export declare const MAX_TIMEOUT_MS = 300000;
export declare const SUPPORTED_FRAMEWORKS: readonly ["bun", "vitest", "jest", "mocha", "pytest", "cargo", "pester", "go-test", "maven", "gradle", "dotnet-test", "ctest", "swift-test", "dart-test", "rspec", "minitest"];
export type TestFramework = (typeof SUPPORTED_FRAMEWORKS)[number] | 'none';
export interface TestRunnerArgs {
    scope?: 'all' | 'convention' | 'graph';
    files?: string[];
    coverage?: boolean;
    timeout_ms?: number;
}
export interface TestTotals {
    passed: number;
    failed: number;
    skipped: number;
    total: number;
}
export interface TestSuccessResult {
    success: true;
    framework: TestFramework;
    scope: 'all' | 'convention' | 'graph';
    command: string[];
    timeout_ms: number;
    duration_ms: number;
    totals: TestTotals;
    coveragePercent?: number;
    rawOutput?: string;
    message?: string;
}
export interface TestErrorResult {
    success: false;
    framework: TestFramework;
    scope: 'all' | 'convention' | 'graph';
    command?: string[];
    timeout_ms?: number;
    duration_ms?: number;
    totals?: TestTotals;
    coveragePercent?: number;
    error: string;
    rawOutput?: string;
    message?: string;
}
export type TestResult = TestSuccessResult | TestErrorResult;
export declare function detectTestFramework(cwd?: string): Promise<TestFramework>;
export declare function runTests(framework: TestFramework, scope: 'all' | 'convention' | 'graph', files: string[], coverage: boolean, timeout_ms: number, cwd?: string): Promise<TestResult>;
export declare const test_runner: ReturnType<typeof tool>;
