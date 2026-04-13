/**
 * Adversarial tests for tool-name registry integrity
 * Tests duplicate detection, set/array divergence, invalid tool-name handling,
 * and accidental omission between union and array
 */

import { describe, expect, test } from 'bun:test';
import {
	TOOL_NAME_SET,
	TOOL_NAMES,
	type ToolName,
} from '../../../src/tools/tool-names';

describe('tool-names registry integrity - adversarial', () => {
	describe('duplicate detection in TOOL_NAMES array', () => {
		test('should have no duplicate tool names in the array', () => {
			const duplicates = findDuplicates(TOOL_NAMES);
			expect(duplicates).toEqual([]);
		});

		test('should have consistent count when converted to set vs array length', () => {
			// Set automatically deduplicates, so set size should equal array length if no duplicates
			expect(TOOL_NAME_SET.size).toBe(TOOL_NAMES.length);
		});
	});

	describe('set/array divergence', () => {
		test('should have every array item in the set', () => {
			const missingFromSet: ToolName[] = [];
			for (const name of TOOL_NAMES) {
				if (!TOOL_NAME_SET.has(name)) {
					missingFromSet.push(name);
				}
			}
			expect(missingFromSet).toEqual([]);
		});

		test('should have every set item in the array', () => {
			const missingFromArray: ToolName[] = [];
			for (const name of TOOL_NAME_SET) {
				if (!TOOL_NAMES.includes(name)) {
					missingFromArray.push(name);
				}
			}
			expect(missingFromArray).toEqual([]);
		});

		test('should have exact same items in set as array (order-independent)', () => {
			const setItems = Array.from(TOOL_NAME_SET).sort();
			const arrayItems = [...TOOL_NAMES].sort();
			expect(setItems).toEqual(arrayItems);
		});
	});

	describe('check_gate_status specific validation', () => {
		test('should have check_gate_status in the union type', () => {
			const testValue: ToolName = 'check_gate_status';
			expect(testValue).toBe('check_gate_status');
		});

		test('should have check_gate_status in the TOOL_NAMES array', () => {
			expect(TOOL_NAMES).toContain('check_gate_status');
		});

		test('should have check_gate_status in the TOOL_NAME_SET', () => {
			expect(TOOL_NAME_SET.has('check_gate_status')).toBe(true);
		});

		test('should validate check_gate_status via set lookup', () => {
			const isValid = TOOL_NAME_SET.has('check_gate_status');
			expect(isValid).toBe(true);
		});

		test('should have check_gate_status appear exactly once in TOOL_NAMES', () => {
			const occurrences = TOOL_NAMES.filter(
				(name) => name === 'check_gate_status',
			);
			expect(occurrences).toHaveLength(1);
		});
	});

	describe('invalid tool-name handling', () => {
		test('should reject arbitrary strings not in the registry via set', () => {
			expect(TOOL_NAME_SET.has('invalid_tool' as ToolName)).toBe(false);
			expect(TOOL_NAME_SET.has('fake_check_gate' as ToolName)).toBe(false);
			expect(TOOL_NAME_SET.has('check-gate-status' as ToolName)).toBe(false);
			expect(TOOL_NAME_SET.has('CHECK_GATE_STATUS' as ToolName)).toBe(false);
		});

		test('should reject empty string', () => {
			expect(TOOL_NAME_SET.has('' as ToolName)).toBe(false);
		});

		test('should reject null and undefined as tool names', () => {
			// @ts-expect-error - intentionally passing invalid type to test runtime behavior
			expect(TOOL_NAME_SET.has(null)).toBe(false);
			// @ts-expect-error - intentionally passing invalid type to test runtime behavior
			expect(TOOL_NAME_SET.has(undefined)).toBe(false);
		});

		test('should reject numeric tool names', () => {
			// @ts-expect-error - intentionally passing invalid type
			expect(TOOL_NAME_SET.has(123)).toBe(false);
			// @ts-expect-error - intentionally passing invalid type
			expect(TOOL_NAME_SET.has(0)).toBe(false);
		});

		test('should reject object tool names', () => {
			// @ts-expect-error - intentionally passing invalid type
			expect(TOOL_NAME_SET.has({})).toBe(false);
			// @ts-expect-error - intentionally passing invalid type
			expect(TOOL_NAME_SET.has({ toolName: 'check_gate_status' })).toBe(false);
		});
	});

	describe('union/array correspondence', () => {
		// These tests verify that the union type and array stay in sync
		// The array should contain exactly the string literals defined in the union

		test('should have all expected tool names in the registry', () => {
			const expectedTools = [
				'diff',
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
				'detect_domains',
				'gitingest',
				'retrieve_summary',
				'extract_code_blocks',
				'phase_complete',
				'save_plan',
				'update_task_status',
				'lint_spec',
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
				'convene_council',
				'declare_council_criteria',
			];

			expect(TOOL_NAMES.length).toBe(expectedTools.length);

			for (const tool of expectedTools) {
				expect(TOOL_NAMES).toContain(tool as ToolName);
			}
		});

		test('should have no extra tool names beyond the expected set', () => {
			const expectedToolsSet = new Set([
				'diff',
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
				'detect_domains',
				'gitingest',
				'retrieve_summary',
				'extract_code_blocks',
				'phase_complete',
				'save_plan',
				'update_task_status',
				'lint_spec',
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
				'convene_council',
				'declare_council_criteria',
			]);

			const extraTools = TOOL_NAMES.filter(
				(name) => !expectedToolsSet.has(name),
			);
			expect(extraTools).toEqual([]);
		});
	});

	describe('boundary conditions', () => {
		test('should handle maximum array length', () => {
			// Verify array has expected count
			expect(TOOL_NAMES.length).toBeGreaterThan(0);
			expect(TOOL_NAMES.length).toBe(48); // Explicit expected count
		});

		test('should have non-empty registry', () => {
			expect(TOOL_NAMES.length).toBeGreaterThan(0);
			expect(TOOL_NAME_SET.size).toBeGreaterThan(0);
		});

		test('should handle case sensitivity correctly', () => {
			// These variations should NOT be valid
			expect(TOOL_NAME_SET.has('CHECK_GATE_STATUS' as ToolName)).toBe(false);
			expect(TOOL_NAME_SET.has('Check_Gate_Status' as ToolName)).toBe(false);
			expect(TOOL_NAME_SET.has('check-gate-status' as ToolName)).toBe(false);
			expect(TOOL_NAME_SET.has('checkGateStatus' as ToolName)).toBe(false);

			// Only exact match should be valid
			expect(TOOL_NAME_SET.has('check_gate_status')).toBe(true);
		});

		test('should handle similar but different tool names', () => {
			// Typos and similar names should be rejected
			expect(TOOL_NAME_SET.has('check_gat_status' as ToolName)).toBe(false);
			expect(TOOL_NAME_SET.has('check_gates_status' as ToolName)).toBe(false);
			expect(TOOL_NAME_SET.has('check_gate' as ToolName)).toBe(false);
			expect(TOOL_NAME_SET.has('gate_status' as ToolName)).toBe(false);
			expect(TOOL_NAME_SET.has('checkstatus' as ToolName)).toBe(false);
		});
	});

	describe('property-based invariants', () => {
		test('should maintain idempotency - set size should equal unique array elements', () => {
			const uniqueCount = new Set(TOOL_NAMES).size;
			expect(uniqueCount).toBe(TOOL_NAMES.length);
		});

		test('should maintain consistency between set.has and array.includes', () => {
			// For any valid tool name, both set.has and array.includes should agree
			const testTools: ToolName[] = [
				'diff',
				'check_gate_status',
				'lint',
				'test_runner',
				'knowledge_query',
			];

			for (const tool of testTools) {
				const setHas = TOOL_NAME_SET.has(tool);
				const arrayHas = TOOL_NAMES.includes(tool);
				expect(setHas).toBe(arrayHas);
			}
		});
	});

	describe('accidental omission detection', () => {
		test('should have check_gate_status added to union but not cause others to be removed', () => {
			// Verify other tools are still present
			const criticalTools: ToolName[] = [
				'diff',
				'lint',
				'secretscan',
				'sast_scan',
				'test_runner',
				'phase_complete',
				'save_plan',
				'evidence_check',
			];

			for (const tool of criticalTools) {
				expect(TOOL_NAME_SET.has(tool)).toBe(true);
				expect(TOOL_NAMES).toContain(tool);
			}
		});

		test('should maintain registry order integrity after check_gate_status insertion', () => {
			// check_gate_status should be at index 15 (after evidence_check at index 14)
			const evidenceCheckIndex = TOOL_NAMES.indexOf('evidence_check');
			const checkGateStatusIndex = TOOL_NAMES.indexOf('check_gate_status');

			expect(evidenceCheckIndex).toBe(14);
			expect(checkGateStatusIndex).toBe(15);
			expect(checkGateStatusIndex).toBe(evidenceCheckIndex + 1);
		});
	});
});

/**
 * Helper function to find duplicate values in an array
 */
function findDuplicates<T>(arr: readonly T[]): T[] {
	const seen = new Set<T>();
	const duplicates: T[] = [];

	for (const item of arr) {
		if (seen.has(item)) {
			duplicates.push(item);
		}
		seen.add(item);
	}

	return duplicates;
}
