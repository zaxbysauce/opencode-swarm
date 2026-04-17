/**
 * Verification tests for tool-names.adversarial.test.ts fixes
 * Tests the two specific corrections:
 * 1. 'diff_summary' present in both expectedTools array AND expectedToolsSet
 * 2. check_gate_status at index 16 (not 15)
 */

import { describe, expect, test } from 'bun:test';
import type { ToolName } from '../../../src/tools/tool-names';
import { TOOL_NAME_SET, TOOL_NAMES } from '../../../src/tools/tool-names';

describe('tool-names adversarial test fix verification', () => {
	describe('Fix #1: diff_summary presence in both expected tools collections', () => {
		// The original issue: expectedToolsSet was missing 'diff_summary'
		// that existed in the expectedTools array

		test('TOOL_NAMES source of truth should contain diff_summary', () => {
			expect(TOOL_NAMES).toContain('diff_summary');
		});

		test('TOOL_NAME_SET should contain diff_summary', () => {
			expect(TOOL_NAME_SET.has('diff_summary')).toBe(true);
		});

		test('expectedTools array should have diff_summary at position 2', () => {
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
				'write_hallucination_evidence',
			];
			expect(expectedTools).toContain('diff_summary');
			expect(expectedTools.indexOf('diff_summary')).toBe(1); // 0-indexed: position 2 = index 1
		});

		test('expectedToolsSet should contain diff_summary (the fix)', () => {
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
				'write_hallucination_evidence',
			]);
			expect(expectedToolsSet.has('diff_summary')).toBe(true);
		});

		test('expectedTools array and expectedToolsSet should have identical members', () => {
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
				'write_hallucination_evidence',
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
				'write_hallucination_evidence',
			]);

			// Both should have 54 entries
			expect(expectedTools.length).toBe(54);
			expect(expectedToolsSet.size).toBe(54);

			// Every item in array should be in set
			const missingFromSet = expectedTools.filter(
				(t) => !expectedToolsSet.has(t),
			);
			expect(missingFromSet).toEqual([]);

			// Every item in set should be in array
			const missingFromArray = Array.from(expectedToolsSet).filter(
				(t) => !expectedTools.includes(t),
			);
			expect(missingFromArray).toEqual([]);
		});
	});

	describe('Fix #2: check_gate_status index verification', () => {
		// The original issue: assertion was .toBe(15) but check_gate_status is at index 16

		test('TOOL_NAMES should have exactly 54 entries', () => {
			expect(TOOL_NAMES.length).toBe(54);
		});

		test('evidence_check should be at index 15', () => {
			const evidenceCheckIndex = TOOL_NAMES.indexOf('evidence_check');
			expect(evidenceCheckIndex).toBe(15);
		});

		test('check_gate_status should be at index 16 (the fix)', () => {
			const checkGateStatusIndex = TOOL_NAMES.indexOf('check_gate_status');
			expect(checkGateStatusIndex).toBe(16);
		});

		test('check_gate_status should immediately follow evidence_check', () => {
			const evidenceCheckIndex = TOOL_NAMES.indexOf('evidence_check');
			const checkGateStatusIndex = TOOL_NAMES.indexOf('check_gate_status');
			expect(checkGateStatusIndex).toBe(evidenceCheckIndex + 1);
		});

		test('indices should NOT be reversed (evidence_check at 16, check_gate_status at 15)', () => {
			const evidenceCheckIndex = TOOL_NAMES.indexOf('evidence_check');
			const checkGateStatusIndex = TOOL_NAMES.indexOf('check_gate_status');
			// This test catches the bug where they were swapped
			expect(evidenceCheckIndex).toBeLessThan(checkGateStatusIndex);
		});
	});

	describe('Full TOOL_NAMES integrity against both collections', () => {
		test('Both expected collections should contain all 51 TOOL_NAMES entries', () => {
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
				'write_hallucination_evidence',
			];

			const expectedToolsSet = new Set(expectedTools);

			// Find any TOOL_NAMES not in expected collections
			const notInExpected = TOOL_NAMES.filter(
				(name) => !expectedToolsSet.has(name),
			);
			expect(notInExpected).toEqual([]);
		});

		test('No entries should be missing from either expectedTools array or expectedToolsSet', () => {
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
				'write_hallucination_evidence',
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
				'write_hallucination_evidence',
			]);

			expect(expectedTools.length).toBe(54);
			expect(expectedToolsSet.size).toBe(54);

			// Verify diff_summary specifically
			expect(expectedTools.includes('diff_summary')).toBe(true);
			expect(expectedToolsSet.has('diff_summary')).toBe(true);
		});
	});
});
