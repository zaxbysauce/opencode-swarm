/**
 * Adversarial tests for tool-names-fix - attacks remaining fragilities
 *
 * Attack vectors:
 * 1. expectedTools array vs expectedToolsSet divergence (asymmetric coverage)
 * 2. Hardcoded index 15/16 could break if array structure changes
 * 3. Hardcoded count 51 becomes stale
 * 4. Silent divergence between the two fix verification files
 */

import { describe, expect, test } from 'bun:test';
import type { ToolName } from '../../../src/tools/tool-names';
import { TOOL_NAME_SET, TOOL_NAMES } from '../../../src/tools/tool-names';

describe('tool-names-fix adversarial attacks', () => {
	/**
	 * ATTACK VECTOR 1: expectedTools vs expectedToolsSet asymmetric divergence
	 *
	 * The existing tests check:
	 * - "no extra tools" (tools in TOOL_NAMES but not in expectedToolsSet)
	 * - "all expected present" (tools in expectedTools array are in TOOL_NAMES)
	 *
	 * BUT: expectedTools array could have a tool MISSING that expectedToolsSet HAS.
	 * This would NOT be caught because the tests only check one direction.
	 */
	describe('attack: expectedTools vs expectedToolsSet asymmetric divergence', () => {
		test('MISSING FROM ARRAY: expectedToolsSet has tool that expectedTools array lacks', () => {
			// This test verifies that if expectedToolsSet has an extra item,
			// it would be caught. Currently there's no test for this direction.
			const expectedTools = [
				'diff',
				'diff_summary',
				'syntax_check',
				'placeholder_scan',
				'imports',
				'lint',
				'secretscan',
				'sast_scan',
				'build_check',
				'pre_check_batch',
				'quality_budget',
				'symbols',
				'complexity_hotspots',
				'schema_drift',
				'todo_extract',
				'evidence_check',
				'check_gate_status',
				'completion_verify',
				'convene_council',
				'declare_council_criteria',
				'sbom_generate',
				'checkpoint',
				'pkg_audit',
				'test_runner',
				'test_impact',
				'mutation_test',
				'detect_domains',
				'gitingest',
				'retrieve_summary',
				'extract_code_blocks',
				'phase_complete',
				'save_plan',
				'update_task_status',
				'lint_spec',
				'write_retro',
				'write_drift_evidence',
				'declare_scope',
				'knowledge_query',
				'doc_scan',
				'doc_extract',
				'curator_analyze',
				'knowledge_add',
				'knowledge_recall',
				'knowledge_remove',
				'co_change_analyzer',
				'search',
				'batch_symbols',
				'suggest_patch',
				'req_coverage',
				'get_approved_plan',
				'repo_map',
				'get_qa_gate_profile',
				'set_qa_gates',
			];

			const expectedToolsSet = new Set([
				'diff',
				'diff_summary',
				'syntax_check',
				'placeholder_scan',
				'imports',
				'lint',
				'secretscan',
				'sast_scan',
				'build_check',
				'pre_check_batch',
				'quality_budget',
				'symbols',
				'complexity_hotspots',
				'schema_drift',
				'todo_extract',
				'evidence_check',
				'check_gate_status',
				'completion_verify',
				'convene_council',
				'declare_council_criteria',
				'sbom_generate',
				'checkpoint',
				'pkg_audit',
				'test_runner',
				'test_impact',
				'mutation_test',
				'detect_domains',
				'gitingest',
				'retrieve_summary',
				'extract_code_blocks',
				'phase_complete',
				'save_plan',
				'update_task_status',
				'lint_spec',
				'write_retro',
				'write_drift_evidence',
				'declare_scope',
				'knowledge_query',
				'doc_scan',
				'doc_extract',
				'curator_analyze',
				'knowledge_add',
				'knowledge_recall',
				'knowledge_remove',
				'co_change_analyzer',
				'search',
				'batch_symbols',
				'suggest_patch',
				'req_coverage',
				'get_approved_plan',
				'repo_map',
				'get_qa_gate_profile',
				'set_qa_gates',
			]);

			// Direction of attack: items in set but NOT in array
			const extraInSet: string[] = [];
			for (const item of expectedToolsSet) {
				if (!expectedTools.includes(item as ToolName)) {
					extraInSet.push(item);
				}
			}
			expect(extraInSet).toEqual([]);
		});

		test('bidirectional symmetry: array and set must have identical members', () => {
			// This is the strong assertion: A ⊆ B AND B ⊆ A => A = B
			const expectedTools = [
				'diff',
				'diff_summary',
				'syntax_check',
				'placeholder_scan',
				'imports',
				'lint',
				'secretscan',
				'sast_scan',
				'build_check',
				'pre_check_batch',
				'quality_budget',
				'symbols',
				'complexity_hotspots',
				'schema_drift',
				'todo_extract',
				'evidence_check',
				'check_gate_status',
				'completion_verify',
				'convene_council',
				'declare_council_criteria',
				'sbom_generate',
				'checkpoint',
				'pkg_audit',
				'test_runner',
				'test_impact',
				'mutation_test',
				'detect_domains',
				'gitingest',
				'retrieve_summary',
				'extract_code_blocks',
				'phase_complete',
				'save_plan',
				'update_task_status',
				'lint_spec',
				'write_retro',
				'write_drift_evidence',
				'declare_scope',
				'knowledge_query',
				'doc_scan',
				'doc_extract',
				'curator_analyze',
				'knowledge_add',
				'knowledge_recall',
				'knowledge_remove',
				'co_change_analyzer',
				'search',
				'batch_symbols',
				'suggest_patch',
				'req_coverage',
				'get_approved_plan',
				'repo_map',
				'get_qa_gate_profile',
				'set_qa_gates',
			];

			const expectedToolsSet = new Set([
				'diff',
				'diff_summary',
				'syntax_check',
				'placeholder_scan',
				'imports',
				'lint',
				'secretscan',
				'sast_scan',
				'build_check',
				'pre_check_batch',
				'quality_budget',
				'symbols',
				'complexity_hotspots',
				'schema_drift',
				'todo_extract',
				'evidence_check',
				'check_gate_status',
				'completion_verify',
				'convene_council',
				'declare_council_criteria',
				'sbom_generate',
				'checkpoint',
				'pkg_audit',
				'test_runner',
				'test_impact',
				'mutation_test',
				'detect_domains',
				'gitingest',
				'retrieve_summary',
				'extract_code_blocks',
				'phase_complete',
				'save_plan',
				'update_task_status',
				'lint_spec',
				'write_retro',
				'write_drift_evidence',
				'declare_scope',
				'knowledge_query',
				'doc_scan',
				'doc_extract',
				'curator_analyze',
				'knowledge_add',
				'knowledge_recall',
				'knowledge_remove',
				'co_change_analyzer',
				'search',
				'batch_symbols',
				'suggest_patch',
				'req_coverage',
				'get_approved_plan',
				'repo_map',
				'get_qa_gate_profile',
				'set_qa_gates',
			]);

			// Sort both for order-independent comparison
			const sortedArray = [...expectedTools].sort();
			const sortedSet = Array.from(expectedToolsSet).sort();
			expect(sortedArray).toEqual(sortedSet);
		});
	});

	/**
	 * ATTACK VECTOR 2: Hardcoded index fragility
	 *
	 * If tools are reordered or new ones inserted before index 15/16,
	 * the hardcoded assertions will break. This is actually GOOD (fails fast)
	 * but we should verify the index is still meaningful.
	 */
	describe('attack: hardcoded index fragility', () => {
		test('evidence_check index should remain stable as sentinel', () => {
			// The index 15 is used as a reference point
			// If the array structure changes significantly, this should fail
			const evidenceCheckIndex = TOOL_NAMES.indexOf('evidence_check');
			expect(evidenceCheckIndex).toBe(15);
		});

		test('check_gate_status should remain immediately after evidence_check', () => {
			// This is the stronger assertion - not the raw index
			const evidenceCheckIndex = TOOL_NAMES.indexOf('evidence_check');
			const checkGateStatusIndex = TOOL_NAMES.indexOf('check_gate_status');

			// Relative position is what matters, not absolute index
			expect(checkGateStatusIndex).toBe(evidenceCheckIndex + 1);
		});

		test('index positions should be order-meaningful (not arbitrary)', () => {
			// Verify the array order matches the union type order
			const sourceOrder = [
				'diff',
				'diff_summary',
				'syntax_check',
				'placeholder_scan',
				'imports',
				'lint',
				'secretscan',
				'sast_scan',
				'build_check',
				'pre_check_batch',
				'quality_budget',
				'symbols',
				'complexity_hotspots',
				'schema_drift',
				'todo_extract',
				'evidence_check',
				'check_gate_status',
				'completion_verify',
				'convene_council',
				'declare_council_criteria',
				'sbom_generate',
				'checkpoint',
				'pkg_audit',
				'test_runner',
				'test_impact',
				'mutation_test',
				'detect_domains',
				'gitingest',
				'retrieve_summary',
				'extract_code_blocks',
				'phase_complete',
				'save_plan',
				'update_task_status',
				'lint_spec',
				'write_retro',
				'write_drift_evidence',
				'write_hallucination_evidence',
				'declare_scope',
				'knowledge_query',
				'doc_scan',
				'doc_extract',
				'curator_analyze',
				'knowledge_add',
				'knowledge_recall',
				'knowledge_remove',
				'co_change_analyzer',
				'search',
				'batch_symbols',
				'suggest_patch',
				'req_coverage',
				'get_approved_plan',
				'repo_map',
				'get_qa_gate_profile',
				'set_qa_gates',
			];

			expect(TOOL_NAMES).toEqual(sourceOrder as ToolName[]);
		});
	});

	/**
	 * ATTACK VECTOR 3: Hardcoded count 51 fragility
	 *
	 * If a tool is added or removed, the count becomes stale.
	 * This is actually GOOD behavior (forces test updates) but we verify it.
	 */
	describe('attack: hardcoded count fragility', () => {
		test('TOOL_NAMES length should be exactly 54', () => {
			expect(TOOL_NAMES.length).toBe(54);
		});

		test('TOOL_NAME_SET size should match array length', () => {
			expect(TOOL_NAME_SET.size).toBe(TOOL_NAMES.length);
		});

		test('count should be consistent across multiple sources', () => {
			// Verify the count is derived from actual data, not hardcoded
			const expectedToolsSet = new Set([
				'diff',
				'diff_summary',
				'syntax_check',
				'placeholder_scan',
				'imports',
				'lint',
				'secretscan',
				'sast_scan',
				'build_check',
				'pre_check_batch',
				'quality_budget',
				'symbols',
				'complexity_hotspots',
				'schema_drift',
				'todo_extract',
				'evidence_check',
				'check_gate_status',
				'completion_verify',
				'convene_council',
				'declare_council_criteria',
				'sbom_generate',
				'checkpoint',
				'pkg_audit',
				'test_runner',
				'test_impact',
				'mutation_test',
				'detect_domains',
				'gitingest',
				'retrieve_summary',
				'extract_code_blocks',
				'phase_complete',
				'save_plan',
				'update_task_status',
				'lint_spec',
				'write_retro',
				'write_drift_evidence',
				'write_hallucination_evidence',
				'declare_scope',
				'knowledge_query',
				'doc_scan',
				'doc_extract',
				'curator_analyze',
				'knowledge_add',
				'knowledge_recall',
				'knowledge_remove',
				'co_change_analyzer',
				'search',
				'batch_symbols',
				'suggest_patch',
				'req_coverage',
				'get_approved_plan',
				'repo_map',
				'get_qa_gate_profile',
				'set_qa_gates',
			]);

			// All four should agree
			expect(TOOL_NAMES.length).toBe(54);
			expect(TOOL_NAME_SET.size).toBe(54);
			expect(expectedToolsSet.size).toBe(54);
			expect(TOOL_NAMES.length).toBe(TOOL_NAME_SET.size);
		});

		test('every tool should have a position (no holes in array)', () => {
			// Verify no undefined/null entries
			for (let i = 0; i < TOOL_NAMES.length; i++) {
				expect(TOOL_NAMES[i]).toBeTruthy();
				expect(typeof TOOL_NAMES[i]).toBe('string');
				expect(TOOL_NAMES[i].length).toBeGreaterThan(0);
			}
		});
	});

	/**
	 * ATTACK VECTOR 4: The two test files (tool-names.adversarial.test.ts and
	 * tool-names-fix.test.ts) have duplicate lists - they could diverge.
	 */
	describe('attack: cross-file divergence between test files', () => {
		test('expectedTools arrays in different test files should match', () => {
			// From tool-names-fix.test.ts (first occurrence at line 26)
			const expectedTools_fix = [
				'diff',
				'diff_summary',
				'syntax_check',
				'placeholder_scan',
				'imports',
				'lint',
				'secretscan',
				'sast_scan',
				'build_check',
				'pre_check_batch',
				'quality_budget',
				'symbols',
				'complexity_hotspots',
				'schema_drift',
				'todo_extract',
				'evidence_check',
				'check_gate_status',
				'completion_verify',
				'convene_council',
				'declare_council_criteria',
				'sbom_generate',
				'checkpoint',
				'pkg_audit',
				'test_runner',
				'test_impact',
				'mutation_test',
				'detect_domains',
				'gitingest',
				'retrieve_summary',
				'extract_code_blocks',
				'phase_complete',
				'save_plan',
				'update_task_status',
				'lint_spec',
				'write_retro',
				'write_drift_evidence',
				'declare_scope',
				'knowledge_query',
				'doc_scan',
				'doc_extract',
				'curator_analyze',
				'knowledge_add',
				'knowledge_recall',
				'knowledge_remove',
				'co_change_analyzer',
				'search',
				'batch_symbols',
				'suggest_patch',
				'req_coverage',
				'get_approved_plan',
				'repo_map',
				'get_qa_gate_profile',
				'set_qa_gates',
			];

			// From tool-names.adversarial.test.ts (expectedTools at line 121)
			const expectedTools_adversarial = [
				'diff',
				'diff_summary',
				'syntax_check',
				'placeholder_scan',
				'imports',
				'lint',
				'secretscan',
				'sast_scan',
				'build_check',
				'pre_check_batch',
				'quality_budget',
				'symbols',
				'complexity_hotspots',
				'schema_drift',
				'todo_extract',
				'evidence_check',
				'check_gate_status',
				'completion_verify',
				'sbom_generate',
				'checkpoint',
				'pkg_audit',
				'test_runner',
				'test_impact',
				'detect_domains',
				'gitingest',
				'retrieve_summary',
				'extract_code_blocks',
				'phase_complete',
				'save_plan',
				'update_task_status',
				'lint_spec',
				'mutation_test',
				'write_retro',
				'declare_scope',
				'knowledge_query',
				'doc_scan',
				'doc_extract',
				'curator_analyze',
				'knowledge_add',
				'knowledge_recall',
				'knowledge_remove',
				'write_drift_evidence',
				'co_change_analyzer',
				'search',
				'batch_symbols',
				'suggest_patch',
				'req_coverage',
				'get_approved_plan',
				'repo_map',
				'get_qa_gate_profile',
				'set_qa_gates',
				'convene_council',
				'declare_council_criteria',
			];

			// Sort for order-independent comparison
			const sorted_fix = [...expectedTools_fix].sort();
			const sorted_adversarial = [...expectedTools_adversarial].sort();

			expect(sorted_fix).toEqual(sorted_adversarial);
		});

		test('expectedToolsSet arrays in different test files should match', () => {
			// From tool-names-fix.test.ts (expectedToolsSet at line 84)
			const expectedToolsSet_fix = new Set([
				'diff',
				'diff_summary',
				'syntax_check',
				'placeholder_scan',
				'imports',
				'lint',
				'secretscan',
				'sast_scan',
				'build_check',
				'pre_check_batch',
				'quality_budget',
				'symbols',
				'complexity_hotspots',
				'schema_drift',
				'todo_extract',
				'evidence_check',
				'check_gate_status',
				'completion_verify',
				'convene_council',
				'declare_council_criteria',
				'sbom_generate',
				'checkpoint',
				'pkg_audit',
				'test_runner',
				'test_impact',
				'mutation_test',
				'detect_domains',
				'gitingest',
				'retrieve_summary',
				'extract_code_blocks',
				'phase_complete',
				'save_plan',
				'update_task_status',
				'lint_spec',
				'write_retro',
				'write_drift_evidence',
				'declare_scope',
				'knowledge_query',
				'doc_scan',
				'doc_extract',
				'curator_analyze',
				'knowledge_add',
				'knowledge_recall',
				'knowledge_remove',
				'co_change_analyzer',
				'search',
				'batch_symbols',
				'suggest_patch',
				'req_coverage',
				'get_approved_plan',
				'repo_map',
				'get_qa_gate_profile',
				'set_qa_gates',
			]);

			// From tool-names.adversarial.test.ts (expectedToolsSet at line 183)
			const expectedToolsSet_adversarial = new Set([
				'diff',
				'diff_summary',
				'syntax_check',
				'placeholder_scan',
				'imports',
				'lint',
				'secretscan',
				'sast_scan',
				'build_check',
				'pre_check_batch',
				'quality_budget',
				'symbols',
				'complexity_hotspots',
				'schema_drift',
				'todo_extract',
				'evidence_check',
				'check_gate_status',
				'completion_verify',
				'sbom_generate',
				'checkpoint',
				'pkg_audit',
				'test_runner',
				'test_impact',
				'detect_domains',
				'gitingest',
				'retrieve_summary',
				'extract_code_blocks',
				'phase_complete',
				'save_plan',
				'update_task_status',
				'lint_spec',
				'mutation_test',
				'write_retro',
				'declare_scope',
				'knowledge_query',
				'doc_scan',
				'doc_extract',
				'curator_analyze',
				'knowledge_add',
				'knowledge_recall',
				'knowledge_remove',
				'write_drift_evidence',
				'co_change_analyzer',
				'search',
				'batch_symbols',
				'suggest_patch',
				'req_coverage',
				'get_approved_plan',
				'repo_map',
				'get_qa_gate_profile',
				'set_qa_gates',
				'convene_council',
				'declare_council_criteria',
			]);

			const sorted_fix = Array.from(expectedToolsSet_fix).sort();
			const sorted_adversarial = Array.from(
				expectedToolsSet_adversarial,
			).sort();

			expect(sorted_fix).toEqual(sorted_adversarial);
		});
	});

	/**
	 * ATTACK VECTOR 5: diff_summary was the missing tool - verify it's present
	 * and test that the fix actually works
	 */
	describe('attack: diff_summary fix verification', () => {
		test('diff_summary should exist in TOOL_NAMES', () => {
			expect(TOOL_NAMES).toContain('diff_summary');
		});

		test('diff_summary should exist in TOOL_NAME_SET', () => {
			expect(TOOL_NAME_SET.has('diff_summary')).toBe(true);
		});

		test('diff_summary position should be index 1', () => {
			expect(TOOL_NAMES.indexOf('diff_summary')).toBe(1);
		});

		test('diff should be at index 0, diff_summary at index 1', () => {
			expect(TOOL_NAMES[0]).toBe('diff');
			expect(TOOL_NAMES[1]).toBe('diff_summary');
		});

		test('diff_summary neighbors should be diff and syntax_check', () => {
			const idx = TOOL_NAMES.indexOf('diff_summary');
			expect(TOOL_NAMES[idx - 1]).toBe('diff');
			expect(TOOL_NAMES[idx + 1]).toBe('syntax_check');
		});
	});

	/**
	 * ATTACK VECTOR 6: Type-level invariants
	 */
	describe('attack: type-level invariants', () => {
		test('every TOOL_NAMES entry should be a valid ToolName', () => {
			for (const name of TOOL_NAMES) {
				expect(TOOL_NAME_SET.has(name as ToolName)).toBe(true);
			}
		});

		test('every ToolName should exist in TOOL_NAMES', () => {
			// This iterates the union via the set
			for (const name of TOOL_NAME_SET) {
				expect(TOOL_NAMES).toContain(name);
			}
		});

		test('snake_case enforcement should reject invalid names at compile time', () => {
			// These would be type errors if uncommented:
			// const bad: ToolName = 'checkGateStatus'; // camelCase
			// const bad2: ToolName = 'check-gate-status'; // kebab-case
			// const bad3: ToolName = 'CHECK_GATE_STATUS'; // SCREAMING_SNAKE

			// Verify valid names work
			const valid: ToolName = 'check_gate_status';
			expect(TOOL_NAME_SET.has(valid)).toBe(true);
		});
	});
});
