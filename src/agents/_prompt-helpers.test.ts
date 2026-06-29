import { describe, expect, test } from 'bun:test';
import { resolvePrompt } from './_prompt-helpers';

describe('resolvePrompt', () => {
	test('returns base when neither custom nor append is provided', () => {
		expect(resolvePrompt('base')).toBe('base');
	});

	test('returns custom when custom is set (ignores append)', () => {
		expect(resolvePrompt('base', 'custom')).toBe('custom');
		expect(resolvePrompt('base', 'custom', 'append')).toBe('custom');
	});

	test('appends to base when only append is provided', () => {
		expect(resolvePrompt('base', undefined, 'append')).toBe('base\n\nappend');
	});

	test('treats empty string custom as falsy — append still applied', () => {
		expect(resolvePrompt('base', '', 'append')).toBe('base\n\nappend');
	});

	test('treats empty string append as falsy — returns base', () => {
		expect(resolvePrompt('base', undefined, '')).toBe('base');
	});
});
