/**
 * Verification tests for tool-names.adversarial.test.ts fixes
 * Tests the specific corrections using dynamic assertions:
 * 1. diff_summary present in both TOOL_NAMES and TOOL_NAME_SET
 * 2. check_gate_status ordering verified relative to evidence_check
 */

import { describe, expect, test } from 'bun:test';
import type { ToolName } from '../../../src/tools/tool-names';
import { TOOL_NAME_SET, TOOL_NAMES } from '../../../src/tools/tool-names';

describe('tool-names adversarial test fix verification - dynamic assertions', () => {
	describe('Fix #1: diff_summary presence verification', () => {
		test('TOOL_NAMES source of truth should contain diff_summary', () => {
			expect(TOOL_NAMES).toContain('diff_summary');
		});

		test('TOOL_NAME_SET should contain diff_summary', () => {
			expect(TOOL_NAME_SET.has('diff_summary')).toBe(true);
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

	describe('Fix #2: check_gate_status ordering verification', () => {
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

		test('check_gate_status should exist exactly once', () => {
			const occurrences = TOOL_NAMES.filter(
				(name) => name === 'check_gate_status',
			);
			expect(occurrences).toHaveLength(1);
		});
	});

	describe('TOOL_NAMES integrity verification', () => {
		test('TOOL_NAMES length should match TOOL_NAME_SET size', () => {
			expect(TOOL_NAMES.length).toBe(TOOL_NAME_SET.size);
		});

		test('TOOL_NAMES should have no duplicates', () => {
			const uniqueCount = new Set(TOOL_NAMES).size;
			expect(uniqueCount).toBe(TOOL_NAMES.length);
		});

		test('every TOOL_NAMES entry should be in TOOL_NAME_SET', () => {
			const missingFromSet: ToolName[] = [];
			for (const name of TOOL_NAMES) {
				if (!TOOL_NAME_SET.has(name)) {
					missingFromSet.push(name);
				}
			}
			expect(missingFromSet).toEqual([]);
		});

		test('every TOOL_NAME_SET entry should be in TOOL_NAMES', () => {
			const missingFromArray: ToolName[] = [];
			for (const name of TOOL_NAME_SET) {
				if (!TOOL_NAMES.includes(name)) {
					missingFromArray.push(name);
				}
			}
			expect(missingFromArray).toEqual([]);
		});

		test('sorted array and set should be equal', () => {
			const sortedArray = [...TOOL_NAMES].sort();
			const sortedSet = Array.from(TOOL_NAME_SET).sort();
			expect(sortedArray).toEqual(sortedSet);
		});

		test('every tool should have a non-empty string name', () => {
			for (let i = 0; i < TOOL_NAMES.length; i++) {
				expect(TOOL_NAMES[i]).toBeTruthy();
				expect(typeof TOOL_NAMES[i]).toBe('string');
				expect(TOOL_NAMES[i].length).toBeGreaterThan(0);
			}
		});
	});

	describe('registry completeness against TOOL_NAMES source', () => {
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
	});
});
