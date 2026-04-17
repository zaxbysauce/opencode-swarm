import { describe, expect, test } from 'bun:test';
import { AGENT_TOOL_MAP } from '../config/constants';

describe('critic_hallucination_verifier tool whitelist', () => {
	test('whitelist is an array', () => {
		expect(Array.isArray(AGENT_TOOL_MAP.critic_hallucination_verifier)).toBe(
			true,
		);
	});

	test('includes core search and symbol tools', () => {
		const whitelist = AGENT_TOOL_MAP.critic_hallucination_verifier;
		expect(whitelist).toContain('search');
		expect(whitelist).toContain('symbols');
		expect(whitelist).toContain('batch_symbols');
		expect(whitelist).toContain('imports');
	});

	test('includes verification tools for hallucination detection', () => {
		const whitelist = AGENT_TOOL_MAP.critic_hallucination_verifier;
		expect(whitelist).toContain('pkg_audit');
		expect(whitelist).toContain('req_coverage');
		expect(whitelist).toContain('repo_map');
	});

	test('includes knowledge and retrieval tools', () => {
		const whitelist = AGENT_TOOL_MAP.critic_hallucination_verifier;
		expect(whitelist).toContain('knowledge_recall');
		expect(whitelist).toContain('retrieve_summary');
		expect(whitelist).toContain('complexity_hotspots');
		expect(whitelist).toContain('detect_domains');
	});

	test('does NOT include write tools (read-only agent)', () => {
		const whitelist = AGENT_TOOL_MAP.critic_hallucination_verifier;
		expect(whitelist).not.toContain('write_hallucination_evidence');
		expect(whitelist).not.toContain('write_drift_evidence');
		expect(whitelist).not.toContain('save_plan');
	});
});
