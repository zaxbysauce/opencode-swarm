/**
 * Tests for curator_analyze entry_id validation (SC-004, SC-005, SC-006)
 *
 * Tests the strict UUID v4 pre-flight validation in curator_analyze:
 * - Non-UUID entry_id strings → error JSON returned
 * - undefined entry_id → passes through (new entry path)
 * - Valid UUID v4 entry_id → passes through (update existing path)
 */

import {
	afterEach,
	beforeEach,
	describe,
	expect,
	type Mock,
	test,
	vi,
} from 'bun:test';

// --- MOCKS (must be before import) ---

// Mock curator hooks
const mockRunCuratorPhase = vi.fn();
const mockApplyCuratorKnowledgeUpdates = vi.fn();
vi.mock('../../../src/hooks/curator', () => ({
	runCuratorPhase: mockRunCuratorPhase,
	applyCuratorKnowledgeUpdates: mockApplyCuratorKnowledgeUpdates,
}));

// Mock LLM factory
const mockCreateCuratorLLMDelegate = vi.fn();
vi.mock('../../../src/hooks/curator-llm-factory.js', () => ({
	createCuratorLLMDelegate: mockCreateCuratorLLMDelegate,
}));

// Mock review receipt
const mockBuildApprovedReceipt = vi.fn();
const mockBuildRejectedReceipt = vi.fn();
const mockPersistReviewReceipt = vi.fn();
vi.mock('../../../src/hooks/review-receipt.js', () => ({
	buildApprovedReceipt: mockBuildApprovedReceipt,
	buildRejectedReceipt: mockBuildRejectedReceipt,
	persistReviewReceipt: mockPersistReviewReceipt,
}));

// Mock config
const mockLoadPluginConfigWithMeta = vi.fn();
vi.mock('../../../src/config', () => ({
	loadPluginConfigWithMeta: mockLoadPluginConfigWithMeta,
}));

// Mock config schema
const mockCuratorConfigSchemaParse = vi.fn((v) => v ?? {});
const mockKnowledgeConfigSchemaParse = vi.fn((v) => v ?? {});
vi.mock('../../../src/config/schema', () => ({
	CuratorConfigSchema: { parse: mockCuratorConfigSchemaParse },
	KnowledgeConfigSchema: { parse: mockKnowledgeConfigSchemaParse },
}));

// --- IMPORT AFTER MOCKS ---
import { curator_analyze } from '../../../src/tools/curator-analyze';

// --- SETUP ---
beforeEach(() => {
	vi.clearAllMocks();

	// Default mock return values for successful path
	mockRunCuratorPhase.mockResolvedValue({
		phase: 1,
		digest: {
			phase: 1,
			timestamp: new Date().toISOString(),
			summary: 'Test digest',
			agents_used: [],
			tasks_completed: 0,
			tasks_total: 0,
			key_decisions: [],
			blockers_resolved: [],
		},
		compliance: [],
		knowledge_recommendations: [],
		summary_updated: false,
	});

	mockApplyCuratorKnowledgeUpdates.mockResolvedValue({
		applied: 1,
		skipped: 0,
	});

	mockCreateCuratorLLMDelegate.mockReturnValue({});

	mockBuildApprovedReceipt.mockReturnValue({});
	mockBuildRejectedReceipt.mockReturnValue({});
	mockPersistReviewReceipt.mockResolvedValue(undefined);

	mockLoadPluginConfigWithMeta.mockReturnValue({
		config: { curator: {}, knowledge: {} },
		meta: {},
	});
});

// ---------------------------------------------------------------------------
// VERIFICATION TESTS (SC-004, SC-005, SC-006)
// ---------------------------------------------------------------------------

describe('SC-004: rejects non-UUID entry_id with error JSON', () => {
	test('entry_id "promote-old-config" returns error JSON containing the offending value', async () => {
		const result = await curator_analyze.execute(
			{
				phase: 1,
				recommendations: [
					{
						action: 'promote',
						entry_id: 'promote-old-config',
						lesson: 'Test lesson',
						reason: 'Test reason',
					},
				],
			},
			'/fake/directory',
		);

		const parsed = JSON.parse(result);

		expect(parsed).toHaveProperty('error');
		expect(typeof parsed.error).toBe('string');
		expect(parsed.error).toContain('promote-old-config');
		expect(parsed.error).toContain('UUID v4');
	});
});

describe('SC-005: accepts undefined entry_id without error', () => {
	test('entry_id: undefined passes through and applyCuratorKnowledgeUpdates is called', async () => {
		const result = await curator_analyze.execute(
			{
				phase: 1,
				recommendations: [
					{
						action: 'promote',
						entry_id: undefined,
						lesson: 'Test lesson for new entry',
						reason: 'Test reason',
					},
				],
			},
			'/fake/directory',
		);

		const parsed = JSON.parse(result);

		// Should NOT have an error key
		expect(parsed).not.toHaveProperty('error');
		// applyCuratorKnowledgeUpdates should have been called
		expect(mockApplyCuratorKnowledgeUpdates).toHaveBeenCalledTimes(1);
		// Should have successful response structure
		expect(parsed).toHaveProperty('applied');
	});
});

