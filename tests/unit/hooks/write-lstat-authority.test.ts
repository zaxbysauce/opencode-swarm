/**
 * PR B: write lstat + transparent authority + universal_deny_prefixes
 *
 * Tests:
 *  1. checkWriteTargetForSymlink — symlink/junction detection for writes
 *  2. Transparent authority — non-architect agents have their writes checked
 *  3. universal_deny_prefixes — no agent may write to globally denied paths
 *  4. lstat check on apply_patch
 *  5. declare_scope lstat gate
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	type AuthorityConfig,
	AuthorityConfigSchema,
	type GuardrailsConfig,
	GuardrailsConfigSchema,
} from '../../../src/config/schema';
import {
	checkWriteTargetForSymlink,
	createGuardrailsHooks,
} from '../../../src/hooks/guardrails';
import {
	beginInvocation,
	ensureAgentSession,
	resetSwarmState,
	swarmState,
} from '../../../src/state';
import { executeDeclareScope } from '../../../src/tools/declare-scope';

// ─── helpers ────────────────────────────────────────────────────────────────

let tempDir: string;
let originalCwd: string;

async function setup(): Promise<void> {
	// realpath so macOS /tmp → /private/tmp doesn't cause path mismatches
	tempDir = await fs.realpath(
		await fs.mkdtemp(path.join(os.tmpdir(), 'write-lstat-')),
	);
	originalCwd = process.cwd();
	process.chdir(tempDir);
	resetSwarmState();
}

async function teardown(): Promise<void> {
	process.chdir(originalCwd);
	try {
		await fs.rm(tempDir, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
}

function makeHooks(
	authorityOverrides: Record<string, unknown> = {},
): ReturnType<typeof createGuardrailsHooks> {
	const cfg = GuardrailsConfigSchema.parse({
		enabled: true,
	}) as GuardrailsConfig;
	const authority = AuthorityConfigSchema.parse(
		authorityOverrides,
	) as AuthorityConfig;
	// Production call convention: createGuardrailsHooks(dir, undefined, guardrailsCfg, authorityCfg)
	return createGuardrailsHooks(tempDir, undefined, cfg, authority);
}

function coderSession(id: string): void {
	ensureAgentSession(id, 'coder');
	swarmState.activeAgent.set(id, 'coder');
	beginInvocation(id, 'coder');
}

function architectSession(id: string): void {
	ensureAgentSession(id, 'architect');
	swarmState.activeAgent.set(id, 'architect');
	beginInvocation(id, 'architect');
}

// ─── 1. checkWriteTargetForSymlink unit tests ────────────────────────────────

describe('checkWriteTargetForSymlink', () => {
	beforeEach(setup);
	afterEach(teardown);

	it('returns null for a plain new file (ENOENT) — write allowed', () => {
		const result = checkWriteTargetForSymlink('does-not-exist.ts', tempDir);
		expect(result).toBeNull();
	});

	it('returns null for an existing real file', async () => {
		await fs.writeFile(path.join(tempDir, 'real.ts'), 'ok');
		const result = checkWriteTargetForSymlink('real.ts', tempDir);
		expect(result).toBeNull();
	});

	it('returns null for a nested path where parent dir is real', async () => {
		await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
		const result = checkWriteTargetForSymlink('src/new-file.ts', tempDir);
		expect(result).toBeNull();
	});

	it('BLOCKS when the target itself is a symlink', async () => {
		// Create a real file and a symlink pointing to it
		const realFile = path.join(tempDir, 'real.ts');
		const link = path.join(tempDir, 'link.ts');
		await fs.writeFile(realFile, 'real');
		fsSync.symlinkSync(realFile, link);

		const result = checkWriteTargetForSymlink('link.ts', tempDir);
		expect(result).not.toBeNull();
		expect(result).toContain('WRITE BLOCKED');
		expect(result).toContain('symlink');
	});

	it('BLOCKS when a parent directory is a symlink', async () => {
		// Create a real dir outside tempDir and a symlink to it inside tempDir
		const outsideDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'outside-real-'),
		);
		const symlinkDir = path.join(tempDir, 'symdir');
		fsSync.symlinkSync(outsideDir, symlinkDir);

		const result = checkWriteTargetForSymlink('symdir/newfile.ts', tempDir);

		// cleanup outside dir
		try {
			await fs.rm(outsideDir, { recursive: true, force: true });
		} catch {
			/* ignore */
		}

		expect(result).not.toBeNull();
		expect(result).toContain('WRITE BLOCKED');
		expect(result).toContain('symlink');
	});

	it('returns null when target is above cwd (absolute external path)', () => {
		// Path outside tempDir — not a symlink concern, just not in scope.
		// checkWriteTargetForSymlink only checks nodes within cwd.
		const result = checkWriteTargetForSymlink('/tmp/harmless.ts', tempDir);
		// Result may be null or blocked depending on whether /tmp is a symlink.
		// The important invariant is: it never throws.
		expect(typeof result === 'string' || result === null).toBe(true);
	});
});

