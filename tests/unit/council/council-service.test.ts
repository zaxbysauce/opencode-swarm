import { describe, expect, test } from 'bun:test';
import { synthesizeCouncilVerdicts } from '../../../src/council/council-service';
import type { CouncilMemberVerdict } from '../../../src/council/types';

const makeVerdict = (
	agent: CouncilMemberVerdict['agent'],
	verdict: CouncilMemberVerdict['verdict'],
	findings: CouncilMemberVerdict['findings'] = [],
): CouncilMemberVerdict => ({
	agent,
	verdict,
	confidence: 0.9,
	findings,
	criteriaAssessed: ['C1'],
	criteriaUnmet: verdict === 'REJECT' ? ['C1'] : [],
	durationMs: 1000,
});

describe('synthesizeCouncilVerdicts — veto logic', () => {
	test('unanimous APPROVE → overall APPROVE', () => {
		const verdicts = [
			makeVerdict('critic', 'APPROVE'),
			makeVerdict('reviewer', 'APPROVE'),
			makeVerdict('sme', 'APPROVE'),
			makeVerdict('test_engineer', 'APPROVE'),
		];
		const result = synthesizeCouncilVerdicts(
			'1.1',
			'swarm-1',
			verdicts,
			null,
			1,
		);
		expect(result.overallVerdict).toBe('APPROVE');
		expect(result.vetoedBy).toBeNull();
		expect(result.allCriteriaMet).toBe(true);
	});

	test('single REJECT → overall REJECT (veto)', () => {
		const verdicts = [
			makeVerdict('critic', 'REJECT'),
			makeVerdict('reviewer', 'APPROVE'),
			makeVerdict('sme', 'APPROVE'),
			makeVerdict('test_engineer', 'APPROVE'),
		];
		const result = synthesizeCouncilVerdicts(
			'1.1',
			'swarm-1',
			verdicts,
			null,
			1,
		);
		expect(result.overallVerdict).toBe('REJECT');
		expect(result.vetoedBy).toContain('critic');
	});

	test('test_engineer REJECT alone blocks (veto parity)', () => {
		const verdicts = [
			makeVerdict('critic', 'APPROVE'),
			makeVerdict('reviewer', 'APPROVE'),
			makeVerdict('sme', 'APPROVE'),
			makeVerdict('test_engineer', 'REJECT', [
				{
					severity: 'HIGH',
					category: 'test_gap',
					location: 'tests/unit/foo.test.ts:0',
					detail: 'No tests for null input path',
					evidence: 'No null guard test exists',
				},
			]),
		];
		const result = synthesizeCouncilVerdicts(
			'1.1',
			'swarm-1',
			verdicts,
			null,
			1,
		);
		expect(result.overallVerdict).toBe('REJECT');
		expect(result.vetoedBy).toContain('test_engineer');
		expect(result.requiredFixes).toHaveLength(1);
	});

	test('CONCERNS without REJECT → overall CONCERNS', () => {
		const verdicts = [
			makeVerdict('critic', 'CONCERNS'),
			makeVerdict('reviewer', 'APPROVE'),
			makeVerdict('sme', 'APPROVE'),
			makeVerdict('test_engineer', 'APPROVE'),
		];
		const result = synthesizeCouncilVerdicts(
			'1.1',
			'swarm-1',
			verdicts,
			null,
			1,
		);
		expect(result.overallVerdict).toBe('CONCERNS');
		expect(result.vetoedBy).toBeNull();
	});

	test('vetoPriority: false → REJECT becomes CONCERNS if majority approve', () => {
		const verdicts = [
			makeVerdict('critic', 'REJECT'),
			makeVerdict('reviewer', 'APPROVE'),
			makeVerdict('sme', 'APPROVE'),
			makeVerdict('test_engineer', 'APPROVE'),
		];
		const result = synthesizeCouncilVerdicts(
			'1.1',
			'swarm-1',
			verdicts,
			null,
			1,
			{
				vetoPriority: false,
			},
		);
		// Without veto, REJECT is downgraded to CONCERNS (never silently swallowed).
		expect(result.overallVerdict).toBe('CONCERNS');
	});
});

