import { describe, expect, it } from 'bun:test';
import { AGENT_TOOL_MAP } from '../../../src/config/constants';

describe('AGENT_TOOL_MAP — declare_scope permission (task 5.7)', () => {
	it('architect includes declare_scope', () => {
		expect(AGENT_TOOL_MAP.architect).toContain('declare_scope');
	});

	it('declare_scope is architect-only (no other agent has it)', () => {
		const otherAgents = (
			Object.keys(AGENT_TOOL_MAP) as Array<keyof typeof AGENT_TOOL_MAP>
		).filter((agent) => agent !== 'architect');

		for (const agent of otherAgents) {
			expect(AGENT_TOOL_MAP[agent]).not.toContain('declare_scope');
		}
	});
});
