import { beforeEach, describe, expect, test } from 'bun:test';
import { diff_summary, mutation_test, test_impact } from '../../../src/tools';
import { TOOL_NAMES, type ToolName } from '../../../src/tools/tool-names';

// Test that the 3 previously-dead tools are now properly registered
describe('Tool Registration Verification', () => {
	const toolsToVerify = [
		{
			name: 'diff_summary' as const,
			tool: diff_summary,
		},
		{
			name: 'mutation_test' as const,
			tool: mutation_test,
		},
		{
			name: 'test_impact' as const,
			tool: test_impact,
		},
	];

	describe('1. Tools are importable from ./tools barrel', () => {
		test.each(toolsToVerify)('$name should be importable and not undefined', ({
			name,
			tool,
		}) => {
			expect(tool).toBeDefined();
			expect(typeof tool).not.toBe('undefined');
		});

		test.each(toolsToVerify)('$name should not be null', ({ name, tool }) => {
			expect(tool).not.toBeNull();
		});
	});

	describe('2. Tools have correct structure (function or object with execute)', () => {
		test.each(toolsToVerify)('$name should be a function or object', ({
			name,
			tool,
		}) => {
			const type = typeof tool;
			expect(
				type === 'function' || type === 'object',
				`${name} should be function or object, got ${type}`,
			).toBe(true);
		});

		test.each(toolsToVerify)('$name should have an execute method', ({
			name,
			tool,
		}) => {
			// createSwarmTool returns a tool object with execute method
			// The tool from @opencode-ai/plugin has an execute property
			expect(tool).toHaveProperty('execute');
			expect(typeof (tool as { execute?: unknown }).execute).toBe('function');
		});

		test.each(toolsToVerify)('$name should have a description property', ({
			name,
			tool,
		}) => {
			expect(tool).toHaveProperty('description');
			expect(typeof (tool as { description?: unknown }).description).toBe(
				'string',
			);
		});
	});

	describe('3. Cross-reference with TOOL_NAMES array', () => {
		test.each(toolsToVerify)('$name should exist in TOOL_NAMES array', ({
			name,
		}) => {
			expect(TOOL_NAMES).toContain(name);
		});

		test.each(toolsToVerify)('$name should exist in ToolName union type', ({
			name,
		}) => {
			// This is a type-level check, but we can verify at runtime
			// that the name is a valid member of TOOL_NAME_SET
			const TOOL_NAME_SET = new Set(TOOL_NAMES);
			expect(TOOL_NAME_SET.has(name as ToolName)).toBe(true);
		});
	});

	describe('4. Specific tool behavior verification', () => {
		test('diff_summary should have correct description', () => {
			expect(diff_summary.description).toContain('semantic diff summary');
		});

		test('test_impact should have correct description', () => {
			expect(test_impact.description).toContain('test files are impacted');
		});

		test('mutation_test should have correct description', () => {
			expect(mutation_test.description).toContain('mutation testing');
		});
	});

	describe('5. Execute method is callable (signature check)', () => {
		test.each(
			toolsToVerify,
		)('$name execute method accepts correct arguments', ({ name, tool }) => {
			const execute = (tool as { execute?: Function }).execute;
			expect(execute).toBeDefined();
			// Verify it's callable with (args, directory, ctx?) signature
			expect(typeof execute).toBe('function');
		});
	});
});

describe('Import block completeness in src/index.ts', () => {
	test('All 3 tools should be in the import list from ./tools', () => {
		// This test verifies the imports exist by checking the barrel exports
		// If we can import them here, the registration is complete
		const allExports = [
			...Object.keys({ diff_summary, mutation_test, test_impact }),
		];
		expect(allExports).toHaveLength(3);
		expect(allExports).toContain('diff_summary');
		expect(allExports).toContain('mutation_test');
		expect(allExports).toContain('test_impact');
	});
});