describe('synthesizeCouncilVerdicts — unified feedback', () => {
	test('APPROVE feedback contains approval message', () => {
		const verdicts = [
			makeVerdict('critic', 'APPROVE'),
			makeVerdict('reviewer', 'APPROVE'),
			makeVerdict('sme', 'APPROVE'),
			makeVerdict('test_engineer', 'APPROVE'),
		];
		const result = synthesizeCouncilVerdicts(
			'1.1',
			'swarm-1',
			verdicts,
			null,
			1,
		);
		expect(result.unifiedFeedbackMd).toContain('All council members approved');
		expect(result.unifiedFeedbackMd).toContain('Round 1/3');
	});

	test('REJECT feedback contains veto notice and required fixes', () => {
		const verdicts = [
			makeVerdict('critic', 'REJECT', [
				{
					severity: 'HIGH',
					category: 'logic',
					location: 'src/foo.ts:10',
					detail: 'Null deref',
					evidence: 'Line 10 dereferences without guard',
				},
			]),
			makeVerdict('reviewer', 'APPROVE'),
			makeVerdict('sme', 'APPROVE'),
			makeVerdict('test_engineer', 'APPROVE'),
		];
		const result = synthesizeCouncilVerdicts(
			'1.1',
			'swarm-1',
			verdicts,
			null,
			1,
		);
		expect(result.unifiedFeedbackMd).toContain('BLOCKED');
		expect(result.unifiedFeedbackMd).toContain('critic');
		expect(result.unifiedFeedbackMd).toContain('Required Fixes');
		expect(result.unifiedFeedbackMd).toContain('Null deref');
	});

	test('max rounds reached shows escalation notice', () => {
		const verdicts = [
			makeVerdict('critic', 'REJECT'),
			makeVerdict('reviewer', 'APPROVE'),
			makeVerdict('sme', 'APPROVE'),
			makeVerdict('test_engineer', 'APPROVE'),
		];
		const result = synthesizeCouncilVerdicts(
			'1.1',
			'swarm-1',
			verdicts,
			null,
			3,
		);
		expect(result.unifiedFeedbackMd).toContain('Max rounds');
		expect(result.unifiedFeedbackMd).toContain('Escalate to user');
	});
});

describe('synthesizeCouncilVerdicts — conflict detection', () => {
	test('same location add vs remove produces conflict', () => {
		const verdicts: CouncilMemberVerdict[] = [
			{
				agent: 'critic',
				verdict: 'CONCERNS',
				confidence: 0.8,
				findings: [
					{
						severity: 'MEDIUM',
						category: 'logic',
						location: 'src/foo.ts:42',
						detail: 'Add null check here',
						evidence: '...',
					},
				],
				criteriaAssessed: [],
				criteriaUnmet: [],
				durationMs: 500,
			},
			{
				agent: 'reviewer',
				verdict: 'CONCERNS',
				confidence: 0.8,
				findings: [
					{
						severity: 'LOW',
						category: 'maintainability',
						location: 'src/foo.ts:42',
						detail: 'Remove redundant check',
						evidence: '...',
					},
				],
				criteriaAssessed: [],
				criteriaUnmet: [],
				durationMs: 500,
			},
			makeVerdict('sme', 'APPROVE'),
			makeVerdict('test_engineer', 'APPROVE'),
		];
		const result = synthesizeCouncilVerdicts(
			'1.1',
			'swarm-1',
			verdicts,
			null,
			1,
		);
		expect(result.unresolvedConflicts.length).toBeGreaterThan(0);
		expect(result.unifiedFeedbackMd).toContain('Conflicts to Resolve');
	});
});

describe('synthesizeCouncilVerdicts — emptyVerdictsWarning field', () => {
	test('empty verdicts array sets emptyVerdictsWarning to true', () => {
		const result = synthesizeCouncilVerdicts('1.1', 's1', [], null, 1);
		expect(result.emptyVerdictsWarning).toBe(true);
		// Backward compatibility: APPROVE still returned on empty
		expect(result.overallVerdict).toBe('APPROVE');
		expect(result.vetoedBy).toBeNull();
	});

	test('non-empty verdicts array does NOT set emptyVerdictsWarning', () => {
		const verdicts = [
			makeVerdict('critic', 'APPROVE'),
			makeVerdict('reviewer', 'APPROVE'),
			makeVerdict('sme', 'APPROVE'),
			makeVerdict('test_engineer', 'APPROVE'),
		];
		const result = synthesizeCouncilVerdicts('1.1', 's1', verdicts, null, 1);
		expect(result.emptyVerdictsWarning).toBeUndefined();
	});
});

