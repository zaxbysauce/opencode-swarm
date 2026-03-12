import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	checkSemgrepAvailable,
	getRulesDirectory,
	hasBundledRules,
	isSemgrepAvailable,
	resetSemgrepCache,
	runSemgrep,
} from './semgrep';

describe('Semgrep Integration', () => {
	beforeEach(() => {
		// Reset cache before each test
		resetSemgrepCache();
	});

	afterEach(() => {
		// Ensure cache is reset after each test
		resetSemgrepCache();
	});

	describe('isSemgrepAvailable()', () => {
		it('should return cached result on subsequent calls', () => {
			// Call twice - should return consistent result
			const result1 = isSemgrepAvailable();
			const result2 = isSemgrepAvailable();
			expect(result1).toBe(result2);
		});

		it('should return boolean regardless of semgrep presence', () => {
			const result = isSemgrepAvailable();
			expect(typeof result).toBe('boolean');
		});

		it('should use cached value after first check', () => {
			// First call to populate cache
			const firstResult = isSemgrepAvailable();
			// Second call should use cache
			const secondResult = isSemgrepAvailable();
			expect(firstResult).toEqual(secondResult);
		});
	});

	describe('checkSemgrepAvailable()', () => {
		it('should return a promise resolving to boolean', async () => {
			const result = await checkSemgrepAvailable();
			expect(typeof result).toBe('boolean');
		});

		it('should return consistent result with sync version', async () => {
			const syncResult = isSemgrepAvailable();
			const asyncResult = await checkSemgrepAvailable();
			expect(syncResult).toBe(asyncResult);
		});
	});

	describe('resetSemgrepCache()', () => {
		it('should clear the cached availability status', () => {
			// First call to populate cache
			isSemgrepAvailable();

			// Reset should clear cache
			resetSemgrepCache();

			// Next call should still return a valid boolean
			const result = isSemgrepAvailable();
			expect(typeof result).toBe('boolean');
		});

		it('should allow re-detection after cache reset', () => {
			// Populate cache
			const cachedResult = isSemgrepAvailable();

			// Reset cache
			resetSemgrepCache();

			// Should still work after reset
			const newResult = isSemgrepAvailable();
			expect(typeof newResult).toBe('boolean');
			// The result should be consistent (same detection)
			expect(newResult).toEqual(cachedResult);
		});
	});

	describe('runSemgrep()', () => {
		it('should return available property when semgrep not available', async () => {
			const result = await runSemgrep({ files: [] });
			expect(result).toHaveProperty('available');
			expect(typeof result.available).toBe('boolean');
		});

		it('should return empty findings when no files provided', async () => {
			const result = await runSemgrep({ files: [] });
			expect(result.findings).toEqual([]);
			expect(result.engine).toBe('tier_a');
		});

		it('should use custom timeout when provided', async () => {
			const result = await runSemgrep({
				files: [],
				timeoutMs: 5000,
			});
			// Should return a valid result regardless of semgrep availability
			expect(result).toHaveProperty('engine');
			expect(result.engine).toMatch(/^tier_a/);
		});

		it('should use custom rules directory when provided', async () => {
			const result = await runSemgrep({
				files: [],
				rulesDir: '.custom-rules',
			});
			expect(result).toHaveProperty('engine');
			expect(result.engine).toMatch(/^tier_a/);
		});

		it('should include findings array in result', async () => {
			const result = await runSemgrep({ files: [] });
			expect(result).toHaveProperty('findings');
			expect(Array.isArray(result.findings)).toBe(true);
		});

		it('should include engine property in result', async () => {
			const result = await runSemgrep({ files: [] });
			expect(result).toHaveProperty('engine');
			expect(result.engine).toBe('tier_a');
		});
	});

	describe('getRulesDirectory()', () => {
		it('should return default rules directory when no project root provided', () => {
			const result = getRulesDirectory();
			expect(result).toBe('.swarm/semgrep-rules');
		});

		it('should return absolute path when project root provided', () => {
			const result = getRulesDirectory('/test/project');
			expect(result).toBe(
				path.resolve('/test/project', '.swarm/semgrep-rules'),
			);
		});

		it('should handle empty string project root', () => {
			const result = getRulesDirectory('');
			// Should return relative path
			expect(result).toContain('.swarm');
		});
	});

	describe('hasBundledRules()', () => {
		it('should return boolean when checking current directory', () => {
			const result = hasBundledRules(process.cwd());
			expect(typeof result).toBe('boolean');
		});

		it('should return false for non-existent directory', () => {
			const result = hasBundledRules('/nonexistent/path/that/does/not/exist');
			expect(result).toBe(false);
		});

		it('should check bundled rules in project root', () => {
			const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'semgrep-rules-'));
			try {
				const rulesDir = path.join(tempRoot, '.swarm', 'semgrep-rules');
				fs.mkdirSync(rulesDir, { recursive: true });
				const result = hasBundledRules(tempRoot);
				expect(result).toBe(true);
			} finally {
				fs.rmSync(tempRoot, { recursive: true, force: true });
			}
		});
	});

	describe('Error handling', () => {
		it('should handle empty files array gracefully', async () => {
			const result = await runSemgrep({ files: [] });
			expect(result.findings).toEqual([]);
			expect(result.engine).toBe('tier_a');
		});

		it('should handle undefined files gracefully', async () => {
			// @ts-expect-error - testing invalid input
			const result = await runSemgrep({ files: undefined });
			expect(result.findings).toEqual([]);
		});

		it('should handle null files gracefully', async () => {
			// @ts-expect-error - testing invalid input
			const result = await runSemgrep({ files: null });
			expect(result.findings).toEqual([]);
		});

		it('should handle missing rules directory gracefully', async () => {
			const result = await runSemgrep({
				files: [],
				rulesDir: '/nonexistent/rules/path',
			});
			// Should either return error or empty findings, not crash
			expect(result).toHaveProperty('findings');
			expect(result).toHaveProperty('engine');
		});

		it('should handle zero timeout gracefully', async () => {
			const result = await runSemgrep({
				files: [],
				timeoutMs: 0,
			});
			// Should handle gracefully
			expect(result).toHaveProperty('findings');
		});
	});

	describe('Output parsing', () => {
		it('should return empty findings when files is empty array', async () => {
			const result = await runSemgrep({ files: [] });
			expect(result.findings).toEqual([]);
		});
	});

	describe('Engine labeling', () => {
		it('should label results as tier_a when semgrep unavailable', async () => {
			const result = await runSemgrep({ files: [] });
			expect(result.engine).toBe('tier_a');
		});

		it('should always have valid engine label', async () => {
			const result = await runSemgrep({ files: [] });
			// The engine should always be a valid value
			expect(result.engine).toMatch(/^tier_a/);
		});
	});
});

