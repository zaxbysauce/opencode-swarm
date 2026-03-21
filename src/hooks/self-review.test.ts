/**
 * self-review.test.ts
 *
 * Tests for self-review hook (Task 4.1):
 * 1. Advisory injected when architect calls update_task_status with status=in_progress
 * 2. NOT injected when status=completed (not in_progress)
 * 3. NOT injected when calling session is not architect
 * 4. Turbo-skip: NOT injected when session.turboMode=true and skip_in_turbo=true
 * 5. Disabled: NOT injected when enabled=false
 * 6. Advisory text contains self-review focus items
 * 7. injectAdvisory errors are caught (non-blocking)
 * 8. No advisory for other tools (not update_task_status)
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ensureAgentSession, resetSwarmState } from '../state';
import { createSelfReviewHook } from './self-review';

const ARCHITECT_SESSION_ID = 'test-session-architect';
const CODER_SESSION_ID = 'test-session-coder';

describe('self-review hook (Task 4.1)', () => {
	let advisories: Array<{ sessionId: string; message: string }>;
	let injectAdvisory: (sessionId: string, message: string) => void;

	beforeEach(() => {
		resetSwarmState();
		advisories = [];
		injectAdvisory = (sessionId: string, message: string) => {
			advisories.push({ sessionId, message });
		};
	});

	afterEach(() => {
		resetSwarmState();
	});

	// ─────────────────────────────────────────────────────────────
	// Helper: fire toolAfter with update_task_status
	// ─────────────────────────────────────────────────────────────
	async function fireHook(
		sessionId: string,
		status: string,
		taskId = '1.1',
		config: Record<string, unknown> = {},
	) {
		ensureAgentSession(sessionId);
		const hook = createSelfReviewHook(
			config as Parameters<typeof createSelfReviewHook>[0],
			injectAdvisory,
		);
		await hook.toolAfter(
			{
				tool: 'update_task_status',
				sessionID: sessionId,
				callID: 'call-1',
			},
			{ args: { task_id: taskId, status } },
		);
		return hook;
	}

	// ─────────────────────────────────────────────────────────────
	// TEST 1: Advisory injected for architect + status=in_progress
	// ─────────────────────────────────────────────────────────────
	it('1. Advisory injected when architect calls update_task_status with status=in_progress', async () => {
		ensureAgentSession(ARCHITECT_SESSION_ID, 'architect');
		await fireHook(ARCHITECT_SESSION_ID, 'in_progress', '4.1');

		expect(advisories.length).toBe(1);
		expect(advisories[0].sessionId).toBe(ARCHITECT_SESSION_ID);
		expect(advisories[0].message).toContain('[SELF-REVIEW]');
		expect(advisories[0].message).toContain('Task 4.1');
		expect(advisories[0].message).toContain('Broken conditionals');
		expect(advisories[0].message).toContain('Off-by-one');
		expect(advisories[0].message).toContain('Scope creep');
		expect(advisories[0].message).toContain('critic');
	});

	// ─────────────────────────────────────────────────────────────
	// TEST 2: NOT injected when status != in_progress
	// ─────────────────────────────────────────────────────────────
	it('2. NOT injected when status=completed (not in_progress)', async () => {
		ensureAgentSession(ARCHITECT_SESSION_ID, 'architect');
		await fireHook(ARCHITECT_SESSION_ID, 'completed', '4.1');

		expect(advisories.length).toBe(0);
	});

	it('2b. NOT injected when status=pending', async () => {
		ensureAgentSession(ARCHITECT_SESSION_ID, 'architect');
		await fireHook(ARCHITECT_SESSION_ID, 'pending', '4.1');

		expect(advisories.length).toBe(0);
	});

	it('2c. NOT injected when status=blocked', async () => {
		ensureAgentSession(ARCHITECT_SESSION_ID, 'architect');
		await fireHook(ARCHITECT_SESSION_ID, 'blocked', '4.1');

		expect(advisories.length).toBe(0);
	});

	// ─────────────────────────────────────────────────────────────
	// TEST 3: NOT injected for non-architect sessions
	// ─────────────────────────────────────────────────────────────
	it('3. NOT injected when calling session is not architect (coder)', async () => {
		ensureAgentSession(CODER_SESSION_ID, 'coder');
		await fireHook(CODER_SESSION_ID, 'in_progress', '4.1');

		expect(advisories.length).toBe(0);
	});

	it('3b. NOT injected when calling session is reviewer', async () => {
		const reviewerSession = 'test-session-reviewer';
		ensureAgentSession(reviewerSession, 'reviewer');
		await fireHook(reviewerSession, 'in_progress', '4.1');

		expect(advisories.length).toBe(0);
	});

	// ─────────────────────────────────────────────────────────────
	// TEST 4: Turbo skip
	// ─────────────────────────────────────────────────────────────
	it('4. Turbo-skip: NOT injected when turboMode=true and skip_in_turbo=true', async () => {
		ensureAgentSession(ARCHITECT_SESSION_ID, 'architect');
		const session = ensureAgentSession(ARCHITECT_SESSION_ID, 'architect');
		session.turboMode = true;

		await fireHook(ARCHITECT_SESSION_ID, 'in_progress', '4.1', {
			skip_in_turbo: true,
		});

		expect(advisories.length).toBe(0);
	});

	it('4b. Advisory IS injected when turboMode=true but skip_in_turbo=false', async () => {
		ensureAgentSession(ARCHITECT_SESSION_ID, 'architect');
		const session = ensureAgentSession(ARCHITECT_SESSION_ID, 'architect');
		session.turboMode = true;

		await fireHook(ARCHITECT_SESSION_ID, 'in_progress', '4.1', {
			skip_in_turbo: false,
		});

		expect(advisories.length).toBe(1);
	});

	it('4c. Advisory IS injected when turboMode=false (even with skip_in_turbo=true)', async () => {
		ensureAgentSession(ARCHITECT_SESSION_ID, 'architect');
		const session = ensureAgentSession(ARCHITECT_SESSION_ID, 'architect');
		session.turboMode = false;

		await fireHook(ARCHITECT_SESSION_ID, 'in_progress', '4.1', {
			skip_in_turbo: true,
		});

		expect(advisories.length).toBe(1);
	});

	// ─────────────────────────────────────────────────────────────
	// TEST 5: Disabled
	// ─────────────────────────────────────────────────────────────
	it('5. NOT injected when enabled=false', async () => {
		ensureAgentSession(ARCHITECT_SESSION_ID, 'architect');
		await fireHook(ARCHITECT_SESSION_ID, 'in_progress', '4.1', {
			enabled: false,
		});

		expect(advisories.length).toBe(0);
	});

	// ─────────────────────────────────────────────────────────────
	// TEST 6: Advisory text contains all focus items
	// ─────────────────────────────────────────────────────────────
	it('6. Advisory text includes all self-review focus items', async () => {
		ensureAgentSession(ARCHITECT_SESSION_ID, 'architect');
		await fireHook(ARCHITECT_SESSION_ID, 'in_progress', '2.3');

		expect(advisories.length).toBe(1);
		const msg = advisories[0].message;
		expect(msg).toContain('Broken conditionals');
		expect(msg).toContain('Off-by-one');
		expect(msg).toContain('Assumptions contradicting');
		expect(msg).toContain('Missing error handling');
		expect(msg).toContain('Scope creep');
		expect(msg).toContain('critic');
		expect(msg).toContain('Task 2.3');
	});

	// ─────────────────────────────────────────────────────────────
	// TEST 7: injectAdvisory errors are caught (non-blocking)
	// ─────────────────────────────────────────────────────────────
	it('7. injectAdvisory errors are caught — hook does not throw', async () => {
		ensureAgentSession(ARCHITECT_SESSION_ID, 'architect');
		const throwingAdvisory = () => {
			throw new Error('advisory service unavailable');
		};
		const hook = createSelfReviewHook({}, throwingAdvisory);

		// Should NOT throw
		await hook.toolAfter(
			{
				tool: 'update_task_status',
				sessionID: ARCHITECT_SESSION_ID,
				callID: 'call-1',
			},
			{ args: { task_id: '1.1', status: 'in_progress' } },
		);

		// No crash, no advisories recorded (since the callback threw)
		expect(advisories.length).toBe(0);
	});

	// ─────────────────────────────────────────────────────────────
	// TEST 8: No advisory for other tools
	// ─────────────────────────────────────────────────────────────
	it('8. No advisory for non-update_task_status tools', async () => {
		ensureAgentSession(ARCHITECT_SESSION_ID, 'architect');
		const hook = createSelfReviewHook({}, injectAdvisory);

		await hook.toolAfter(
			{
				tool: 'edit',
				sessionID: ARCHITECT_SESSION_ID,
				callID: 'call-1',
			},
			{ args: { path: '/some/file.ts' } },
		);

		await hook.toolAfter(
			{
				tool: 'bash',
				sessionID: ARCHITECT_SESSION_ID,
				callID: 'call-2',
			},
			{ args: { command: 'echo hello' } },
		);

		expect(advisories.length).toBe(0);
	});

	// ─────────────────────────────────────────────────────────────
	// TEST 9: Tool name with single prefix stripped correctly
	// ─────────────────────────────────────────────────────────────
	it('9. Fires correctly when tool name has single prefix (e.g. opencode:update_task_status)', async () => {
		ensureAgentSession(ARCHITECT_SESSION_ID, 'architect');
		const hook = createSelfReviewHook({}, injectAdvisory);

		await hook.toolAfter(
			{
				tool: 'opencode:update_task_status',
				sessionID: ARCHITECT_SESSION_ID,
				callID: 'call-1',
			},
			{ args: { task_id: '5.1', status: 'in_progress' } },
		);

		expect(advisories.length).toBe(1);
		expect(advisories[0].message).toContain('Task 5.1');
	});

	// ─────────────────────────────────────────────────────────────
	// TEST 10: Falls back to unknown task_id when missing
	// ─────────────────────────────────────────────────────────────
	it('10. Uses "unknown" task_id when task_id is missing from args', async () => {
		ensureAgentSession(ARCHITECT_SESSION_ID, 'architect');
		const hook = createSelfReviewHook({}, injectAdvisory);

		await hook.toolAfter(
			{
				tool: 'update_task_status',
				sessionID: ARCHITECT_SESSION_ID,
				callID: 'call-1',
			},
			{ args: { status: 'in_progress' } },
		);

		expect(advisories.length).toBe(1);
		expect(advisories[0].message).toContain('Task unknown');
	});
});
