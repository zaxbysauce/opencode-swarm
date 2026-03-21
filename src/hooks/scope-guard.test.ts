/**
 * scope-guard.test.ts
 *
 * Tests for scope-guard hook (Task 3.1):
 * 1. Returns early (no throw) when guard is disabled (config.enabled = false)
 * 2. Returns early when tool is not in WRITE_TOOLS set (e.g., 'read')
 * 3. Returns early when session is the architect (agentName = 'Architect')
 * 4. Returns early when declaredCoderScope is null (no scope declared)
 * 5. Throws 'SCOPE VIOLATION' when non-architect writes file outside declared scope
 * 6. Does NOT throw when non-architect writes file INSIDE declared scope
 * 7. Sanitizes path with \r\n to prevent log injection (SEC-1 fix)
 * 8. isFileInScope correctly handles exact match and directory containment
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as path from 'node:path';
import { ensureAgentSession, resetSwarmState, swarmState } from '../state';
import { createScopeGuardHook, isFileInScope } from './scope-guard';

const SESSION_ID = 'test-session-scope-guard';
const ARCHITECT_SESSION_ID = 'architect-session';
const WORKSPACE_DIR = '/workspace';

describe('scope-guard hook (Task 3.1)', () => {
	beforeEach(() => {
		resetSwarmState();
	});

	afterEach(() => {
		resetSwarmState();
	});

	// ─────────────────────────────────────────────────────────────
	// Test 1: Returns early when guard is disabled
	// ─────────────────────────────────────────────────────────────
	it('1. Returns early (no throw) when guard is disabled (config.enabled = false)', async () => {
		const hook = createScopeGuardHook(
			{ enabled: false },
			WORKSPACE_DIR,
			() => {},
		);

		// Should NOT throw even with out-of-scope write
		await expect(async () => {
			await hook.toolBefore(
				{
					tool: 'edit',
					sessionID: SESSION_ID,
					callID: 'call-1',
				},
				{ args: { path: '/workspace/outside.ts' } },
			);
		}).not.toThrow();
	});

	// ─────────────────────────────────────────────────────────────
	// Test 2: Returns early when tool is not in WRITE_TOOLS
	// ─────────────────────────────────────────────────────────────
	it('2. Returns early when tool is not in WRITE_TOOLS set (e.g., read)', async () => {
		ensureAgentSession(SESSION_ID, 'coder');

		const hook = createScopeGuardHook(
			{ enabled: true },
			WORKSPACE_DIR,
			() => {},
		);

		// 'read' is not a write tool — should return early
		await expect(async () => {
			await hook.toolBefore(
				{
					tool: 'read',
					sessionID: SESSION_ID,
					callID: 'call-1',
				},
				{ args: { path: '/workspace/any-file.ts' } },
			);
		}).not.toThrow();
	});

	// ─────────────────────────────────────────────────────────────
	// Test 3: Returns early when session is the architect
	// ─────────────────────────────────────────────────────────────
	it('3. Returns early when session is the architect (agentName = Architect)', async () => {
		// Create a session with architect identity
		ensureAgentSession(ARCHITECT_SESSION_ID, 'Architect');

		const hook = createScopeGuardHook(
			{ enabled: true },
			WORKSPACE_DIR,
			() => {},
		);

		// Architect editing should be allowed (no throw)
		await expect(async () => {
			await hook.toolBefore(
				{
					tool: 'edit',
					sessionID: ARCHITECT_SESSION_ID,
					callID: 'call-1',
				},
				{ args: { path: '/workspace/any-file.ts' } },
			);
		}).not.toThrow();
	});

	// ─────────────────────────────────────────────────────────────
	// Test 4: Returns early when declaredCoderScope is null
	// ─────────────────────────────────────────────────────────────
	it('4. Returns early when declaredCoderScope is null (no scope declared)', async () => {
		ensureAgentSession(SESSION_ID, 'coder');
		// Ensure declaredCoderScope is null (default)
		const session = swarmState.agentSessions.get(SESSION_ID);
		expect(session?.declaredCoderScope).toBeNull();

		const hook = createScopeGuardHook(
			{ enabled: true },
			WORKSPACE_DIR,
			() => {},
		);

		// No scope declared — should allow
		await expect(async () => {
			await hook.toolBefore(
				{
					tool: 'edit',
					sessionID: SESSION_ID,
					callID: 'call-1',
				},
				{ args: { path: '/workspace/any-file.ts' } },
			);
		}).not.toThrow();
	});

	// ─────────────────────────────────────────────────────────────
	// Test 5: Throws SCOPE VIOLATION for out-of-scope write
	// ─────────────────────────────────────────────────────────────
	it('5. Throws SCOPE VIOLATION when non-architect writes file outside declared scope', async () => {
		ensureAgentSession(SESSION_ID, 'coder');
		// Set declared scope to a specific directory
		const session = swarmState.agentSessions.get(SESSION_ID)!;
		session.declaredCoderScope = ['/workspace/src/hooks'];

		const hook = createScopeGuardHook(
			{ enabled: true },
			WORKSPACE_DIR,
			() => {},
		);

		// Writing outside scope should throw
		await expect(async () => {
			await hook.toolBefore(
				{
					tool: 'edit',
					sessionID: SESSION_ID,
					callID: 'call-1',
				},
				{ args: { path: '/workspace/src/tools/some-file.ts' } },
			);
		}).toThrow(/SCOPE VIOLATION/);
	});

	// ─────────────────────────────────────────────────────────────
	// Test 6: Does NOT throw when writing inside declared scope
	// ─────────────────────────────────────────────────────────────
	it('6. Does NOT throw when non-architect writes file INSIDE declared scope', async () => {
		ensureAgentSession(SESSION_ID, 'coder');
		// Set declared scope to a specific directory
		const session = swarmState.agentSessions.get(SESSION_ID)!;
		session.declaredCoderScope = [
			'/workspace/src/hooks',
			'/workspace/src/utils',
		];

		const hook = createScopeGuardHook(
			{ enabled: true },
			WORKSPACE_DIR,
			() => {},
		);

		// Writing inside scope should NOT throw
		await expect(async () => {
			await hook.toolBefore(
				{
					tool: 'edit',
					sessionID: SESSION_ID,
					callID: 'call-1',
				},
				{ args: { path: '/workspace/src/hooks/scope-guard.ts' } },
			);
		}).not.toThrow();
	});

	// ─────────────────────────────────────────────────────────────
	// Test 7: Sanitizes path with \r\n to prevent log injection (SEC-1 fix)
	// ─────────────────────────────────────────────────────────────
	it('7. Sanitizes path with \\r\\n to prevent log injection (SEC-1 fix)', async () => {
		ensureAgentSession(SESSION_ID, 'coder');
		const session = swarmState.agentSessions.get(SESSION_ID)!;
		session.declaredCoderScope = ['/workspace/src/hooks'];

		// Track what advisory would be injected
		let advisoryMessage = '';
		const hook = createScopeGuardHook(
			{ enabled: true },
			WORKSPACE_DIR,
			(_sessionId, message) => {
				advisoryMessage = message;
			},
		);

		// Inject CR/LF characters to test sanitization
		const maliciousPath = '/workspace/src/tools/file.ts\r\nMalicious content';

		await expect(async () => {
			await hook.toolBefore(
				{
					tool: 'edit',
					sessionID: SESSION_ID,
					callID: 'call-1',
				},
				{ args: { path: maliciousPath } },
			);
		}).toThrow(/SCOPE VIOLATION/);

		// The violation message should have \r\n replaced with underscore
		// to prevent log injection attacks
		expect(advisoryMessage).not.toContain('\r');
		expect(advisoryMessage).not.toContain('\n');
	});

	// ─────────────────────────────────────────────────────────────
	// Test 8: isFileInScope handles exact match and directory containment
	// ─────────────────────────────────────────────────────────────
	describe('isFileInScope', () => {
		it('8a. Returns true for exact file match', () => {
			const scope = ['/workspace/src/hooks/scope-guard.ts'];
			expect(isFileInScope('/workspace/src/hooks/scope-guard.ts', scope)).toBe(
				true,
			);
		});

		it('8b. Returns true for file inside directory scope', () => {
			const scope = ['/workspace/src/hooks'];
			expect(isFileInScope('/workspace/src/hooks/scope-guard.ts', scope)).toBe(
				true,
			);
		});

		it('8c. Returns false for file outside directory scope', () => {
			const scope = ['/workspace/src/hooks'];
			expect(isFileInScope('/workspace/src/tools/scope-guard.ts', scope)).toBe(
				false,
			);
		});

		it('8d. Handles path.normalize for nested directories', () => {
			const scope = ['/workspace/src'];
			expect(isFileInScope('/workspace/src/hooks/scope-guard.ts', scope)).toBe(
				true,
			);
			expect(isFileInScope('/workspace/src/deep/nested/file.ts', scope)).toBe(
				true,
			);
		});

		it('8e. Returns false for parent directory traversal', () => {
			const scope = ['/workspace/src/hooks'];
			// File is outside scope via ..
			expect(isFileInScope('/workspace/src/../other/file.ts', scope)).toBe(
				false,
			);
		});
	});
});
