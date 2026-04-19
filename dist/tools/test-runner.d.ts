import { tool } from '@opencode-ai/plugin';
export declare const MAX_OUTPUT_BYTES = 512000;
export declare const MAX_COMMAND_LENGTH = 500;
export declare const DEFAULT_TIMEOUT_MS = 60000;
export declare const MAX_TIMEOUT_MS = 300000;
export declare const MAX_SAFE_TEST_FILES = 50;
export declare const SUPPORTED_FRAMEWORKS: readonly ["bun", "vitest", "jest", "mocha", "pytest", "cargo", "pester", "go-test", "maven", "gradle", "dotnet-test", "ctest", "swift-test", "dart-test", "rspec", "minitest"];
export type TestFramework = (typeof SUPPORTED_FRAMEWORKS)[number] | 'none';
export interface TestRunnerArgs {
    scope?: 'all' | 'convention' | 'graph' | 'impact';
    files?: string[];
    coverage?: boolean;
    timeout_ms?: number;
    allow_full_suite?: boolean;
}
export type RegressionOutcome = 'pass' | 'skip' | 'regression' | 'scope_exceeded' | 'error';
export interface TestTotals {
    passed: number;
    failed: number;
    skipped: number;
    total: number;
}
export interface TestSuccessResult {
    success: true;
    framework: TestFramework;
    scope: 'all' | 'convention' | 'graph' | 'impact';
    command: string[];
    timeout_ms: number;
    duration_ms: number;
    totals: TestTotals;
    coveragePercent?: number;
    rawOutput?: string;
    message?: string;
    outcome?: RegressionOutcome;
}
export interface TestErrorResult {
    success: false;
    framework: TestFramework;
    scope: 'all' | 'convention' | 'graph' | 'impact';
    command?: string[];
    timeout_ms?: number;
    duration_ms?: number;
    totals?: TestTotals;
    coveragePercent?: number;
    error: string;
    rawOutput?: string;
    message?: string;
    outcome?: RegressionOutcome;
    attempted_scope?: 'graph';
}
export type TestResult = TestSuccessResult | TestErrorResult;
export declare function detectTestFramework(cwd: string): Promise<TestFramework>;
/**
 * Returns true when `basename` matches a language-specific test file naming
 * convention that is NOT captured by the compound-extension or dot-separated
 * `.test.`/`.spec.` checks above.
 *
 * Covered patterns (all lower-cased for comparison):
 *   Go   : <name>_test.go          (per `go test` convention)
 *   Python: test_<name>.py          (pytest discovery default)
 *           <name>_test.py          (pytest alternative)
 *   Ruby : <name>_spec.rb           (RSpec convention)
 *   Java : Test<Name>.java          (JUnit 4/5 prefix)
 *          <Name>Test.java          (JUnit 4/5 suffix)
 *          <Name>Tests.java         (JUnit 4/5 plural suffix)
 *          <Name>IT.java            (Maven Failsafe integration-test suffix)
 *   C#   : <Name>Test.cs            (xUnit/NUnit/MSTest suffix)
 *          <Name>Tests.cs           (xUnit/NUnit/MSTest plural suffix)
 *   Rust : test files are recognized by test-directory placement
 *           (for example, tests/<anything>.rs via /tests/ path detection)
 *   Kotlin: <Name>Test.kt / <Name>Tests.kt / Test<Name>.kt
 *
 * Exported for unit tests; production code uses it only through
 * getTestFilesFromConvention.
 */
export declare function isLanguageSpecificTestFile(basename: string): boolean;
/**
 * Map source files (or already-test files) to the test files that should be
 * run for them. Handles any language whose test files follow a naming convention
 * — TS/JS, Go, Python, Ruby, Java, C#, Kotlin, PowerShell.
 *
 * Exported for unit tests.
 */
export declare function getTestFilesFromConvention(sourceFiles: string[], workingDir?: string): string[];
export declare function runTests(framework: TestFramework, scope: 'all' | 'convention' | 'graph' | 'impact', files: string[], coverage: boolean, timeout_ms: number, cwd: string): Promise<TestResult>;
export declare const test_runner: ReturnType<typeof tool>;
