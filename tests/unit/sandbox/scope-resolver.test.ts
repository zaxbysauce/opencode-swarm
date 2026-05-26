/**
 * Tests for src/sandbox/scope-resolver.ts
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
// Use the _internals seam since it's the documented DI approach
import {
	_internals,
	resolveScopePaths,
} from '../../../src/sandbox/scope-resolver';

describe('resolveScopePaths', () => {
	let tempDir: string;
	let projectRoot: string;

	beforeEach(() => {
		// Create a temp directory for each test using mkdtempSync + realpathSync
		// (macOS symlink shenanigans require realpathSync per AGENTS.md invariant 7)
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-scope-test-'));
		projectRoot = fs.realpathSync(tempDir);
	});

	afterEach(() => {
		// Clean up temp directory ΓÇö ignore errors on Windows where handles may linger
		try {
			fs.rmSync(projectRoot, { recursive: true, force: true });
		} catch {
			// best-effort cleanup
		}
	});

	describe('relative path resolution', () => {
		test('resolves relative path against projectRoot', () => {
			// Create a subdirectory inside projectRoot
			const subdir = path.join(projectRoot, 'src');
			fs.mkdirSync(subdir, { recursive: true });

			const result = _internals.resolveScopePaths(['./src'], projectRoot);

			expect(result.paths).toContain(subdir);
			expect(result.rejected).toHaveLength(0);
		});

		test('resolves relative path with parent segments', () => {
			const subdir = path.join(projectRoot, 'packages', 'core');
			fs.mkdirSync(subdir, { recursive: true });

			const result = _internals.resolveScopePaths(
				['packages/core'],
				projectRoot,
			);

			expect(result.paths).toContain(subdir);
			expect(result.rejected).toHaveLength(0);
		});

		test('normalizes ./ prefix in relative paths', () => {
			const subdir = path.join(projectRoot, 'lib');
			fs.mkdirSync(subdir, { recursive: true });

			// ./lib/./lib normalizes to lib\lib on Windows, lib/lib on Unix ΓÇö
			// it refers to a sub-path "lib" inside "lib", not the lib directory itself.
			const nestedLib = path.normalize(path.join(projectRoot, 'lib', 'lib'));
			const result = _internals.resolveScopePaths(['./lib/./lib'], projectRoot);

			expect(result.paths).toContain(nestedLib);
		});
	});

	describe('absolute path handling', () => {
		test('accepts absolute path unchanged', () => {
			const subdir = path.join(projectRoot, 'abs-path-test');
			fs.mkdirSync(subdir, { recursive: true });

			const result = _internals.resolveScopePaths([subdir], projectRoot);

			expect(result.paths).toContain(subdir);
			expect(result.rejected).toHaveLength(0);
		});

		test('normalizes absolute path separators', () => {
			// Mixed separators on Windows
			const mixed = path.join(projectRoot, 'mixed', 'paths');
			fs.mkdirSync(mixed, { recursive: true });

			// path.isAbsolute treats both as absolute; path.normalize cleans separators
			const result = _internals.resolveScopePaths([mixed], projectRoot);

			expect(result.paths).toHaveLength(1);
			expect(result.paths[0]).toBe(mixed);
		});
	});

	describe('path traversal detection', () => {
		test('rejects ../outside traversal attempt', () => {
			const siblingDir = path.join(projectRoot, '..', 'sibling');
			// siblingDir is outside projectRoot so it should be rejected

			const result = _internals.resolveScopePaths([siblingDir], projectRoot);

			expect(result.rejected).toHaveLength(1);
			expect(result.rejected[0].reason).toContain(
				'Path traversal attempt detected',
			);
		});

		test('rejects deeply nested ../ traversal (../../etc/passwd style)', () => {
			// ../../etc/passwd from within projectRoot
			const traversal = path.join(
				projectRoot,
				'foo',
				'..',
				'..',
				'..',
				'etc',
				'passwd',
			);

			const result = _internals.resolveScopePaths([traversal], projectRoot);

			expect(result.rejected).toHaveLength(1);
			expect(result.rejected[0].reason).toContain(
				'Path traversal attempt detected',
			);
		});

		test('rejects path that resolves outside projectRoot via .. in rawPaths', () => {
			// rawPaths entry with explicit ..
			const result = _internals.resolveScopePaths(['../secret'], projectRoot);

			expect(result.rejected.length).toBeGreaterThan(0);
			expect(result.rejected[0].reason).toContain(
				'Path traversal attempt detected',
			);
		});

		test('rejects path that is absolute but outside projectRoot', () => {
			// An absolute path on a different drive on Windows, or /tmp/outside on Unix
			const outsidePath = path.join(os.tmpdir(), 'outside-sandbox-project');

			const result = _internals.resolveScopePaths([outsidePath], projectRoot);

			// This should be rejected because it doesn't start with projectRoot
			expect(result.rejected.length).toBeGreaterThan(0);
		});
	});

	describe('non-existent path warnings', () => {
		test('warns on non-existent path but does not reject it', () => {
			const nonExistent = path.join(projectRoot, 'does-not-exist', 'file.txt');

			const result = _internals.resolveScopePaths([nonExistent], projectRoot);

			expect(result.warnings.some((w) => w.includes('does not exist'))).toBe(
				true,
			);
			expect(
				result.rejected.filter((r) => r.path === nonExistent),
			).toHaveLength(0);
		});

		test('non-existent path is still included in resolved paths', () => {
			const nonExistent = path.join(projectRoot, 'future-file.txt');

			const result = _internals.resolveScopePaths([nonExistent], projectRoot);

			// Non-existent paths get a warning but are still included
			expect(result.paths).toContain(nonExistent);
		});
	});

	describe('projectRoot validation', () => {
		test('rejects empty projectRoot string', () => {
			const result = _internals.resolveScopePaths([], '');

			expect(result.paths).toHaveLength(0);
			expect(result.rejected).toHaveLength(1);
			expect(result.rejected[0].reason).toContain('empty');
		});

		test('rejects whitespace-only projectRoot', () => {
			const result = _internals.resolveScopePaths([], '   ');

			expect(result.rejected).toHaveLength(1);
		});

		test('rejects relative projectRoot', () => {
			const result = _internals.resolveScopePaths([], './relative-path');

			expect(result.rejected).toHaveLength(1);
			expect(result.rejected[0].reason).toContain('absolute path');
		});

		test('rejects null-like projectRoot (empty string treated as falsy)', () => {
			const result = _internals.resolveScopePaths([], '');

			expect(result.rejected).toHaveLength(1);
		});
	});

	describe('deduplication', () => {
		test('deduplicates identical paths', () => {
			const subdir = path.join(projectRoot, 'dup-test');
			fs.mkdirSync(subdir, { recursive: true });

			const result = _internals.resolveScopePaths(
				[subdir, subdir, './dup-test'],
				projectRoot,
			);

			// Should only appear once (Set deduplication)
			expect(result.paths).toHaveLength(1);
			expect(result.paths[0]).toBe(subdir);
		});

		test('dedplicates paths with different separator styles', () => {
			const subdir = path.join(projectRoot, 'sep-test');
			fs.mkdirSync(subdir, { recursive: true });

			// path.normalize handles different separators
			const normalized = path.normalize(subdir);

			const result = _internals.resolveScopePaths(
				[normalized, subdir],
				projectRoot,
			);

			expect(result.paths).toHaveLength(1);
		});
	});

	describe('symlink traversal detection', () => {
		// Probe whether we can create symlinks ΓÇö use a standalone temp dir so this
		// runs at module-load time (before beforeEach sets projectRoot)
		const canCreateSymlink = (() => {
			try {
				const probeDir = fs.mkdtempSync(
					path.join(os.tmpdir(), 'symlink-probe-'),
				);
				const probeTarget = path.join(probeDir, 'target');
				const probeLink = path.join(probeDir, 'link');
				fs.mkdirSync(probeTarget);
				fs.symlinkSync(probeTarget, probeLink, 'junction' as fs.symlink.Type);
				fs.rmSync(probeDir, { recursive: true, force: true });
				return true;
			} catch {
				return false;
			}
		})();

		test.if(canCreateSymlink)(
			'detects symlink that escapes projectRoot',
			() => {
				const subdir = path.join(projectRoot, 'subdir');
				fs.mkdirSync(subdir, { recursive: true });

				// Create a symlink inside subdir that points to projectRoot's parent
				const symlinkPath = path.join(subdir, 'escape-link');
				const parentDir = path.dirname(projectRoot);
				fs.symlinkSync(parentDir, symlinkPath, 'junction' as fs.symlink.Type);

				// The symlink resolves to a path outside projectRoot ΓÇö should be rejected
				const result = _internals.resolveScopePaths([symlinkPath], projectRoot);

				expect(result.rejected.length).toBeGreaterThan(0);
				expect(result.rejected[0].reason).toContain(
					'Path traversal attempt detected',
				);
			},
		);

		test.if(canCreateSymlink)(
			'symlink to existing directory inside projectRoot is allowed',
			() => {
				const realDir = path.join(projectRoot, 'real-stuff');
				fs.mkdirSync(realDir, { recursive: true });

				const linkDir = path.join(projectRoot, 'linked-stuff');
				fs.symlinkSync(realDir, linkDir, 'junction' as fs.symlink.Type);

				const result = _internals.resolveScopePaths([linkDir], projectRoot);

				// Should be allowed ΓÇö resolves inside projectRoot.
				// realpathSync follows the symlink, so the resolved path is realDir.
				expect(result.rejected).toHaveLength(0);
				expect(result.paths).toContain(realDir);
			},
		);
	});

	describe('empty and invalid rawPaths', () => {
		test('skips empty string entries in rawPaths with warning', () => {
			const subdir = path.join(projectRoot, 'valid');
			fs.mkdirSync(subdir, { recursive: true });

			const result = _internals.resolveScopePaths(
				['', subdir, '  '],
				projectRoot,
			);

			expect(
				result.warnings.some((w) => w.includes('Skipping empty path')),
			).toBe(true);
			expect(result.paths).toContain(subdir);
		});

		test('returns empty paths array when rawPaths is empty', () => {
			const result = _internals.resolveScopePaths([], projectRoot);

			expect(result.paths).toHaveLength(0);
			expect(result.rejected).toHaveLength(0);
			expect(result.warnings).toHaveLength(0);
		});
	});

	describe('all-paths-rejected warning', () => {
		test('adds warning when every path was rejected', () => {
			// A traversal attempt that definitely gets rejected
			const traversal = path.join(projectRoot, '..', '..', '..', 'etc');

			const result = _internals.resolveScopePaths([traversal], projectRoot);

			expect(
				result.warnings.some((w) => w.includes('All paths were rejected')),
			).toBe(true);
		});
	});
});
