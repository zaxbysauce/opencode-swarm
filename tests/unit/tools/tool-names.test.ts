import { describe, expect, test } from 'bun:test';
import {
	TOOL_NAME_SET,
	TOOL_NAMES,
	type ToolName,
} from '../../../src/tools/tool-names';

describe('tool-names', () => {
	test('TOOL_NAMES includes declare_scope', () => {
		expect(TOOL_NAMES).toContain('declare_scope');
	});

	test('TOOL_NAME_SET includes declare_scope', () => {
		expect(TOOL_NAME_SET.has('declare_scope')).toBe(true);
	});

	test('TOOL_NAMES has no duplicates', () => {
		expect(TOOL_NAMES.length).toBe(TOOL_NAME_SET.size);
	});

	test('declare_scope is a valid ToolName type', () => {
		const toolName: ToolName = 'declare_scope';
		expect(TOOL_NAME_SET.has(toolName)).toBe(true);
	});
});
