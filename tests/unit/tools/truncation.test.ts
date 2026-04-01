import { describe, expect, it } from 'bun:test';
import { truncateToolOutput } from '../../../src/utils/tool-output';

describe('truncateToolOutput', () => {
	it('returns empty input unchanged', () => {
		expect(truncateToolOutput('', 10)).toBe('');
		expect(truncateToolOutput('', 10, 'test')).toBe('');
	});

	it('returns short output unchanged', () => {
		const short = 'line 1\nline 2\nline 3';
		const result = truncateToolOutput(short, 10);
		expect(result).toBe(short);
	});

	it('truncates long output and adds footer', () => {
		const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join(
			'\n',
		);
		const result = truncateToolOutput(lines, 5);

		// Should have 5 lines
		const resultLines = result.split('\n');
		expect(resultLines.length).toBeGreaterThan(5);

		// Should contain omitted count
		expect(result).toContain('15 line');
		expect(result).toContain('omitted');

		// Should contain guidance
		expect(result).toContain('Use /swarm retrieve');
	});

	it('includes tool name in footer when provided', () => {
		const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join(
			'\n',
		);
		const result = truncateToolOutput(lines, 5, 'diff');

		expect(result).toContain('Tool: diff');
	});

	it('does not include tool name when not provided', () => {
		const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join(
			'\n',
		);
		const result = truncateToolOutput(lines, 5);

		expect(result).not.toContain('Tool:');
	});

	it('handles exact maxLines boundary', () => {
		const exactly5 = '1\n2\n3\n4\n5';
		const result = truncateToolOutput(exactly5, 5);
		expect(result).toBe(exactly5);
	});

	it('handles single omitted line correctly', () => {
		const lines = '1\n2\n3';
		const result = truncateToolOutput(lines, 2);

		expect(result).toContain('1 line omitted');
	});
});
