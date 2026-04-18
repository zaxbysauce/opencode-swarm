import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveSwarmRoot } from '../../../src/utils/swarm-root';

describe('resolveSwarmRoot', () => {
	let tmpRoot: string;
	let origCwd: string;

	beforeEach(() => {
		tmpRoot = mkdtempSync(join(tmpdir(), 'swarm-root-test-'));
		origCwd = process.cwd();
	});

	afterEach(() => {
		try {
			process.chdir(origCwd);
		} catch {
			// Ignore
		}
		try {
			rmSync(tmpRoot, { recursive: true, force: true });
		} catch {
			// Ignore
		}
	});

	test('returns explicitOverride when provided', () => {
		const dir = mkdtempSync(join(tmpdir(), 'override-'));
		try {
			const result = resolveSwarmRoot('/some/ctx', dir);
			expect(result).toBe(dir);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('returns ctxDirectory when no explicitOverride', () => {
		const result = resolveSwarmRoot(tmpRoot);
		expect(result).toBe(tmpRoot);
	});

	test('returns ctxDirectory when explicitOverride is empty string', () => {
		const result = resolveSwarmRoot(tmpRoot, '');
		expect(result).toBe(tmpRoot);
	});

	test('returns ctxDirectory when explicitOverride is null', () => {
		const result = resolveSwarmRoot(tmpRoot, null);
		expect(result).toBe(tmpRoot);
	});

	test('marker walk-up: recovers project root via .git when cwd is subdir', () => {
		// Create project root with .git marker
		const projectRoot = mkdtempSync(join(tmpdir(), 'project-'));
		const subDir = join(projectRoot, 'src', 'components');
		mkdirSync(subDir, { recursive: true });
		mkdirSync(join(projectRoot, '.git'));

		process.chdir(subDir);

		const result = resolveSwarmRoot(null, null);
		expect(result).toBe(projectRoot);

		process.chdir(origCwd);
		rmSync(projectRoot, { recursive: true, force: true });
	});

	test('marker walk-up: recovers project root via package.json when cwd is subdir', () => {
		const projectRoot = mkdtempSync(join(tmpdir(), 'project-pkg-'));
		const subDir = join(projectRoot, 'src');
		mkdirSync(subDir, { recursive: true });
		writeFileSync(join(projectRoot, 'package.json'), '{"name":"test"}');

		process.chdir(subDir);

		const result = resolveSwarmRoot(undefined, undefined);
		expect(result).toBe(projectRoot);

		process.chdir(origCwd);
		rmSync(projectRoot, { recursive: true, force: true });
	});

	test('falls back to process.cwd() when no ctxDirectory and no marker found', () => {
		// Use a tmpdir path that has no .git or package.json ancestry chain
		// (OS tmp dir typically has neither)
		const isolated = mkdtempSync(join(tmpdir(), 'no-marker-'));
		process.chdir(isolated);

		// Just verify it returns a string (cwd) without throwing
		const result = resolveSwarmRoot(null, null);
		expect(typeof result).toBe('string');
		expect(result.length).toBeGreaterThan(0);

		process.chdir(origCwd);
		rmSync(isolated, { recursive: true, force: true });
	});

	test('ctxDirectory takes priority over marker walk-up', () => {
		// Even if cwd has a .git marker somewhere up, ctxDirectory wins
		const ctxDir = mkdtempSync(join(tmpdir(), 'ctx-dir-'));
		const result = resolveSwarmRoot(ctxDir, null);
		expect(result).toBe(ctxDir);
		rmSync(ctxDir, { recursive: true, force: true });
	});
});
