/**
 * Tests for architect tool list generation functions.
 *
 * Verifies that YOUR TOOLS and Available Tools in the architect prompt are
 * generated from AGENT_TOOL_MAP.architect as the single source of truth,
 * replacing the previously hand-maintained lists.
 *
 * Covers:
 * 1. YOUR TOOLS contains all 39 AGENT_TOOL_MAP.architect tools
 * 2. YOUR TOOLS starts with "Task (delegation),"
 * 3. Available Tools contains all 39 AGENT_TOOL_MAP.architect tools
 * 4. Available Tools has descriptions (e.g. "build_check (build verification)")
 * 5. Both lists are sorted alphabetically (after "Task (delegation)" prefix for YOUR TOOLS)
 * 6. Tool count matches AGENT_TOOL_MAP.architect.length
 */

import { beforeAll, describe, expect, it } from 'bun:test';
import { createArchitectAgent } from '../../../src/agents/architect.js';
import { AGENT_TOOL_MAP } from '../../../src/config/constants.js';

const ARCHITECT_TOOL_COUNT = AGENT_TOOL_MAP['architect'].length;

let resolvedPrompt: string;

// Render with council.enabled=true so the full AGENT_TOOL_MAP.architect
// surface (including `convene_council` and `declare_council_criteria`)
// appears in YOUR TOOLS and Available Tools. Without council enabled,
// those tools are filtered out of the prompt — see
// architect-tool-visibility-council.test.ts for the council-off behavior.
beforeAll(() => {
	const agent = createArchitectAgent(
		'test-model',
		undefined,
		undefined,
		undefined,
		{ enabled: true },
	);
	resolvedPrompt = agent.config.prompt ?? '';
});

describe('YOUR TOOLS generation from AGENT_TOOL_MAP', () => {
	it('contains all 39 AGENT_TOOL_MAP.architect tools', () => {
		for (const tool of AGENT_TOOL_MAP['architect']) {
			expect(resolvedPrompt).toContain(tool);
		}
	});

	it('starts with "Task (delegation)," prefix', () => {
		// Extract YOUR TOOLS line - multiline match to capture just this line
		const yourToolsMatch = resolvedPrompt.match(/^YOUR TOOLS: (.+?)$/m);
		expect(yourToolsMatch).not.toBeNull();
		const yourToolsSection = yourToolsMatch![1];
		expect(yourToolsSection.trim().startsWith('Task (delegation),')).toBe(true);
	});

	it('tool count matches AGENT_TOOL_MAP.architect.length', () => {
		// Extract YOUR TOOLS line
		const yourToolsMatch = resolvedPrompt.match(/^YOUR TOOLS: (.+?)$/m);
		expect(yourToolsMatch).not.toBeNull();
		const yourToolsSection = yourToolsMatch![1];

		// Remove prefix, split by comma+space, trim trailing period
		const afterPrefix = yourToolsSection
			.replace('Task (delegation),', '')
			.trim();
		const toolsStr = afterPrefix.replace(/\.\s*$/, ''); // remove trailing period
		const tools = toolsStr
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean);

		expect(tools.length).toBe(ARCHITECT_TOOL_COUNT);
	});

	it('tools after prefix are sorted alphabetically', () => {
		const yourToolsMatch = resolvedPrompt.match(/^YOUR TOOLS: (.+?)$/m);
		expect(yourToolsMatch).not.toBeNull();
		const yourToolsSection = yourToolsMatch![1];

		const afterPrefix = yourToolsSection
			.replace('Task (delegation),', '')
			.trim();
		const toolsStr = afterPrefix.replace(/\.\s*$/, '');
		const tools = toolsStr
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean);

		const sorted = [...tools].sort();
		expect(tools).toEqual(sorted);
	});
});

describe('Available Tools generation from AGENT_TOOL_MAP', () => {
	it('contains all 39 AGENT_TOOL_MAP.architect tools', () => {
		for (const tool of AGENT_TOOL_MAP['architect']) {
			expect(resolvedPrompt).toContain(tool);
		}
	});

	it('has descriptions for tools that have TOOL_DESCRIPTIONS entries', () => {
		// build_check has description "build verification"
		expect(resolvedPrompt).toContain('build_check (build verification)');
		// checkpoint has description "state snapshots"
		expect(resolvedPrompt).toContain('checkpoint (state snapshots)');
		// secretscan has description "secret detection"
		expect(resolvedPrompt).toContain('secretscan (secret detection)');
	});

	it('tool count matches AGENT_TOOL_MAP.architect.length', () => {
		// Extract Available Tools line
		const availableToolsMatch = resolvedPrompt.match(
			/^Available Tools: (.+?)$/m,
		);
		expect(availableToolsMatch).not.toBeNull();
		const availableToolsContent = availableToolsMatch![1];

		// Use regex to extract tool names - handles descriptions with commas
		// Match: word characters (tool name) optionally followed by (description)
		const toolMatches = availableToolsContent.matchAll(
			/(\w+)(?:\s*\([^)]*\))?/g,
		);
		const tools = [...toolMatches].map((m) => m[1]).filter(Boolean);

		expect(tools.length).toBe(ARCHITECT_TOOL_COUNT);
	});

	it('tools are sorted alphabetically', () => {
		const availableToolsMatch = resolvedPrompt.match(
			/^Available Tools: (.+?)$/m,
		);
		expect(availableToolsMatch).not.toBeNull();
		const availableToolsContent = availableToolsMatch![1];

		// Use regex to extract tool names - handles descriptions with commas
		const toolMatches = availableToolsContent.matchAll(
			/(\w+)(?:\s*\([^)]*\))?/g,
		);
		const tools = [...toolMatches].map((m) => m[1]).filter(Boolean);

		const sorted = [...tools].sort();
		expect(tools).toEqual(sorted);
	});
});

describe('Single source of truth verification', () => {
	it('YOUR TOOLS and Available Tools count both match AGENT_TOOL_MAP.architect.length', () => {
		// Extract YOUR TOOLS line
		const yourToolsMatch = resolvedPrompt.match(/^YOUR TOOLS: (.+?)$/m);
		expect(yourToolsMatch).not.toBeNull();
		const yourToolsSection = yourToolsMatch![1];
		const afterPrefix = yourToolsSection
			.replace('Task (delegation),', '')
			.trim();
		const yourToolsStr = afterPrefix.replace(/\.\s*$/, '');
		const yourTools = yourToolsStr
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean);

		// Extract Available Tools line
		const availableToolsMatch = resolvedPrompt.match(
			/^Available Tools: (.+?)$/m,
		);
		expect(availableToolsMatch).not.toBeNull();
		const availableToolsContent = availableToolsMatch![1];
		// Use regex to extract tool names - handles descriptions with commas
		const toolMatches = availableToolsContent.matchAll(
			/(\w+)(?:\s*\([^)]*\))?/g,
		);
		const availableTools = [...toolMatches].map((m) => m[1]).filter(Boolean);

		expect(yourTools.length).toBe(ARCHITECT_TOOL_COUNT);
		expect(availableTools.length).toBe(ARCHITECT_TOOL_COUNT);
	});

	it('a new tool added to AGENT_TOOL_MAP.architect would appear in the generated prompt', () => {
		// This is verified by the count test: if AGENT_TOOL_MAP.architect.length
		// changes, the count test will fail until the prompt is regenerated.
		// We verify the mechanism is correct by confirming all current tools are present.
		const allPresent = AGENT_TOOL_MAP['architect'].every((tool) =>
			resolvedPrompt.includes(tool),
		);
		expect(allPresent).toBe(true);
	});
});
