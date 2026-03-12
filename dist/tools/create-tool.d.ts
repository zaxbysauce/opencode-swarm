import { type ToolContext, tool } from '@opencode-ai/plugin';
/**
 * Options for creating a swarm tool.
 * The args type is inferred from what you pass to the tool() call.
 */
export interface SwarmToolOptions<Args extends Record<string, unknown>> {
    description: string;
    args: Args;
    execute: (args: Args, directory: string, ctx?: ToolContext) => Promise<string>;
}
/**
 * Creates a swarm tool with automatic working directory injection.
 * Wraps the @opencode-ai/plugin/tool factory to always inject `directory` and `ctx` into tool execute callbacks.
 */
export declare function createSwarmTool<Args extends Record<string, unknown>>(opts: SwarmToolOptions<Args>): ReturnType<typeof tool>;
