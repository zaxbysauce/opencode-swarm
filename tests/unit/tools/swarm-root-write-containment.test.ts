/**
 * Regression tests for issue #528 — .swarm/ scattered in subdirectories.
 *
 * Verifies that resolveSwarmRoot (which createSwarmTool and all retrofitted
 * writers now use) always returns the project root even when process.cwd()
 * points to a subdirectory — and that no .swarm directory is created inside
 * the subdirectory.
 *
 * Note: Tests that import @opencode-ai/plugin tools are excluded here because
 * @opencode-ai/plugin is not available in the unit-test runner. The key
 * invariant (correct directory resolution) is tested via resolveSwarmRoot
 * directly, since that is the shared choke-point used by createSwarmTool and
 * every retrofitted writer.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveSwarmRoot } from '../../../src/utils/swarm-root';

// Utility: check whether any .swarm directory exists inside dir itself (not at root)
function hasSwarmInDir(dir: string): boolean {
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return false;
	}
	return entries.includes('.swarm');
}

describe('issue #528 — resolveSwarmRoot prevents .swarm scatter', () => {
	let projectRoot: string;
	let subDir: string;
	let origCwd: string;

	beforeEach(() => {
		origCwd = process.cwd();
		projectRoot = mkdtempSync(join(tmpdir(), 'swarm-project-'));
		subDir = join(projectRoot, 'src', 'components');
		mkdirSync(subDir, { recursive: true });
		// Marker so walk-up can find projectRoot
		mkdirSync(join(projectRoot, '.git'));
		// Change cwd to the subdir to simulate the bug scenario
		process.chdir(subDir);
	});

	afterEach(() => {
		try { process.chdir(origCwd); } catch { /* ignore */ }
		try { rmSync(projectRoot, { recursive: true, force: true }); } catch { /* ignore */ }
	});

	it('returns projectRoot when ctx.directory is provided (standard plugin path)', () => {
		const resolved = resolveSwarmRoot(projectRoot);
		expect(resolved).toBe(projectRoot);
	});

	it('returns projectRoot via marker walk-up when ctx.directory is missing', () => {
		// cwd is subDir; .git marker is at projectRoot → should recover
		const resolved = resolveSwarmRoot(undefined);
		expect(resolved).toBe(projectRoot);
	});

	it('no .swarm directory created inside subDir when ctx.directory is provided', () => {
		const resolved = resolveSwarmRoot(projectRoot);
		// Simulate a write that would happen with the resolved dir
		const swarmAtRoot = join(resolved, '.swarm');
		mkdirSync(swarmAtRoot, { recursive: true });
		writeFileSync(join(swarmAtRoot, 'test.txt'), 'ok');

		// The resolved dir should be projectRoot, not subDir
		expect(resolved).toBe(projectRoot);
		expect(hasSwarmInDir(subDir)).toBe(false);
		expect(existsSync(swarmAtRoot)).toBe(true);
	});

	it('no .swarm directory created inside subDir when ctx.directory is missing (marker recovery)', () => {
		const resolved = resolveSwarmRoot(undefined);
		// Simulate a write with the recovered root
		const swarmAtRoot = join(resolved, '.swarm');
		mkdirSync(swarmAtRoot, { recursive: true });
		writeFileSync(join(swarmAtRoot, 'test.txt'), 'ok');

		expect(resolved).toBe(projectRoot);
		expect(hasSwarmInDir(subDir)).toBe(false);
		expect(existsSync(swarmAtRoot)).toBe(true);
	});

	it('explicit working_directory override always wins over ctx.directory', () => {
		const overrideDir = mkdtempSync(join(tmpdir(), 'override-'));
		try {
			const resolved = resolveSwarmRoot('/some/wrong/ctx', overrideDir);
			expect(resolved).toBe(overrideDir);
		} finally {
			rmSync(overrideDir, { recursive: true, force: true });
		}
	});
});

describe('issue #528 — regression: createSwarmTool injects correct directory', () => {
	let projectRoot: string;
	let subDir: string;
	let origCwd: string;

	beforeEach(() => {
		origCwd = process.cwd();
		projectRoot = mkdtempSync(join(tmpdir(), 'swarm-ct-'));
		subDir = join(projectRoot, 'nested', 'deep');
		mkdirSync(subDir, { recursive: true });
		mkdirSync(join(projectRoot, '.git'));
		process.chdir(subDir);
	});

	afterEach(() => {
		try { process.chdir(origCwd); } catch { /* ignore */ }
		try { rmSync(projectRoot, { recursive: true, force: true }); } catch { /* ignore */ }
	});

	it('with ctx.directory: resolveSwarmRoot returns projectRoot', () => {
		// Simulates what createSwarmTool does: resolveSwarmRoot(ctx?.directory)
		const resolved = resolveSwarmRoot(projectRoot);
		expect(resolved).toBe(projectRoot);
	});

	it('without ctx.directory: resolveSwarmRoot recovers via .git marker', () => {
		// Simulates the missing-ctx case: resolveSwarmRoot(undefined)
		const resolved = resolveSwarmRoot(undefined);
		expect(resolved).toBe(projectRoot);
	});

	it('resolveSwarmRoot with ctx.directory never returns subDir', () => {
		const resolved = resolveSwarmRoot(projectRoot);
		expect(resolved).not.toBe(subDir);
		expect(resolved).not.toContain(join('nested', 'deep'));
	});
});
