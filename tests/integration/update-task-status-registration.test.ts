import { describe, expect, it } from 'bun:test';
import { AGENT_TOOL_MAP } from '../../src/config/constants';
import { TOOL_NAME_SET, TOOL_NAMES } from '../../src/tools/tool-names';

describe('update_task_status and write_retro tool registration', () => {
	const ARCHITECT_TOOLS = AGENT_TOOL_MAP.architect;
	const NON_ARCHITECT_AGENTS = [
		'explorer',
		'coder',
		'test_engineer',
		'sme',
		'reviewer',
		'critic',
		'docs',
		'designer',
	] as const;
	const TOOLS_TO_VERIFY = ['update_task_status', 'write_retro'] as const;

	describe('TOOL_NAMES and TOOL_NAME_SET registration', () => {
		it('should have update_task_status in TOOL_NAMES', () => {
			expect(TOOL_NAMES).toContain('update_task_status');
		});

		it('should have write_retro in TOOL_NAMES', () => {
			expect(TOOL_NAMES).toContain('write_retro');
		});

		it('should have update_task_status in TOOL_NAME_SET', () => {
			expect(TOOL_NAME_SET.has('update_task_status')).toBe(true);
		});

		it('should have write_retro in TOOL_NAME_SET', () => {
			expect(TOOL_NAME_SET.has('write_retro')).toBe(true);
		});
	});

	describe('architect tool exposure', () => {
		it('should have update_task_status in AGENT_TOOL_MAP.architect', () => {
			expect(ARCHITECT_TOOLS).toContain('update_task_status');
		});

		it('should have write_retro in AGENT_TOOL_MAP.architect', () => {
			expect(ARCHITECT_TOOLS).toContain('write_retro');
		});
	});

	describe('non-architect agent exclusion', () => {
		it.each(
			TOOLS_TO_VERIFY,
		)('should NOT have %s in any non-architect agent tool list', (toolName) => {
			for (const agentName of NON_ARCHITECT_AGENTS) {
				const agentTools = AGENT_TOOL_MAP[agentName];
				expect(agentTools).not.toContain(toolName);
			}
		});

		it.each(
			NON_ARCHITECT_AGENTS,
		)('agent %s should not have update_task_status or write_retro', (agentName) => {
			const agentTools = AGENT_TOOL_MAP[agentName];
			expect(agentTools).not.toContain('update_task_status');
			expect(agentTools).not.toContain('write_retro');
		});
	});
});
