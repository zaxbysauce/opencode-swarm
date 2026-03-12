import { describe, it, expect } from 'bun:test';
import { RetrospectiveEvidenceSchema, EvidenceSchema } from '../../../src/config/evidence-schema';

describe('RetrospectiveEvidenceSchema', () => {
	it('valid retrospective evidence parses correctly', () => {
		const validRetrospective = {
			type: 'retrospective',
			task_id: 'phase-1',
			agent: 'architect',
			timestamp: '2026-01-01T00:00:00.000Z',
			verdict: 'info',
			summary: 'Phase 1 complete',
			phase_number: 1,
			total_tool_calls: 42,
			coder_revisions: 2,
			reviewer_rejections: 1,
			test_failures: 0,
			security_findings: 0,
			integration_issues: 0,
			task_count: 5,
			task_complexity: 'moderate',
			top_rejection_reasons: ['missing validation'],
			lessons_learned: ['validate inputs early'],
		};

		const result = RetrospectiveEvidenceSchema.safeParse(validRetrospective);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.type).toBe('retrospective');
		}
	});

	it('invalid task_complexity rejects', () => {
		const invalidComplexity = {
			type: 'retrospective',
			task_id: 'phase-1',
			agent: 'architect',
			timestamp: '2026-01-01T00:00:00.000Z',
			verdict: 'info',
			summary: 'Phase 1 complete',
			phase_number: 1,
			total_tool_calls: 42,
			coder_revisions: 2,
			reviewer_rejections: 1,
			test_failures: 0,
			security_findings: 0,
			integration_issues: 0,
			task_count: 5,
			task_complexity: 'unknown',
			top_rejection_reasons: ['missing validation'],
			lessons_learned: ['validate inputs early'],
		};

		const result = RetrospectiveEvidenceSchema.safeParse(invalidComplexity);

		expect(result.success).toBe(false);
	});

	it('lessons_learned max 5 enforced', () => {
		const tooManyLessons = {
			type: 'retrospective',
			task_id: 'phase-1',
			agent: 'architect',
			timestamp: '2026-01-01T00:00:00.000Z',
			verdict: 'info',
			summary: 'Phase 1 complete',
			phase_number: 1,
			total_tool_calls: 42,
			coder_revisions: 2,
			reviewer_rejections: 1,
			test_failures: 0,
			security_findings: 0,
			integration_issues: 0,
			task_count: 5,
			task_complexity: 'moderate',
			top_rejection_reasons: ['missing validation'],
			lessons_learned: ['a', 'b', 'c', 'd', 'e', 'f'],
		};

		const result = RetrospectiveEvidenceSchema.safeParse(tooManyLessons);

		expect(result.success).toBe(false);
	});

	it('EvidenceSchema discriminated union includes retrospective type', () => {
		const validRetrospective = {
			type: 'retrospective',
			task_id: 'phase-1',
			agent: 'architect',
			timestamp: '2026-01-01T00:00:00.000Z',
			verdict: 'info',
			summary: 'Phase 1 complete',
			phase_number: 1,
			total_tool_calls: 42,
			coder_revisions: 2,
			reviewer_rejections: 1,
			test_failures: 0,
			security_findings: 0,
			integration_issues: 0,
			task_count: 5,
			task_complexity: 'moderate',
			top_rejection_reasons: ['missing validation'],
			lessons_learned: ['validate inputs early'],
		};

		const result = EvidenceSchema.safeParse(validRetrospective);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.type).toBe('retrospective');
		}
	});
});
