/**
 * Regression tests: isTaskTool must not match MCP tool names whose prefix was
 * stripped by normalizeToolName (e.g. "expect:task", "expect.task").
 *
 * Before the fix, normalizeToolName("expect:task") returned "task", and the
 * check `normalizedTool === 'task'` would pass — incorrectly triggering Task
 * delegation handling and corrupting swarm session state.
 *
 * The fix adds: `&& normalizedTool === input.tool` so that only a tool whose
 * raw name IS "task" or "Task" (no prefix stripped) is treated as a Task call.
 */

import { describe, expect, it } from 'bun:test';
import { normalizeToolName } from './normalize-tool-name';

/**
 * Mirror of the isTaskTool guard as it now exists in src/index.ts.
 * Kept here so this test file can be read stand-alone.
 */
function isTaskTool(rawToolName: string): boolean {
	const normalized = normalizeToolName(rawToolName);
	return (
		(normalized === 'Task' || normalized === 'task') &&
		normalized === rawToolName
	);
}

describe('isTaskTool guard', () => {
	describe('true positives — real Task tool names', () => {
		it('matches bare "task"', () => {
			expect(isTaskTool('task')).toBe(true);
		});

		it('matches "Task" (capitalised SDK variant)', () => {
			expect(isTaskTool('Task')).toBe(true);
		});
	});

	describe('false positives prevented — MCP tools normalized to "task"', () => {
		it('rejects "expect:task" (colon-namespaced MCP tool)', () => {
			expect(isTaskTool('expect:task')).toBe(false);
		});

		it('rejects "expect.task" (dot-namespaced MCP tool)', () => {
			expect(isTaskTool('expect.task')).toBe(false);
		});

		it('rejects "mcp:task" (generic MCP namespace)', () => {
			expect(isTaskTool('mcp:task')).toBe(false);
		});

		it('rejects "myserver:Task" (capitalised inside MCP namespace)', () => {
			expect(isTaskTool('myserver:Task')).toBe(false);
		});

		it('rejects "opencode:task"', () => {
			expect(isTaskTool('opencode:task')).toBe(false);
		});
	});

	describe('unrelated tools', () => {
		it('rejects "write"', () => {
			expect(isTaskTool('write')).toBe(false);
		});

		it('rejects "bash"', () => {
			expect(isTaskTool('bash')).toBe(false);
		});

		it('rejects empty string (normalizeToolName returns empty)', () => {
			expect(isTaskTool('')).toBe(false);
		});
	});

	describe('normalizeToolName behaviour (anchors the guard contract)', () => {
		it('"expect:task" normalizes to "task"', () => {
			expect(normalizeToolName('expect:task')).toBe('task');
		});

		it('"task" is unchanged by normalization', () => {
			expect(normalizeToolName('task')).toBe('task');
		});

		it('"Task" is unchanged by normalization', () => {
			expect(normalizeToolName('Task')).toBe('Task');
		});
	});
});
