/**
 * Adversarial tests for tool-names.adversarial.test.ts
 *
 * Attack vectors (now resolved with dynamic assertions):
 * 1. Set/array correspondence - verified dynamically via TOOL_NAMES/TOOL_NAME_SET
 * 2. Index positions - verified via relative ordering, not hardcoded indices
 * 3. Count assertions - derived from TOOL_NAMES.length, not hardcoded
 * 4. All tools verified against the dynamic source, not static lists
 */

import { describe, expect, test } from 'bun:test';
import type { ToolName } from '../../../src/tools/tool-names';
import { TOOL_NAME_SET, TOOL_NAMES } from '../../../src/tools/tool-names';

describe('tool-names adversarial test - dynamic assertions', () => {
	describe('duplicate detection in TOOL_NAMES array', () => {
		test('should have no duplicate tool names in the array', () => {
			const duplicates = findDuplicates(TOOL_NAMES);
			expect(duplicates).toEqual([]);
		});

		test('should have consistent count when converted to set vs array length', () => {
			expect(TOOL_NAME_SET.size).toBe(TOOL_NAMES.length);
		});
	});

	describe('set/array divergence - bidirectional symmetry', () => {
		test('every array item should be in the set', () => {
			const missingFromSet: ToolName[] = [];
			for (const name of TOOL_NAMES) {
				if (!TOOL_NAME_SET.has(name)) {
					missingFromSet.push(name);
				}
			}
			expect(missingFromSet).toEqual([]);
		});

		test('every set item should be in the array', () => {
			const missingFromArray: ToolName[] = [];
			for (const name of TOOL_NAME_SET) {
				if (!TOOL_NAMES.includes(name)) {
					missingFromArray.push(name);
				}
			}
			expect(missingFromArray).toEqual([]);
		});

		test('array and set should have identical members (order-independent)', () => {
			const setItems = Array.from(TOOL_NAME_SET).sort();
			const arrayItems = [...TOOL_NAMES].sort();
			expect(setItems).toEqual(arrayItems);
		});
	});

	describe('specific tool verification', () => {
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

		test('should have check_gate_status appear exactly once in TOOL_NAMES', () => {
			const occurrences = TOOL_NAMES.filter(
				(name) => name === 'check_gate_status',
			);
			expect(occurrences).toHaveLength(1);
		});

		test('should have diff_summary in TOOL_NAMES', () => {
			expect(TOOL_NAMES).toContain('diff_summary');
		});

		test('should have diff_summary in TOOL_NAME_SET', () => {
			expect(TOOL_NAME_SET.has('diff_summary')).toBe(true);
		});

		test('diff_summary neighbors should be diff and syntax_check', () => {
			const idx = TOOL_NAMES.indexOf('diff_summary');
			expect(TOOL_NAMES[idx - 1]).toBe('diff');
			expect(TOOL_NAMES[idx + 1]).toBe('syntax_check');
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

	describe('registry completeness', () => {
		test('all TOOL_NAMES should be valid ToolNames', () => {
			for (const name of TOOL_NAMES) {
				expect(TOOL_NAME_SET.has(name as ToolName)).toBe(true);
			}
		});

		test('all ToolNames should exist in TOOL_NAMES', () => {
			for (const name of TOOL_NAME_SET) {
				expect(TOOL_NAMES).toContain(name);
			}
		});

		test('every tool should have a position (no holes in array)', () => {
			for (let i = 0; i < TOOL_NAMES.length; i++) {
				expect(TOOL_NAMES[i]).toBeTruthy();
				expect(typeof TOOL_NAMES[i]).toBe('string');
				expect(TOOL_NAMES[i].length).toBeGreaterThan(0);
			}
		});
	});

	describe('boundary conditions', () => {
		test('should handle non-empty registry', () => {
			expect(TOOL_NAMES.length).toBeGreaterThan(0);
			expect(TOOL_NAME_SET.size).toBeGreaterThan(0);
		});

		test('set size should equal unique array elements (idempotency)', () => {
			const uniqueCount = new Set(TOOL_NAMES).size;
			expect(uniqueCount).toBe(TOOL_NAMES.length);
		});

		test('case sensitivity enforcement', () => {
			expect(TOOL_NAME_SET.has('CHECK_GATE_STATUS' as ToolName)).toBe(false);
			expect(TOOL_NAME_SET.has('Check_Gate_Status' as ToolName)).toBe(false);
			expect(TOOL_NAME_SET.has('check-gate-status' as ToolName)).toBe(false);
			expect(TOOL_NAME_SET.has('checkGateStatus' as ToolName)).toBe(false);
			expect(TOOL_NAME_SET.has('check_gate_status')).toBe(true);
		});

		test('similar but different tool names rejected', () => {
			expect(TOOL_NAME_SET.has('check_gat_status' as ToolName)).toBe(false);
			expect(TOOL_NAME_SET.has('check_gates_status' as ToolName)).toBe(false);
			expect(TOOL_NAME_SET.has('check_gate' as ToolName)).toBe(false);
			expect(TOOL_NAME_SET.has('gate_status' as ToolName)).toBe(false);
			expect(TOOL_NAME_SET.has('checkstatus' as ToolName)).toBe(false);
		});
	});

	describe('critical tools presence', () => {
		test('critical tools should all be present', () => {
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
	});

	describe('relative ordering invariants', () => {
		test('evidence_check should precede check_gate_status', () => {
			const evidenceCheckIndex = TOOL_NAMES.indexOf('evidence_check');
			const checkGateStatusIndex = TOOL_NAMES.indexOf('check_gate_status');
			expect(evidenceCheckIndex).toBeLessThan(checkGateStatusIndex);
		});

		test('check_gate_status should immediately follow evidence_check', () => {
			const evidenceCheckIndex = TOOL_NAMES.indexOf('evidence_check');
			const checkGateStatusIndex = TOOL_NAMES.indexOf('check_gate_status');
			expect(checkGateStatusIndex).toBe(evidenceCheckIndex + 1);
		});
	});

	describe('set.has vs array.includes consistency', () => {
		test('set.has and array.includes should agree for valid tools', () => {
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