describe('SC-006: existing tests pass (valid UUID v4 entry_id)', () => {
	test('valid UUID v4 entry_id "a1b2c3d4-e5f6-4789-8012-abcdef012345" is accepted', async () => {
		const result = await curator_analyze.execute(
			{
				phase: 1,
				recommendations: [
					{
						action: 'archive',
						entry_id: 'a1b2c3d4-e5f6-4789-8012-abcdef012345',
						lesson: 'Archive this entry',
						reason: 'No longer relevant',
					},
				],
			},
			'/fake/directory',
		);

		const parsed = JSON.parse(result);

		expect(parsed).not.toHaveProperty('error');
		expect(mockApplyCuratorKnowledgeUpdates).toHaveBeenCalledTimes(1);
		expect(parsed).toHaveProperty('applied');
	});
});

// ---------------------------------------------------------------------------
// ADVERSARIAL TESTS
// ---------------------------------------------------------------------------

describe('adversarial: empty string entry_id', () => {
	test('entry_id: "" (empty string) is rejected — empty string !== undefined and fails UUID regex', async () => {
		const result = await curator_analyze.execute(
			{
				phase: 1,
				recommendations: [
					{
						action: 'promote',
						entry_id: '',
						lesson: 'Test lesson',
						reason: 'Test reason',
					},
				],
			},
			'/fake/directory',
		);

		const parsed = JSON.parse(result);

		expect(parsed).toHaveProperty('error');
		expect(parsed.error).toContain('');
		// applyCuratorKnowledgeUpdates should NOT be called since validation failed first
		expect(mockApplyCuratorKnowledgeUpdates).not.toHaveBeenCalled();
	});
});

describe('adversarial: slug-style entry_id', () => {
	test('entry_id: "my-knowledge-entry" (slug format) is rejected', async () => {
		const result = await curator_analyze.execute(
			{
				phase: 1,
				recommendations: [
					{
						action: 'promote',
						entry_id: 'my-knowledge-entry',
						lesson: 'Test lesson',
						reason: 'Test reason',
					},
				],
			},
			'/fake/directory',
		);

		const parsed = JSON.parse(result);

		expect(parsed).toHaveProperty('error');
		expect(parsed.error).toContain('my-knowledge-entry');
		expect(mockApplyCuratorKnowledgeUpdates).not.toHaveBeenCalled();
	});
});

describe('adversarial: short-circuit on first bad entry_id', () => {
	test('first rec has bad entry_id, second has valid UUID → error returned, applyCuratorKnowledgeUpdates NOT called', async () => {
		const result = await curator_analyze.execute(
			{
				phase: 1,
				recommendations: [
					{
						action: 'promote',
						entry_id: 'bad-entry-id',
						lesson: 'Bad lesson',
						reason: 'Bad reason',
					},
					{
						action: 'archive',
						entry_id: 'a1b2c3d4-e5f6-4789-8012-abcdef012345',
						lesson: 'Good lesson',
						reason: 'Good reason',
					},
				],
			},
			'/fake/directory',
		);

		const parsed = JSON.parse(result);

		expect(parsed).toHaveProperty('error');
		expect(parsed.error).toContain('bad-entry-id');
		// Short-circuit: applyCuratorKnowledgeUpdates should NOT be called
		expect(mockApplyCuratorKnowledgeUpdates).not.toHaveBeenCalled();
		// runCuratorPhase is also NOT called — validation fails BEFORE config load / LLM delegate
		expect(mockRunCuratorPhase).not.toHaveBeenCalled();
	});
});

describe('adversarial: all-undefined batch without error', () => {
	test('3 recs, all entry_id undefined → no error, applyCuratorKnowledgeUpdates called once with all 3', async () => {
		const recommendations = [
			{
				action: 'promote',
				entry_id: undefined,
				lesson: 'Lesson 1',
				reason: 'Reason 1',
			},
			{
				action: 'archive',
				entry_id: undefined,
				lesson: 'Lesson 2',
				reason: 'Reason 2',
			},
			{
				action: 'flag_contradiction',
				entry_id: undefined,
				lesson: 'Lesson 3',
				reason: 'Reason 3',
			},
		];

		const result = await curator_analyze.execute(
			{ phase: 1, recommendations },
			'/fake/directory',
		);

		const parsed = JSON.parse(result);

		expect(parsed).not.toHaveProperty('error');
		expect(mockApplyCuratorKnowledgeUpdates).toHaveBeenCalledTimes(1);
		// Verify all 3 recs were passed through
		const passedRecs = mockApplyCuratorKnowledgeUpdates.mock.calls[0][1];
		expect(passedRecs).toHaveLength(3);
		expect(passedRecs[0].entry_id).toBeUndefined();
		expect(passedRecs[1].entry_id).toBeUndefined();
		expect(passedRecs[2].entry_id).toBeUndefined();
	});
});

describe('adversarial: mixed valid UUIDs and undefineds in batch', () => {
	test('batch with mix of valid UUID v4 and undefined entry_ids passes validation', async () => {
		const recommendations = [
			{
				action: 'promote',
				entry_id: undefined,
				lesson: 'New entry',
				reason: 'Create new',
			},
			{
				action: 'archive',
				entry_id: 'a1b2c3d4-e5f6-4789-8012-abcdef012345',
				lesson: 'Archive existing',
				reason: 'Outdated',
			},
			{
				action: 'flag_contradiction',
				entry_id: undefined,
				lesson: 'Another new',
				reason: 'Contradiction found',
			},
		];

		const result = await curator_analyze.execute(
			{ phase: 1, recommendations },
			'/fake/directory',
		);

		const parsed = JSON.parse(result);

		expect(parsed).not.toHaveProperty('error');
		expect(mockApplyCuratorKnowledgeUpdates).toHaveBeenCalledTimes(1);
		const passedRecs = mockApplyCuratorKnowledgeUpdates.mock.calls[0][1];
		expect(passedRecs).toHaveLength(3);
	});
});
