import { type ToolContext, tool } from '@opencode-ai/plugin';

/**
 * Options for creating a swarm tool.
 * The args type is inferred from what you pass to the tool() call.
 */
export interface SwarmToolOptions<Args extends Record<string, unknown>> {
	description: string;
	args: Args;
	execute: (args: Args, directory: string) => Promise<string>;
}

/**
 * Creates a swarm tool with automatic working directory injection.
 * Wraps the @opencode-ai/plugin/tool factory to always inject `directory` into tool execute callbacks.
 */
export function createSwarmTool<Args extends Record<string, unknown>>(
	opts: SwarmToolOptions<Args>,
): ReturnType<typeof tool> {
	type ToolArgs = Parameters<typeof tool>[0]['args'];
	type ToolExecuteArgs = Parameters<Parameters<typeof tool>[0]['execute']>[0];

	return tool({
		description: opts.description,
		args: opts.args as unknown as ToolArgs,
		execute: async (args: ToolExecuteArgs, ctx?: ToolContext) => {
			// process.cwd() fallback is intentional: used when tool is invoked directly (CLI) without plugin runtime context
			const directory = ctx?.directory ?? process.cwd();
			return opts.execute(args as Args, directory);
		},
	});
}
