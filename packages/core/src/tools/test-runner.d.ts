export declare const MAX_OUTPUT_BYTES = 512000;
export declare const MAX_COMMAND_LENGTH = 500;
export declare const DEFAULT_TIMEOUT_MS = 60000;
export declare const MAX_TIMEOUT_MS = 300000;
export declare const MAX_SAFE_TEST_FILES = 50;
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
export declare function containsPathTraversal(str: string): boolean;
export declare function isAbsolutePath(str: string): boolean;
export declare function containsControlChars(str: string): boolean;
export declare function containsPowerShellMetacharacters(str: string): boolean;
export declare function validateArgs(args: unknown): args is TestRunnerArgs;
/** Detect Go test runner (go test ./...) */
export declare function detectGoTest(cwd: string): boolean;
/** Detect Java/Maven test runner (mvn test) */
export declare function detectJavaMaven(cwd: string): boolean;
/** Detect Java/Gradle or Kotlin/Gradle test runner (gradlew test) */
export declare function detectGradle(cwd: string): boolean;
/** Detect C#/.NET test runner (dotnet test) */
export declare function detectDotnetTest(cwd: string): boolean;
/** Detect C/C++ CTest runner */
export declare function detectCTest(cwd: string): boolean;
/** Detect Swift test runner (swift test) */
export declare function detectSwiftTest(cwd: string): boolean;
/** Detect Dart/Flutter test runner (dart test or flutter test) */
export declare function detectDartTest(cwd: string): boolean;
/** Detect Ruby/RSpec test runner */
export declare function detectRSpec(cwd: string): boolean;
/** Detect Ruby/Minitest test runner */
export declare function detectMinitest(cwd: string): boolean;
export declare function detectTestFramework(cwd?: string): Promise<TestFramework>;
export declare function hasCompoundTestExtension(filename: string): boolean;
export declare function getTestFilesFromConvention(sourceFiles: string[]): string[];
export declare function getTestFilesFromGraph(sourceFiles: string[]): Promise<string[]>;
export declare function buildTestCommand(framework: TestFramework, scope: 'all' | 'convention' | 'graph', files: string[], coverage: boolean, baseDir: string): string[] | null;
export declare function parseTestOutput(framework: TestFramework, output: string): {
    totals: TestTotals;
    coveragePercent?: number;
};
export declare function runTests(framework: TestFramework, scope: 'all' | 'convention' | 'graph', files: string[], coverage: boolean, timeout_ms: number, cwd?: string): Promise<TestResult>;
export declare function findSourceFiles(dir: string, files?: string[]): string[];
