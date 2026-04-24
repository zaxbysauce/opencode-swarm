/**
 * Tests for src/council/general-council-service.ts.
 *
 * Pure-function tests. Verify confidence-weighted consensus, MAINTAIN/CONCEDE/
 * NUANCE protocol, source dedup, and well-formed synthesis markdown.
 */

import { describe, expect, test } from 'bun:test';
import { synthesizeGeneralCouncil } from '../council/general-council-service.js';
import type {
	GeneralCouncilDeliberationResponse,
	GeneralCouncilMemberResponse,
	WebSearchResult,
} from '../council/general-council-types.js';

function source(url: string, title = 'src'): WebSearchResult {
	return { title, url, snippet: 'snippet', query: 'q' };
}

function member(
	id: string,
	response: string,
	overrides: Partial<GeneralCouncilMemberResponse> = {},
): GeneralCouncilMemberResponse {
	return {
		memberId: id,
		model: 'test-model',
		role: 'generalist',
		response,
		sources: [],
		searchQueries: [],
		confidence: 0.7,
		areasOfUncertainty: [],
		durationMs: 100,
		...overrides,
	};
}

function deliberation(
	id: string,
	response: string,
	disagreementTopics: string[],
	overrides: Partial<GeneralCouncilDeliberationResponse> = {},
): GeneralCouncilDeliberationResponse {
	return {
		...member(id, response),
		disagreementTopics,
		...overrides,
	};
}

describe('synthesizeGeneralCouncil', () => {
	test('returns valid GeneralCouncilResult with all fields populated', () => {
		const result = synthesizeGeneralCouncil(
			'What database should we use?',
			'general',
			[member('m1', 'Use Postgres for strong consistency guarantees.')],
			[],
		);
		expect(result.question).toBe('What database should we use?');
		expect(result.mode).toBe('general');
		expect(Array.isArray(result.disagreements)).toBe(true);
		expect(Array.isArray(result.consensusPoints)).toBe(true);
		expect(Array.isArray(result.persistingDisagreements)).toBe(true);
		expect(Array.isArray(result.allSources)).toBe(true);
		expect(typeof result.synthesis).toBe('string');
		expect(typeof result.timestamp).toBe('string');
		expect(result.moderatorOutput).toBeUndefined();
	});

	test('roundsCompleted = 1 when no Round 2 responses', () => {
		const result = synthesizeGeneralCouncil(
			'q',
			'general',
			[member('m1', 'Response A.')],
			[],
		);
		expect(result.synthesis).toContain('**Rounds:** 1');
	});

	test('roundsCompleted = 2 when Round 2 responses present', () => {
		const result = synthesizeGeneralCouncil(
			'q',
			'general',
			[
				member('m1', 'I recommend X.', { confidence: 0.9 }),
				member('m2', 'I disagree, prefer Y.', { confidence: 0.8 }),
			],
			[deliberation('m1', 'I MAINTAIN my position.', ['some topic'])],
		);
		expect(result.synthesis).toContain('**Rounds:** 2');
	});

	test('confidence-weighted consensus: 2 high-confidence members agreeing → consensus', () => {
		const sharedClaim =
			'The recommended approach is Postgres because of its strong consistency, mature ecosystem, and operational maturity.';
		const result = synthesizeGeneralCouncil(
			'q',
			'general',
			[
				member('m1', sharedClaim, { confidence: 0.95 }),
				member('m2', sharedClaim, { confidence: 0.9 }),
			],
			[],
		);
		expect(result.consensusPoints.length).toBeGreaterThan(0);
	});

	test('low-confidence members below threshold → no consensus', () => {
		const sharedClaim =
			'The recommended approach is Postgres because of its strong consistency, mature ecosystem, and operational maturity.';
		const result = synthesizeGeneralCouncil(
			'q',
			'general',
			[
				member('m1', sharedClaim, { confidence: 0.1 }),
				member('m2', sharedClaim, { confidence: 0.1 }),
			],
			[],
		);
		expect(result.consensusPoints.length).toBe(0);
	});

	test('CONCEDE in Round 2 resolves disagreement', () => {
		const round1 = [
			member('m1', 'I disagree with the X approach. Y is better.'),
			member('m2', 'I recommend X is the best approach.'),
		];
		// Run synthesis once to discover the disagreement topic
		const synth1 = synthesizeGeneralCouncil('q', 'general', round1, []);
		const topic = synth1.disagreements[0]?.topic;
		expect(topic).toBeDefined();

		const round2 = [
			deliberation(
				'm1',
				'On reflection I CONCEDE — Y was wrong, X is correct.',
				topic ? [topic] : [],
			),
		];
		const synth2 = synthesizeGeneralCouncil('q', 'general', round1, round2);
		expect(synth2.persistingDisagreements.length).toBeLessThan(
			synth1.disagreements.length,
		);
	});

	test('MAINTAIN keeps disagreement persisting', () => {
		const round1 = [
			member('m1', 'I disagree with the X approach. Y is better.'),
			member('m2', 'I recommend X is the best approach.'),
		];
		const synth1 = synthesizeGeneralCouncil('q', 'general', round1, []);
		const topic = synth1.disagreements[0]?.topic ?? 'unknown';

		const round2 = [
			deliberation('m1', 'I MAINTAIN my position. Y remains correct.', [topic]),
		];
		const synth2 = synthesizeGeneralCouncil('q', 'general', round1, round2);
		expect(synth2.persistingDisagreements.length).toBe(
			synth1.disagreements.length,
		);
	});

	test('source URLs deduplicated in allSources', () => {
		const result = synthesizeGeneralCouncil(
			'q',
			'general',
			[
				member('m1', 'Response A.', {
					sources: [source('https://shared'), source('https://m1-only')],
				}),
				member('m2', 'Response B.', {
					sources: [source('https://shared'), source('https://m2-only')],
				}),
			],
			[],
		);
		const urls = result.allSources.map((s) => s.url);
		expect(urls.length).toBe(3);
		expect(new Set(urls).size).toBe(3);
	});

	test('synthesis markdown contains required sections', () => {
		const result = synthesizeGeneralCouncil(
			'What is X?',
			'general',
			[member('m1', 'X is foo.')],
			[],
		);
		expect(result.synthesis).toContain('## General Council Synthesis');
		expect(result.synthesis).toContain('**Question:** What is X?');
		expect(result.synthesis).toContain('### Consensus');
		expect(result.synthesis).toContain('### Persistent Disagreements');
		expect(result.synthesis).toContain('### Sources');
	});

	test('empty round2Responses → graceful (no throw)', () => {
		expect(() =>
			synthesizeGeneralCouncil('q', 'general', [member('m1', 'Response.')], []),
		).not.toThrow();
	});

	test('mode = spec_review surfaces in markdown', () => {
		const result = synthesizeGeneralCouncil(
			'review the spec',
			'spec_review',
			[member('m1', 'Spec looks good.')],
			[],
		);
		expect(result.mode).toBe('spec_review');
		expect(result.synthesis).toContain('**Mode:** spec_review');
	});

	test('moderatorOutput remains undefined (set later by tool)', () => {
		const result = synthesizeGeneralCouncil(
			'q',
			'general',
			[member('m1', 'r')],
			[],
		);
		expect(result.moderatorOutput).toBeUndefined();
	});
});
