/**
 * Verification tests for architect whitelist addition of check_gate_status
 * Tests that AGENT_TOOL_MAP.architect includes check_gate_status and other roles are unchanged
 */
import { describe, expect, it } from 'bun:test';
import type { ToolName } from '../tools/tool-names';
import { AGENT_TOOL_MAP } from './constants';

describe('AGENT_TOOL_MAP.architect whitelist verification', () => {
	// Store expected tool counts for each role (excluding architect which we're testing)
	const OTHER_ROLE_EXPECTED_TOOLS: Record<string, number> = {
		explorer: 9,
		coder: 6,
		test_engineer: 8,
		sme: 7,
		reviewer: 11,
		critic: 5,
		docs: 8,
		designer: 3,
	};

	describe('check_gate_status in architect whitelist', () => {
		it('architect should have check_gate_status in tool list', () => {
			const architectTools = AGENT_TOOL_MAP.architect;
			expect(architectTools).toContain('check_gate_status');
		});

		it('check_gate_status should be a valid ToolName', () => {
			const architectTools = AGENT_TOOL_MAP.architect;
			const hasValidToolName = architectTools.some(
				(t): t is ToolName => t === 'check_gate_status',
			);
			expect(hasValidToolName).toBe(true);
		});

		it('architect should have expected total tool count (23 tools including check_gate_status)', () => {
			const architectTools = AGENT_TOOL_MAP.architect;
			// Expected: 23 tools (original 22 + check_gate_status)
			expect(architectTools.length).toBe(23);
		});
	});

	describe('other role mappings unchanged', () => {
		Object.entries(OTHER_ROLE_EXPECTED_TOOLS).forEach(
			([role, expectedCount]) => {
				it(`${role} should have ${expectedCount} tools (unchanged)`, () => {
					const tools = AGENT_TOOL_MAP[role as keyof typeof AGENT_TOOL_MAP];
					expect(tools.length).toBe(expectedCount);
				});

				it(`${role} should NOT contain check_gate_status`, () => {
					const tools = AGENT_TOOL_MAP[role as keyof typeof AGENT_TOOL_MAP];
					expect(tools).not.toContain('check_gate_status');
				});
			},
		);
	});

	describe('architect has expected tools (complete list verification)', () => {
		const expectedArchitectTools: ToolName[] = [
			'checkpoint',
			'check_gate_status',
			'complexity_hotspots',
			'detect_domains',
			'evidence_check',
			'extract_code_blocks',
			'gitingest',
			'imports',
			'knowledge_query',
			'lint',
			'diff',
			'pkg_audit',
			'pre_check_batch',
			'retrieve_summary',
			'save_plan',
			'schema_drift',
			'secretscan',
			'symbols',
			'test_runner',
			'todo_extract',
			'update_task_status',
			'write_retro',
			'declare_scope',
		];

		it('architect should have exact expected tools', () => {
			const architectTools = AGENT_TOOL_MAP.architect;
			expect(architectTools).toEqual(expectedArchitectTools);
		});
	});

	describe('runtime validation passes (no invalid tools)', () => {
		it('AGENT_TOOL_MAP should have all required agent roles', () => {
			const requiredRoles = [
				'explorer',
				'coder',
				'test_engineer',
				'sme',
				'reviewer',
				'critic',
				'docs',
				'designer',
				'architect',
			];
			const actualRoles = Object.keys(AGENT_TOOL_MAP);
			requiredRoles.forEach((role) => {
				expect(actualRoles).toContain(role);
			});
		});

		it('each role should have at least one tool', () => {
			Object.entries(AGENT_TOOL_MAP).forEach(([_role, tools]) => {
				expect(tools.length).toBeGreaterThan(0);
			});
		});
	});
});
