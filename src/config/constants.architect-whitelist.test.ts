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
		explorer: 13,
		coder: 11,
		test_engineer: 11,
		sme: 8,
		reviewer: 17,
		critic: 7,
		docs: 9,
		designer: 4,
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

		it('architect should have expected total tool count (43 tools including lint_spec)', () => {
			const architectTools = AGENT_TOOL_MAP.architect;
			// Expected: 43 tools
			expect(architectTools.length).toBe(43);
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
			'completion_verify',
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
			'quality_budget',
			'retrieve_summary',
			'save_plan',
			'search',
			'batch_symbols',
			'schema_drift',
			'secretscan',
			'symbols',
			'test_runner',
			'todo_extract',
			'update_task_status',
			'lint_spec',
			'write_retro',
			'write_drift_evidence',
			'declare_scope',
			'sast_scan',
			'sbom_generate',
			'build_check',
			'syntax_check',
			'placeholder_scan',
			'phase_complete',
			'doc_scan',
			'doc_extract',
			'curator_analyze',
			'knowledge_add',
			'knowledge_recall',
			'knowledge_remove',
			'co_change_analyzer',
			'suggest_patch',
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
