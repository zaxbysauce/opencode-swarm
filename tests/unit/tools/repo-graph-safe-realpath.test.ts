import { describe, expect, test } from 'bun:test';
import { safeRealpathSync } from '../../../src/tools/repo-graph/safe-realpath';

describe('safeRealpathSync', () => {
	test('returns resolved path when resolver succeeds', () => {
		const resolved = safeRealpathSync('/workspace/file.ts', '/fallback', () => {
			return '/real/workspace/file.ts';
		});
		expect(resolved).toBe('/real/workspace/file.ts');
	});

	test('returns fallback on ENOENT', () => {
		const resolved = safeRealpathSync(
			'/workspace/missing.ts',
			'/fallback',
			() => {
				const error = new Error('missing') as NodeJS.ErrnoException;
				error.code = 'ENOENT';
				throw error;
			},
		);
		expect(resolved).toBe('/fallback');
	});

	test('returns null on non-ENOENT errno errors', () => {
		const eacces = safeRealpathSync(
			'/workspace/blocked.ts',
			'/fallback',
			() => {
				const error = new Error('denied') as NodeJS.ErrnoException;
				error.code = 'EACCES';
				throw error;
			},
		);
		expect(eacces).toBeNull();

		const eloop = safeRealpathSync('/workspace/loop.ts', '/fallback', () => {
			const error = new Error('loop') as NodeJS.ErrnoException;
			error.code = 'ELOOP';
			throw error;
		});
		expect(eloop).toBeNull();
	});

	test('returns null when resolver throws non-Error values', () => {
		const nonError = safeRealpathSync(
			'/workspace/value.ts',
			'/fallback',
			() => {
				// Intentionally throw non-Error to verify defensive handling.
				throw 'failure';
			},
		);
		expect(nonError).toBeNull();
	});

	test('returns null when Error lacks errno code', () => {
		const withoutCode = safeRealpathSync(
			'/workspace/error.ts',
			'/fallback',
			() => {
				throw new Error('unknown');
			},
		);
		expect(withoutCode).toBeNull();
	});
});
