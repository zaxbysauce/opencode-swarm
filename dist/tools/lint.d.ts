import { tool } from '@opencode-ai/plugin';
export declare const MAX_OUTPUT_BYTES = 512000;
export declare const MAX_COMMAND_LENGTH = 500;
export declare const SUPPORTED_LINTERS: readonly ["biome", "eslint"];
export type SupportedLinter = (typeof SUPPORTED_LINTERS)[number];
export type AdditionalLinter = 'ruff' | 'clippy' | 'golangci-lint' | 'checkstyle' | 'ktlint' | 'dotnet-format' | 'cppcheck' | 'swiftlint' | 'dart-analyze' | 'rubocop';
export interface LintSuccessResult {
    success: true;
    mode: 'fix' | 'check';
    linter: SupportedLinter | AdditionalLinter;
    command: string[];
    exitCode: number;
    output: string;
    message?: string;
}
export interface LintErrorResult {
    success: false;
    mode: 'fix' | 'check';
    linter?: SupportedLinter | AdditionalLinter;
    command?: string[];
    exitCode?: number;
    output?: string;
    error: string;
    message?: string;
}
export type LintResult = LintSuccessResult | LintErrorResult;
export declare function containsPathTraversal(str: string): boolean;
export declare function containsControlChars(str: string): boolean;
export declare function validateArgs(args: unknown): args is {
    mode: 'fix' | 'check';
};
export declare function getLinterCommand(linter: SupportedLinter, mode: 'fix' | 'check'): string[];
/**
 * Build the shell command for an additional (non-JS/TS) linter.
 * cppcheck has no --fix mode; csharp and some others behave differently.
 */
export declare function getAdditionalLinterCommand(linter: AdditionalLinter, mode: 'fix' | 'check', cwd: string): string[];
/**
 * Detect the first available additional (non-JS/TS) linter for the current project.
 * Returns null when no additional linter is detected or its binary is unavailable.
 */
export declare function detectAdditionalLinter(cwd: string): 'ruff' | 'clippy' | 'golangci-lint' | 'checkstyle' | 'ktlint' | 'dotnet-format' | 'cppcheck' | 'swiftlint' | 'dart-analyze' | 'rubocop' | null;
export declare function detectAvailableLinter(): Promise<SupportedLinter | null>;
export declare function runLint(linter: SupportedLinter, mode: 'fix' | 'check'): Promise<LintResult>;
/**
 * Run an additional (non-JS/TS) linter.
 * Follows the same structure as runLint() but uses getAdditionalLinterCommand().
 */
export declare function runAdditionalLint(linter: AdditionalLinter, mode: 'fix' | 'check', cwd: string): Promise<LintResult>;
export declare const lint: ReturnType<typeof tool>;