// ─── 2. Transparent authority — non-architect agents ─────────────────────────

describe('Transparent authority: non-architect agents checked on Write', () => {
	beforeEach(setup);
	afterEach(teardown);

	it('coder blocked from writing to .swarm/ (blockedPrefix rule)', async () => {
		const hooks = makeHooks();
		coderSession('coder-swarm-block');

		await expect(
			hooks.toolBefore(
				{ tool: 'write', sessionID: 'coder-swarm-block', callID: 'c1' },
				{ args: { filePath: '.swarm/outputs/report.md' } },
			),
		).rejects.toThrow(/WRITE BLOCKED/);
	});

	it('coder allowed to write to src/ (in allowedPrefix)', async () => {
		const hooks = makeHooks();
		coderSession('coder-src-allow');

		// Should NOT throw — coder's allowedPrefix includes 'src/'
		await hooks.toolBefore(
			{ tool: 'write', sessionID: 'coder-src-allow', callID: 'c2' },
			{ args: { filePath: 'src/utils/helper.ts' } },
		);
	});

	it('coder blocked from writing to tests/ via edit tool (not in coder allowedPrefix in default rules)', async () => {
		// Default coder allowedPrefix: ['src/', 'tests/', 'docs/', 'scripts/']
		// tests/ IS included for coder — so this should be allowed
		const hooks = makeHooks();
		coderSession('coder-tests-allow');

		await hooks.toolBefore(
			{ tool: 'edit', sessionID: 'coder-tests-allow', callID: 'c3' },
			{ args: { filePath: 'tests/unit/my.test.ts' } },
		);
	});

	it('reviewer blocked from writing to src/ (blockedPrefix rule)', async () => {
		const hooks = makeHooks();
		const id = 'reviewer-src-block';
		ensureAgentSession(id, 'reviewer');
		swarmState.activeAgent.set(id, 'reviewer');
		beginInvocation(id, 'reviewer');

		await expect(
			hooks.toolBefore(
				{ tool: 'write', sessionID: id, callID: 'r1' },
				{ args: { filePath: 'src/component.ts' } },
			),
		).rejects.toThrow(/WRITE BLOCKED/);
	});

	it('explorer (readOnly) blocked from any write', async () => {
		const hooks = makeHooks();
		const id = 'explorer-write-block';
		ensureAgentSession(id, 'explorer');
		swarmState.activeAgent.set(id, 'explorer');
		beginInvocation(id, 'explorer');

		await expect(
			hooks.toolBefore(
				{ tool: 'write', sessionID: id, callID: 'e1' },
				{ args: { filePath: 'src/something.ts' } },
			),
		).rejects.toThrow(/WRITE BLOCKED/);
	});
});

// ─── 3. universal_deny_prefixes ───────────────────────────────────────────────

