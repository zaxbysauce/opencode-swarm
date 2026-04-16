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
import { pendingCoderScopeByTaskId } from '../../../src/hooks/delegation-gate';
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

	it('coder allowed to write to tests/ via edit tool (in coder allowedPrefix)', async () => {
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

	it('architect is permitted to write to src/ (authority check does not block architect)', async () => {
		const hooks = makeHooks();
		architectSession('arch-write-src');

		// Architect writes to src/ must not be blocked by the authority check
		await hooks.toolBefore(
			{ tool: 'write', sessionID: 'arch-write-src', callID: 'arch-w1' },
			{ args: { filePath: 'src/new-module.ts' } },
		);
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

	it('blocks paths using ../ traversal that normalize to a denied prefix', async () => {
		// Test gap fix: ensures path.resolve/relative normalizes '..' before prefix check,
		// preventing bypass via 'src/../.env' which resolves to '.env'
		const hooks = makeHooks({ universal_deny_prefixes: ['.env'] });
		coderSession('coder-deny-traversal');

		await expect(
			hooks.toolBefore(
				{ tool: 'write', sessionID: 'coder-deny-traversal', callID: 'u8' },
				{ args: { filePath: 'src/../.env' } },
			),
		).rejects.toThrow(/universal deny prefix/);
	});

	it('blocks nested ../ traversal that normalizes to a denied prefix', async () => {
		// Test gap fix: deep traversal 'a/b/../../secrets/key' normalizes to 'secrets/key'
		const hooks = makeHooks({ universal_deny_prefixes: ['secrets/'] });
		coderSession('coder-deny-nested-traversal');

		await expect(
			hooks.toolBefore(
				{
					tool: 'write',
					sessionID: 'coder-deny-nested-traversal',
					callID: 'u9',
				},
				{ args: { filePath: 'a/b/../../secrets/key.pem' } },
			),
		).rejects.toThrow(/universal deny prefix/);
	});

	it('blocks absolute paths inside cwd that match a denied prefix', async () => {
		// Test gap fix: absolute paths should also be normalized and matched
		const hooks = makeHooks({ universal_deny_prefixes: ['.env'] });
		coderSession('coder-deny-absolute');

		const absolutePath = path.join(tempDir, '.env');
		await expect(
			hooks.toolBefore(
				{ tool: 'write', sessionID: 'coder-deny-absolute', callID: 'u10' },
				{ args: { filePath: absolutePath } },
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

	it('BLOCKS apply_patch when target path is a symlink', async () => {
		// Test gap fix: apply_patch + lstat combination was not previously tested
		await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
		const realFile = path.join(tempDir, 'src', 'real.ts');
		const linkFile = path.join(tempDir, 'src', 'link.ts');
		await fs.writeFile(realFile, 'real');
		fsSync.symlinkSync(realFile, linkFile);

		const hooks = makeHooks();
		coderSession('coder-patch-lstat');

		const patchContent = `*** Begin Patch
*** Update File: src/link.ts
@@
-real
+modified
*** End Patch`;

		await expect(
			hooks.toolBefore(
				{ tool: 'apply_patch', sessionID: 'coder-patch-lstat', callID: 'l4' },
				{ args: { patch: patchContent } },
			),
		).rejects.toThrow(/WRITE BLOCKED.*symlink/);
	});

	it('BLOCKS apply_patch when a parent directory is a symlink', async () => {
		// Test gap fix: verifies ancestor-chain walk works for patch targets
		const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'patch-ext-'));
		fsSync.symlinkSync(outside, path.join(tempDir, 'linked-src'));

		const hooks = makeHooks();
		coderSession('coder-patch-lstat-parent');

		const patchContent = `*** Begin Patch
*** Update File: linked-src/file.ts
@@
-x
+y
*** End Patch`;

		await expect(
			hooks.toolBefore(
				{
					tool: 'apply_patch',
					sessionID: 'coder-patch-lstat-parent',
					callID: 'l5',
				},
				{ args: { patch: patchContent } },
			),
		).rejects.toThrow(/WRITE BLOCKED.*symlink/);

		try {
			await fs.rm(outside, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
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

	it('rejects mixed scope when only some files are symlinked (no early-exit)', async () => {
		// Test gap fix: verifies the lstat check loop does NOT short-circuit on the
		// first real file — every declared file must be validated.
		await writePlan();
		await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
		const realFile = path.join(tempDir, 'src', 'real.ts');
		await fs.writeFile(realFile, 'ok');

		// Create a symlink that appears AFTER a real file in the scope list
		const linkTarget = path.join(tempDir, 'target.ts');
		await fs.writeFile(linkTarget, 'target');
		fsSync.symlinkSync(linkTarget, path.join(tempDir, 'src', 'link.ts'));

		const result = await executeDeclareScope(
			{ taskId: '1.1', files: ['src/real.ts', 'src/link.ts'] },
			tempDir,
		);
		expect(result.success).toBe(false);
		expect(result.message).toContain('symlink');
		// Confirm the symlinked file was actually detected (not skipped by early-exit)
		expect(JSON.stringify(result.errors ?? [])).toContain('link.ts');
	});
});

// ─── 6. declared scope overrides allowedPrefix (issue #496) ──────────────────
//
// declare_scope-declared paths bypass the hardcoded allowedPrefix whitelist
// (e.g. coder's ['src/', 'tests/', 'docs/', 'scripts/']) so the architect can
// authorise framework-agnostic paths (Rails config/, app/, db/; Python module/;
// etc.) without editing the default rule set. All DENY rules remain enforced.

describe('declared scope overrides allowedPrefix (#496)', () => {
	beforeEach(setup);
	afterEach(teardown);

	it('ALLOWS Rails config/ path after declare_scope (outside coder allowedPrefix)', async () => {
		// Without declare_scope, coder cannot write to `config/` (not in allowedPrefix).
		// After declare_scope, the same write succeeds — scope overrides allowedPrefix.
		const hooks = makeHooks();
		const id = 'coder-scope-rails-config';
		coderSession(id);

		const session = swarmState.agentSessions.get(id);
		if (session) {
			session.declaredCoderScope = ['config/environments/test.rb'];
		}

		// config/environments/test.rb is outside ['src/','tests/','docs/','scripts/']
		// but inside the declared scope — authority check should allow it.
		await hooks.toolBefore(
			{ tool: 'write', sessionID: id, callID: 's1' },
			{ args: { filePath: 'config/environments/test.rb' } },
		);
	});

	it('ALLOWS Rails app/ and db/migrate/ directories after declare_scope', async () => {
		const hooks = makeHooks();
		const id = 'coder-scope-rails-app';
		coderSession(id);

		const session = swarmState.agentSessions.get(id);
		if (session) {
			session.declaredCoderScope = ['app/', 'db/migrate/'];
		}

		// Directory-containment: files under declared directories are in scope.
		await hooks.toolBefore(
			{ tool: 'write', sessionID: id, callID: 's2a' },
			{ args: { filePath: 'app/models/user.rb' } },
		);
		await hooks.toolBefore(
			{ tool: 'write', sessionID: id, callID: 's2b' },
			{ args: { filePath: 'db/migrate/20260416_create_users.rb' } },
		);
	});

	it('BLOCKS non-Rails path outside declared scope (scope does not widen everything)', async () => {
		const hooks = makeHooks();
		const id = 'coder-scope-narrow';
		coderSession(id);

		const session = swarmState.agentSessions.get(id);
		if (session) {
			session.declaredCoderScope = ['config/'];
		}

		// `app/` is NOT in declared scope, and also NOT in coder's allowedPrefix
		// → authority check must still block.
		await expect(
			hooks.toolBefore(
				{ tool: 'write', sessionID: id, callID: 's3' },
				{ args: { filePath: 'app/models/user.rb' } },
			),
		).rejects.toThrow(/not in allowed list/);
	});

	it('BACKWARD COMPAT: without declare_scope, allowedPrefix still restricts coder to src/', async () => {
		// Pre-fix behaviour must be preserved: if the architect has NOT declared
		// scope, the hardcoded allowedPrefix whitelist still applies.
		const hooks = makeHooks();
		const id = 'coder-no-scope';
		coderSession(id);

		// No declaredCoderScope set. `config/` is not in coder's allowedPrefix.
		await expect(
			hooks.toolBefore(
				{ tool: 'write', sessionID: id, callID: 's4' },
				{ args: { filePath: 'config/routes.rb' } },
			),
		).rejects.toThrow(/not in allowed list/);
	});

	it('SECURITY: blockedPrefix still enforced even when path is in declared scope', async () => {
		// blockedPrefix takes priority over the declared-scope allow. Declaring
		// `.swarm/` in scope must NOT let the coder write into it.
		const hooks = makeHooks();
		const id = 'coder-scope-blocked-prefix';
		coderSession(id);

		const session = swarmState.agentSessions.get(id);
		if (session) {
			session.declaredCoderScope = ['.swarm/plan.json'];
		}

		// coder's blockedPrefix is ['.swarm/'] — must still fire.
		await expect(
			hooks.toolBefore(
				{ tool: 'write', sessionID: id, callID: 's5' },
				{ args: { filePath: '.swarm/plan.json' } },
			),
		).rejects.toThrow(/WRITE BLOCKED.*under \.swarm/);
	});

	it('SECURITY: readOnly (explorer) still enforced even when path is in declared scope', async () => {
		const hooks = makeHooks();
		const id = 'explorer-scope-readonly';
		ensureAgentSession(id, 'explorer');
		swarmState.activeAgent.set(id, 'explorer');
		beginInvocation(id, 'explorer');

		const session = swarmState.agentSessions.get(id);
		if (session) {
			session.declaredCoderScope = ['src/feature.ts'];
		}

		// explorer is read-only — scope declaration must not grant write authority.
		await expect(
			hooks.toolBefore(
				{ tool: 'write', sessionID: id, callID: 's6' },
				{ args: { filePath: 'src/feature.ts' } },
			),
		).rejects.toThrow(/read-only/);
	});

	it('SECURITY: universal_deny still blocks even when path is in declared scope', async () => {
		const hooks = makeHooks({
			universal_deny_prefixes: ['.env', 'secrets/'],
		});
		const id = 'coder-scope-universal-deny';
		coderSession(id);

		const session = swarmState.agentSessions.get(id);
		if (session) {
			session.declaredCoderScope = ['.env', 'secrets/api-key.pem'];
		}

		// universal_deny_prefixes is checked before per-agent rules and is not
		// relaxed by declared scope.
		await expect(
			hooks.toolBefore(
				{ tool: 'write', sessionID: id, callID: 's7a' },
				{ args: { filePath: '.env' } },
			),
		).rejects.toThrow(/universal deny prefix/);

		await expect(
			hooks.toolBefore(
				{ tool: 'write', sessionID: id, callID: 's7b' },
				{ args: { filePath: 'secrets/api-key.pem' } },
			),
		).rejects.toThrow(/universal deny prefix/);
	});

	it('SECURITY: blockedZones still enforced even when path is in declared scope', async () => {
		// coder blockedZones = ['generated', 'config']. A `.yaml` file classifies
		// as `config` zone — declared scope must not bypass blockedZones.
		const hooks = makeHooks();
		const id = 'coder-scope-blocked-zone';
		coderSession(id);

		const session = swarmState.agentSessions.get(id);
		if (session) {
			session.declaredCoderScope = ['config/database.yml'];
		}

		await expect(
			hooks.toolBefore(
				{ tool: 'write', sessionID: id, callID: 's8' },
				{ args: { filePath: 'config/database.yml' } },
			),
		).rejects.toThrow(/config zone/);
	});

	it('FALLBACK: pendingCoderScopeByTaskId used when session.declaredCoderScope is null', async () => {
		// After /swarm close and before a new session inherits scope, the
		// per-task map is the source of truth. The guard must consult it.
		const hooks = makeHooks();
		const id = 'coder-scope-task-fallback';
		coderSession(id);

		const session = swarmState.agentSessions.get(id);
		if (session) {
			session.declaredCoderScope = null;
			session.currentTaskId = 'task-rails-1';
		}
		pendingCoderScopeByTaskId.set('task-rails-1', ['config/', 'app/']);

		try {
			await hooks.toolBefore(
				{ tool: 'write', sessionID: id, callID: 's9' },
				{ args: { filePath: 'config/routes.rb' } },
			);
		} finally {
			pendingCoderScopeByTaskId.delete('task-rails-1');
		}
	});

	it('apply_patch also honours declared scope (parity with Write/Edit)', async () => {
		const hooks = makeHooks();
		const id = 'coder-scope-patch';
		coderSession(id);

		const session = swarmState.agentSessions.get(id);
		if (session) {
			session.declaredCoderScope = ['config/'];
		}

		const patchContent = `*** Begin Patch
*** Update File: config/routes.rb
@@
-old
+new
*** End Patch`;

		// config/routes.rb would normally be rejected by coder's allowedPrefix,
		// but declared scope lets it through — and blockedZones/blockedPrefix
		// still apply (routes.rb is production zone, not blocked).
		await hooks.toolBefore(
			{ tool: 'apply_patch', sessionID: id, callID: 's10' },
			{ args: { patch: patchContent } },
		);
	});
});
