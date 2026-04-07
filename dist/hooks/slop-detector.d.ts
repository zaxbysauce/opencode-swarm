/**
 * Slop detector — PostToolUse hook that checks for AI code quality anti-patterns.
 * Fires after Write and Edit tool calls. Runs 4 heuristics and emits an advisory
 * system message when findings are detected. Non-blocking, <500ms.
 */
import type { SlopDetectorConfig } from '../config/schema';
export type { SlopDetectorConfig };
export interface SlopDetectorHook {
    toolAfter: (input: {
        tool: string;
        sessionID: string;
    }, output: {
        output?: unknown;
        args?: unknown;
    }) => Promise<void>;
}
export declare function createSlopDetectorHook(config: SlopDetectorConfig, projectDir: string, injectSystemMessage: (sessionId: string, message: string) => void): SlopDetectorHook;