describe('synthesizeCouncilVerdicts — criteria assessment', () => {
	test('allCriteriaMet is false when a mandatory criterion was not assessed at all', () => {
		// An unassessed mandatory criterion must NOT count as met — otherwise a
		// council that simply forgot to evaluate C2 would silently auto-approve.
		const verdicts: CouncilMemberVerdict[] = [
			{
				agent: 'critic',
				verdict: 'APPROVE',
				confidence: 1,
				findings: [],
				criteriaAssessed: ['C1'],
				criteriaUnmet: [],
				durationMs: 10,
			},
			{
				agent: 'reviewer',
				verdict: 'APPROVE',
				confidence: 1,
				findings: [],
				criteriaAssessed: ['C1'],
				criteriaUnmet: [],
				durationMs: 10,
			},
			{
				agent: 'sme',
				verdict: 'APPROVE',
				confidence: 1,
				findings: [],
				criteriaAssessed: ['C1'],
				criteriaUnmet: [],
				durationMs: 10,
			},
			{
				agent: 'test_engineer',
				verdict: 'APPROVE',
				confidence: 1,
				findings: [],
				criteriaAssessed: ['C1'],
				criteriaUnmet: [],
				durationMs: 10,
			},
		];
		const result = synthesizeCouncilVerdicts(
			'1.1',
			'swarm-1',
			verdicts,
			{
				taskId: '1.1',
				criteria: [
					{ id: 'C1', description: 'x', mandatory: true },
					{ id: 'C2', description: 'y', mandatory: true },
				],
				declaredAt: new Date().toISOString(),
			},
			1,
		);
		expect(result.allCriteriaMet).toBe(false);
	});

	test('allCriteriaMet with two mandatory criteria and one unmet catches .every/.some mutation', () => {
		// With two mandatory criteria, C1 met and C2 unmet: .every returns false
		// (correct), .some would return true (incorrect). This test will fail if
		// someone ever flips .every to .some.
		const verdicts: CouncilMemberVerdict[] = [
			{
				agent: 'critic',
				verdict: 'CONCERNS',
				confidence: 1,
				findings: [],
				criteriaAssessed: ['C1', 'C2'],
				criteriaUnmet: ['C2'],
				durationMs: 10,
			},
			{
				agent: 'reviewer',
				verdict: 'APPROVE',
				confidence: 1,
				findings: [],
				criteriaAssessed: ['C1', 'C2'],
				criteriaUnmet: [],
				durationMs: 10,
			},
			{
				agent: 'sme',
				verdict: 'APPROVE',
				confidence: 1,
				findings: [],
				criteriaAssessed: ['C1', 'C2'],
				criteriaUnmet: [],
				durationMs: 10,
			},
			{
				agent: 'test_engineer',
				verdict: 'APPROVE',
				confidence: 1,
				findings: [],
				criteriaAssessed: ['C1', 'C2'],
				criteriaUnmet: [],
				durationMs: 10,
			},
		];
		const result = synthesizeCouncilVerdicts(
			'1.1',
			'swarm-1',
			verdicts,
			{
				taskId: '1.1',
				criteria: [
					{ id: 'C1', description: 'x', mandatory: true },
					{ id: 'C2', description: 'y', mandatory: true },
				],
				declaredAt: new Date().toISOString(),
			},
			1,
		);
		expect(result.allCriteriaMet).toBe(false);
	});

	test('allCriteriaMet is true when both mandatory criteria are assessed and not unmet', () => {
		const verdicts: CouncilMemberVerdict[] = [
			{
				agent: 'critic',
				verdict: 'APPROVE',
				confidence: 1,
				findings: [],
				criteriaAssessed: ['C1', 'C2'],
				criteriaUnmet: [],
				durationMs: 10,
			},
			{
				agent: 'reviewer',
				verdict: 'APPROVE',
				confidence: 1,
				findings: [],
				criteriaAssessed: ['C1', 'C2'],
				criteriaUnmet: [],
				durationMs: 10,
			},
			{
				agent: 'sme',
				verdict: 'APPROVE',
				confidence: 1,
				findings: [],
				criteriaAssessed: ['C1', 'C2'],
				criteriaUnmet: [],
				durationMs: 10,
			},
			{
				agent: 'test_engineer',
				verdict: 'APPROVE',
				confidence: 1,
				findings: [],
				criteriaAssessed: ['C1', 'C2'],
				criteriaUnmet: [],
				durationMs: 10,
			},
		];
		const result = synthesizeCouncilVerdicts(
			'1.1',
			'swarm-1',
			verdicts,
			{
				taskId: '1.1',
				criteria: [
					{ id: 'C1', description: 'x', mandatory: true },
					{ id: 'C2', description: 'y', mandatory: true },
				],
				declaredAt: new Date().toISOString(),
			},
			1,
		);
		expect(result.allCriteriaMet).toBe(true);
	});

	test('allCriteriaMet is false when a mandatory criterion is unmet', () => {
		const verdicts = [
			makeVerdict('critic', 'REJECT'),
			makeVerdict('reviewer', 'APPROVE'),
			makeVerdict('sme', 'APPROVE'),
			makeVerdict('test_engineer', 'APPROVE'),
		];
		const result = synthesizeCouncilVerdicts(
			'1.1',
			'swarm-1',
			verdicts,
			{
				taskId: '1.1',
				criteria: [
					{ id: 'C1', description: 'x', mandatory: true },
					{ id: 'C2', description: 'y', mandatory: false },
				],
				declaredAt: new Date().toISOString(),
			},
			1,
		);
		// critic REJECT carries criteriaUnmet: ['C1']
		expect(result.allCriteriaMet).toBe(false);
	});

	test('allCriteriaMet is true when only non-mandatory criteria are unmet', () => {
		const verdict: CouncilMemberVerdict = {
			agent: 'critic',
			verdict: 'CONCERNS',
			confidence: 0.8,
			findings: [],
			criteriaAssessed: ['C1', 'C2'],
			criteriaUnmet: ['C2'],
			durationMs: 100,
		};
		const result = synthesizeCouncilVerdicts(
			'1.1',
			'swarm-1',
			[
				verdict,
				makeVerdict('reviewer', 'APPROVE'),
				makeVerdict('sme', 'APPROVE'),
				makeVerdict('test_engineer', 'APPROVE'),
			],
			{
				taskId: '1.1',
				criteria: [
					{ id: 'C1', description: 'x', mandatory: true },
					{ id: 'C2', description: 'y', mandatory: false },
				],
				declaredAt: new Date().toISOString(),
			},
			1,
		);
		expect(result.allCriteriaMet).toBe(true);
	});
});
