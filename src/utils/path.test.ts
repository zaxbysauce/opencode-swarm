import { describe, expect, test } from 'bun:test';
import { normalizePath } from './path';

describe('normalizePath', () => {
	test('returns empty string for empty input', () => {
		expect(normalizePath('')).toBe('');
	});

	test('returns empty string for falsy input', () => {
		expect(normalizePath(null as unknown as string)).toBe('');
		expect(normalizePath(undefined as unknown as string)).toBe('');
	});

	test('converts backslashes to forward slashes', () => {
		expect(normalizePath('a\\b\\c')).toBe('a/b/c');
	});

	test('collapses multiple consecutive slashes', () => {
		expect(normalizePath('a//b///c')).toBe('a/b/c');
	});

	test('strips leading ./ prefix', () => {
		expect(normalizePath('./a/b')).toBe('a/b');
	});

	test('strips trailing slash', () => {
		expect(normalizePath('a/b/')).toBe('a/b');
	});

	test('strips trailing /. segment', () => {
		expect(normalizePath('a/b/.')).toBe('a/b');
	});

	test('resolves internal ./ segments', () => {
		expect(normalizePath('a/./b')).toBe('a/b');
		expect(normalizePath('a/./b/./c')).toBe('a/b/c');
	});

	test('handles mixed backslash and multiple slash', () => {
		expect(normalizePath('a\\\\b//c')).toBe('a/b/c');
	});

	test('returns the path unchanged when already normalized', () => {
		expect(normalizePath('a/b/c')).toBe('a/b/c');
	});
});
