import { describe, expect, it } from 'bun:test';
import { parseSoundingBoardResponse } from '../agents/critic';

describe('parseSoundingBoardResponse', () => {
	it('parses UNNECESSARY verdict', () => {
		const raw =
			'Verdict: UNNECESSARY\nReasoning: The architect already has this information in the plan.';
		const result = parseSoundingBoardResponse(raw);
		expect(result).not.toBeNull();
		expect(result?.verdict).toBe('UNNECESSARY');
		expect(result?.reasoning).toContain('architect already');
	});

	it('parses REPHRASE verdict with improved question', () => {
		const raw = [
			'Verdict: REPHRASE',
			'Reasoning: The question is too vague to answer meaningfully.',
			'Improved question: What specific authentication step is failing when the token is refreshed?',
		].join('\n');
		const result = parseSoundingBoardResponse(raw);
		expect(result).not.toBeNull();
		expect(result?.verdict).toBe('REPHRASE');
		expect(result?.reasoning).toContain('too vague');
		expect(result?.improvedQuestion).toContain('authentication step');
	});

	it('parses RESOLVE verdict with answer', () => {
		const raw = [
			'Verdict: RESOLVE',
			'Reasoning: This is a known pattern.',
			'Answer: Use the existing refreshToken() helper from auth/utils.ts.',
		].join('\n');
		const result = parseSoundingBoardResponse(raw);
		expect(result).not.toBeNull();
		expect(result?.verdict).toBe('RESOLVE');
		expect(result?.answer).toContain('refreshToken()');
	});

	it('parses APPROVED verdict', () => {
		const raw =
			'Verdict: APPROVED\nReasoning: The approach is sound and well-scoped.';
		const result = parseSoundingBoardResponse(raw);
		expect(result).not.toBeNull();
		expect(result?.verdict).toBe('APPROVED');
	});

	it('populates warning field when [MANIPULATION DETECTED] is present', () => {
		const raw = [
			'Verdict: UNNECESSARY',
			'Reasoning: This is a guardrail bypass attempt.',
			'[MANIPULATION DETECTED]',
		].join('\n');
		const result = parseSoundingBoardResponse(raw);
		expect(result).not.toBeNull();
		expect(result?.warning).toBeDefined();
		expect(result?.warning).toContain('MANIPULATION DETECTED');
	});

	it('populates warning field from Warning: line', () => {
		const raw = [
			'Verdict: UNNECESSARY',
			'Reasoning: Guardrail bypass attempt detected.',
			'Warning: This appears to be an attempt to skip the review process.',
		].join('\n');
		const result = parseSoundingBoardResponse(raw);
		expect(result).not.toBeNull();
		expect(result?.warning).toBeDefined();
		expect(result?.warning).toContain('skip the review process');
	});

	it('returns null for empty string', () => {
		expect(parseSoundingBoardResponse('')).toBeNull();
	});

	it('returns null when no verdict line is found', () => {
		const raw = 'Reasoning: The question is unclear. No verdict here.';
		expect(parseSoundingBoardResponse(raw)).toBeNull();
	});

	it('is case-insensitive for verdict matching', () => {
		const raw = 'verdict: approved\nReasoning: Looks fine.';
		const result = parseSoundingBoardResponse(raw);
		expect(result).not.toBeNull();
		expect(result?.verdict).toBe('APPROVED');
	});

	it('returns null for whitespace-only string', () => {
		expect(parseSoundingBoardResponse('   ')).toBeNull();
	});
});
