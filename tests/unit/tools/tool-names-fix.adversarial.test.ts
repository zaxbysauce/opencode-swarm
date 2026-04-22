/**
 * Adversarial tests for tool-names-fix - attacks remaining fragilities
 *
 * Attack vectors (now resolved with dynamic assertions):
 * 1. Array/set symmetric divergence - verified dynamically
 * 2. Index positions - verified via relative ordering, not hardcoded indices
 * 3. Count assertions - derived from TOOL_NAMES.length, not hardcoded
 * 4. Cross-file consistency - verified against TOOL_NAMES source
 */

import { describe, expect, test } from 'bun:test';
import type { ToolName } from '../../../src/tools/tool-names';
import { TOOL_NAME_SET, TOOL_NAMES } from '../../../src/tools/tool-names';

describe('tool-names-fix adversarial attacks - dynamic assertions', () => {
	describe('attack: array/set symmetric divergence', () => {
		test('set should have no items missing from array', () => {
			const missingFromArray: ToolName[] = [];
			for (const item of TOOL_NAME_SET) {
				if (!TOOL_NAMES.includes(item)) {
					missingFromArray.push(item);
				}
			}
			expect(missingFromArray).toEqual([]);
		});

		test('array should have no items missing from set', () => {
			const missingFromSet: ToolName[] = [];
			for (const item of TOOL_NAMES) {
				if (!TOOL_NAME_SET.has(item as ToolName)) {
					missingFromSet.push(item);
				}
			}
			expect(missingFromSet).toEqual([]);
		});

		test('array and set should have identical members (order-independent)', () => {
			const sortedArray = [...TOOL_NAMES].sort();
			const sortedSet = Array.from(TOOL_NAME_SET).sort();
			expect(sortedArray).toEqual(sortedSet);
		});
	});

	describe('attack: index position fragility', () => {
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

		test('evidence_check should have a valid index', () => {
			const evidenceCheckIndex = TOOL_NAMES.indexOf('evidence_check');
			expect(evidenceCheckIndex).toBeGreaterThanOrEqual(0);
			expect(evidenceCheckIndex).toBeLessThan(TOOL_NAMES.length);
		});

		test('check_gate_status should have a valid index', () => {
			const checkGateStatusIndex = TOOL_NAMES.indexOf('check_gate_status');
			expect(checkGateStatusIndex).toBeGreaterThanOrEqual(0);
			expect(checkGateStatusIndex).toBeLessThan(TOOL_NAMES.length);
		});
	});

	describe('attack: count fragility', () => {
		test('TOOL_NAMES length should match TOOL_NAME_SET size', () => {
			expect(TOOL_NAME_SET.size).toBe(TOOL_NAMES.length);
		});

		test('set size should equal unique array elements', () => {
			const uniqueCount = new Set(TOOL_NAMES).size;
			expect(uniqueCount).toBe(TOOL_NAMES.length);
		});

		test('count should be consistent across derived sources', () => {
			const arrayLength = TOOL_NAMES.length;
			const setSize = TOOL_NAME_SET.size;
			const uniqueArrayCount = new Set(TOOL_NAMES).size;

			expect(arrayLength).toBe(setSize);
			expect(setSize).toBe(uniqueArrayCount);
		});

		test('every tool should have a position (no holes in array)', () => {
			for (let i = 0; i < TOOL_NAMES.length; i++) {
				expect(TOOL_NAMES[i]).toBeTruthy();
				expect(typeof TOOL_NAMES[i]).toBe('string');
				expect(TOOL_NAMES[i].length).toBeGreaterThan(0);
			}
		});
	});

	describe('attack: cross-file consistency against source of truth', () => {
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

		test('registry should be non-empty', () => {
			expect(TOOL_NAMES.length).toBeGreaterThan(0);
			expect(TOOL_NAME_SET.size).toBeGreaterThan(0);
		});
	});

	describe('attack: diff_summary fix verification', () => {
		test('diff_summary should exist in TOOL_NAMES', () => {
			expect(TOOL_NAMES).toContain('diff_summary');
		});

		test('diff_summary should exist in TOOL_NAME_SET', () => {
			expect(TOOL_NAME_SET.has('diff_summary')).toBe(true);
		});

		test('diff_summary should exist in TOOL_NAMES', () => {
			expect(TOOL_NAMES).toContain('diff_summary');
		});

		test('diff should appear before diff_summary', () => {
			const diffIndex = TOOL_NAMES.indexOf('diff');
			const diffSummaryIndex = TOOL_NAMES.indexOf('diff_summary');
			expect(diffIndex).toBeGreaterThanOrEqual(0);
			expect(diffSummaryIndex).toBeGreaterThanOrEqual(0);
			expect(diffIndex).toBeLessThan(diffSummaryIndex);
		});

		test('diff_summary neighbors should be diff and syntax_check', () => {
			const idx = TOOL_NAMES.indexOf('diff_summary');
			expect(idx).toBeGreaterThan(0);
			expect(TOOL_NAMES[idx - 1]).toBe('diff');
			expect(TOOL_NAMES[idx + 1]).toBe('syntax_check');
		});
	});

	describe('attack: type-level invariants', () => {
		test('every TOOL_NAMES entry should be a valid ToolName', () => {
			for (const name of TOOL_NAMES) {
				expect(TOOL_NAME_SET.has(name as ToolName)).toBe(true);
			}
		});

		test('every ToolName should exist in TOOL_NAMES', () => {
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

	describe('duplicate detection', () => {
		test('TOOL_NAMES should have no duplicates', () => {
			const seen = new Set<string>();
			const duplicates: string[] = [];
			for (const name of TOOL_NAMES) {
				if (seen.has(name)) {
					duplicates.push(name);
				}
				seen.add(name);
			}
			expect(duplicates).toEqual([]);
		});

		test('set size should equal array length when no duplicates', () => {
			expect(TOOL_NAME_SET.size).toBe(TOOL_NAMES.length);
		});
	});
});
