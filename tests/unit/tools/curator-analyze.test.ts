/**
 * Tests for curator_analyze tool — entry_id validation gate.
 * Covers the strict UUID v4 validation added to replace silent coercion.
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// Mock curator functions BEFORE importing the module under test
const mockRunCuratorPhase = mock(async () => ({
	phase: 1,
	agents_dispatched: [],
	compliance: [],
	knowledge_recommendations: [],
	digest: { summary: 'test digest' },
	summary: 'Test curator phase result',
	timestamp: new Date().toISOString(),
}));

const mockApplyCuratorKnowledgeUpdates = mock(async () => ({
	applied: 1,
	skipped: 0,
}));

mock.module('../../../src/hooks/curator', () => ({
	runCuratorPhase: mockRunCuratorPhase,
	applyCuratorKnowledgeUpdates: mockApplyCuratorKnowledgeUpdates,
}));

mock.module('../../../src/hooks/curator-llm-factory.js', () => ({
	createCuratorLLMDelegate: mock(() => ({})),
}));

mock.module('../../../src/hooks/review-receipt.js', () => ({
	buildApprovedReceipt: mock(() => ({ type: 'approved' })),
	buildRejectedReceipt: mock(() => ({ type: 'rejected' })),
	persistReviewReceipt: mock(async () => {}),
}));

mock.module('../../../src/config', () => ({
	loadPluginConfigWithMeta: mock(() => ({
		config: { curator: {}, knowledge: {} },
		meta: {},
	})),
}));

mock.module('../../../src/config/schema', () => ({
	CuratorConfigSchema: { parse: (v: unknown) => v ?? {} },
	KnowledgeConfigSchema: { parse: (v: unknown) => v ?? {} },
}));

// Import after mocks are set up
const { curator_analyze } = await import('../../../src/tools/curator-analyze');

describe('curator_analyze — entry_id validation', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curator-analyze-test-'));
		fs.mkdirSync(path.join(tmpDir, '.swarm'), { recursive: true });
		mockApplyCuratorKnowledgeUpdates.mockClear();
	});

	test('rejects non-UUID entry_id with an error response', async () => {
		const result = await curator_analyze.execute(
			{
				phase: 1,
				recommendations: [
					{
						action: 'promote',
						entry_id: 'promote-old-config',
						lesson: 'Always validate inputs',
						reason: 'Found to be universally applicable',
					},
				],
			},
			tmpDir,
		);

		const parsed = JSON.parse(result);
		expect(parsed).toHaveProperty('error');
		expect(parsed.error).toContain('promote-old-config');
		expect(parsed.error).toContain('UUID v4');
		// Must not have called applyCuratorKnowledgeUpdates
		expect(mockApplyCuratorKnowledgeUpdates).not.toHaveBeenCalled();
	});

	test('accepts undefined entry_id (new entry) without error', async () => {
		const result = await curator_analyze.execute(
			{
				phase: 1,
				recommendations: [
					{
						action: 'promote',
						entry_id: undefined,
						lesson: 'Always validate inputs',
						reason: 'Found to be universally applicable',
					},
				],
			},
			tmpDir,
		);

		const parsed = JSON.parse(result);
		expect(parsed).not.toHaveProperty('error');
		expect(parsed).toHaveProperty('applied');
		expect(mockApplyCuratorKnowledgeUpdates).toHaveBeenCalled();
	});

	test('accepts valid UUID v4 entry_id without error', async () => {
		const validUUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
		const result = await curator_analyze.execute(
			{
				phase: 1,
				recommendations: [
					{
						action: 'promote',
						entry_id: validUUID,
						lesson: 'Always validate inputs',
						reason: 'Found to be universally applicable',
					},
				],
			},
			tmpDir,
		);

		const parsed = JSON.parse(result);
		expect(parsed).not.toHaveProperty('error');
		expect(parsed).toHaveProperty('applied');
		expect(mockApplyCuratorKnowledgeUpdates).toHaveBeenCalled();
	});
});
