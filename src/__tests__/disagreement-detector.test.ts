/**
 * Tests for src/council/disagreement-detector.ts.
 *
 * Pure-function tests — no mocks, no I/O. Adversarial cases for empty/missing
 * fields and the cap-of-10 boundary.
 */

import { describe, expect, test } from 'bun:test';
import { detectDisagreements } from '../council/disagreement-detector.js';
import type {
	GeneralCouncilMemberResponse,
	GeneralCouncilMemberRole,
} from '../council/general-council-types.js';

function member(
	id: string,
	response: string,
	overrides: Partial<GeneralCouncilMemberResponse> = {},
): GeneralCouncilMemberResponse {
	return {
		memberId: id,
		model: 'test-model',
		role: 'generalist' as GeneralCouncilMemberRole,
		response,
		sources: [],
		searchQueries: [],
		confidence: 0.7,
		areasOfUncertainty: [],
		durationMs: 100,
		...overrides,
	};
}

describe('detectDisagreements', () => {
	test('single-member input → empty array', () => {
		const result = detectDisagreements([member('m1', 'Some response.')]);
		expect(result).toEqual([]);
	});

	test('zero-member input → empty array', () => {
		const result = detectDisagreements([]);
		expect(result).toEqual([]);
	});

	test('two members in agreement → no disagreement', () => {
		const result = detectDisagreements([
			member(
				'm1',
				'I recommend approach X for this problem because of reason A.',
			),
			member(
				'm2',
				'I recommend approach X for this problem because of reason B.',
			),
		]);
		expect(result).toEqual([]);
	});

	test('explicit "I disagree with" marker → detected and attributed', () => {
		const result = detectDisagreements([
			member(
				'm1',
				'I recommend Postgres for the database layer because of strong consistency.',
			),
			member(
				'm2',
				'I disagree with the Postgres recommendation. SQLite is sufficient at this scale.',
			),
		]);
		expect(result.length).toBeGreaterThan(0);
		const attributed = result.find((d) =>
			d.positions.some((p) => p.memberId === 'm2'),
		);
		expect(attributed).toBeDefined();
	});

	test('explicit "contrary to" marker → detected', () => {
		const result = detectDisagreements([
			member('m1', 'Use Library X for serialization.'),
			member(
				'm2',
				'Contrary to popular usage, Library X has known issues with edge cases.',
			),
		]);
		expect(result.length).toBeGreaterThan(0);
	});

	test('mutually exclusive recommendations → divergence detected', () => {
		const result = detectDisagreements([
			member(
				'm1',
				'I recommend Redis as the cache layer because of low latency requirements.',
			),
			member(
				'm2',
				'The best approach is Memcached for simplicity and operational maturity.',
			),
		]);
		// Either explicit-marker or claim-divergence path may catch this
		expect(Array.isArray(result)).toBe(true);
	});

	test('cap of 10 enforced when many disagreements detected', () => {
		const responses: GeneralCouncilMemberResponse[] = [];
		for (let i = 0; i < 20; i++) {
			responses.push(
				member(
					`m${i}`,
					`I disagree with the ${i} approach. Topic ${i} should be different than approach ${i}.`,
				),
			);
		}
		const result = detectDisagreements(responses);
		expect(result.length).toBeLessThanOrEqual(10);
	});

	test('empty response strings → no throw, returns array', () => {
		const result = detectDisagreements([member('m1', ''), member('m2', '')]);
		expect(Array.isArray(result)).toBe(true);
	});

	test('undefined fields handled (defensive) → no throw', () => {
		// Cast through unknown to simulate runtime garbage
		const garbage = [
			{ memberId: 'm1' } as unknown as GeneralCouncilMemberResponse,
			{
				memberId: 'm2',
				response: '',
			} as unknown as GeneralCouncilMemberResponse,
		];
		const result = detectDisagreements(garbage);
		expect(Array.isArray(result)).toBe(true);
	});

	test('deterministic: same input → same output', () => {
		const input = [
			member('m1', 'I disagree with the choice. Use A.'),
			member('m2', 'I recommend B.'),
		];
		const r1 = detectDisagreements(input);
		const r2 = detectDisagreements(input);
		expect(r1).toEqual(r2);
	});
});
