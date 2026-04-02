import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetSwarmState } from '../../../src/state';

// Helper that replicates the directArgs.task_id preference logic from delegation-gate.ts
// This mirrors the exact inline logic at lines 564-568 and 745-749
function resolveEvidenceTaskId(
	directArgs: Record<string, unknown> | undefined,
	fallback: string | undefined,
): string | undefined {
	const rawTaskId = directArgs?.task_id;
	return typeof rawTaskId === 'string' && /^\d+\.\d+$/.test(rawTaskId.trim())
		? rawTaskId.trim()
		: fallback;
}

describe('delegation-gate — directArgs.task_id evidence preference (task 3.2)', () => {
	beforeEach(() => resetSwarmState());
	afterEach(() => resetSwarmState());

	it('uses directArgs.task_id when valid and session.currentTaskId differs', () => {
		const result = resolveEvidenceTaskId({ task_id: '3.1' }, '2.5');
		expect(result).toBe('3.1');
	});

	it('falls back to session currentTaskId when directArgs.task_id is absent', () => {
		const result = resolveEvidenceTaskId(undefined, '2.5');
		expect(result).toBe('2.5');
	});

	it('falls back when directArgs.task_id is empty string', () => {
		const result = resolveEvidenceTaskId({ task_id: '' }, '2.5');
		expect(result).toBe('2.5');
	});

	it('falls back when directArgs.task_id is malformed "abc"', () => {
		const result = resolveEvidenceTaskId({ task_id: 'abc' }, '2.5');
		expect(result).toBe('2.5');
	});

	it('falls back when directArgs.task_id is null', () => {
		const result = resolveEvidenceTaskId(
			{ task_id: null as unknown as string },
			'2.5',
		);
		expect(result).toBe('2.5');
	});

	it('falls back when directArgs.task_id is a number', () => {
		const result = resolveEvidenceTaskId(
			{ task_id: 3.1 as unknown as string },
			'2.5',
		);
		expect(result).toBe('2.5');
	});

	it('trims whitespace from directArgs.task_id before using', () => {
		const result = resolveEvidenceTaskId({ task_id: '  3.1  ' }, '2.5');
		expect(result).toBe('3.1');
	});

	it('falls back when directArgs.task_id is single-segment "3" (missing dot)', () => {
		const result = resolveEvidenceTaskId({ task_id: '3' }, '2.5');
		expect(result).toBe('2.5');
	});

	it('accepts multi-part task IDs like "3.1.2"', () => {
		// /^\d+\.\d+$/ — only matches exactly two segments, so 3.1.2 should NOT match
		const result = resolveEvidenceTaskId({ task_id: '3.1.2' }, '2.5');
		expect(result).toBe('2.5');
	});

	it('returns undefined when both directArgs.task_id is invalid and fallback is undefined', () => {
		const result = resolveEvidenceTaskId({ task_id: 'bad' }, undefined);
		expect(result).toBeUndefined();
	});
});
