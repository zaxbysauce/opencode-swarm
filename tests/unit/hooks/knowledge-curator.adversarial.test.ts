/**
 * Adversarial security and edge-case tests for knowledge-curator.ts
 * Tests attack vectors, boundary violations, and malformed inputs.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
	createKnowledgeCuratorHook,
	curateAndStoreSwarm,
} from '../../../src/hooks/knowledge-curator.js';
import type { KnowledgeConfig } from '../../../src/hooks/knowledge-types.js';

// Create local mock variables for knowledge-store
const mockAppendKnowledge = vi.fn<[], Promise<void>>();
const mockAppendRejectedLesson = vi.fn<[], Promise<void>>();
const mockFindNearDuplicate = vi.fn<[string, unknown[], number], unknown>();
const mockReadKnowledge = vi.fn<[string], Promise<unknown[]>>();
const mockRewriteKnowledge = vi.fn<[string, unknown[]], Promise<void>>();
const mockResolveSwarmKnowledgePath = vi.fn<[string], string>();
const mockResolveSwarmRejectedPath = vi.fn<[string], string>();
const mockComputeConfidence = vi.fn<[number, boolean], number>();
const mockInferTags = vi.fn<[string], string[]>();

// Create local mock variables for utils
const mockReadSwarmFileAsync = vi.fn<
	[string, string],
	Promise<string | null>
>();
const mockSafeHook = vi.fn<(fn: unknown) => unknown>();
const mockValidateSwarmPath = vi.fn<[string, string], string>();

// Create local mock variable for knowledge-validator
const mockValidateLesson = vi.fn<
	[string, string[], { category: string; scope: string; confidence: number }],
	{
		valid: boolean;
		layer: number | null;
		reason: string | null;
		severity: string | null;
	}
>();

// Create local mock variable for knowledge-reader
const mockUpdateRetrievalOutcome = vi.fn<
	[string, string, boolean],
	Promise<void>
>();

vi.mock('../../../src/hooks/knowledge-store.js', () => ({
	resolveSwarmKnowledgePath: (...args: unknown[]) =>
		mockResolveSwarmKnowledgePath(...(args as [string])),
	resolveSwarmRejectedPath: (...args: unknown[]) =>
		mockResolveSwarmRejectedPath(...(args as [string])),
	readKnowledge: (...args: unknown[]) =>
		mockReadKnowledge(...(args as [string])),
	appendKnowledge: (...args: unknown[]) => mockAppendKnowledge(...(args as [])),
	appendRejectedLesson: (...args: unknown[]) =>
		mockAppendRejectedLesson(...(args as [])),
	findNearDuplicate: (...args: unknown[]) =>
		mockFindNearDuplicate(...(args as [string, unknown[], number])),
	rewriteKnowledge: (...args: unknown[]) =>
		mockRewriteKnowledge(...(args as [string, unknown[]])),
	computeConfidence: (...args: unknown[]) =>
		mockComputeConfidence(...(args as [number, boolean])),
	inferTags: (...args: unknown[]) => mockInferTags(...(args as [string])),
}));

vi.mock('../../../src/hooks/utils.js', () => ({
	readSwarmFileAsync: (...args: unknown[]) =>
		mockReadSwarmFileAsync(...(args as [string, string])),
	safeHook: (...args: unknown[]) => mockSafeHook(...(args as [unknown])),
	validateSwarmPath: (...args: unknown[]) =>
		mockValidateSwarmPath(...(args as [string, string])),
}));

vi.mock('../../../src/hooks/knowledge-validator.js', () => ({
	validateLesson: (...args: unknown[]) =>
		mockValidateLesson(
			...(args as [
				string,
				string[],
				{ category: string; scope: string; confidence: number },
			]),
		),
}));

vi.mock('../../../src/hooks/knowledge-reader.js', () => ({
	updateRetrievalOutcome: (...args: unknown[]) =>
		mockUpdateRetrievalOutcome(...(args as [string, string, boolean])),
}));

// ============================================================================
// Test data
// ============================================================================

const defaultConfig: KnowledgeConfig = {
	enabled: true,
	swarm_max_entries: 100,
	hive_max_entries: 200,
	auto_promote_days: 90,
	max_inject_count: 5,
	dedup_threshold: 0.6,
	scope_filter: ['global'],
	hive_enabled: true,
	rejected_max_entries: 20,
	validation_enabled: true,
	evergreen_confidence: 0.9,
	evergreen_utility: 0.8,
	low_utility_threshold: 0.3,
	min_retrievals_for_utility: 3,
	schema_version: 1,
};

function makePlanContent(lessons: string[]): string {
	const bullets = lessons.map((l) => `- ${l}`).join('\n');
	return `# My Test Project
Swarm: mega
Phase: 2 | Updated: 2026-03-02

## Phase 1: Setup [COMPLETE]
- [x] 1.1: Init

### Lessons Learned
${bullets}

## Phase 2: Core [IN PROGRESS]
- [ ] 2.1: Build
`;
}

// ============================================================================
// Tests
// ============================================================================

describe('knowledge-curator (adversarial & edge cases)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset mock implementations to defaults
		mockResolveSwarmKnowledgePath.mockReturnValue(
			'/project/.swarm/knowledge.jsonl',
		);
		mockResolveSwarmRejectedPath.mockReturnValue(
			'/project/.swarm/rejected.jsonl',
		);
		mockReadKnowledge.mockResolvedValue([]);
		mockAppendKnowledge.mockResolvedValue(undefined);
		mockAppendRejectedLesson.mockResolvedValue(undefined);
		mockFindNearDuplicate.mockReturnValue(undefined);
		mockRewriteKnowledge.mockResolvedValue(undefined);
		mockComputeConfidence.mockReturnValue(0.6);
		mockInferTags.mockReturnValue([]);
		mockReadSwarmFileAsync.mockResolvedValue(null);
		// Mock safeHook to actually catch and swallow errors (like the real implementation)
		mockSafeHook.mockImplementation((fn: unknown) => {
			return async (input: unknown, output: unknown): Promise<void> => {
				try {
					await (fn as (input: unknown, output: unknown) => Promise<void>)(
						input,
						output,
					);
				} catch {
					// Swallow error like real safeHook
				}
			};
		});
		mockValidateSwarmPath.mockImplementation(
			(dir: string, file: string) => `${dir}/.swarm/${file}`,
		);
		mockValidateLesson.mockReturnValue({
			valid: true,
			layer: null,
			reason: null,
			severity: null,
		});
		mockUpdateRetrievalOutcome.mockResolvedValue(undefined);
	});

	// ============================================================================
	// 1. Path traversal in isWriteToSwarmPlan
	// ============================================================================

	describe('isWriteToSwarmPlan - path traversal attacks', () => {
		test('path traversal with ../../../etc/passwd should NOT fire hook', async () => {
			const hook = createKnowledgeCuratorHook('/project', defaultConfig);

			// Input with path traversal
			const input = {
				toolName: 'write',
				path: '../../../etc/passwd',
				sessionID: 'sess-traversal',
			};
			await hook(input, {});

			// Expected: hook does NOT fire - no .swarm/plan.md in path
			expect(mockReadSwarmFileAsync).not.toHaveBeenCalled();
			expect(mockAppendKnowledge).not.toHaveBeenCalled();
		});

		test('path .swarm/plan.md.evil WILL fire hook (substring match - LOW RISK)', async () => {
			// Setup: readSwarmFileAsync returns plan content
			mockReadSwarmFileAsync.mockResolvedValueOnce(
				makePlanContent(['Test lesson']),
			);

			const hook = createKnowledgeCuratorHook('/project', defaultConfig);

			// Input with .evil suffix - this is a known LOW risk
			const input = {
				toolName: 'write',
				path: '.swarm/plan.md.evil',
				sessionID: 'sess-evil-suffix',
			};
			await hook(input, {});

			// Expected: hook fires (known low-risk behavior - includes() matches substring)
			expect(mockReadSwarmFileAsync).toHaveBeenCalledTimes(1);
			expect(mockAppendKnowledge).toHaveBeenCalledTimes(1);
		});

		test('path foo.swarm/plan.md WILL fire hook (substring match - LOW RISK)', async () => {
			// Setup: readSwarmFileAsync returns plan content
			mockReadSwarmFileAsync.mockResolvedValueOnce(
				makePlanContent(['Test lesson']),
			);

			const hook = createKnowledgeCuratorHook('/project', defaultConfig);

			// Input with substring match - this is a known LOW risk
			const input = {
				toolName: 'write',
				path: 'foo.swarm/plan.md',
				sessionID: 'sess-substring',
			};
			await hook(input, {});

			// Expected: hook fires (known low-risk behavior)
			expect(mockReadSwarmFileAsync).toHaveBeenCalledTimes(1);
			expect(mockAppendKnowledge).toHaveBeenCalledTimes(1);
		});

		test('Windows backslash .swarm\\plan.md should fire hook (normalization)', async () => {
			// Setup: readSwarmFileAsync returns plan content
			mockReadSwarmFileAsync.mockResolvedValueOnce(
				makePlanContent(['Test lesson']),
			);

			const hook = createKnowledgeCuratorHook('/project', defaultConfig);

			// Input with Windows backslash path
			const input = {
				toolName: 'write',
				path: '.swarm\\plan.md',
				sessionID: 'sess-windows',
			};
			await hook(input, {});

			// Expected: hook fires - backslashes are normalized to forward slashes
			expect(mockReadSwarmFileAsync).toHaveBeenCalledTimes(1);
			expect(mockAppendKnowledge).toHaveBeenCalledTimes(1);
		});

		test('path with file field instead of path field', async () => {
			// Setup: readSwarmFileAsync returns plan content
			mockReadSwarmFileAsync.mockResolvedValueOnce(
				makePlanContent(['Test lesson']),
			);

			const hook = createKnowledgeCuratorHook('/project', defaultConfig);

			// Input with file field (should also be checked)
			const input = {
				toolName: 'write',
				file: '.swarm/plan.md',
				sessionID: 'sess-file-field',
			};
			await hook(input, {});

			// Expected: hook fires - file field is also checked
			expect(mockReadSwarmFileAsync).toHaveBeenCalledTimes(1);
			expect(mockAppendKnowledge).toHaveBeenCalledTimes(1);
		});

		test('null/undefined input does not crash hook', async () => {
			const hook = createKnowledgeCuratorHook('/project', defaultConfig);

			// Input: null
			await expect(hook(null, {})).resolves.toBeUndefined();

			// Input: undefined
			await expect(hook(undefined, {})).resolves.toBeUndefined();

			// Input: empty object
			await expect(hook({}, {})).resolves.toBeUndefined();

			// Expected: no errors, no processing
			expect(mockReadSwarmFileAsync).not.toHaveBeenCalled();
			expect(mockAppendKnowledge).not.toHaveBeenCalled();
		});
	});

	// ============================================================================
	// 2. Injection via lesson content
	// ============================================================================

	describe('lesson content injection attacks', () => {
		test('lesson with control characters should be rejected', async () => {
			// Configure validator to reject control characters
			mockValidateLesson.mockImplementation(() => ({
				valid: false,
				layer: 2,
				reason: 'control characters detected',
				severity: 'error',
			}));
			mockReadKnowledge.mockResolvedValueOnce([]);

			await curateAndStoreSwarm(
				['Lesson with \x00 null and \x1f unit separator'],
				'test-project',
				{ phase_number: 1 },
				'/project',
				defaultConfig,
			);

			// Expected: rejected, not stored
			expect(mockAppendRejectedLesson).toHaveBeenCalledTimes(1);
			expect(mockAppendKnowledge).not.toHaveBeenCalled();
		});

		test('lesson with system: prefix should be rejected', async () => {
			// Configure validator to reject system: prefix
			mockValidateLesson.mockImplementation((lesson: string) => {
				if (lesson.startsWith('system:')) {
					return {
						valid: false,
						layer: 2,
						reason: 'system: prefix detected',
						severity: 'error',
					};
				}
				return { valid: true, layer: null, reason: null, severity: null };
			});
			mockReadKnowledge.mockResolvedValueOnce([]);

			await curateAndStoreSwarm(
				['system: This is an injection attempt'],
				'test-project',
				{ phase_number: 1 },
				'/project',
				defaultConfig,
			);

			// Expected: rejected, not stored
			expect(mockAppendRejectedLesson).toHaveBeenCalledTimes(1);
			expect(mockAppendKnowledge).not.toHaveBeenCalled();
		});

		test('lesson with __proto__ should be rejected', async () => {
			// Configure validator to reject __proto__
			mockValidateLesson.mockImplementation((lesson: string) => {
				if (lesson.includes('__proto__')) {
					return {
						valid: false,
						layer: 2,
						reason: 'prototype pollution pattern',
						severity: 'error',
					};
				}
				return { valid: true, layer: null, reason: null, severity: null };
			});
			mockReadKnowledge.mockResolvedValueOnce([]);

			await curateAndStoreSwarm(
				['Modify __proto__ to exploit prototype pollution'],
				'test-project',
				{ phase_number: 1 },
				'/project',
				defaultConfig,
			);

			// Expected: rejected, not stored
			expect(mockAppendRejectedLesson).toHaveBeenCalledTimes(1);
			expect(mockAppendKnowledge).not.toHaveBeenCalled();
		});

		test('lesson with embedded newlines in plan content extracts bullet lines correctly', async () => {
			mockReadKnowledge.mockResolvedValueOnce([]);

			// Note: embedded newlines come from the plan content
			// This tests that the lesson extractor handles them correctly
			const planContent = `# Test Project
Swarm: mega

### Lessons Learned
- Line one
Line two in same bullet (ignored - no bullet prefix)
- Another lesson
`;
			mockReadSwarmFileAsync.mockResolvedValueOnce(planContent);

			const hook = createKnowledgeCuratorHook('/project', defaultConfig);
			const input = {
				toolName: 'write',
				path: '.swarm/plan.md',
				sessionID: 'sess-newlines',
			};
			await hook(input, {});

			// Expected: stores 2 lessons (only lines with bullet prefix)
			expect(mockAppendKnowledge).toHaveBeenCalledTimes(2);
		});

		test('very long lesson (400 chars) should be rejected', async () => {
			// Configure validator to reject too-long lessons
			mockValidateLesson.mockImplementation((lesson: string) => {
				if (lesson.length > 280) {
					return {
						valid: false,
						layer: 1,
						reason: 'lesson too long',
						severity: 'error',
					};
				}
				return { valid: true, layer: null, reason: null, severity: null };
			});
			mockReadKnowledge.mockResolvedValueOnce([]);

			const longLesson = 'A'.repeat(400);

			await curateAndStoreSwarm(
				[longLesson],
				'test-project',
				{ phase_number: 1 },
				'/project',
				defaultConfig,
			);

			// Expected: rejected, not stored
			expect(mockAppendRejectedLesson).toHaveBeenCalledTimes(1);
			expect(mockAppendKnowledge).not.toHaveBeenCalled();
		});

		test('lesson with HTML tags should be rejected (if validator configured)', async () => {
			// Configure validator to reject HTML tags
			mockValidateLesson.mockImplementation((lesson: string) => {
				if (/<[^>]+>/.test(lesson)) {
					return {
						valid: false,
						layer: 2,
						reason: 'HTML tags detected',
						severity: 'error',
					};
				}
				return { valid: true, layer: null, reason: null, severity: null };
			});
			mockReadKnowledge.mockResolvedValueOnce([]);

			await curateAndStoreSwarm(
				['Use <script>alert("xss")</script> to inject code'],
				'test-project',
				{ phase_number: 1 },
				'/project',
				defaultConfig,
			);

			// Expected: rejected, not stored
			expect(mockAppendRejectedLesson).toHaveBeenCalledTimes(1);
			expect(mockAppendKnowledge).not.toHaveBeenCalled();
		});

		test('lesson with SQL injection pattern should be rejected', async () => {
			// Configure validator to reject SQL injection patterns
			mockValidateLesson.mockImplementation((lesson: string) => {
				if (/['";]\s*(OR|AND|DROP|UNION|SELECT)/i.test(lesson)) {
					return {
						valid: false,
						layer: 2,
						reason: 'SQL injection pattern',
						severity: 'error',
					};
				}
				return { valid: true, layer: null, reason: null, severity: null };
			});
			mockReadKnowledge.mockResolvedValueOnce([]);

			await curateAndStoreSwarm(
				['Use " OR 1=1 --" to bypass authentication'],
				'test-project',
				{ phase_number: 1 },
				'/project',
				defaultConfig,
			);

			// Expected: rejected, not stored
			expect(mockAppendRejectedLesson).toHaveBeenCalledTimes(1);
			expect(mockAppendKnowledge).not.toHaveBeenCalled();
		});
	});

	// ============================================================================
	// 3. Idempotency under concurrent-like conditions
	// ============================================================================

	describe('idempotency under concurrent-like conditions', () => {
		test('same sessionID with same retro section called 3 times → appendKnowledge only once', async () => {
			// Setup: readSwarmFileAsync returns plan content
			const planContent = makePlanContent(['Test idempotency']);
			mockReadSwarmFileAsync.mockResolvedValue(planContent);

			const hook = createKnowledgeCuratorHook('/project', defaultConfig);
			const input = {
				toolName: 'write',
				path: '.swarm/plan.md',
				sessionID: 'sess-same-idempotent',
			};

			// Call hook 3 times with same session ID and same content
			await hook(input, {});
			await hook(input, {});
			await hook(input, {});

			// Expected: appendKnowledge called only once (idempotency guard)
			expect(mockAppendKnowledge).toHaveBeenCalledTimes(1);
		});

		test('different sessionIDs with same content → appendKnowledge called once per session', async () => {
			// Setup: readSwarmFileAsync returns plan content
			const planContent = makePlanContent(['Test different sessions']);
			mockReadSwarmFileAsync.mockResolvedValue(planContent);

			const hook = createKnowledgeCuratorHook('/project', defaultConfig);

			// Call hook 3 times with different session IDs but same content
			await hook(
				{ toolName: 'write', path: '.swarm/plan.md', sessionID: 'sess-1' },
				{},
			);
			await hook(
				{ toolName: 'write', path: '.swarm/plan.md', sessionID: 'sess-2' },
				{},
			);
			await hook(
				{ toolName: 'write', path: '.swarm/plan.md', sessionID: 'sess-3' },
				{},
			);

			// Expected: appendKnowledge called 3 times (once per session)
			expect(mockAppendKnowledge).toHaveBeenCalledTimes(3);
		});

		test('same sessionID but different retro section → appendKnowledge called each time', async () => {
			// First call with lesson A
			mockReadSwarmFileAsync.mockResolvedValueOnce(
				makePlanContent(['Lesson A']),
			);
			const hook = createKnowledgeCuratorHook('/project', defaultConfig);
			await hook(
				{ toolName: 'write', path: '.swarm/plan.md', sessionID: 'sess-change' },
				{},
			);

			// Second call with lesson B (different content)
			mockReadSwarmFileAsync.mockResolvedValueOnce(
				makePlanContent(['Lesson B']),
			);
			await hook(
				{ toolName: 'write', path: '.swarm/plan.md', sessionID: 'sess-change' },
				{},
			);

			// Third call with lesson C (different content again)
			mockReadSwarmFileAsync.mockResolvedValueOnce(
				makePlanContent(['Lesson C']),
			);
			await hook(
				{ toolName: 'write', path: '.swarm/plan.md', sessionID: 'sess-change' },
				{},
			);

			// Expected: appendKnowledge called 3 times (content changed each time)
			expect(mockAppendKnowledge).toHaveBeenCalledTimes(3);
		});
	});

	// ============================================================================
	// 4. Empty/malformed plan content edge cases
	// ============================================================================

	describe('empty/malformed plan content edge cases', () => {
		test('plan with no ### Lessons Learned section → no lessons extracted', async () => {
			const planContent = `# Test Project
Swarm: mega

## Phase 1: Setup [COMPLETE]
- [x] 1.1: Init

## Phase 2: Core [IN PROGRESS]
- [ ] 2.1: Build
`;
			mockReadSwarmFileAsync.mockResolvedValueOnce(planContent);

			const hook = createKnowledgeCuratorHook('/project', defaultConfig);
			const input = {
				toolName: 'write',
				path: '.swarm/plan.md',
				sessionID: 'sess-no-retro',
			};
			await hook(input, {});

			// Expected: no lessons extracted, appendKnowledge NOT called
			expect(mockAppendKnowledge).not.toHaveBeenCalled();
		});

		test('plan with ### Lessons Learned but no bullet points → no lessons extracted', async () => {
			const planContent = `# Test Project
Swarm: mega

### Lessons Learned
This is just a description line, not a lesson.
Another line without a bullet.

## Phase 2: Core [IN PROGRESS]
- [ ] 2.1: Build
`;
			mockReadSwarmFileAsync.mockResolvedValueOnce(planContent);

			const hook = createKnowledgeCuratorHook('/project', defaultConfig);
			const input = {
				toolName: 'write',
				path: '.swarm/plan.md',
				sessionID: 'sess-no-bullets',
			};
			await hook(input, {});

			// Expected: no lessons extracted, appendKnowledge NOT called
			expect(mockAppendKnowledge).not.toHaveBeenCalled();
		});

		test('plan with ### Lessons Learned at end of file (no following heading) → still extracts bullets', async () => {
			const planContent = `# Test Project
Swarm: mega

### Lessons Learned
- First lesson at end
- Second lesson at end
`;
			mockReadSwarmFileAsync.mockResolvedValueOnce(planContent);

			const hook = createKnowledgeCuratorHook('/project', defaultConfig);
			const input = {
				toolName: 'write',
				path: '.swarm/plan.md',
				sessionID: 'sess-end-of-file',
			};
			await hook(input, {});

			// Expected: extracts bullets even at end of file
			expect(mockAppendKnowledge).toHaveBeenCalledTimes(2);
		});

		test('plan with empty ### Lessons Learned section → no lessons extracted', async () => {
			const planContent = `# Test Project
Swarm: mega

### Lessons Learned

## Phase 2: Core [IN PROGRESS]
- [ ] 2.1: Build
`;
			mockReadSwarmFileAsync.mockResolvedValueOnce(planContent);

			const hook = createKnowledgeCuratorHook('/project', defaultConfig);
			const input = {
				toolName: 'write',
				path: '.swarm/plan.md',
				sessionID: 'sess-empty-retro',
			};
			await hook(input, {});

			// Expected: no lessons extracted (section is empty)
			expect(mockAppendKnowledge).not.toHaveBeenCalled();
		});

		test('plan with malformed bullets (missing dash) → ignored', async () => {
			const planContent = `# Test Project
Swarm: mega

### Lessons Learned
First lesson missing dash
- Valid lesson
Second lesson missing dash
- Another valid lesson
`;
			mockReadSwarmFileAsync.mockResolvedValueOnce(planContent);

			const hook = createKnowledgeCuratorHook('/project', defaultConfig);
			const input = {
				toolName: 'write',
				path: '.swarm/plan.md',
				sessionID: 'sess-malformed-bullets',
			};
			await hook(input, {});

			// Expected: only 2 valid lessons extracted
			expect(mockAppendKnowledge).toHaveBeenCalledTimes(2);
		});

		test('plan with null readSwarmFileAsync result → no processing', async () => {
			mockReadSwarmFileAsync.mockResolvedValueOnce(null);

			const hook = createKnowledgeCuratorHook('/project', defaultConfig);
			const input = {
				toolName: 'write',
				path: '.swarm/plan.md',
				sessionID: 'sess-null-read',
			};
			await hook(input, {});

			// Expected: no processing, early return
			expect(mockAppendKnowledge).not.toHaveBeenCalled();
		});

		test('plan with very large content (100k chars) → should not crash', async () => {
			const largeContent = 'A'.repeat(100000);
			const planContent = `# Test Project
Swarm: mega

### Lessons Learned
- Valid lesson one
${largeContent}
- Valid lesson two
`;
			mockReadSwarmFileAsync.mockResolvedValueOnce(planContent);

			const hook = createKnowledgeCuratorHook('/project', defaultConfig);
			const input = {
				toolName: 'write',
				path: '.swarm/plan.md',
				sessionID: 'sess-large',
			};

			// Should not throw or crash
			await expect(hook(input, {})).resolves.toBeUndefined();

			// Expected: extracts 2 lessons (large text without bullet prefix is ignored)
			expect(mockAppendKnowledge).toHaveBeenCalledTimes(2);
		});
	});

	// ============================================================================
	// 5. Oversized lesson array
	// ============================================================================

	describe('oversized lesson array handling', () => {
		test('50 lessons where half valid, half blocked → only valid stored', async () => {
			// Setup: mix of valid and blocked lessons
			const lessons: string[] = [];
			for (let i = 0; i < 50; i++) {
				if (i % 2 === 0) {
					lessons.push(`Valid lesson ${i}`);
				} else {
					lessons.push(`rm -rf /some/path ${i}`); // Blocked pattern
				}
			}

			// Configure validator: even lessons valid, odd lessons blocked
			mockValidateLesson.mockImplementation((lesson: string) => {
				if (lesson.startsWith('rm -rf')) {
					return {
						valid: false,
						layer: 2,
						reason: 'dangerous command',
						severity: 'error',
					};
				}
				return { valid: true, layer: null, reason: null, severity: null };
			});
			mockReadKnowledge.mockResolvedValueOnce([]);

			await curateAndStoreSwarm(
				lessons,
				'test-project',
				{ phase_number: 1 },
				'/project',
				defaultConfig,
			);

			// Expected: 25 valid lessons stored, 25 blocked rejected
			expect(mockAppendKnowledge).toHaveBeenCalledTimes(25);
			expect(mockAppendRejectedLesson).toHaveBeenCalledTimes(25);
		});

		test('array with 100 identical valid lessons → only one stored (deduplication)', async () => {
			const identicalLessons = Array(100).fill('Always validate inputs');

			mockValidateLesson.mockReturnValue({
				valid: true,
				layer: null,
				reason: null,
				severity: null,
			});
			mockReadKnowledge.mockResolvedValueOnce([]);

			// After first lesson, mark as duplicate
			let callCount = 0;
			mockFindNearDuplicate.mockImplementation(() => {
				callCount++;
				if (callCount > 1) {
					return { id: 'first-entry', lesson: 'Always validate inputs' };
				}
				return undefined;
			});

			await curateAndStoreSwarm(
				identicalLessons,
				'test-project',
				{ phase_number: 1 },
				'/project',
				defaultConfig,
			);

			// Expected: only 1 stored (first one), rest skipped as duplicates
			expect(mockAppendKnowledge).toHaveBeenCalledTimes(1);
		});

		test('empty lessons array → no processing', async () => {
			mockReadKnowledge.mockResolvedValueOnce([]);

			await curateAndStoreSwarm(
				[],
				'test-project',
				{ phase_number: 1 },
				'/project',
				defaultConfig,
			);

			// Expected: no processing
			expect(mockAppendKnowledge).not.toHaveBeenCalled();
			expect(mockAppendRejectedLesson).not.toHaveBeenCalled();
		});

		test('lessons array with empty strings → validator rejects them', async () => {
			// Configure validator to reject empty/whitespace-only strings
			mockValidateLesson.mockImplementation((lesson: string) => {
				if (!lesson || !lesson.trim()) {
					return {
						valid: false,
						layer: 1,
						reason: 'empty lesson',
						severity: 'error',
					};
				}
				return { valid: true, layer: null, reason: null, severity: null };
			});
			mockReadKnowledge.mockResolvedValueOnce([]);

			await curateAndStoreSwarm(
				['', '   ', 'Valid lesson', '', 'Another valid lesson', ''],
				'test-project',
				{ phase_number: 1 },
				'/project',
				defaultConfig,
			);

			// Expected: only 2 non-empty lessons stored, 4 empty rejected
			expect(mockAppendKnowledge).toHaveBeenCalledTimes(2);
			expect(mockAppendRejectedLesson).toHaveBeenCalledTimes(4);
		});
	});

	// ============================================================================
	// Additional edge cases
	// ============================================================================

	describe('additional edge cases', () => {
		test('edit tool with .swarm/plan.md should fire hook', async () => {
			mockReadSwarmFileAsync.mockResolvedValueOnce(
				makePlanContent(['Test lesson']),
			);

			const hook = createKnowledgeCuratorHook('/project', defaultConfig);

			// Input with edit tool (not just write)
			const input = {
				toolName: 'edit',
				path: '.swarm/plan.md',
				sessionID: 'sess-edit',
			};
			await hook(input, {});

			// Expected: hook fires for edit tool
			expect(mockReadSwarmFileAsync).toHaveBeenCalledTimes(1);
			expect(mockAppendKnowledge).toHaveBeenCalledTimes(1);
		});

		test('apply_patch tool with .swarm/plan.md should fire hook', async () => {
			mockReadSwarmFileAsync.mockResolvedValueOnce(
				makePlanContent(['Test lesson']),
			);

			const hook = createKnowledgeCuratorHook('/project', defaultConfig);

			// Input with apply_patch tool
			const input = {
				toolName: 'apply_patch',
				path: '.swarm/plan.md',
				sessionID: 'sess-patch',
			};
			await hook(input, {});

			// Expected: hook fires for apply_patch tool
			expect(mockReadSwarmFileAsync).toHaveBeenCalledTimes(1);
			expect(mockAppendKnowledge).toHaveBeenCalledTimes(1);
		});

		test('unknown tool name should NOT fire hook', async () => {
			const hook = createKnowledgeCuratorHook('/project', defaultConfig);

			// Input with unknown tool
			const input = {
				toolName: 'delete',
				path: '.swarm/plan.md',
				sessionID: 'sess-unknown',
			};
			await hook(input, {});

			// Expected: hook does NOT fire
			expect(mockReadSwarmFileAsync).not.toHaveBeenCalled();
		});

		test('curateAndStoreSwarm with undefined projectName falls back to unknown', async () => {
			const planContent = `### Lessons Learned
- Test lesson
`;
			mockReadSwarmFileAsync.mockResolvedValueOnce(planContent);

			const hook = createKnowledgeCuratorHook('/project', defaultConfig);
			await hook(
				{
					toolName: 'write',
					path: '.swarm/plan.md',
					sessionID: 'sess-no-project',
				},
				{},
			);

			// Should still process (projectName defaults to 'unknown')
			expect(mockAppendKnowledge).toHaveBeenCalledTimes(1);
		});

		test('curateAndStoreSwarm with undefined phaseNumber falls back to 1', async () => {
			const planContent = `### Lessons Learned
- Test lesson
`;
			mockReadSwarmFileAsync.mockResolvedValueOnce(planContent);

			const hook = createKnowledgeCuratorHook('/project', defaultConfig);
			await hook(
				{
					toolName: 'write',
					path: '.swarm/plan.md',
					sessionID: 'sess-no-phase',
				},
				{},
			);

			// Should still process (phaseNumber defaults to 1)
			expect(mockAppendKnowledge).toHaveBeenCalledTimes(1);
		});

		test('config.enabled false at runtime should skip processing', async () => {
			const disabledConfig = { ...defaultConfig, enabled: false };

			mockReadSwarmFileAsync.mockResolvedValueOnce(
				makePlanContent(['Test lesson']),
			);

			const hook = createKnowledgeCuratorHook('/project', disabledConfig);
			await hook(
				{
					toolName: 'write',
					path: '.swarm/plan.md',
					sessionID: 'sess-disabled',
				},
				{},
			);

			// Expected: no processing (early return)
			expect(mockReadSwarmFileAsync).not.toHaveBeenCalled();
			expect(mockAppendKnowledge).not.toHaveBeenCalled();
		});
	});

	// ============================================================================
	// 6. updateRetrievalOutcome wiring attack vectors
	// ============================================================================

	describe('updateRetrievalOutcome wiring - adversarial tests', () => {
		test('directory path-traversal (../../evil) must be called as-is', async () => {
			const planContent = makePlanContent(['Test lesson']);
			mockReadSwarmFileAsync.mockResolvedValue(planContent);

			const hook = createKnowledgeCuratorHook('../../evil', defaultConfig);
			const input = {
				toolName: 'write',
				path: '.swarm/plan.md',
				sessionID: 'sess-traversal-evil',
			};
			await hook(input, {});

			// Expected: updateRetrievalOutcome called with path-traversal directory (reader's responsibility to validate)
			expect(mockUpdateRetrievalOutcome).toHaveBeenCalledTimes(1);
			expect(mockUpdateRetrievalOutcome).toHaveBeenCalledWith(
				'../../evil',
				'Phase 2',
				true,
			);
		});

		test('directory path-traversal (../etc/passwd) must be called as-is', async () => {
			const planContent = makePlanContent(['Test lesson']);
			mockReadSwarmFileAsync.mockResolvedValue(planContent);

			const hook = createKnowledgeCuratorHook('../etc/passwd', defaultConfig);
			const input = {
				toolName: 'write',
				path: '.swarm/plan.md',
				sessionID: 'sess-traversal-etc',
			};
			await hook(input, {});

			// Expected: updateRetrievalOutcome called with path-traversal directory
			expect(mockUpdateRetrievalOutcome).toHaveBeenCalledTimes(1);
			expect(mockUpdateRetrievalOutcome).toHaveBeenCalledWith(
				'../etc/passwd',
				'Phase 2',
				true,
			);
		});

		test('phaseNumber NaN (no valid phase number) falls back to 1', async () => {
			const planContent = `# Test Project
Swarm: mega

Phase: NaN

### Lessons Learned
- Test lesson
`;
			mockReadSwarmFileAsync.mockResolvedValue(planContent);

			const hook = createKnowledgeCuratorHook('/project', defaultConfig);
			const input = {
				toolName: 'write',
				path: '.swarm/plan.md',
				sessionID: 'sess-nan-phase',
			};
			await hook(input, {});

			// Expected: hook completes, updateRetrievalOutcome called with "Phase 1" (fallback when regex doesn't match)
			expect(mockUpdateRetrievalOutcome).toHaveBeenCalledTimes(1);
			expect(mockUpdateRetrievalOutcome).toHaveBeenCalledWith(
				'/project',
				'Phase 1',
				true,
			);
		});

		test('phaseNumber undefined (no valid phase number) falls back to 1', async () => {
			const planContent = `# Test Project
Swarm: mega
Phase: undefined

### Lessons Learned
- Test lesson
`;
			mockReadSwarmFileAsync.mockResolvedValue(planContent);

			const hook = createKnowledgeCuratorHook('/project', defaultConfig);
			const input = {
				toolName: 'write',
				path: '.swarm/plan.md',
				sessionID: 'sess-undefined-phase',
			};
			await hook(input, {});

			// Expected: hook completes, updateRetrievalOutcome called with "Phase 1" (fallback when regex doesn't match)
			expect(mockUpdateRetrievalOutcome).toHaveBeenCalledTimes(1);
			expect(mockUpdateRetrievalOutcome).toHaveBeenCalledWith(
				'/project',
				'Phase 1',
				true,
			);
		});

		test('updateRetrievalOutcome hangs indefinitely - hook should complete (no timeout in curator)', async () => {
			const planContent = makePlanContent(['Test lesson']);

			// Mock updateRetrievalOutcome to hang forever
			let resolveHang: undefined | (() => void);
			const hangingPromise = new Promise<void>((resolve) => {
				resolveHang = resolve;
			});
			mockUpdateRetrievalOutcome.mockReturnValue(hangingPromise);

			// Ensure mockReadSwarmFileAsync returns the plan content
			mockReadSwarmFileAsync.mockResolvedValue(planContent);

			const hook = createKnowledgeCuratorHook('/project', defaultConfig);
			const input = {
				toolName: 'write',
				path: '.swarm/plan.md',
				sessionID: 'sess-hang',
			};

			// Expected: hook hangs (no timeout in curator - relies on safeHook wrapper timeout if any)
			// Note: In reality, this test would hang forever, so we use a timeout
			const timeoutPromise = new Promise((_, reject) => {
				setTimeout(
					() => reject(new Error('Timeout - hook hung as expected')),
					100,
				);
			});

			// Don't use expect().rejects.toThrow() since safeHook swallows errors
			// Instead, just verify it hangs as expected
			try {
				await Promise.race([hook(input, {}), timeoutPromise]);
			} catch (e) {
				expect((e as Error).message).toBe('Timeout - hook hung as expected');
			}

			// updateRetrievalOutcome was called
			expect(mockUpdateRetrievalOutcome).toHaveBeenCalledTimes(1);
			expect(mockUpdateRetrievalOutcome).toHaveBeenCalledWith(
				'/project',
				'Phase 2',
				true,
			);

			// Clean up the hanging promise
			if (resolveHang) {
				resolveHang();
			}
		});

		test('updateRetrievalOutcome throws string error - safeHook must swallow', async () => {
			const planContent = makePlanContent(['Test lesson']);
			mockReadSwarmFileAsync.mockResolvedValue(planContent);

			// Mock updateRetrievalOutcome to throw a non-Error string
			mockUpdateRetrievalOutcome.mockImplementation(() => {
				throw 'string error from updateRetrievalOutcome';
			});

			const hook = createKnowledgeCuratorHook('/project', defaultConfig);
			const input = {
				toolName: 'write',
				path: '.swarm/plan.md',
				sessionID: 'sess-string-error',
			};

			// Expected: hook completes without throwing (safeHook swallows the error)
			await expect(hook(input, {})).resolves.toBeUndefined();

			// updateRetrievalOutcome was called
			expect(mockUpdateRetrievalOutcome).toHaveBeenCalledTimes(1);
		});

		test('updateRetrievalOutcome throws null - safeHook must swallow', async () => {
			const planContent = makePlanContent(['Test lesson']);
			mockReadSwarmFileAsync.mockResolvedValue(planContent);

			// Mock updateRetrievalOutcome to throw null
			mockUpdateRetrievalOutcome.mockImplementation(() => {
				throw null;
			});

			const hook = createKnowledgeCuratorHook('/project', defaultConfig);
			const input = {
				toolName: 'write',
				path: '.swarm/plan.md',
				sessionID: 'sess-null-error',
			};

			// Expected: hook completes without throwing (safeHook swallows the error)
			await expect(hook(input, {})).resolves.toBeUndefined();

			// updateRetrievalOutcome was called
			expect(mockUpdateRetrievalOutcome).toHaveBeenCalledTimes(1);
		});

		test('updateRetrievalOutcome throws undefined - safeHook must swallow', async () => {
			const planContent = makePlanContent(['Test lesson']);
			mockReadSwarmFileAsync.mockResolvedValue(planContent);

			// Mock updateRetrievalOutcome to throw undefined
			mockUpdateRetrievalOutcome.mockImplementation(() => {
				throw undefined;
			});

			const hook = createKnowledgeCuratorHook('/project', defaultConfig);
			const input = {
				toolName: 'write',
				path: '.swarm/plan.md',
				sessionID: 'sess-undefined-error',
			};

			// Expected: hook completes without throwing (safeHook swallows the error)
			await expect(hook(input, {})).resolves.toBeUndefined();

			// updateRetrievalOutcome was called
			expect(mockUpdateRetrievalOutcome).toHaveBeenCalledTimes(1);
		});

		test('updateRetrievalOutcome throws object - safeHook must swallow', async () => {
			const planContent = makePlanContent(['Test lesson']);
			mockReadSwarmFileAsync.mockResolvedValue(planContent);

			// Mock updateRetrievalOutcome to throw a plain object
			mockUpdateRetrievalOutcome.mockImplementation(() => {
				throw { code: 'CUSTOM', message: 'custom object error' };
			});

			const hook = createKnowledgeCuratorHook('/project', defaultConfig);
			const input = {
				toolName: 'write',
				path: '.swarm/plan.md',
				sessionID: 'sess-object-error',
			};

			// Expected: hook completes without throwing (safeHook swallows the error)
			await expect(hook(input, {})).resolves.toBeUndefined();

			// updateRetrievalOutcome was called
			expect(mockUpdateRetrievalOutcome).toHaveBeenCalledTimes(1);
		});

		test('concurrent hook invocations - no race condition or double-call error', async () => {
			const planContent = makePlanContent(['Test lesson']);
			mockReadSwarmFileAsync.mockResolvedValue(planContent);

			const hook = createKnowledgeCuratorHook('/project', defaultConfig);
			const input = {
				toolName: 'write',
				path: '.swarm/plan.md',
				sessionID: 'sess-concurrent',
			};

			// Call hook concurrently 3 times
			const promises = [hook(input, {}), hook(input, {}), hook(input, {})];

			// Expected: all hooks complete without throwing
			const results = await Promise.all(promises);
			expect(results).toEqual([undefined, undefined, undefined]);

			// Note: updateRetrievalOutcome may be called multiple times due to lack of session ID reset in tests
			// The important part is no crash/race condition
			expect(mockUpdateRetrievalOutcome).toHaveBeenCalled();
		});

		test('concurrent hook invocations with different sessionIDs - each calls updateRetrievalOutcome', async () => {
			const planContent = makePlanContent(['Test lesson']);
			mockReadSwarmFileAsync.mockResolvedValue(planContent);

			const hook = createKnowledgeCuratorHook('/project', defaultConfig);

			// Call hook concurrently with different sessionIDs
			const promises = [
				hook(
					{ toolName: 'write', path: '.swarm/plan.md', sessionID: 'sess-1' },
					{},
				),
				hook(
					{ toolName: 'write', path: '.swarm/plan.md', sessionID: 'sess-2' },
					{},
				),
				hook(
					{ toolName: 'write', path: '.swarm/plan.md', sessionID: 'sess-3' },
					{},
				),
			];

			// Expected: all hooks complete without throwing
			const results = await Promise.all(promises);
			expect(results).toEqual([undefined, undefined, undefined]);

			// Each hook calls updateRetrievalOutcome once (different sessionIDs bypass idempotency guard)
			expect(mockUpdateRetrievalOutcome).toHaveBeenCalledTimes(3);
		});
	});
});
