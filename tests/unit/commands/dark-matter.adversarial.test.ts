import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleDarkMatterCommand } from '../../../src/commands/dark-matter.js';
import type { DarkMatterOptions } from '../../../src/tools/co-change-analyzer.js';

const mockDetectDarkMatter = vi.fn();
const mockFormatDarkMatterOutput = vi.fn();

vi.mock('../../../src/tools/co-change-analyzer.js', () => ({
	detectDarkMatter: mockDetectDarkMatter,
	formatDarkMatterOutput: mockFormatDarkMatterOutput,
}));

describe('handleDarkMatterCommand (adversarial)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDetectDarkMatter.mockResolvedValue([]);
		mockFormatDarkMatterOutput.mockReturnValue(
			'## Dark Matter: Hidden Couplings\n\nNo hidden couplings detected.',
		);
	});

	describe('1. Empty string args', () => {
		it('should not crash with empty string arg', async () => {
			await expect(handleDarkMatterCommand('/dir', [''])).resolves.toBeDefined();

			// verify detectDarkMatter called with empty options
			expect(mockDetectDarkMatter).toHaveBeenCalledWith('/dir', {});
		});
	});

	describe('2. Large arg array', () => {
		it('should not hang or crash with 1000 args', async () => {
			const largeArgs = new Array(1000).fill('--threshold');
			await expect(handleDarkMatterCommand('/dir', largeArgs)).resolves.toBeDefined();
		});
	});

	describe('3. Injection in directory', () => {
		it('should forward malicious directory as-is without execution', async () => {
			const maliciousDir = '/dir; rm -rf /';

			await expect(
				handleDarkMatterCommand(maliciousDir, []),
			).resolves.toBeDefined();

			// directory passed directly to detectDarkMatter, no sanitization
			expect(mockDetectDarkMatter).toHaveBeenCalledWith(maliciousDir, {});
		});
	});

	describe('4. Injection in threshold', () => {
		it('should parse injection attempt as valid number', async () => {
			const maliciousThreshold = '0.5; rm -rf /';

			await expect(
				handleDarkMatterCommand('/dir', ['--threshold', maliciousThreshold]),
			).resolves.toBeDefined();

			// parseFloat('0.5; rm -rf /') = 0.5
			expect(mockDetectDarkMatter).toHaveBeenCalledWith('/dir', {
				npmiThreshold: 0.5,
			});
		});
	});

	describe('5. NaN threshold', () => {
		it('should ignore NaN threshold silently', async () => {
			await expect(
				handleDarkMatterCommand('/dir', ['--threshold', 'NaN']),
			).resolves.toBeDefined();

			// NaN check in condition prevents setting
			expect(mockDetectDarkMatter).toHaveBeenCalledWith('/dir', {});
		});
	});

	describe('6. Negative threshold', () => {
		it('should ignore negative threshold', async () => {
			await expect(
				handleDarkMatterCommand('/dir', ['--threshold', '-0.1']),
			).resolves.toBeDefined();

			// Range check val >= 0 fails
			expect(mockDetectDarkMatter).toHaveBeenCalledWith('/dir', {});
		});
	});

	describe('7. Zero threshold', () => {
		it('should accept zero threshold', async () => {
			await expect(
				handleDarkMatterCommand('/dir', ['--threshold', '0']),
			).resolves.toBeDefined();

			// 0 is valid (>=0 && <=1)
			expect(mockDetectDarkMatter).toHaveBeenCalledWith('/dir', {
				npmiThreshold: 0,
			});
		});
	});

	describe('8. Threshold exactly 1.0', () => {
		it('should accept threshold of 1.0', async () => {
			await expect(
				handleDarkMatterCommand('/dir', ['--threshold', '1']),
			).resolves.toBeDefined();

			expect(mockDetectDarkMatter).toHaveBeenCalledWith('/dir', {
				npmiThreshold: 1,
			});
		});
	});

	describe('9. Negative min-commits', () => {
		it('should ignore negative min-commits', async () => {
			await expect(
				handleDarkMatterCommand('/dir', ['--min-commits', '-5']),
			).resolves.toBeDefined();

			// val > 0 check fails
			expect(mockDetectDarkMatter).toHaveBeenCalledWith('/dir', {});
		});
	});

	describe('10. Zero min-commits', () => {
		it('should ignore zero min-commits', async () => {
			await expect(
				handleDarkMatterCommand('/dir', ['--min-commits', '0']),
			).resolves.toBeDefined();

			// val > 0 check fails
			expect(mockDetectDarkMatter).toHaveBeenCalledWith('/dir', {});
		});
	});

	describe('11. Very large min-commits', () => {
		it('should accept and forward large min-commits', async () => {
			await expect(
				handleDarkMatterCommand('/dir', ['--min-commits', '999999']),
			).resolves.toBeDefined();

			expect(mockDetectDarkMatter).toHaveBeenCalledWith('/dir', {
				minCommits: 999999,
			});
		});
	});

	describe('12. detectDarkMatter throws', () => {
		it('should propagate error from detectDarkMatter', async () => {
			mockDetectDarkMatter.mockRejectedValue(new Error('git not found'));

			await expect(
				handleDarkMatterCommand('/dir', []),
			).rejects.toThrow('git not found');
		});
	});

	describe('13. Unicode in directory', () => {
		it('should forward unicode directory path correctly', async () => {
			const unicodeDir = '/日本語/ディレクトリ';

			await expect(
				handleDarkMatterCommand(unicodeDir, []),
			).resolves.toBeDefined();

			expect(mockDetectDarkMatter).toHaveBeenCalledWith(unicodeDir, {});
		});
	});

	describe('14. Very long directory path', () => {
		it('should forward long directory path without truncation', async () => {
			const longDir = '/'.repeat(1000) + 'directory';

			await expect(
				handleDarkMatterCommand(longDir, []),
			).resolves.toBeDefined();

			expect(mockDetectDarkMatter).toHaveBeenCalledWith(longDir, {});
		});
	});

	// Additional edge cases
	describe('Additional edge cases', () => {
		it('should handle threshold > 1.0', async () => {
			await expect(
				handleDarkMatterCommand('/dir', ['--threshold', '1.5']),
			).resolves.toBeDefined();

			// Range check val <= 1 fails
			expect(mockDetectDarkMatter).toHaveBeenCalledWith('/dir', {});
		});

		it('should handle flag without value (missing)', async () => {
			await expect(
				handleDarkMatterCommand('/dir', ['--threshold']),
			).resolves.toBeDefined();

			// args[i + 1] check fails
			expect(mockDetectDarkMatter).toHaveBeenCalledWith('/dir', {});
		});

		it('should handle non-numeric threshold', async () => {
			await expect(
				handleDarkMatterCommand('/dir', ['--threshold', 'abc']),
			).resolves.toBeDefined();

			// parseFloat('abc') = NaN
			expect(mockDetectDarkMatter).toHaveBeenCalledWith('/dir', {});
		});

		it('should handle non-numeric min-commits', async () => {
			await expect(
				handleDarkMatterCommand('/dir', ['--min-commits', 'xyz']),
			).resolves.toBeDefined();

			// parseInt('xyz', 10) = NaN
			expect(mockDetectDarkMatter).toHaveBeenCalledWith('/dir', {});
		});

		it('should handle multiple valid flags', async () => {
			await expect(
				handleDarkMatterCommand('/dir', ['--threshold', '0.7', '--min-commits', '10']),
			).resolves.toBeDefined();

			expect(mockDetectDarkMatter).toHaveBeenCalledWith('/dir', {
				npmiThreshold: 0.7,
				minCommits: 10,
			});
		});

		it('should handle decimal threshold at boundary', async () => {
			await expect(
				handleDarkMatterCommand('/dir', ['--threshold', '0.000001']),
			).resolves.toBeDefined();

			expect(mockDetectDarkMatter).toHaveBeenCalledWith('/dir', {
				npmiThreshold: 0.000001,
			});
		});

		it('should handle Infinity threshold', async () => {
			await expect(
				handleDarkMatterCommand('/dir', ['--threshold', 'Infinity']),
			).resolves.toBeDefined();

			// Infinity > 1, range check fails
			expect(mockDetectDarkMatter).toHaveBeenCalledWith('/dir', {});
		});

		it('should handle -Infinity threshold', async () => {
			await expect(
				handleDarkMatterCommand('/dir', ['--threshold', '-Infinity']),
			).resolves.toBeDefined();

			// -Infinity < 0, range check fails
			expect(mockDetectDarkMatter).toHaveBeenCalledWith('/dir', {});
		});

		it('should handle formatDarkMatterOutput returning empty string', async () => {
			mockFormatDarkMatterOutput.mockReturnValue('');

			const result = await handleDarkMatterCommand('/dir', []);
			expect(result).toBe('');
		});

		it('should handle formatDarkMatterOutput throwing', async () => {
			mockFormatDarkMatterOutput.mockImplementation(() => {
				throw new Error('Format error');
			});

			await expect(
				handleDarkMatterCommand('/dir', []),
			).rejects.toThrow('Format error');
		});
	});
});
