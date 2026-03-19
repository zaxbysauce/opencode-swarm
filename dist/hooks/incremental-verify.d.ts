/**
 * Incremental verification hook — runs a typecheck after each coder Task delegation.
 * Fires in tool.execute.after when input.tool === 'Task' and the delegated agent was 'coder'.
 * Advisory only — never blocks. 30-second hard timeout. Uses directory from context.
 */
import type { IncrementalVerifyConfig } from '../config/schema';
export type { IncrementalVerifyConfig };
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
export declare function createIncrementalVerifyHook(config: IncrementalVerifyConfig, projectDir: string, injectMessage: (sessionId: string, message: string) => void): IncrementalVerifyHook;
