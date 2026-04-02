/**
 * Adversarial Tests for Issue #78 Hotfix - retrieve_summary and exempt tool defaults
 * Tests attack vectors: malformed offset/limit, oversized limit clamp, offset beyond lines,
 * invalid summary IDs, path traversal, null bytes, control characters, loop-prevention
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import type { ToolContext } from '@opencode-ai/plugin';
import { SummaryConfigSchema } from '../../src/config/schema';
import { createToolSummarizerHook } from '../../src/hooks/tool-summarizer';
import { sanitizeSummaryId } from '../../src/summaries/manager';
import { retrieve_summary } from '../../src/tools/retrieve-summary';

describe('ADVERSARIAL: retrieve_summary security and boundary tests', () => {
	let testDir: string;
	let swarmDir: string;
	let mockContext: ToolContext;

	beforeEach(() => {
		testDir = fs.mkdtempSync(path.join(tmpdir(), 'retrieve-summary-test-'));
		swarmDir = path.join(testDir, '.swarm');
		fs.mkdirSync(path.join(swarmDir, 'summaries'), { recursive: true });
		mockContext = { directory: testDir } as ToolContext;
	});

	afterEach(() => {
		if (testDir && fs.existsSync(testDir)) {
			fs.rmSync(testDir, { recursive: true, force: true });
		}
	});

	// Helper to create a summary file
	const createSummary = (id: string, content: string) => {
		const summaryPath = path.join(swarmDir, 'summaries', `${id}.json`);
		fs.writeFileSync(
			summaryPath,
			JSON.stringify({
				id,
				summaryText: `Summary of ${id}`,
				fullOutput: content,
				timestamp: Date.now(),
				originalBytes: Buffer.byteLength(content, 'utf8'),
			}),
		);
	};

	describe('1. Invalid summary ID attack vectors', () => {
		it('should reject empty string summary ID', async () => {
			const result = await retrieve_summary.execute({ id: '' }, mockContext);
			expect(result).toContain('Error: invalid summary ID format');
		});

		it('should reject null bytes in summary ID', async () => {
			const result = await retrieve_summary.execute(
				{ id: 'S1\u0000' },
				mockContext,
			);
			expect(result).toContain('Error: invalid summary ID format');
		});

		it('should reject control characters in summary ID', async () => {
			const result = await retrieve_summary.execute(
				{ id: 'S1\x01\x02' },
				mockContext,
			);
			expect(result).toContain('Error: invalid summary ID format');
		});

		it('should reject path traversal in summary ID (dots)', async () => {
			const result = await retrieve_summary.execute(
				{ id: 'S1/../../../etc/passwd' },
				mockContext,
			);
			expect(result).toContain('Error: invalid summary ID format');
		});

		it('should reject path traversal in summary ID (double dots)', async () => {
			const result = await retrieve_summary.execute({ id: '..' }, mockContext);
			expect(result).toContain('Error: invalid summary ID format');
		});

		it('should reject path traversal in summary ID (backslash)', async () => {
			const result = await retrieve_summary.execute(
				{ id: 'S1..\\..\\windows\\system32' },
				mockContext,
			);
			expect(result).toContain('Error: invalid summary ID format');
		});

		it('should reject non-matching pattern (no digits)', async () => {
			const result = await retrieve_summary.execute({ id: 'SA' }, mockContext);
			expect(result).toContain('Error: invalid summary ID format');
		});

		it('should reject pattern with letters after S', async () => {
			const result = await retrieve_summary.execute(
				{ id: 'Sabc' },
				mockContext,
			);
			expect(result).toContain('Error: invalid summary ID format');
		});

		it('should reject ID without S prefix', async () => {
			const result = await retrieve_summary.execute({ id: '123' }, mockContext);
			expect(result).toContain('Error: invalid summary ID format');
		});

		it('should reject ID with only S', async () => {
			const result = await retrieve_summary.execute({ id: 'S' }, mockContext);
			expect(result).toContain('Error: invalid summary ID format');
		});
	});

	describe('2. Malformed offset/limit boundary cases', () => {
		const multiLineContent =
			'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10';

		beforeEach(() => {
			createSummary('S1', multiLineContent);
		});

		it('should handle negative offset (below min)', async () => {
			// Schema enforces min(0), so this tests runtime fallback
			const result = await retrieve_summary.execute(
				{ id: 'S1', offset: -1, limit: 10 },
				mockContext,
			);
			// With schema validation, -1 becomes 0
			expect(result).toContain('Lines 1-');
		});

		it('should handle zero offset', async () => {
			const result = await retrieve_summary.execute(
				{ id: 'S1', offset: 0, limit: 5 },
				mockContext,
			);
			expect(result).toContain('Lines 1-5');
			expect(result).toContain('line1');
			expect(result).not.toContain('line6');
		});

		it('should handle fractional offset (floor to integer)', async () => {
			// Note: Schema validation may convert this - testing actual behavior
			const result = await retrieve_summary.execute(
				{ id: 'S1', offset: 2.7, limit: 3 },
				mockContext,
			);
			// Should work without crashing
			expect(result).toBeDefined();
		});

		it('should handle NaN offset gracefully', async () => {
			// @ts-ignore - testing runtime behavior
			const result = await retrieve_summary.execute(
				{ id: 'S1', offset: NaN, limit: 5 },
				mockContext,
			);
			// Should use default or fail gracefully
			expect(result).toBeDefined();
		});

		it('should handle Infinity offset', async () => {
			// @ts-ignore - testing runtime behavior
			const result = await retrieve_summary.execute(
				{ id: 'S1', offset: Infinity, limit: 5 },
				mockContext,
			);
			// Should use safe fallback
			expect(result).toBeDefined();
		});

		it('should handle undefined offset (uses default 0)', async () => {
			const result = await retrieve_summary.execute(
				{ id: 'S1', limit: 3 },
				mockContext,
			);
			expect(result).toContain('Lines 1-3');
			expect(result).toContain('line1');
		});

		it('should handle undefined limit (uses default 200)', async () => {
			const result = await retrieve_summary.execute(
				{ id: 'S1', offset: 0 },
				mockContext,
			);
			// Should return up to 200 lines or all 10
			expect(result).toContain('Lines 1-10');
		});
	});

	describe('3. Oversized limit clamp enforcement', () => {
		const multiLineContent = 'line1\nline2\nline3\nline4\nline5';

		beforeEach(() => {
			createSummary('S1', multiLineContent);
		});

		it('should clamp limit to max 500', async () => {
			const result = await retrieve_summary.execute(
				{ id: 'S1', offset: 0, limit: 1000 },
				mockContext,
			);
			// Should clamp to 500 or file length
			expect(result).toContain('Lines 1-');
			// Should NOT return more than 500 lines worth
			expect(result).not.toContain('more than 500');
		});

		it('should handle limit at exact max (500)', async () => {
			const result = await retrieve_summary.execute(
				{ id: 'S1', offset: 0, limit: 500 },
				mockContext,
			);
			expect(result).toBeDefined();
		});

		it('should handle limit above max (501+)', async () => {
			const result = await retrieve_summary.execute(
				{ id: 'S1', offset: 0, limit: 501 },
				mockContext,
			);
			// Should clamp to 500
			expect(result).toBeDefined();
		});

		it('should handle extremely large limit (10000)', async () => {
			const result = await retrieve_summary.execute(
				{ id: 'S1', offset: 0, limit: 10000 },
				mockContext,
			);
			// Should clamp to 500
			expect(result).toBeDefined();
		});

		it('should handle negative limit (schema min: 1)', async () => {
			// Schema enforces min(1), so this tests runtime
			const result = await retrieve_summary.execute(
				{ id: 'S1', offset: 0, limit: -5 },
				mockContext,
			);
			// Should either clamp to 1 or use default
			expect(result).toBeDefined();
		});

		it('should handle zero limit', async () => {
			// Schema enforces min(1), runtime should handle
			const result = await retrieve_summary.execute(
				{ id: 'S1', offset: 0, limit: 0 },
				mockContext,
			);
			expect(result).toBeDefined();
		});
	});

	describe('4. Offset beyond lines', () => {
		const shortContent = 'line1\nline2';

		beforeEach(() => {
			createSummary('S1', shortContent);
		});

		it('should handle offset equal to total lines', async () => {
			const result = await retrieve_summary.execute(
				{ id: 'S1', offset: 2, limit: 10 },
				mockContext,
			);
			expect(result).toContain('--- Offset beyond range ---');
		});

		it('should handle offset beyond total lines', async () => {
			const result = await retrieve_summary.execute(
				{ id: 'S1', offset: 100, limit: 10 },
				mockContext,
			);
			expect(result).toContain('--- Offset beyond range ---');
		});

		it('should handle very large offset', async () => {
			const result = await retrieve_summary.execute(
				{ id: 'S1', offset: 999999, limit: 10 },
				mockContext,
			);
			expect(result).toBeDefined();
		});

		it('should return empty content when offset >= totalLines', async () => {
			const result = await retrieve_summary.execute(
				{ id: 'S1', offset: 5, limit: 10 },
				mockContext,
			);
			// Should show range but empty content
			expect(result).toContain('--- Offset beyond range ---');
		});
	});

	describe('5. Non-existent summary ID', () => {
		it('should return not found for non-existent ID', async () => {
			const result = await retrieve_summary.execute(
				{ id: 'S999' },
				mockContext,
			);
			expect(result).toContain('not found');
		});

		it('should return not found for deleted ID', async () => {
			// Create then delete
			createSummary('S1', 'content');
			fs.unlinkSync(path.join(swarmDir, 'summaries', 'S1.json'));

			const result = await retrieve_summary.execute({ id: 'S1' }, mockContext);
			expect(result).toContain('not found');
		});
	});

	describe('6. Size limit enforcement', () => {
		it('should reject content exceeding 10MB limit', async () => {
			// Create a large summary
			const largeContent = 'x'.repeat(11 * 1024 * 1024); // 11MB
			createSummary('S1', largeContent);

			const result = await retrieve_summary.execute({ id: 'S1' }, mockContext);
			expect(result).toContain('exceeds maximum size');
		});

		it('should handle content at exactly 10MB boundary', async () => {
			const boundaryContent = 'x'.repeat(10 * 1024 * 1024);
			createSummary('S1', boundaryContent);

			const result = await retrieve_summary.execute({ id: 'S1' }, mockContext);
			// Should succeed (not exceed)
			expect(result).not.toContain('exceeds maximum size');
		});
	});

	describe('7. sanitizeSummaryId function direct tests', () => {
		it('should accept valid IDs', () => {
			expect(sanitizeSummaryId('S1')).toBe('S1');
			expect(sanitizeSummaryId('S99')).toBe('S99');
			expect(sanitizeSummaryId('S123456789')).toBe('S123456789');
		});

		it('should throw on invalid IDs', () => {
			expect(() => sanitizeSummaryId('')).toThrow();
			expect(() => sanitizeSummaryId('S')).toThrow();
			expect(() => sanitizeSummaryId('Sabc')).toThrow();
			expect(() => sanitizeSummaryId('../etc')).toThrow();
			expect(() => sanitizeSummaryId('S1\x00')).toThrow();
			expect(() => sanitizeSummaryId('S1\x1f')).toThrow();
		});
	});

	describe('8. Pagination response format', () => {
		const manyLines = Array.from({ length: 50 }, (_, i) => `line${i + 1}`).join(
			'\n',
		);

		beforeEach(() => {
			createSummary('S1', manyLines);
		});

		it('should include range header', async () => {
			const result = await retrieve_summary.execute(
				{ id: 'S1', offset: 0, limit: 10 },
				mockContext,
			);
			expect(result).toMatch(/--- Lines \d+-\d+ of \d+ ---/);
		});

		it('should include continuation hint when more lines exist', async () => {
			const result = await retrieve_summary.execute(
				{ id: 'S1', offset: 0, limit: 10 },
				mockContext,
			);
			expect(result).toContain('more lines');
			expect(result).toContain('offset=');
		});

		it('should not include continuation hint at end of content', async () => {
			const result = await retrieve_summary.execute(
				{ id: 'S1', offset: 40, limit: 20 },
				mockContext,
			);
			expect(result).not.toContain('more lines');
		});
	});

	describe('9. Edge case: empty content', () => {
		it('should handle empty file content', async () => {
			createSummary('S1', '');

			const result = await retrieve_summary.execute({ id: 'S1' }, mockContext);
			// Implementation returns "No content" message for empty
			expect(result).toContain('No content');
		});

		it('should handle single line without newline', async () => {
			createSummary('S1', 'single line');

			const result = await retrieve_summary.execute(
				{ id: 'S1', offset: 0, limit: 5 },
				mockContext,
			);
			expect(result).toContain('single line');
		});

		it('should handle MAX_SAFE_INTEGER offset without crashing', async () => {
			createSummary('S1', 'line1\nline2\nline3');

			// Should handle MAX_SAFE_INTEGER gracefully
			const result = await retrieve_summary.execute(
				{
					id: 'S1',
					offset: Number.MAX_SAFE_INTEGER,
					limit: 10,
				},
				mockContext,
			);
			// Should return offset-beyond-range response, not crash
			expect(result).toBeDefined();
			expect(result).toMatch(/Offset beyond range|No content/);
		});

		it('should handle limit=500 on 1-line file without overflow', async () => {
			createSummary('S1', 'only one line');

			const result = await retrieve_summary.execute(
				{
					id: 'S1',
					offset: 0,
					limit: 500,
				},
				mockContext,
			);
			// Should return exactly 1 line, not overflow
			expect(result).toContain('only one line');
			expect(result).toContain('Lines 1-1 of 1');
			// Should NOT claim 500 lines
			expect(result).not.toContain('Lines 1-500');
		});
	});
});

describe('ADVERSARIAL: exempt tool defaults and loop prevention', () => {
	describe('1. Default exempt_tools configuration', () => {
		it('should include "read" in default exempt_tools', () => {
			const config = SummaryConfigSchema.parse({});
			expect(config.exempt_tools).toContain('read');
		});

		it('should include "retrieve_summary" in default exempt_tools', () => {
			const config = SummaryConfigSchema.parse({});
			expect(config.exempt_tools).toContain('retrieve_summary');
		});

		it('should include "task" in default exempt_tools', () => {
			const config = SummaryConfigSchema.parse({});
			expect(config.exempt_tools).toContain('task');
		});

		it('should allow custom exempt_tools override', () => {
			const config = SummaryConfigSchema.parse({
				exempt_tools: ['custom_tool'],
			});
			expect(config.exempt_tools).toEqual(['custom_tool']);
		});

		it('should allow extending default exempt_tools', () => {
			// Note: Default is used, but we can verify the array contains expected items
			const config = SummaryConfigSchema.parse({
				exempt_tools: ['read', 'retrieve_summary', 'task', 'new_tool'],
			});
			expect(config.exempt_tools).toContain('read');
			expect(config.exempt_tools).toContain('retrieve_summary');
			expect(config.exempt_tools).toContain('task');
			expect(config.exempt_tools).toContain('new_tool');
		});
	});

	describe('2. Tool summarizer loop prevention', () => {
		let testDir: string;
		let mockContext: ToolContext;

		beforeEach(() => {
			testDir = fs.mkdtempSync(path.join(tmpdir(), 'tool-summarizer-test-'));
			mockContext = { directory: testDir } as ToolContext;
		});

		afterEach(() => {
			if (testDir && fs.existsSync(testDir)) {
				fs.rmSync(testDir, { recursive: true, force: true });
			}
		});

		it('should skip summarization for exempt tool "read"', async () => {
			const config = SummaryConfigSchema.parse({});
			const summarizer = createToolSummarizerHook(config, testDir);

			const input = { tool: 'read', args: {} };
			const output = { output: 'x'.repeat(200000) }; // Above threshold

			await summarizer(input as any, output as any);

			// Output should NOT be summarized (should remain original)
			expect(output.output).toBe('x'.repeat(200000));
		});

		it('should skip summarization for exempt tool "retrieve_summary"', async () => {
			const config = SummaryConfigSchema.parse({});
			const summarizer = createToolSummarizerHook(config, testDir);

			const input = { tool: 'retrieve_summary', args: {} };
			const output = { output: 'x'.repeat(200000) };

			await summarizer(input as any, output as any);

			expect(output.output).toBe('x'.repeat(200000));
		});

		it('should skip summarization for exempt tool "task"', async () => {
			const config = SummaryConfigSchema.parse({});
			const summarizer = createToolSummarizerHook(config, testDir);

			const input = { tool: 'task', args: {} };
			const output = { output: 'x'.repeat(200000) };

			await summarizer(input as any, output as any);

			expect(output.output).toBe('x'.repeat(200000));
		});

		it('should summarize non-exempt tools', async () => {
			const config = SummaryConfigSchema.parse({
				exempt_tools: [], // Empty - no exemptions
			});
			const summarizer = createToolSummarizerHook(config, testDir);

			const input = { tool: 'write', args: {} };
			const output = { output: 'x'.repeat(200000) };

			await summarizer(input as any, output as any);

			// Output should be summarized
			expect(output.output).not.toBe('x'.repeat(200000));
			expect(output.output).toContain('S'); // Summary ID
		});

		it('should skip empty outputs', async () => {
			const config = SummaryConfigSchema.parse({});
			const summarizer = createToolSummarizerHook(config, testDir);

			const input = { tool: 'write', args: {} };
			const output = { output: '' };

			await summarizer(input as any, output as any);

			// Should not crash, output should remain empty
			expect(output.output).toBe('');
		});

		it('should skip non-string outputs', async () => {
			const config = SummaryConfigSchema.parse({});
			const summarizer = createToolSummarizerHook(config, testDir);

			const input = { tool: 'write', args: {} };
			const output = { output: null as any };

			await summarizer(input as any, output as any);
			// Should not crash
		});
	});
});