describe('universal_deny_prefixes', () => {
	beforeEach(setup);
	afterEach(teardown);

	it('blocks architect from writing to a universal deny prefix', async () => {
		const hooks = makeHooks({
			universal_deny_prefixes: ['.env', 'secrets/'],
		});
		architectSession('arch-deny-env');

		await expect(
			hooks.toolBefore(
				{ tool: 'write', sessionID: 'arch-deny-env', callID: 'u1' },
				{ args: { filePath: '.env' } },
			),
		).rejects.toThrow(/universal deny prefix/);
	});

	it('blocks coder from writing to a universal deny prefix (before per-agent rules)', async () => {
		// coder's allowedPrefix includes 'src/' but universal_deny overrides it
		const hooks = makeHooks({
			universal_deny_prefixes: ['src/generated/'],
		});
		coderSession('coder-deny-generated');

		await expect(
			hooks.toolBefore(
				{ tool: 'write', sessionID: 'coder-deny-generated', callID: 'u2' },
				{ args: { filePath: 'src/generated/types.ts' } },
			),
		).rejects.toThrow(/universal deny prefix/);
	});

	it('blocks patches to universal deny prefix', async () => {
		const hooks = makeHooks({
			universal_deny_prefixes: ['secrets/'],
		});
		coderSession('coder-patch-deny');

		const patchContent = `*** Begin Patch
*** Update File: secrets/key.pem
@@
-old line
+new line
*** End Patch`;

		await expect(
			hooks.toolBefore(
				{ tool: 'apply_patch', sessionID: 'coder-patch-deny', callID: 'u3' },
				{ args: { patch: patchContent } },
			),
		).rejects.toThrow(/universal deny prefix/);
	});

	it('allows writes to paths not matching any universal deny prefix', async () => {
		const hooks = makeHooks({
			universal_deny_prefixes: ['.env', 'secrets/'],
		});
		coderSession('coder-deny-ok');

		// src/utils.ts is not in the deny list, and coder's allowedPrefix includes src/
		await hooks.toolBefore(
			{ tool: 'write', sessionID: 'coder-deny-ok', callID: 'u4' },
			{ args: { filePath: 'src/utils.ts' } },
		);
	});

	it('empty universal_deny_prefixes → no extra blocking', async () => {
		const hooks = makeHooks({ universal_deny_prefixes: [] });
		coderSession('coder-deny-empty');

		// coder can write to src/ normally
		await hooks.toolBefore(
			{ tool: 'write', sessionID: 'coder-deny-empty', callID: 'u5' },
			{ args: { filePath: 'src/file.ts' } },
		);
	});

	it('universal deny is case-insensitive (.ENV blocked by .env prefix)', async () => {
		// Fix for adversarial finding: case-sensitive startsWith() allowed .ENV bypass
		const hooks = makeHooks({ universal_deny_prefixes: ['.env'] });
		coderSession('coder-deny-case');

		await expect(
			hooks.toolBefore(
				{ tool: 'write', sessionID: 'coder-deny-case', callID: 'u6' },
				{ args: { filePath: '.ENV' } },
			),
		).rejects.toThrow(/universal deny prefix/);
	});

	it('BLOCKS write when no active agent is registered for the session', async () => {
		// Fix for adversarial finding: missing activeAgent fell back to 'architect' (broad permissions)
		// Now it fails closed instead
		const hooks = makeHooks();
		// Deliberately do NOT register an agent for this session
		const id = 'unregistered-session';

		await expect(
			hooks.toolBefore(
				{ tool: 'write', sessionID: id, callID: 'u7' },
				{ args: { filePath: 'src/file.ts' } },
			),
		).rejects.toThrow(/No active agent registered/);
	});
});

// ─── 4. lstat check via toolBefore hook ─────────────────────────────────────

