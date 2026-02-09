import { describe, it, expect } from 'bun:test';
import {
	EvidenceTypeSchema,
	EvidenceVerdictSchema,
	BaseEvidenceSchema,
	ReviewEvidenceSchema,
	TestEvidenceSchema,
	DiffEvidenceSchema,
	ApprovalEvidenceSchema,
	NoteEvidenceSchema,
	EvidenceSchema,
	EvidenceBundleSchema,
	EVIDENCE_MAX_JSON_BYTES,
	EVIDENCE_MAX_PATCH_BYTES,
	EVIDENCE_MAX_TASK_BYTES,
} from '../../../src/config/evidence-schema';

describe('EvidenceTypeSchema', () => {
	it('valid values: review, test, diff, approval, note all parse', () => {
		const review = EvidenceTypeSchema.safeParse('review');
		expect(review.success).toBe(true);

		const test = EvidenceTypeSchema.safeParse('test');
		expect(test.success).toBe(true);

		const diff = EvidenceTypeSchema.safeParse('diff');
		expect(diff.success).toBe(true);

		const approval = EvidenceTypeSchema.safeParse('approval');
		expect(approval.success).toBe(true);

		const note = EvidenceTypeSchema.safeParse('note');
		expect(note.success).toBe(true);
	});

	it('invalid value: unknown rejects', () => {
		const result = EvidenceTypeSchema.safeParse('unknown');
		expect(result.success).toBe(false);
	});
});

describe('EvidenceVerdictSchema', () => {
	it('valid values: pass, fail, approved, rejected, info all parse', () => {
		const pass = EvidenceVerdictSchema.safeParse('pass');
		expect(pass.success).toBe(true);

		const fail = EvidenceVerdictSchema.safeParse('fail');
		expect(fail.success).toBe(true);

		const approved = EvidenceVerdictSchema.safeParse('approved');
		expect(approved.success).toBe(true);

		const rejected = EvidenceVerdictSchema.safeParse('rejected');
		expect(rejected.success).toBe(true);

		const info = EvidenceVerdictSchema.safeParse('info');
		expect(info.success).toBe(true);
	});

	it('invalid value: maybe rejects', () => {
		const result = EvidenceVerdictSchema.safeParse('maybe');
		expect(result.success).toBe(false);
	});
});

describe('BaseEvidenceSchema', () => {
	it('valid base evidence parses', () => {
		const evidence = {
			task_id: '1.1',
			type: 'note' as const,
			timestamp: '2026-02-09T12:00:00.000Z',
			agent: 'mega_reviewer',
			verdict: 'info' as const,
			summary: 'test note',
		};
		const result = BaseEvidenceSchema.safeParse(evidence);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.task_id).toBe('1.1');
			expect(result.data.type).toBe('note');
			expect(result.data.timestamp).toBe('2026-02-09T12:00:00.000Z');
			expect(result.data.agent).toBe('mega_reviewer');
			expect(result.data.verdict).toBe('info');
			expect(result.data.summary).toBe('test note');
			expect(result.data.metadata).toBeUndefined();
		}
	});

	it('missing required field (no task_id) rejects', () => {
		const evidence = {
			type: 'note' as const,
			timestamp: '2026-02-09T12:00:00.000Z',
			agent: 'mega_reviewer',
			verdict: 'info' as const,
			summary: 'test note',
		};
		const result = BaseEvidenceSchema.safeParse(evidence);
		expect(result.success).toBe(false);
	});

	it('optional metadata field works when present', () => {
		const evidence = {
			task_id: '1.1',
			type: 'note' as const,
			timestamp: '2026-02-09T12:00:00.000Z',
			agent: 'mega_reviewer',
			verdict: 'info' as const,
			summary: 'test note',
			metadata: {
				key: 'value',
				number: 42,
				flag: true,
			},
		};
		const result = BaseEvidenceSchema.safeParse(evidence);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.metadata).toEqual({
				key: 'value',
				number: 42,
				flag: true,
			});
		}
	});
});

