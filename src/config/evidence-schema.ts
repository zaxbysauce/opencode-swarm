import { z } from 'zod';

// File size limits for evidence bundles
export const EVIDENCE_MAX_JSON_BYTES = 500 * 1024; // 500KB
export const EVIDENCE_MAX_PATCH_BYTES = 5 * 1024 * 1024; // 5MB
export const EVIDENCE_MAX_TASK_BYTES = 20 * 1024 * 1024; // 20MB

// Evidence type enum
export const EvidenceTypeSchema = z.enum([
	'review',
	'test',
	'diff',
	'approval',
	'note',
]);
export type EvidenceType = z.infer<typeof EvidenceTypeSchema>;

// Evidence verdict enum
export const EvidenceVerdictSchema = z.enum([
	'pass',
	'fail',
	'approved',
	'rejected',
	'info',
]);
export type EvidenceVerdict = z.infer<typeof EvidenceVerdictSchema>;

// Base evidence schema with common fields
export const BaseEvidenceSchema = z.object({
	task_id: z.string().min(1), // e.g. "1.1", "2.3"
	type: EvidenceTypeSchema,
	timestamp: z.string().datetime(), // ISO 8601
	agent: z.string().min(1), // which agent produced this
	verdict: EvidenceVerdictSchema,
	summary: z.string().min(1), // human-readable summary
	metadata: z.record(z.string(), z.unknown()).optional(), // extensible key-value
});
export type BaseEvidence = z.infer<typeof BaseEvidenceSchema>;

// Review evidence schema
export const ReviewEvidenceSchema = BaseEvidenceSchema.extend({
	type: z.literal('review'),
	risk: z.enum(['low', 'medium', 'high', 'critical']),
	issues: z
		.array(
			z.object({
				severity: z.enum(['error', 'warning', 'info']),
				message: z.string().min(1),
				file: z.string().optional(),
				line: z.number().int().optional(),
			}),
		)
		.default([]),
});
export type ReviewEvidence = z.infer<typeof ReviewEvidenceSchema>;

// Test evidence schema
export const TestEvidenceSchema = BaseEvidenceSchema.extend({
	type: z.literal('test'),
	tests_passed: z.number().int().min(0),
	tests_failed: z.number().int().min(0),
	test_file: z.string().optional(), // path to test file
	failures: z
		.array(
			z.object({
				name: z.string().min(1),
				message: z.string().min(1),
			}),
		)
		.default([]),
});
export type TestEvidence = z.infer<typeof TestEvidenceSchema>;

// Diff evidence schema
export const DiffEvidenceSchema = BaseEvidenceSchema.extend({
	type: z.literal('diff'),
	files_changed: z.array(z.string()).default([]),
	additions: z.number().int().min(0).default(0),
	deletions: z.number().int().min(0).default(0),
	patch_path: z.string().optional(), // path to .patch file
});
export type DiffEvidence = z.infer<typeof DiffEvidenceSchema>;

// Approval evidence schema (base with narrowed type)
export const ApprovalEvidenceSchema = BaseEvidenceSchema.extend({
	type: z.literal('approval'),
});
export type ApprovalEvidence = z.infer<typeof ApprovalEvidenceSchema>;

// Note evidence schema (base with narrowed type)
export const NoteEvidenceSchema = BaseEvidenceSchema.extend({
	type: z.literal('note'),
});
export type NoteEvidence = z.infer<typeof NoteEvidenceSchema>;

// Discriminated union of all evidence types
export const EvidenceSchema = z.discriminatedUnion('type', [
	ReviewEvidenceSchema,
	TestEvidenceSchema,
	DiffEvidenceSchema,
	ApprovalEvidenceSchema,
	NoteEvidenceSchema,
]);
export type Evidence = z.infer<typeof EvidenceSchema>;

// Evidence bundle schema (container for all evidence for a task)
export const EvidenceBundleSchema = z.object({
	schema_version: z.literal('1.0.0'),
	task_id: z.string().min(1),
	entries: z.array(EvidenceSchema).default([]),
	created_at: z.string().datetime(),
	updated_at: z.string().datetime(),
});
export type EvidenceBundle = z.infer<typeof EvidenceBundleSchema>;
