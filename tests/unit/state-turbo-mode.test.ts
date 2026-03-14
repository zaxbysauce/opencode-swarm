import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
	ensureAgentSession,
	getAgentSession,
	resetSwarmState,
	startAgentSession,
} from '../../src/state';

describe('Turbo Mode (Task 3.10)', () => {
	const sessionId = 'test-session-turbo';

	beforeEach(() => {
		resetSwarmState();
	});

	afterEach(() => {
		resetSwarmState();
	});

	describe('turboMode property initialization', () => {
		it('should initialize turboMode to false on new session via startAgentSession', () => {
			startAgentSession(sessionId, 'mega_coder');
			const session = getAgentSession(sessionId);

			expect(session).toBeDefined();
			expect(session!.turboMode).toBe(false);
		});

		it('should initialize turboMode to false on new session via ensureAgentSession', () => {
			ensureAgentSession(sessionId, 'mega_coder');
			const session = getAgentSession(sessionId);

			expect(session).toBeDefined();
			expect(session!.turboMode).toBe(false);
		});

		it('should have turboMode as boolean type', () => {
			startAgentSession(sessionId, 'mega_coder');
			const session = getAgentSession(sessionId)!;

			expect(typeof session.turboMode).toBe('boolean');
		});
	});

	describe('turboMode migration safety', () => {
		it('should initialize turboMode to false when session exists but turboMode is undefined', () => {
			// Simulate an old session without turboMode field
			// Create session first
			startAgentSession(sessionId, 'mega_coder');
			const session = getAgentSession(sessionId)!;

			// Manually delete turboMode to simulate old state
			// @ts-expect-error - intentionally removing property to test migration
			delete session.turboMode;

			// Call ensureAgentSession which should migrate the field
			ensureAgentSession(sessionId, 'mega_coder');
			const migratedSession = getAgentSession(sessionId);

			expect(migratedSession).toBeDefined();
			expect(migratedSession!.turboMode).toBe(false);
		});
	});

	describe('turboMode mutation', () => {
		it('should allow setting turboMode to true', () => {
			startAgentSession(sessionId, 'mega_coder');
			const session = getAgentSession(sessionId)!;

			session.turboMode = true;

			expect(session.turboMode).toBe(true);
		});

		it('should allow toggling turboMode from false to true and back', () => {
			startAgentSession(sessionId, 'mega_coder');
			const session = getAgentSession(sessionId)!;

			// Initially false
			expect(session.turboMode).toBe(false);

			// Set to true
			session.turboMode = true;
			expect(session.turboMode).toBe(true);

			// Toggle back to false
			session.turboMode = false;
			expect(session.turboMode).toBe(false);
		});

		it('should persist turboMode across ensureAgentSession calls', () => {
			startAgentSession(sessionId, 'mega_coder');
			const session = getAgentSession(sessionId)!;

			// Set turboMode to true
			session.turboMode = true;
			expect(session.turboMode).toBe(true);

			// Call ensureAgentSession again (simulating new activity)
			ensureAgentSession(sessionId, 'mega_coder');
			const sessionAfter = getAgentSession(sessionId)!;

			// turboMode should persist
			expect(sessionAfter.turboMode).toBe(true);
		});
	});

	describe('turboMode interface definition', () => {
		it('should include turboMode in AgentSessionState interface', () => {
			// This test verifies the interface includes turboMode
			startAgentSession(sessionId, 'mega_coder');
			const session = getAgentSession(sessionId)!;

			// Verify turboMode exists and is accessible
			const hasTurboMode = 'turboMode' in session;
			expect(hasTurboMode).toBe(true);
		});
	});
});