describe('ReviewEvidenceSchema', () => {
	it('valid review evidence parses (include type:review, risk:low, issues:[])', () => {
		const evidence = {
			task_id: '1.1',
			type: 'review' as const,
			timestamp: '2026-02-09T12:00:00.000Z',
			agent: 'mega_reviewer',
			verdict: 'pass' as const,
			summary: 'Code review passed',
			risk: 'low' as const,
			issues: [],
		};
		const result = ReviewEvidenceSchema.safeParse(evidence);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.type).toBe('review');
			expect(result.data.risk).toBe('low');
			expect(result.data.issues).toEqual([]);
		}
	});

	it('missing risk field rejects', () => {
		const evidence = {
			task_id: '1.1',
			type: 'review' as const,
			timestamp: '2026-02-09T12:00:00.000Z',
			agent: 'mega_reviewer',
			verdict: 'pass' as const,
			summary: 'Code review passed',
			issues: [],
		};
		const result = ReviewEvidenceSchema.safeParse(evidence);
		expect(result.success).toBe(false);
	});

	it('issues array with proper structure parses', () => {
		const evidence = {
			task_id: '1.1',
			type: 'review' as const,
			timestamp: '2026-02-09T12:00:00.000Z',
			agent: 'mega_reviewer',
			verdict: 'fail' as const,
			summary: 'Code review failed',
			risk: 'high' as const,
			issues: [
				{
					severity: 'error' as const,
					message: 'Undefined variable',
					file: 'test.ts',
					line: 42,
				},
				{
					severity: 'warning' as const,
					message: 'Missing type annotation',
				},
			],
		};
		const result = ReviewEvidenceSchema.safeParse(evidence);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.issues.length).toBe(2);
			expect(result.data.issues[0].severity).toBe('error');
			expect(result.data.issues[0].message).toBe('Undefined variable');
			expect(result.data.issues[0].file).toBe('test.ts');
			expect(result.data.issues[0].line).toBe(42);
			expect(result.data.issues[1].severity).toBe('warning');
			expect(result.data.issues[1].file).toBeUndefined();
		}
	});
});

describe('TestEvidenceSchema', () => {
	it('valid test evidence parses (include type:test, tests_passed:5, tests_failed:0)', () => {
		const evidence = {
			task_id: '1.1',
			type: 'test' as const,
			timestamp: '2026-02-09T12:00:00.000Z',
			agent: 'mega_test_engineer',
			verdict: 'pass' as const,
			summary: 'All tests passed',
			tests_passed: 5,
			tests_failed: 0,
		};
		const result = TestEvidenceSchema.safeParse(evidence);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.type).toBe('test');
			expect(result.data.tests_passed).toBe(5);
			expect(result.data.tests_failed).toBe(0);
		}
	});

	it('negative tests_passed rejects', () => {
		const evidence = {
			task_id: '1.1',
			type: 'test' as const,
			timestamp: '2026-02-09T12:00:00.000Z',
			agent: 'mega_test_engineer',
			verdict: 'fail' as const,
			summary: 'Some tests failed',
			tests_passed: -1,
			tests_failed: 2,
		};
		const result = TestEvidenceSchema.safeParse(evidence);
		expect(result.success).toBe(false);
	});
});

describe('DiffEvidenceSchema', () => {
	it('valid diff evidence parses (include type:diff, files_changed:[a.ts], additions:10, deletions:5)', () => {
		const evidence = {
			task_id: '1.1',
			type: 'diff' as const,
			timestamp: '2026-02-09T12:00:00.000Z',
			agent: 'mega_reviewer',
			verdict: 'info' as const,
			summary: 'Code changes',
			files_changed: ['a.ts', 'b.ts'],
			additions: 10,
			deletions: 5,
		};
		const result = DiffEvidenceSchema.safeParse(evidence);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.type).toBe('diff');
			expect(result.data.files_changed).toEqual(['a.ts', 'b.ts']);
			expect(result.data.additions).toBe(10);
			expect(result.data.deletions).toBe(5);
		}
	});

	it('defaults applied (files_changed defaults to [], additions/deletions to 0)', () => {
		const evidence = {
			task_id: '1.1',
			type: 'diff' as const,
			timestamp: '2026-02-09T12:00:00.000Z',
			agent: 'mega_reviewer',
			verdict: 'info' as const,
			summary: 'Code changes',
		};
		const result = DiffEvidenceSchema.safeParse(evidence);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.files_changed).toEqual([]);
			expect(result.data.additions).toBe(0);
			expect(result.data.deletions).toBe(0);
		}
	});
});

