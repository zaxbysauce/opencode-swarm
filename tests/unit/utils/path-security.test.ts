import { describe, test, expect } from 'bun:test';
import {
	containsPathTraversal,
	containsControlChars,
	validateDirectory,
} from '../../../src/utils/path-security';

describe('containsPathTraversal', () => {
	test('blocks basic ../', () => {
		expect(containsPathTraversal('../etc/passwd')).toBe(true);
		expect(containsPathTraversal('foo/../../bar')).toBe(true);
		expect(containsPathTraversal('..\\windows\\system32')).toBe(true);
	});

	test('blocks URL-encoded traversal %2e%2e%2f', () => {
		expect(containsPathTraversal('%2e%2e%2f')).toBe(true);
		expect(containsPathTraversal('%2E%2E%2F')).toBe(true);
	});

	test('blocks Unicode homoglyph traversal', () => {
		// Fullwidth dot U+FF0E
		expect(containsPathTraversal('\uff0e\uff0e/')).toBe(true);
		// Ideographic full stop U+3002
		expect(containsPathTraversal('\u3002\u3002/')).toBe(true);
		// Halfwidth katakana middle dot U+FF65
		expect(containsPathTraversal('\uff65\uff65/')).toBe(true);
	});

	test('blocks double-encoded traversal', () => {
		expect(containsPathTraversal('%252e%252e%252f')).toBe(true);
	});

	test('blocks backslash separator variants', () => {
		expect(containsPathTraversal('..\\foo')).toBe(true);
		expect(containsPathTraversal('%5c..%5c')).toBe(true);
	});

	test('blocks encoded forward slash', () => {
		expect(containsPathTraversal('%2f')).toBe(true);
		expect(containsPathTraversal('%2F')).toBe(true);
	});

	test('blocks mixed encoding', () => {
		expect(containsPathTraversal('%2e.')).toBe(true);
	});

	test('allows normal paths', () => {
		expect(containsPathTraversal('src/utils/index.ts')).toBe(false);
		expect(containsPathTraversal('README.md')).toBe(false);
		expect(containsPathTraversal('tests/unit/config')).toBe(false);
		expect(containsPathTraversal('.gitignore')).toBe(false);
		expect(containsPathTraversal('a.b.c')).toBe(false);
	});
});

describe('containsControlChars', () => {
	test('blocks null byte', () => {
		expect(containsControlChars('foo\0bar')).toBe(true);
	});

	test('blocks tab', () => {
		expect(containsControlChars('foo\tbar')).toBe(true);
	});

	test('blocks carriage return', () => {
		expect(containsControlChars('foo\rbar')).toBe(true);
	});

	test('blocks newline', () => {
		expect(containsControlChars('foo\nbar')).toBe(true);
	});

	test('allows normal strings', () => {
		expect(containsControlChars('hello world')).toBe(false);
		expect(containsControlChars('src/tools/lint.ts')).toBe(false);
		expect(containsControlChars('')).toBe(false);
	});
});

describe('validateDirectory', () => {
	test('accepts valid directories', () => {
		expect(() => validateDirectory('src')).not.toThrow();
		expect(() => validateDirectory('tests/unit')).not.toThrow();
		expect(() => validateDirectory('my-project')).not.toThrow();
	});

	test('rejects empty directories', () => {
		expect(() => validateDirectory('')).toThrow('empty');
		expect(() => validateDirectory('   ')).toThrow('empty');
	});

	test('rejects paths with traversal', () => {
		expect(() => validateDirectory('../etc')).toThrow('path traversal');
		expect(() => validateDirectory('foo/../../bar')).toThrow('path traversal');
	});

	test('rejects paths with control chars', () => {
		expect(() => validateDirectory('foo\0bar')).toThrow('control characters');
		expect(() => validateDirectory('foo\nbar')).toThrow('control characters');
	});

	test('rejects absolute paths', () => {
		expect(() => validateDirectory('/etc/passwd')).toThrow('absolute path');
		expect(() => validateDirectory('\\windows')).toThrow('absolute path');
	});

	test('rejects Windows absolute paths', () => {
		expect(() => validateDirectory('C:\\Users')).toThrow('Windows absolute path');
		expect(() => validateDirectory('D:/Projects')).toThrow('Windows absolute path');
	});
});
