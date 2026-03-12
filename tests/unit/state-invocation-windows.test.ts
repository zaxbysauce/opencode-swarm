import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ORCHESTRATOR_NAME } from '../../src/config/constants';
import {
	beginInvocation,
	ensureAgentSession,
	getActiveWindow,
	pruneOldWindows,
	resetSwarmState,
	swarmState,
} from '../../src/state';

describe('Invocation Windows', () => {
	const sessionId = 'test-session';

	beforeEach(() => {
		resetSwarmState();
	});

	afterEach(() => {
		resetSwarmState();
	});

	it('should increment invocation ID per agent type', () => {
		// Create session with mega_coder
		ensureAgentSession(sessionId, 'mega_coder');

		// Call beginInvocation 3 times for mega_coder → IDs should be 1, 2, 3
		const window1 = beginInvocation(sessionId, 'mega_coder');
		expect(window1).toBeDefined();
		expect(window1!.id).toBe(1);

		const window2 = beginInvocation(sessionId, 'mega_coder');
		expect(window2).toBeDefined();
		expect(window2!.id).toBe(2);

		const window3 = beginInvocation(sessionId, 'mega_coder');
		expect(window3).toBeDefined();
		expect(window3!.id).toBe(3);

		// Call beginInvocation once for mega_reviewer → ID should be 1 (different agent starts fresh)
		const reviewerWindow = beginInvocation(sessionId, 'mega_reviewer');
		expect(reviewerWindow).toBeDefined();
		expect(reviewerWindow!.id).toBe(1);

		// Call beginInvocation again for mega_coder → ID should be 4
		const window4 = beginInvocation(sessionId, 'mega_coder');
		expect(window4).toBeDefined();
		expect(window4!.id).toBe(4);
	});

	it('should return null for architect (unlimited)', () => {
		// Create session with architect
		ensureAgentSession(sessionId, ORCHESTRATOR_NAME);

		// Call beginInvocation with ORCHESTRATOR_NAME → should return null
		const architectWindow = beginInvocation(sessionId, ORCHESTRATOR_NAME);
		expect(architectWindow).toBeNull();

		// Also test with prefixed 'mega_architect' → should also return null
		const prefixedArchitectWindow = beginInvocation(sessionId, 'mega_architect');
		expect(prefixedArchitectWindow).toBeNull();
	});

	it('should create isolated budget counters per window', () => {
		// Create session, begin invocation for mega_coder
		ensureAgentSession(sessionId, 'mega_coder');
		const window1 = beginInvocation(sessionId, 'mega_coder');

		// Verify window1 starts at toolCalls=0, consecutiveErrors=0, hardLimitHit=false
		expect(window1).toBeDefined();
		expect(window1!.toolCalls).toBe(0);
		expect(window1!.consecutiveErrors).toBe(0);
		expect(window1!.hardLimitHit).toBe(false);

		// Mutate window1: toolCalls=150, consecutiveErrors=3
		window1!.toolCalls = 150;
		window1!.consecutiveErrors = 3;
		window1!.hardLimitHit = true;

		// Begin second invocation for mega_coder
		const window2 = beginInvocation(sessionId, 'mega_coder');

		// Verify window2 starts fresh: toolCalls=0, consecutiveErrors=0
		expect(window2).toBeDefined();
		expect(window2!.toolCalls).toBe(0);
		expect(window2!.consecutiveErrors).toBe(0);
		expect(window2!.hardLimitHit).toBe(false);
	});

	it('should retrieve active window correctly', () => {
		// Create session for mega_coder, begin invocation
		ensureAgentSession(sessionId, 'mega_coder');
		beginInvocation(sessionId, 'mega_coder');

		// getActiveWindow should return defined window with agentName='coder', id=1
		const activeWindow = getActiveWindow(sessionId);
		expect(activeWindow).toBeDefined();
		expect(activeWindow!.agentName).toBe('coder');
		expect(activeWindow!.id).toBe(1);
	});

	it('should return undefined for architect in getActiveWindow', () => {
		// Create session for ORCHESTRATOR_NAME
		ensureAgentSession(sessionId, ORCHESTRATOR_NAME);

		// getActiveWindow should return undefined (no window for architect)
		const activeWindow = getActiveWindow(sessionId);
		expect(activeWindow).toBeUndefined();
	});

	it('should prune windows older than max age', () => {
		// Create session for mega_coder
		ensureAgentSession(sessionId, 'mega_coder');

		// Begin 3 invocations
		const window1 = beginInvocation(sessionId, 'mega_coder');
		const window2 = beginInvocation(sessionId, 'mega_coder');
		const window3 = beginInvocation(sessionId, 'mega_coder');

		expect(window1).toBeDefined();
		expect(window2).toBeDefined();
		expect(window3).toBeDefined();

		// Manually backdate window1 to 30 hours ago, window2 to 20 hours ago
		const now = Date.now();
		const session = swarmState.agentSessions.get(sessionId)!;
		session.windows['coder:1'].startedAtMs = now - 30 * 60 * 60 * 1000; // 30 hours ago
		session.windows['coder:2'].startedAtMs = now - 20 * 60 * 60 * 1000; // 20 hours ago

		// Call pruneOldWindows(sessionId, 24 * 60 * 60 * 1000, 100)
		pruneOldWindows(sessionId, 24 * 60 * 60 * 1000, 100);

		// Verify: window 'coder:1' removed (>24h), 'coder:2' kept (<24h), 'coder:3' kept (recent)
		// Total remaining: 2 windows
		const remainingKeys = Object.keys(session.windows);
		expect(remainingKeys).toContain('coder:2');
		expect(remainingKeys).toContain('coder:3');
		expect(remainingKeys).not.toContain('coder:1');
		expect(remainingKeys.length).toBe(2);
	});

	it('should prune windows beyond max count', () => {
		// Create session for mega_coder
		ensureAgentSession(sessionId, 'mega_coder');

		// Begin 60 invocations in a loop
		for (let i = 0; i < 60; i++) {
			beginInvocation(sessionId, 'mega_coder');
		}

		// Verify Object.keys(session.windows).length <= 50 (auto-pruned during beginInvocation)
		const session = swarmState.agentSessions.get(sessionId)!;
		const windowCount = Object.keys(session.windows).length;
		expect(windowCount).toBeLessThanOrEqual(50);
	});

	it('should maintain window state across agent switches', () => {
		// Create session for mega_coder, begin invocation, set toolCalls=100
		ensureAgentSession(sessionId, 'mega_coder');
		const window1 = beginInvocation(sessionId, 'mega_coder');
		window1!.toolCalls = 100;

		// Switch to mega_reviewer (ensureAgentSession), begin invocation, set toolCalls=20
		ensureAgentSession(sessionId, 'mega_reviewer');
		const reviewerWindow = beginInvocation(sessionId, 'mega_reviewer');
		reviewerWindow!.toolCalls = 20;

		// Switch back to mega_coder (ensureAgentSession)
		ensureAgentSession(sessionId, 'mega_coder');

		// Begin new invocation for mega_coder
		const newCoderWindow = beginInvocation(sessionId, 'mega_coder');

		// getActiveWindow should return new coder window with toolCalls=0 (fresh)
		const activeWindow = getActiveWindow(sessionId);
		expect(activeWindow).toBeDefined();
		expect(activeWindow!.toolCalls).toBe(0);
		expect(activeWindow!.id).toBe(2);

		// Old window at session.windows['coder:1'] should still have toolCalls=100
		const session = swarmState.agentSessions.get(sessionId)!;
		expect(session.windows['coder:1'].toolCalls).toBe(100);
	});
});