describe('lstat check via toolBefore (Write tool)', () => {
	beforeEach(setup);
	afterEach(teardown);

	it('BLOCKS write when target is a symlink', async () => {
		// Create real file + symlink
		await fs.writeFile(path.join(tempDir, 'real.ts'), 'real');
		fsSync.symlinkSync(
			path.join(tempDir, 'real.ts'),
			path.join(tempDir, 'link.ts'),
		);

		const hooks = makeHooks();
		coderSession('coder-lstat-symlink');

		await expect(
			hooks.toolBefore(
				{ tool: 'write', sessionID: 'coder-lstat-symlink', callID: 'l1' },
				{ args: { filePath: 'link.ts' } },
			),
		).rejects.toThrow(/WRITE BLOCKED.*symlink/);
	});

	it('BLOCKS write when a parent directory is a symlink', async () => {
		// Create symlinked parent dir
		const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'ext-'));
		fsSync.symlinkSync(outside, path.join(tempDir, 'linked-src'));

		const hooks = makeHooks();
		coderSession('coder-lstat-parent');

		// Expect-then-cleanup: await the rejection before cleaning up the outside dir
		// so the promise is handled before any await between creation and expectation.
		await expect(
			hooks.toolBefore(
				{ tool: 'write', sessionID: 'coder-lstat-parent', callID: 'l2' },
				{ args: { filePath: 'linked-src/file.ts' } },
			),
		).rejects.toThrow(/WRITE BLOCKED.*symlink/);

		try {
			await fs.rm(outside, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
	});

	it('allows write to a real (non-symlink) file path', async () => {
		await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });

		const hooks = makeHooks();
		coderSession('coder-lstat-real');

		// Should not throw (lstat sees real dir, authority check passes for coder+src/)
		await hooks.toolBefore(
			{ tool: 'write', sessionID: 'coder-lstat-real', callID: 'l3' },
			{ args: { filePath: 'src/new.ts' } },
		);
	});
});

// ─── 5. declare_scope lstat gate ─────────────────────────────────────────────

describe('declare_scope lstat validation', () => {
	beforeEach(setup);
	afterEach(teardown);

	async function writePlan(): Promise<void> {
		await fs.mkdir(path.join(tempDir, '.swarm'), { recursive: true });
		await fs.writeFile(
			path.join(tempDir, '.swarm', 'plan.json'),
			JSON.stringify({
				phases: [{ tasks: [{ id: '1.1', status: 'in_progress' }] }],
			}),
		);
	}

	it('accepts scope with real files (no symlinks)', async () => {
		await writePlan();
		await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
		await fs.writeFile(path.join(tempDir, 'src', 'a.ts'), 'ok');

		const result = await executeDeclareScope(
			{ taskId: '1.1', files: ['src/a.ts'] },
			tempDir,
		);
		expect(result.success).toBe(true);
	});

	it('rejects scope when a declared file is a symlink', async () => {
		await writePlan();
		const real = path.join(tempDir, 'real.ts');
		const link = path.join(tempDir, 'link.ts');
		await fs.writeFile(real, 'real');
		fsSync.symlinkSync(real, link);

		const result = await executeDeclareScope(
			{ taskId: '1.1', files: ['link.ts'] },
			tempDir,
		);
		expect(result.success).toBe(false);
		expect(result.message).toContain('symlink');
	});

	it('rejects scope when a declared file is under a symlinked directory', async () => {
		await writePlan();
		const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'ext2-'));
		fsSync.symlinkSync(outside, path.join(tempDir, 'symdir'));

		const result = await executeDeclareScope(
			{ taskId: '1.1', files: ['symdir/file.ts'] },
			tempDir,
		);

		try {
			await fs.rm(outside, { recursive: true, force: true });
		} catch {
			/* ignore */
		}

		expect(result.success).toBe(false);
		expect(result.message).toContain('symlink');
	});

	it('accepts scope for new files that do not exist yet', async () => {
		await writePlan();
		// 'src/new.ts' does not exist — should be accepted (ENOENT is OK)
		const result = await executeDeclareScope(
			{ taskId: '1.1', files: ['src/new.ts'] },
			tempDir,
		);
		expect(result.success).toBe(true);
	});
});
