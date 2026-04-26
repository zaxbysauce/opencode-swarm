/**
 * Tests for the .swarm/ gitignore warning emitted on plugin startup.
 *
 * Covers:
 * 1. Warning fires when .gitignore exists but does not contain .swarm/
 * 2. Warning does NOT fire when .gitignore contains .swarm/
 * 3. Warning does NOT fire when .gitignore contains .swarm (without trailing slash)
 * 4. Warning does NOT fire when .git/info/exclude covers .swarm/
 * 5. Warning does NOT fire when no .git/ directory is found (not a git repo)
 * 6. Warning fires at most once (module-level deduplication)
 */

import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	mock,
	spyOn,
} from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	resetGitignoreWarningState,
	warnIfSwarmNotGitignored,
} from '../src/utils/gitignore-warning';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-gitignore-test-'));
}

function makeGitRepo(dir: string): void {
	fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
	fs.mkdirSync(path.join(dir, '.git', 'info'), { recursive: true });
}

function writeGitignore(dir: string, content: string): void {
	fs.writeFileSync(path.join(dir, '.gitignore'), content, 'utf8');
}

function writeExclude(dir: string, content: string): void {
	fs.writeFileSync(path.join(dir, '.git', 'info', 'exclude'), content, 'utf8');
}

function rmrf(dir: string): void {
	try {
		fs.rmSync(dir, { recursive: true, force: true });
	} catch {
		// best-effort cleanup
	}
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('warnIfSwarmNotGitignored', () => {
	let tmpDir: string;
	let warnSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		tmpDir = makeTmpDir();
		resetGitignoreWarningState();
		warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		warnSpy.mockRestore();
		rmrf(tmpDir);
		resetGitignoreWarningState();
	});

	// -------------------------------------------------------------------------
	// 1. Warning fires when .gitignore exists but does not cover .swarm/
	// -------------------------------------------------------------------------
	it('fires when .gitignore exists but does not contain .swarm/', () => {
		makeGitRepo(tmpDir);
		writeGitignore(tmpDir, 'node_modules/\ndist/\n');

		warnIfSwarmNotGitignored(tmpDir);

		expect(warnSpy).toHaveBeenCalledTimes(1);
		const [message] = warnSpy.mock.calls[0] as [string];
		expect(message).toContain('[opencode-swarm] WARNING');
		expect(message).toContain('.swarm/');
		expect(message).toContain('.gitignore');
	});

	// -------------------------------------------------------------------------
	// 2. Warning does NOT fire when .gitignore contains .swarm/
	// -------------------------------------------------------------------------
	it('does NOT fire when .gitignore contains .swarm/', () => {
		makeGitRepo(tmpDir);
		writeGitignore(tmpDir, 'node_modules/\n.swarm/\ndist/\n');

		warnIfSwarmNotGitignored(tmpDir);

		expect(warnSpy).not.toHaveBeenCalled();
	});

	// -------------------------------------------------------------------------
	// 3. Warning does NOT fire when .gitignore contains .swarm (no trailing /)
	// -------------------------------------------------------------------------
	it('does NOT fire when .gitignore contains .swarm (without trailing slash)', () => {
		makeGitRepo(tmpDir);
		writeGitignore(tmpDir, 'node_modules/\n.swarm\n');

		warnIfSwarmNotGitignored(tmpDir);

		expect(warnSpy).not.toHaveBeenCalled();
	});

	// -------------------------------------------------------------------------
	// 4. Warning does NOT fire when .git/info/exclude covers .swarm/
	// -------------------------------------------------------------------------
	it('does NOT fire when .git/info/exclude contains .swarm/', () => {
		makeGitRepo(tmpDir);
		// .gitignore exists but doesn't cover .swarm/
		writeGitignore(tmpDir, 'node_modules/\n');
		// exclude file covers it
		writeExclude(tmpDir, '# git exclude\n.swarm/\n');

		warnIfSwarmNotGitignored(tmpDir);

		expect(warnSpy).not.toHaveBeenCalled();
	});

	it('does NOT fire when .git/info/exclude contains .swarm (no trailing slash)', () => {
		makeGitRepo(tmpDir);
		writeGitignore(tmpDir, 'node_modules/\n');
		writeExclude(tmpDir, '.swarm\n');

		warnIfSwarmNotGitignored(tmpDir);

		expect(warnSpy).not.toHaveBeenCalled();
	});

	// -------------------------------------------------------------------------
	// 5. Warning does NOT fire when no .git/ directory is found
	// -------------------------------------------------------------------------
	it('does NOT fire when no .git/ directory is found (not a git repo)', () => {
		// tmpDir has no .git/ — create a nested subdir to call from
		const subDir = path.join(tmpDir, 'some', 'nested', 'path');
		fs.mkdirSync(subDir, { recursive: true });

		warnIfSwarmNotGitignored(subDir);

		expect(warnSpy).not.toHaveBeenCalled();
	});

	// -------------------------------------------------------------------------
	// 6. Warning fires at most once per process (module-level deduplication)
	// -------------------------------------------------------------------------
	it('fires at most once even when called multiple times', () => {
		makeGitRepo(tmpDir);
		writeGitignore(tmpDir, 'node_modules/\n');

		warnIfSwarmNotGitignored(tmpDir);
		warnIfSwarmNotGitignored(tmpDir);
		warnIfSwarmNotGitignored(tmpDir);

		expect(warnSpy).toHaveBeenCalledTimes(1);
	});

	it('does NOT fire a second call after flag was set by a covered repo', () => {
		// First call: covered — flag set without warning
		makeGitRepo(tmpDir);
		writeGitignore(tmpDir, '.swarm/\n');
		warnIfSwarmNotGitignored(tmpDir);
		expect(warnSpy).not.toHaveBeenCalled();

		// Second call with a different (uncovered) dir — should be suppressed
		const tmpDir2 = makeTmpDir();
		try {
			makeGitRepo(tmpDir2);
			writeGitignore(tmpDir2, 'node_modules/\n');
			warnIfSwarmNotGitignored(tmpDir2);
			// Still no warning because flag already set
			expect(warnSpy).not.toHaveBeenCalled();
		} finally {
			rmrf(tmpDir2);
		}
	});

	// -------------------------------------------------------------------------
	// Edge cases
	// -------------------------------------------------------------------------
	it('ignores comment lines when scanning .gitignore', () => {
		makeGitRepo(tmpDir);
		// Lines that look like .swarm but are comments — should NOT count
		writeGitignore(tmpDir, '# .swarm/\n# .swarm\nnode_modules/\n');

		warnIfSwarmNotGitignored(tmpDir);

		expect(warnSpy).toHaveBeenCalledTimes(1);
	});

	it('handles whitespace around .swarm/ in .gitignore', () => {
		makeGitRepo(tmpDir);
		// Leading/trailing whitespace should be stripped before matching
		writeGitignore(tmpDir, '  .swarm/  \n');

		warnIfSwarmNotGitignored(tmpDir);

		expect(warnSpy).not.toHaveBeenCalled();
	});

	it('fires when .gitignore does not exist at all', () => {
		makeGitRepo(tmpDir);
		// No .gitignore written — no exclude either

		warnIfSwarmNotGitignored(tmpDir);

		expect(warnSpy).toHaveBeenCalledTimes(1);
	});

	it('walks up to the git root when called from a subdirectory', () => {
		makeGitRepo(tmpDir);
		writeGitignore(tmpDir, 'node_modules/\n');

		// Create a nested project directory
		const subDir = path.join(tmpDir, 'packages', 'core', 'src');
		fs.mkdirSync(subDir, { recursive: true });

		warnIfSwarmNotGitignored(subDir);

		// Should find tmpDir/.git and read tmpDir/.gitignore
		expect(warnSpy).toHaveBeenCalledTimes(1);
	});

	it('does NOT fire when walking up finds a covered .gitignore', () => {
		makeGitRepo(tmpDir);
		writeGitignore(tmpDir, '.swarm/\n');

		const subDir = path.join(tmpDir, 'src', 'deep', 'path');
		fs.mkdirSync(subDir, { recursive: true });

		warnIfSwarmNotGitignored(subDir);

		expect(warnSpy).not.toHaveBeenCalled();
	});
});
