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
	test('YOUR TOOLS with council.enabled=true matches full AGENT_TOOL_MAP architect entry', () => {
		// council.enabled=true exposes the full AGENT_TOOL_MAP.architect surface
		// including convene_council and declare_council_criteria. This is the
		// only configuration where YOUR TOOLS matches the map exactly.
		const agent = createArchitectAgent(
			'test-model',
			undefined,
			undefined,
			undefined,
			{ enabled: true },
		);
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

	test('YOUR TOOLS with council disabled (default) excludes the two council-only tools', () => {
		// Default no-arg call: council is undefined, which the prompt builder
		// treats as disabled. convene_council and declare_council_criteria
		// must be filtered out so the model is not shown phantom tools the
		// runtime gate (src/hooks/convene-council.ts) would reject.
		const agent = createArchitectAgent('test-model');
		const prompt =
			((agent.config as Record<string, unknown>).prompt as string) ?? '';

		const promptTools = extractPromptTools(prompt);
		const expected = [...AGENT_TOOL_MAP.architect]
			.filter(
				(t) => t !== 'convene_council' && t !== 'declare_council_criteria',
			)
			.sort();

		const promptToolsWithoutTask = promptTools
			.filter((t) => t !== 'Task (delegation)')
			.sort();

		expect(promptToolsWithoutTask).toEqual(expected);
		expect(promptToolsWithoutTask).not.toContain('convene_council');
		expect(promptToolsWithoutTask).not.toContain('declare_council_criteria');
	});
});
