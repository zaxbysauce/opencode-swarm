/**
 * Incremental verification hook — runs a typecheck after each coder Task delegation.
 * Fires in tool.execute.after when input.tool === 'Task' and the delegated agent was 'coder'.
 * Advisory only — never blocks. 30-second hard timeout. Uses directory from context.
 */
import type { IncrementalVerifyConfig } from '../config/schema';
export type { IncrementalVerifyConfig };
export { detectTypecheckCommand };
export interface IncrementalVerifyHook {
    toolAfter: (input: {
        tool: string;
        sessionID: string;
        args?: unknown;
    }, output: {
        output?: unknown;
        args?: unknown;
    }) => Promise<void>;
}
/** For test isolation — call in beforeEach/afterEach */
export declare function resetAdvisoryDedup(): void;
/**
 * Detect the typecheck/build check command for the project.
 * Returns { command, language } where command is null if no default checker exists,
 * or null overall if no supported language is detected.
 * Checks in order: TypeScript (package.json) → Go (go.mod) → Rust (Cargo.toml)
 * → Python (pyproject.toml/requirements.txt/setup.py) → C# (*.csproj/*.sln)
 * First match wins; package.json only short-circuits when TypeScript markers are present.
 * Otherwise the function falls through to Go/Rust/Python/C# detection.
 */
declare function detectTypecheckCommand(projectDir: string): {
    command: string[] | null;
    language: string;
} | null;
export declare function createIncrementalVerifyHook(config: IncrementalVerifyConfig, projectDir: string, injectMessage: (sessionId: string, message: string) => void): IncrementalVerifyHook;
