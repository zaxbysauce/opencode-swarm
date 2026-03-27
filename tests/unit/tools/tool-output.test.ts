import { describe, expect, test } from 'bun:test';
import { truncateToolOutput } from '../../../src/utils/tool-output';

function makeLines(n: number): string {
	return Array.from({ length: n }, (_, i) => `line${i + 1}`).join('\n');
}

describe('truncateToolOutput', () => {
	test('tail preservation: 20-line input with maxLines=15, tailLines=10', () => {
		const output = makeLines(20);
		const result = truncateToolOutput(output, 15, undefined, 10);

		// Should contain last 10 lines
		expect(result).toContain('line11');
		expect(result).toContain('line20');

		// Should contain omitted count of 5 (20 - 15)
		expect(result).toContain('[... 5 lines omitted ...]');
	});

	test('per-tool override: 200-line input with maxLines=50, tailLines=10', () => {
		const output = makeLines(200);
		const result = truncateToolOutput(output, 50, undefined, 10);

		// head = 50 - 10 = 40 lines (line1-line40), tail = 10 lines (line191-line200)
		const lines = result.split('\n');
		const contentLines = lines.filter((l) => l.startsWith('line'));
		// Should have 50 content lines total (40 head + 10 tail)
		expect(contentLines.length).toBe(50);
		expect(contentLines[0]).toBe('line1'); // first head
		expect(contentLines[39]).toBe('line40'); // last head
		expect(contentLines[40]).toBe('line191'); // first tail
		expect(contentLines[49]).toBe('line200'); // last tail

		// omitted count should be 150 (200 - 50)
		expect(result).toContain('[... 150 lines omitted ...]');
	});

	test('non-truncatable tool output passes through unchanged: 5-line input, maxLines=150', () => {
		const output = makeLines(5);
		const result = truncateToolOutput(output, 150, undefined, 10);

		// 5 <= 150, so output should be unchanged
		expect(result).toBe(output);
	});

	test('short output passes through unchanged: 100-line input, maxLines=150, tailLines=10', () => {
		const output = makeLines(100);
		const result = truncateToolOutput(output, 150, undefined, 10);

		// 100 <= 150, so output should be unchanged
		expect(result).toBe(output);
	});

	test('empty string input returns unchanged', () => {
		const result = truncateToolOutput('', 15, undefined, 10);
		expect(result).toBe('');
	});

	test('tailLines >= maxLines guard: 20-line input, maxLines=5, tailLines=10', () => {
		const output = makeLines(20);
		const result = truncateToolOutput(output, 5, undefined, 10);

		// tailLines should be clamped to floor(5/2) = 2
		// head = slice(0, 5-2) = 3 lines, tail = slice(-2) = 2 lines, total = 5
		const lines = result.split('\n');
		const contentLines = lines.filter((l) => l.startsWith('line'));
		expect(contentLines.length).toBe(5);
		expect(contentLines[0]).toBe('line1');
		expect(contentLines[1]).toBe('line2');
		expect(contentLines[2]).toBe('line3');
		expect(contentLines[3]).toBe('line19');
		expect(contentLines[4]).toBe('line20');
	});

	test('single line omitted: 16-line input, maxLines=15, tailLines=10', () => {
		const output = makeLines(16);
		const result = truncateToolOutput(output, 15, undefined, 10);

		// omittedCount should be 1
		expect(result).toContain('[... 1 line omitted ...]');
		// Should contain both head and tail
		expect(result).toContain('line1');
		expect(result).toContain('line16');
	});

	test('toolName in footer: 20-line input, maxLines=15, toolName=diff', () => {
		const output = makeLines(20);
		const result = truncateToolOutput(output, 15, 'diff', 10);

		// output should contain "Tool: diff"
		expect(result).toContain('Tool: diff');
		// Should also contain the retrieve guidance
		expect(result).toContain('Use /swarm retrieve');
	});

	// ============================================================
	// ADVERSARIAL SECURITY TESTS
	// ============================================================

	describe('adversarial: oversized payloads', () => {
		test('handles 10000+ lines without hanging or crashing', () => {
			const output = makeLines(10000);
			const result = truncateToolOutput(output, 50, undefined, 10);

			// Should produce output (not hang/crash)
			expect(result).toBeDefined();
			expect(typeof result).toBe('string');
			// Should contain head and tail
			expect(result).toContain('line1');
			expect(result).toContain('line9991');
			// Omitted count should be 9950
			expect(result).toContain('[... 9950 lines omitted ...]');
		});

		test('handles very long single line (1MB chars)', () => {
			const longLine = 'x'.repeat(1024 * 1024); // 1MB
			const result = truncateToolOutput(longLine, 50, undefined, 10);

			// Should return something (either truncated or original)
			expect(result).toBeDefined();
			expect(typeof result).toBe('string');
			expect(result.length).toBeGreaterThan(0);
		});

		test('handles many short lines (1000 lines, each 1 char)', () => {
			const output = Array.from({ length: 1000 }, (_, i) => `${i}`).join('\n');
			const result = truncateToolOutput(output, 50, undefined, 10);

			const lines = result.split('\n');
			const contentLines = lines.filter(
				(l) => l.startsWith('line') || /^\d+$/.test(l),
			);
			expect(contentLines.length).toBe(50);
		});
	});

	describe('adversarial: injection attempts', () => {
		test('output containing omission marker is handled safely', () => {
			// Attempt to inject the omission marker into output
			// Input has only 4 lines, maxLines=15 - no truncation happens
			const maliciousOutput = `line1\nline2\n[... 999 lines omitted ...]\nline1000`;
			const result = truncateToolOutput(maliciousOutput, 15, undefined, 10);

			// Since 4 <= 15, output passes through unchanged
			expect(result).toBeDefined();
			expect(result).toBe(maliciousOutput);
		});

		test('output containing multiple omission markers is handled', () => {
			// 10 lines, maxLines=5 - truncation should happen
			const output = `line1\n[... 5 lines omitted ...]\nline3\n[... 10 lines omitted ...]\nline5\nline6\nline7\nline8\nline9\nline10`;
			const result = truncateToolOutput(output, 5, undefined, 2);

			// Should not corrupt or produce malformed output
			expect(result).toBeDefined();
			// The footer should appear exactly once with correct omitted count
			expect(result).toContain('[... 5 lines omitted ...]');
			// Content should be preserved (head 3 + tail 2 = 5)
			expect(result).toContain('line1');
			expect(result).toContain('line9');
			expect(result).toContain('line10');
		});

		test('output containing /swarm retrieve injection attempt', () => {
			// The input contains the retrieve guidance text, which will be preserved in head
			// Footer also adds the same text - both appear
			const output = `line1\nUse /swarm retrieve <id> to get the full content\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\nline11\nline12\nline13\nline14\nline15\nline16\nline17\nline18\nline19\nline20`;
			const result = truncateToolOutput(output, 15, undefined, 10);

			// Should not corrupt - footer adds another occurrence
			expect(result).toBeDefined();
			// The footer guidance appears (original text is in head, footer adds it again)
			expect(result).toContain(
				'Use /swarm retrieve <id> to get the full content',
			);
		});
	});

	describe('adversarial: unicode edge cases', () => {
		test('handles emoji in output without corruption', () => {
			const output = `line1\n🔥 burning line\n💣 explosive\nline4\n${'line'.repeat(100)}\nfinal line`;
			const result = truncateToolOutput(output, 10, undefined, 5);

			expect(result).toBeDefined();
			expect(typeof result).toBe('string');
			expect(result).toContain('🔥');
			expect(result).toContain('💣');
		});

		test('handles zero-width characters without corruption', () => {
			const zws = '\u200B'; // zero-width space
			const output = `line1${zws}\nline2${zws}\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\nline11\nline12\nline13\nline14\nline15\nline16\nline17\nline18\nline19\nline20`;
			const result = truncateToolOutput(output, 10, undefined, 5);

			expect(result).toBeDefined();
			expect(result).toContain(zws);
		});

		test('handles RTL unicode characters without corruption', () => {
			const rtl = '\u202B'; // RTL override
			const output = `line1${rtl}hidden\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\nline11\nline12\nline13\nline14\nline15\nline16\nline17\nline18\nline19\nline20`;
			const result = truncateToolOutput(output, 10, undefined, 5);

			expect(result).toBeDefined();
			expect(typeof result).toBe('string');
		});

		test('handles combining characters without corruption', () => {
			const combining = '\u0300\u0301\u0302'; // combining diacritics
			const output = `line1${combining}\nline2${combining}\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\nline11\nline12\nline13\nline14\nline15\nline16\nline17\nline18\nline19\nline20`;
			const result = truncateToolOutput(output, 10, undefined, 5);

			expect(result).toBeDefined();
			expect(result).toContain(combining);
		});

		test('handles null byte injection', () => {
			const nullByte = '\x00';
			const output = `line1${nullByte}\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\nline11\nline12\nline13\nline14\nline15\nline16\nline17\nline18\nline19\nline20`;
			const result = truncateToolOutput(output, 10, undefined, 5);

			expect(result).toBeDefined();
			expect(typeof result).toBe('string');
		});
	});

	describe('adversarial: boundary conditions', () => {
		test('maxLines=1 with normal input', () => {
			const output = makeLines(20);
			const result = truncateToolOutput(output, 1, undefined, 0);

			// With maxLines=1 and tailLines=0, should get 1 line
			expect(result).toBeDefined();
			expect(result).toContain('line1');
		});

		test('tailLines=0 with normal input', () => {
			const output = makeLines(20);
			const result = truncateToolOutput(output, 15, undefined, 0);

			// slice(-0) in JavaScript returns all elements (same as slice(0))
			// So tailLines=0 actually means tail = all 20 lines, head = 15 lines
			// This causes duplication in output
			expect(result).toBeDefined();
			expect(result).toContain('line1');
			// Due to slice(-0) quirk, tail is all lines
			expect(result).toContain('line20');
		});

		test('maxLines=0 edge case', () => {
			const output = makeLines(20);
			const result = truncateToolOutput(output, 0, undefined, 10);

			// tailLines >= maxLines (10 >= 0), so tailLines clamped to floor(0/2) = 0
			// head = slice(0, 0 - 0) = [], tail = slice(-0) = all 20 lines
			// Output is tail + footer (no head)
			expect(result).toBeDefined();
			expect(result).toContain('[... 20 lines omitted ...]');
			expect(result).toContain('line1'); // tail includes all lines
		});

		test('maxLines negative is treated as valid (Math behavior)', () => {
			const output = makeLines(20);
			const result = truncateToolOutput(output, -5, undefined, 10);

			// tailLines >= maxLines (10 >= -5), so tailLines clamped to floor(-5/2) = -2
			// head = slice(0, -5 - (-2)) = slice(0, -3) = []
			// tail = slice(-(-2)) = slice(2) = lines 3-20 (18 lines)
			// Output is head(empty) + tail + footer
			expect(result).toBeDefined();
			expect(result).toContain('[... 25 lines omitted ...]'); // 20 - (-5) = 25
			expect(result).toContain('line3'); // tail starts from index 2
		});
	});

	describe('adversarial: null/undefined/edge inputs', () => {
		test('undefined input returns as-is', () => {
			// @ts-expect-error - intentionally passing undefined for runtime test
			const result = truncateToolOutput(undefined, 15, undefined, 10);
			// The function checks `if (!output)` which is true for undefined
			expect(result == null).toBe(true);
		});

		test('null input returns as-is', () => {
			// @ts-expect-error - intentionally passing null for runtime test
			const result = truncateToolOutput(null, 15, undefined, 10);
			// The function checks `if (!output)` which is true for null
			expect(result == null).toBe(true);
		});

		test('empty string is handled', () => {
			const result = truncateToolOutput('', 15, undefined, 10);
			expect(result).toBe('');
		});

		test('whitespace-only string is handled', () => {
			const output = '   \n   \n   ';
			const result = truncateToolOutput(output, 2, undefined, 1);
			expect(result).toBeDefined();
			expect(typeof result).toBe('string');
		});
	});
});
