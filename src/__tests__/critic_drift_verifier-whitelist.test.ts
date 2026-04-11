import { describe, expect, test } from 'bun:test';
import { AGENT_TOOL_MAP } from '../config/constants';

describe('critic_drift_verifier tool whitelist', () => {
	test('includes req_coverage in whitelist', () => {
		const whitelist = AGENT_TOOL_MAP.critic_drift_verifier;
		expect(whitelist).toContain('req_coverage');
	});

	test('includes get_approved_plan in whitelist', () => {
		const whitelist = AGENT_TOOL_MAP.critic_drift_verifier;
		expect(whitelist).toContain('get_approved_plan');
	});

	test('whitelist is an array with expected tools', () => {
		const whitelist = AGENT_TOOL_MAP.critic_drift_verifier;
		expect(Array.isArray(whitelist)).toBe(true);
		expect(whitelist).toContain('complexity_hotspots');
		expect(whitelist).toContain('detect_domains');
		expect(whitelist).toContain('imports');
		expect(whitelist).toContain('retrieve_summary');
		expect(whitelist).toContain('symbols');
		expect(whitelist).toContain('knowledge_recall');
	});
});
