import { describe, expect, test } from 'bun:test';
import { createArchitectAgent } from '../../../src/agents/architect';
import { AGENT_TOOL_MAP } from '../../../src/config/constants';

/**
 * Extracts the YOUR TOOLS list from the architect prompt.
 * The prompt contains a line like:
 * YOUR TOOLS: Task (delegation), checkpoint, check_gate_status, ...
 */
function extractPromptTools(prompt: string): string[] {
	const match = prompt.match(/YOUR TOOLS:\s*(.+?)(?:\n|$)/);
	if (!match) return [];
	return match[1]
		.replace(/\.$/, '') // Remove trailing period
		.split(',')
		.map((t) => t.trim())
		.filter((t) => t.length > 0);
}

describe('architect prompt tool alignment', () => {
	test('YOUR TOOLS in prompt matches AGENT_TOOL_MAP architect entry', () => {
		const agent = createArchitectAgent('test-model');
		const prompt =
			((agent.config as Record<string, unknown>).prompt as string) ?? '';

		const promptTools = extractPromptTools(prompt);
		const mapTools = [...AGENT_TOOL_MAP.architect].sort();

		// Remove 'Task (delegation)' from prompt tools — it's the built-in delegation tool, not in AGENT_TOOL_MAP
		const promptToolsWithoutTask = promptTools
			.filter((t) => t !== 'Task (delegation)')
			.sort();

		expect(promptToolsWithoutTask).toEqual(mapTools);
	});
});
