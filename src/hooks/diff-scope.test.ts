import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { validateDiffScope } from './diff-scope';

/**
 * Create an isolated temp directory OUTSIDE the repo tree.
 */
function mkTempDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'diff-scope-test-'));
}

/**
 * Run a command in a directory.
 */
async function run(
	cmd: string[],
	cwd: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(cmd, { cwd, stdout: 'pipe', stderr: 'pipe' });
	const [exitCode, stdout, stderr] = await Promise.all([
		proc.exited,
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	return { exitCode, stdout, stderr };
}

/**
 * Initialise a git repo with one initial commit.
 */
async function gitInit(cwd: string): Promise<void> {
	await run(['git', 'init'], cwd);
	await run(['git', 'config', 'user.email', 'test@test.com'], cwd);
	await run(['git', 'config', 'user.name', 'Test'], cwd);
	fs.writeFileSync(path.join(cwd, 'dummy.txt'), 'initial');
	await run(['git', 'add', '.'], cwd);
	await run(['git', 'commit', '-m', 'initial'], cwd);
}

/**
 * Create a .swarm/plan.json with the given tasks.
 */
function createPlanJson(
	cwd: string,
	tasks: Array<{ id: string; files_touched?: string | string[] }>,
): void {
	const plan = {
		phases: [{ id: '1', name: 'Phase 1', tasks }],
	};
	const swarmDir = path.join(cwd, '.swarm');
	fs.mkdirSync(swarmDir, { recursive: true });
	fs.writeFileSync(
		path.join(swarmDir, 'plan.json'),
		JSON.stringify(plan, null, 2),
	);
}

/**
 * Stage (add) files to git index without committing — makes `git diff --name-only HEAD~1` return them.
 */
async function stageFiles(cwd: string, files: string[]): Promise<void> {
	for (const f of files) {
		const fullPath = path.join(cwd, f);
		fs.mkdirSync(path.dirname(fullPath), { recursive: true });
		fs.writeFileSync(fullPath, `content of ${f}`);
	}
	await run(['git', 'add', ...files], cwd);
}

describe('validateDiffScope', () => {
	// ── 1. No warning when changed files match declared scope ──────────────────
	test('1. in-scope: returns null when git-changed files exactly match declared scope', async () => {
		const dir = mkTempDir();
		await gitInit(dir);
		await stageFiles(dir, ['src/foo.ts']);
		createPlanJson(dir, [{ id: '1.1', files_touched: ['src/foo.ts'] }]);

		const result = await validateDiffScope('1.1', dir);

		expect(result).toBeNull();
	});

	// ── 2. Warning when undeclared files modified ───────────────────────────────
	test('2. out-of-scope: returns SCOPE WARNING with undeclared file names', async () => {
		const dir = mkTempDir();
		await gitInit(dir);
		await stageFiles(dir, ['src/foo.ts', 'src/bar.ts']);
		createPlanJson(dir, [{ id: '2.1', files_touched: ['src/foo.ts'] }]);

		const result = await validateDiffScope('2.1', dir);

		expect(result).not.toBeNull();
		expect(typeof result).toBe('string');
		expect(result!.includes('SCOPE WARNING')).toBe(true);
		expect(result!.includes('src/bar.ts')).toBe(true);
	});

	// ── 3. Null for task with empty/absent files_touched ───────────────────────
	test('3. no-scope: returns null when task exists but files_touched is absent', async () => {
		const dir = mkTempDir();
		await gitInit(dir);
		await stageFiles(dir, ['src/foo.ts']);
		createPlanJson(dir, [{ id: '3.1' }]); // no files_touched

		const result = await validateDiffScope('3.1', dir);

		expect(result).toBeNull();
	});

	test('3b. no-scope: returns null when task exists but files_touched is empty array', async () => {
		const dir = mkTempDir();
		await gitInit(dir);
		await stageFiles(dir, ['src/foo.ts']);
		createPlanJson(dir, [{ id: '3.2', files_touched: [] }]);

		const result = await validateDiffScope('3.2', dir);

		expect(result).toBeNull();
	});

	// ── 4. Null when git unavailable (non-git directory) ──────────────────────
	test('4. no-git: returns null without throwing when directory is not a git repo', async () => {
		const dir = mkTempDir();
		createPlanJson(dir, [{ id: '4.1', files_touched: ['src/foo.ts'] }]);
		fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
		fs.writeFileSync(path.join(dir, 'src', 'foo.ts'), 'content');

		// Should not throw and should return null
		const result = await validateDiffScope('4.1', dir);

		expect(result).toBeNull();
	});

	// ── 5. Null when task not found in plan.json ───────────────────────────────
	test('5. task-not-found: returns null when taskId does not exist in plan.json', async () => {
		const dir = mkTempDir();
		await gitInit(dir);
		await stageFiles(dir, ['src/foo.ts']);
		createPlanJson(dir, [{ id: '5.1', files_touched: ['src/foo.ts'] }]);

		const result = await validateDiffScope('nonexistent-task', dir);

		expect(result).toBeNull();
	});

	// ── 6. Null when plan.json missing ─────────────────────────────────────────
	test('6. no-plan: returns null without throwing when .swarm/plan.json is absent', async () => {
		const dir = mkTempDir();
		await gitInit(dir);
		await stageFiles(dir, ['src/foo.ts']);

		// No .swarm directory at all

		// Should not throw
		const result = await validateDiffScope('any-task', dir);

		expect(result).toBeNull();
	});

	// ── 7. Windows-style paths normalised ─────────────────────────────────────
	test('7. windows-paths: backslash paths in plan.json are normalised to forward slashes', async () => {
		const dir = mkTempDir();
		await gitInit(dir);
		await stageFiles(dir, ['src/foo.ts']);
		// Manually write plan.json with Windows-style paths
		const swarmDir = path.join(dir, '.swarm');
		fs.mkdirSync(swarmDir, { recursive: true });
		fs.writeFileSync(
			path.join(swarmDir, 'plan.json'),
			JSON.stringify({
				phases: [
					{ id: '1', tasks: [{ id: '7.1', files_touched: ['src\\foo.ts'] }] },
				],
			}),
		);

		const result = await validateDiffScope('7.1', dir);

		// Should be null — path was normalised and matched git output src/foo.ts
		expect(result).toBeNull();
	});

	// ── 8. files_touched as single string (not array) ─────────────────────────
	test('8. string-scope: files_touched as a single string (not array) still works', async () => {
		const dir = mkTempDir();
		await gitInit(dir);
		await stageFiles(dir, ['src/foo.ts']);
		createPlanJson(dir, [{ id: '8.1', files_touched: 'src/foo.ts' }]);

		const result = await validateDiffScope('8.1', dir);

		expect(result).toBeNull();
	});

	// ── 9. More than 5 undeclared files truncated ───────────────────────────────
	test('9. truncation: warning lists first 5 undeclared files then (+N more)', async () => {
		const dir = mkTempDir();
		await gitInit(dir);
		// Stage 8 files; scope declares only 1
		await stageFiles(dir, [
			'src/a.ts',
			'src/b.ts',
			'src/c.ts',
			'src/d.ts',
			'src/e.ts',
			'src/f.ts',
			'src/g.ts',
			'src/h.ts',
		]);
		createPlanJson(dir, [{ id: '9.1', files_touched: ['src/a.ts'] }]);

		const result = await validateDiffScope('9.1', dir);

		expect(result).not.toBeNull();
		// 8 total changed - 1 declared = 7 undeclared; first 5 undeclared shown: b,c,d,e,f → +2 more
		expect(result!.includes('(+2 more)')).toBe(true);
		// Declared file
		expect(result!.includes('src/a.ts')).toBe(true);
		// First 5 undeclared (b through f) should appear
		expect(result!.includes('src/b.ts')).toBe(true);
		expect(result!.includes('src/c.ts')).toBe(true);
		expect(result!.includes('src/d.ts')).toBe(true);
		expect(result!.includes('src/e.ts')).toBe(true);
		expect(result!.includes('src/f.ts')).toBe(true);
		// 6th and 7th undeclared (g, h) should NOT appear (replaced by +2 more)
		expect(result!.includes('src/g.ts')).toBe(false);
		expect(result!.includes('src/h.ts')).toBe(false);
	});
});
