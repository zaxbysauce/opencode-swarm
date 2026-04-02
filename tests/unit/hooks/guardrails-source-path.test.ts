import { describe, expect, it } from 'bun:test';

/**
 * Duplicated function for testing purposes.
 * This is a copy of the private isSourceCodePath function from guardrails.ts.
 */
function isSourceCodePath(filePath: string): boolean {
	if (!filePath) return false;
	const normalized = filePath.replace(/\\/g, '/');
	const nonSourcePatterns = [
		/^README(\..+)?$/i,
		/\/README(\..+)?$/i,
		/^CHANGELOG(\..+)?$/i,
		/\/CHANGELOG(\..+)?$/i,
		/^package\.json$/,
		/\/package\.json$/,
		/^\.github\//,
		/\/\.github\//,
		/^docs\//,
		/\/docs\//,
		/^\.swarm\//,
		/\/\.swarm\//,
	];
	return !nonSourcePatterns.some((pattern) => pattern.test(normalized));
}

describe('isSourceCodePath', () => {
	// Test 1: Empty string
	it('should return false for empty string', () => {
		expect(isSourceCodePath('')).toBe(false);
	});

	// Test 2: Source code path
	it('should return true for source code path', () => {
		expect(isSourceCodePath('src/hooks/guardrails.ts')).toBe(true);
	});

	// Test 3: README.md file
	it('should return false for README.md', () => {
		expect(isSourceCodePath('README.md')).toBe(false);
	});

	// Test 4: README without extension
	it('should return false for README without extension', () => {
		expect(isSourceCodePath('README')).toBe(false);
	});

	// Test 5: Docs directory
	it('should return false for files in docs directory', () => {
		expect(isSourceCodePath('docs/guide.md')).toBe(false);
	});

	// Test 6: .github directory
	it('should return false for files in .github directory', () => {
		expect(isSourceCodePath('.github/workflows/ci.yml')).toBe(false);
	});

	// Test 7: package.json file
	it('should return false for package.json', () => {
		expect(isSourceCodePath('package.json')).toBe(false);
	});

	// Test 8: CHANGELOG.md file
	it('should return false for CHANGELOG.md', () => {
		expect(isSourceCodePath('CHANGELOG.md')).toBe(false);
	});

	// Test 9: .swarm directory
	it('should return false for files in .swarm directory', () => {
		expect(isSourceCodePath('.swarm/plan.md')).toBe(false);
	});

	// Test 10: Another source code path
	it('should return true for source code in config', () => {
		expect(isSourceCodePath('src/config/constants.ts')).toBe(true);
	});

	// Test 11: Test files are considered source code
	it('should return true for test files', () => {
		expect(isSourceCodePath('tests/unit/tools/cross-platform.test.ts')).toBe(
			true,
		);
	});

	// Test 12: Windows-style path with backslashes
	it('should return false for Windows-style .github path with backslashes', () => {
		expect(isSourceCodePath('.github\\workflows\\ci.yml')).toBe(false);
	});
});

describe('isSourceCodePath - Adversarial security tests', () => {
	// Adversarial Test 1: Null byte injection attempt
	// Null byte tricks shouldn't bypass since pattern matching happens AFTER normalization
	it('should return true for src path with null byte injection (src/ is source code)', () => {
		expect(isSourceCodePath('src/\x00README.md')).toBe(true);
	});

	// Adversarial Test 2: Path traversal attempt
	// After normalization, 'src/../README.md' becomes 'src/../README.md' and contains README.md
	it('should return false for path traversal attempt (README.md pattern matches)', () => {
		expect(isSourceCodePath('src/../README.md')).toBe(false);
	});

	// Adversarial Test 3: Very long path (10000 chars)
	// Should not crash or hang on oversized payloads
	it('should not crash or hang on very long path (10000 chars)', () => {
		const longPath = 'src/' + 'a'.repeat(10000) + '/file.ts';
		const result = isSourceCodePath(longPath);
		// Should process without throwing - result can be either true or false
		expect(result).toBe(true);
	});

	// Adversarial Test 4: Unicode path with null character
	// Should return true or false without throwing
	it('should handle unicode path with null character without throwing', () => {
		const result = isSourceCodePath('src/\u0000hooks/guardrails.ts');
		expect(result).toBe(true);
	});

	// Adversarial Test 5: Path that looks like source but ends in .github
	// 'src/.github' starts with src/, not '.github/' with trailing slash, so should be true
	it('should return true for src/.github (pattern requires trailing slash)', () => {
		expect(isSourceCodePath('src/.github')).toBe(true);
	});

	// Adversarial Test 6: Bypass attempt with multiple extensions
	// README.md.bak matches /^README(\..+)?$/i because (.+) is greedy and matches .md.bak
	it('should return false for README.md.bak (greedy regex matches)', () => {
		expect(isSourceCodePath('README.md.bak')).toBe(false);
	});

	// Adversarial Test 7: Case variation
	// Pattern is case-insensitive, so readme.MD should return false
	it('should return false for readme.MD (case-insensitive pattern)', () => {
		expect(isSourceCodePath('readme.MD')).toBe(false);
	});

	// Adversarial Test 8: Mixed separators
	// Bizarre mixed path - after normalization becomes '.github/workflows/.github/src.ts'
	// The '/.github/' pattern should match, returning false
	it('should return false for mixed separators path (.github pattern matches)', () => {
		expect(isSourceCodePath('.github/workflows\\.github/src.ts')).toBe(false);
	});
});