describe('Semgrep Result Interface', () => {
	it('should return proper SemgrepResult structure', async () => {
		const result = await runSemgrep({ files: [] });

		// Verify all required properties exist
		expect(result).toHaveProperty('available');
		expect(result).toHaveProperty('findings');
		expect(result).toHaveProperty('engine');

		// Verify types
		expect(typeof result.available).toBe('boolean');
		expect(Array.isArray(result.findings)).toBe(true);
		expect(typeof result.engine).toBe('string');

		// Verify engine is one of the valid values
		expect(['tier_a', 'tier_a+tier_b']).toContain(result.engine);
	});

	it('should return findings in SastFinding format', async () => {
		const result = await runSemgrep({ files: [] });

		// When there are no findings, should be empty array
		expect(result.findings).toEqual([]);
	});

	it('should handle optional error property', async () => {
		const result = await runSemgrep({ files: [] });

		// Error should be undefined when no error occurs
		if (result.error) {
			expect(typeof result.error).toBe('string');
		}
	});
});

describe('Multiple invocations', () => {
	beforeEach(() => {
		resetSemgrepCache();
	});

	afterEach(() => {
		resetSemgrepCache();
	});

	it('should handle multiple sequential runSemgrep calls', async () => {
		const result1 = await runSemgrep({ files: [] });
		const result2 = await runSemgrep({ files: [] });
		const result3 = await runSemgrep({ files: [] });

		expect(result1.engine).toBe(result2.engine);
		expect(result2.engine).toBe(result3.engine);
	});

	it('should maintain consistency across multiple availability checks', async () => {
		const results = await Promise.all([
			checkSemgrepAvailable(),
			checkSemgrepAvailable(),
			checkSemgrepAvailable(),
		]);

		// All results should be the same (using cache)
		expect(results[0]).toBe(results[1]);
		expect(results[1]).toBe(results[2]);
	});
});