describe('ApprovalEvidenceSchema', () => {
	it('valid approval evidence parses', () => {
		const evidence = {
			task_id: '1.1',
			type: 'approval' as const,
			timestamp: '2026-02-09T12:00:00.000Z',
			agent: 'mega_reviewer',
			verdict: 'approved' as const,
			summary: 'Changes approved',
		};
		const result = ApprovalEvidenceSchema.safeParse(evidence);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.type).toBe('approval');
		}
	});
});

describe('NoteEvidenceSchema', () => {
	it('valid note evidence parses', () => {
		const evidence = {
			task_id: '1.1',
			type: 'note' as const,
			timestamp: '2026-02-09T12:00:00.000Z',
			agent: 'mega_reviewer',
			verdict: 'info' as const,
			summary: 'Test note',
		};
		const result = NoteEvidenceSchema.safeParse(evidence);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.type).toBe('note');
		}
	});
});

describe('EvidenceSchema discriminated union', () => {
	it('review type correctly parsed as review', () => {
		const evidence = {
			task_id: '1.1',
			type: 'review' as const,
			timestamp: '2026-02-09T12:00:00.000Z',
			agent: 'mega_reviewer',
			verdict: 'pass' as const,
			summary: 'Code review',
			risk: 'low' as const,
			issues: [],
		};
		const result = EvidenceSchema.safeParse(evidence);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.type).toBe('review');
		}
	});

	it('test type correctly parsed as test', () => {
		const evidence = {
			task_id: '1.1',
			type: 'test' as const,
			timestamp: '2026-02-09T12:00:00.000Z',
			agent: 'mega_test_engineer',
			verdict: 'pass' as const,
			summary: 'Test results',
			tests_passed: 10,
			tests_failed: 0,
		};
		const result = EvidenceSchema.safeParse(evidence);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.type).toBe('test');
		}
	});

	it('invalid type foobar rejects', () => {
		const evidence = {
			task_id: '1.1',
			type: 'foobar' as const,
			timestamp: '2026-02-09T12:00:00.000Z',
			agent: 'mega_reviewer',
			verdict: 'info' as const,
			summary: 'Invalid type',
		};
		const result = EvidenceSchema.safeParse(evidence);
		expect(result.success).toBe(false);
	});
});

describe('EvidenceBundleSchema', () => {
	it('valid bundle parses with entries', () => {
		const bundle = {
			schema_version: '1.0.0' as const,
			task_id: '1.1',
			entries: [
				{
					task_id: '1.1',
					type: 'note' as const,
					timestamp: '2026-02-09T12:00:00.000Z',
					agent: 'mega_reviewer',
					verdict: 'info' as const,
					summary: 'Test note',
				},
			],
			created_at: '2026-02-09T12:00:00.000Z',
			updated_at: '2026-02-09T12:00:00.000Z',
		};
		const result = EvidenceBundleSchema.safeParse(bundle);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.schema_version).toBe('1.0.0');
			expect(result.data.task_id).toBe('1.1');
			expect(result.data.entries.length).toBe(1);
		}
	});

	it('empty entries array parses (with default)', () => {
		const bundle = {
			schema_version: '1.0.0' as const,
			task_id: '1.1',
			entries: [],
			created_at: '2026-02-09T12:00:00.000Z',
			updated_at: '2026-02-09T12:00:00.000Z',
		};
		const result = EvidenceBundleSchema.safeParse(bundle);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.entries).toEqual([]);
		}
	});

	it('wrong schema_version rejects', () => {
		const bundle = {
			schema_version: '0.9.0' as const,
			task_id: '1.1',
			entries: [],
			created_at: '2026-02-09T12:00:00.000Z',
			updated_at: '2026-02-09T12:00:00.000Z',
		};
		const result = EvidenceBundleSchema.safeParse(bundle);
		expect(result.success).toBe(false);
	});
});

describe('Constants', () => {
	it('EVIDENCE_MAX_JSON_BYTES = 512000, EVIDENCE_MAX_PATCH_BYTES = 5242880, EVIDENCE_MAX_TASK_BYTES = 20971520', () => {
		expect(EVIDENCE_MAX_JSON_BYTES).toBe(512000);
		expect(EVIDENCE_MAX_PATCH_BYTES).toBe(5242880);
		expect(EVIDENCE_MAX_TASK_BYTES).toBe(20971520);
	});
});
