/**
 * Integration test: full-auto mode end-to-end flow.
 * Tests the full-auto intercept hook's behavior across different escalation scenarios.
 *
 * NOTE: This tests the real hook path with minimal mocking.
 * Only external dependencies (file system writes, process.exit) are mocked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { PluginConfig } from '../../src/config/schema';
import { createFullAutoInterceptHook } from '../../src/hooks/full-auto-intercept';
import {
	hasActiveFullAuto,
	resetSwarmState,
	startAgentSession,
	swarmState,
} from '../../src/state';

// Mock process.exit to prevent test termination
vi.mock('node:process', () => ({
	exit: vi.fn(),
	default: {
		...process,
		exit: vi.fn(),
	},
}));

// Mock opencodeClient for integration tests
const mockSessionId = 'mock-critic-session';
const mockClient = {
	session: {
		create: vi.fn().mockResolvedValue({ data: { id: mockSessionId } }),
		delete: vi.fn().mockResolvedValue({ data: { success: true } }),
		prompt: vi.fn().mockResolvedValue({
			data: {
				parts: [
					{
						type: 'text',
						text: `VERDICT: APPROVED
REASONING: All Phase 1 tasks verified complete. Config schema adds full_auto correctly. hasActiveFullAuto() implemented. Model validation at startup correct.
EVIDENCE_CHECKED: src/config/schema.ts, src/state.ts, src/index.ts
ANTI_PATTERNS_DETECTED: none
ESCALATION_NEEDED: NO`,
					},
				],
			},
		}),
	},
};

/**
 * Creates a full PluginConfig object with all required fields, using type casting.
 */
function makePluginConfig(fullAutoOverrides?: {
	enabled?: boolean;
	max_interactions_per_phase?: number;
	deadlock_threshold?: number;
	escalation_mode?: 'pause' | 'terminate';
	critic_model?: string;
}): PluginConfig {
	return {
		max_iterations: 5,
		qa_retry_limit: 3,
		execution_mode: 'balanced',
		inject_phase_reminders: true,
		full_auto: {
			enabled: true,
			max_interactions_per_phase: 50,
			deadlock_threshold: 3,
			escalation_mode: 'pause',
			...fullAutoOverrides,
		},
	} as PluginConfig;
}

describe('full-auto mode integration', () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await fsPromises.mkdtemp(
			path.join(os.tmpdir(), 'full-auto-test-'),
		);
		await fsPromises.mkdir(path.join(tmpDir, '.swarm'), { recursive: true });

		// Reset state between tests
		resetSwarmState();
	});

	afterEach(async () => {
		try {
			await fsPromises.rm(tmpDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
		vi.clearAllMocks();
	});

	/**
	 * Helper: create a minimal architect message in the expected format
	 */
	function makeArchitectMessage(
		text: string,
		sessionID: string,
		agent = 'architect',
	): {
		info: { role: string; agent?: string; sessionID?: string };
		parts: Array<{ type: string; text?: string }>;
	} {
		return {
			info: { role: 'user', agent, sessionID },
			parts: [{ type: 'text', text }],
		};
	}

	/**
	 * Helper: build a messages array with architect output
	 */
	function makeMessages(
		architectOutput: string,
		sessionID: string,
	): Array<{
		info: { role: string; agent?: string; sessionID?: string };
		parts: Array<{ type: string; text?: string }>;
	}> {
		return [makeArchitectMessage(architectOutput, sessionID)];
	}

	/**
	 * Helper: start a session with fullAutoMode enabled directly.
	 * Since v6.52.0, fullAutoMode initializes to false on every new session
	 * (config-seeding was removed). Enable it directly on the session object.
	 */
	function startFullAutoSession(sessionID: string): void {
		startAgentSession(sessionID, 'architect', 7200000, tmpDir);
		const session = swarmState.agentSessions.get(sessionID);
		if (session) {
			session.fullAutoMode = true;
			session.fullAutoInteractionCount = 0;
			session.fullAutoDeadlockCount = 0;
		}
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Test 1: End-to-end critic dispatch with phase completion pattern
	// ─────────────────────────────────────────────────────────────────────────

	it('1. End-to-end: architect outputs "Ready for Phase 2?" → hook detects escalation → mock critic returns APPROVED → event written', async () => {
		const sessionID = 'test-session-phase-completion';
		startFullAutoSession(sessionID);

		const config = makePluginConfig({
			enabled: true,
			critic_model: 'test-critic-model',
		});
		const hook = createFullAutoInterceptHook(config, tmpDir);

		const messages = makeMessages('Ready for Phase 2?', sessionID);
		const output = { messages };

		// Make the mock client available
		const originalOpencodeClient = swarmState.opencodeClient;
		(swarmState as any).opencodeClient = mockClient;

		// Simulate the hook execution
		await hook.messagesTransform({}, output);

		// Verify critic was invoked with correct agent name
		expect(mockClient.session.prompt).toHaveBeenCalledWith(
			expect.objectContaining({
				body: expect.objectContaining({
					agent: 'critic_oversight',
				}),
			}),
		);

		// Restore original client
		(swarmState as any).opencodeClient = originalOpencodeClient;

		// Verify the auto_oversight event was written to events.jsonl
		const eventsPath = path.join(tmpDir, '.swarm', 'events.jsonl');
		const eventsContent = await fsPromises.readFile(eventsPath, 'utf-8');
		const lines = eventsContent.trim().split('\n').filter(Boolean);

		expect(lines.length).toBeGreaterThanOrEqual(1);

		// Parse the last event (most recent)
		const lastEvent = JSON.parse(lines[lines.length - 1]);
		expect(lastEvent.type).toBe('auto_oversight');
		expect(lastEvent.interaction_mode).toBe('phase_completion');
		expect(lastEvent.architect_output).toBe('Ready for Phase 2?');
		expect(lastEvent.critic_verdict).toBe('APPROVED');
		expect(lastEvent.critic_reasoning).toContain(
			'Phase 1 tasks verified complete',
		);
		expect(lastEvent.interaction_count).toBe(1);
		expect(lastEvent.deadlock_count).toBe(0);
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Test 1b: Prefixed swarm mega_architect dispatches mega_critic_oversight
	// ─────────────────────────────────────────────────────────────────────────

	it('1b. Prefixed swarm: mega_architect → mega_critic_oversight agent in prompt', async () => {
		const sessionID = 'test-session-prefixed-mega';
		startFullAutoSession(sessionID);

		const config = makePluginConfig({
			enabled: true,
			critic_model: 'test-critic-model',
		});
		const hook = createFullAutoInterceptHook(config, tmpDir);

		// Use mega_architect agent (prefixed swarm)
		const messages = [
			{
				info: { role: 'user' as const, agent: 'mega_architect', sessionID },
				parts: [{ type: 'text' as const, text: 'Ready for Phase 2?' }],
			},
		];
		const output = { messages };

		// Make the mock client available
		const originalOpencodeClient = swarmState.opencodeClient;
		(swarmState as any).opencodeClient = mockClient;

		// Simulate the hook execution
		await hook.messagesTransform({}, output);

		// Verify critic was invoked with prefixed mega_critic_oversight agent name
		expect(mockClient.session.prompt).toHaveBeenCalledWith(
			expect.objectContaining({
				body: expect.objectContaining({
					agent: 'mega_critic_oversight',
				}),
			}),
		);

		// Restore original client
		(swarmState as any).opencodeClient = originalOpencodeClient;

		// Verify the auto_oversight event was written to events.jsonl
		const eventsPath = path.join(tmpDir, '.swarm', 'events.jsonl');
		const eventsContent = await fsPromises.readFile(eventsPath, 'utf-8');
		const lines = eventsContent.trim().split('\n').filter(Boolean);

		expect(lines.length).toBeGreaterThanOrEqual(1);

		// Parse the last event (most recent)
		const lastEvent = JSON.parse(lines[lines.length - 1]);
		expect(lastEvent.type).toBe('auto_oversight');
		expect(lastEvent.interaction_mode).toBe('phase_completion');
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Test 2: Phase completion question triggers phase_completion verdict
	// (split into independent cases to avoid brittle reset/readFile loop)
	// ─────────────────────────────────────────────────────────────────────────

	it('2a. "Ready for Phase 2?" → interaction_mode is phase_completion', async () => {
		const sessionID = 'test-session-phase-q-2a';
		startFullAutoSession(sessionID);

		const config = makePluginConfig({ enabled: true });
		const hook = createFullAutoInterceptHook(config, tmpDir);

		const pattern = 'Ready for Phase 2?';
		const messages = makeMessages(pattern, sessionID);

		const originalOpencodeClient = swarmState.opencodeClient;
		(swarmState as any).opencodeClient = mockClient;

		await hook.messagesTransform({}, { messages });

		(swarmState as any).opencodeClient = originalOpencodeClient;

		const eventsPath = path.join(tmpDir, '.swarm', 'events.jsonl');
		const eventsContent = await fsPromises.readFile(eventsPath, 'utf-8');
		const lines = eventsContent.trim().split('\n').filter(Boolean);
		const lastEvent = JSON.parse(lines[lines.length - 1]);

		expect(lastEvent.interaction_mode).toBe('phase_completion');
		expect(lastEvent.architect_output).toBe(pattern);
	});

	it('2b. "Ready for Phase N+1?" → interaction_mode is phase_completion', async () => {
		const sessionID = 'test-session-phase-q-2b';
		startFullAutoSession(sessionID);

		const config = makePluginConfig({ enabled: true });
		const hook = createFullAutoInterceptHook(config, tmpDir);

		const pattern = 'Ready for Phase N+1?';
		const messages = makeMessages(pattern, sessionID);

		const originalOpencodeClient = swarmState.opencodeClient;
		(swarmState as any).opencodeClient = mockClient;

		await hook.messagesTransform({}, { messages });

		(swarmState as any).opencodeClient = originalOpencodeClient;

		const eventsPath = path.join(tmpDir, '.swarm', 'events.jsonl');
		const eventsContent = await fsPromises.readFile(eventsPath, 'utf-8');
		const lines = eventsContent.trim().split('\n').filter(Boolean);
		const lastEvent = JSON.parse(lines[lines.length - 1]);

		expect(lastEvent.interaction_mode).toBe('phase_completion');
		expect(lastEvent.architect_output).toBe(pattern);
	});

	it('2c. "Should I proceed to the next phase?" → interaction_mode is phase_completion', async () => {
		const sessionID = 'test-session-phase-q-2c';
		startFullAutoSession(sessionID);

		const config = makePluginConfig({ enabled: true });
		const hook = createFullAutoInterceptHook(config, tmpDir);

		const pattern = 'Should I proceed to the next phase?';
		const messages = makeMessages(pattern, sessionID);

		const originalOpencodeClient = swarmState.opencodeClient;
		(swarmState as any).opencodeClient = mockClient;

		await hook.messagesTransform({}, { messages });

		(swarmState as any).opencodeClient = originalOpencodeClient;

		const eventsPath = path.join(tmpDir, '.swarm', 'events.jsonl');
		const eventsContent = await fsPromises.readFile(eventsPath, 'utf-8');
		const lines = eventsContent.trim().split('\n').filter(Boolean);
		const lastEvent = JSON.parse(lines[lines.length - 1]);

		expect(lastEvent.interaction_mode).toBe('phase_completion');
		expect(lastEvent.architect_output).toBe(pattern);
	});

	it('2d. "What would you like me to do next?" → interaction_mode is phase_completion', async () => {
		const sessionID = 'test-session-phase-q-2d';
		startFullAutoSession(sessionID);

		const config = makePluginConfig({ enabled: true });
		const hook = createFullAutoInterceptHook(config, tmpDir);

		const pattern = 'What would you like me to do next?';
		const messages = makeMessages(pattern, sessionID);

		const originalOpencodeClient = swarmState.opencodeClient;
		(swarmState as any).opencodeClient = mockClient;

		await hook.messagesTransform({}, { messages });

		(swarmState as any).opencodeClient = originalOpencodeClient;

		const eventsPath = path.join(tmpDir, '.swarm', 'events.jsonl');
		const eventsContent = await fsPromises.readFile(eventsPath, 'utf-8');
		const lines = eventsContent.trim().split('\n').filter(Boolean);
		const lastEvent = JSON.parse(lines[lines.length - 1]);

		expect(lastEvent.interaction_mode).toBe('phase_completion');
		expect(lastEvent.architect_output).toBe(pattern);
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Test 3: Technical question triggers question_resolution verdict
	// ─────────────────────────────────────────────────────────────────────────

	it('3. Technical question → interaction_mode is question_resolution', async () => {
		const sessionID = 'test-session-technical-q';
		startFullAutoSession(sessionID);

		const config = makePluginConfig({ enabled: true });
		const hook = createFullAutoInterceptHook(config, tmpDir);

		// Architect asks a technical question
		const messages = makeMessages(
			'Should I use a Map or an object for this lookup table?',
			sessionID,
		);
		await hook.messagesTransform({}, { messages });

		const eventsPath = path.join(tmpDir, '.swarm', 'events.jsonl');
		const eventsContent = await fsPromises.readFile(eventsPath, 'utf-8');
		const lines = eventsContent.trim().split('\n').filter(Boolean);
		const lastEvent = JSON.parse(lines[lines.length - 1]);

		expect(lastEvent.interaction_mode).toBe('question_resolution');
		expect(lastEvent.architect_output).toBe(
			'Should I use a Map or an object for this lookup table?',
		);
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Test 4: Product/requirements question triggers critic context for escalation
	// ─────────────────────────────────────────────────────────────────────────

	it('4. Product/requirements question → critic is invoked with question_resolution mode', async () => {
		const sessionID = 'test-session-product-q';
		startFullAutoSession(sessionID);

		const config = makePluginConfig({ enabled: true });
		const hook = createFullAutoInterceptHook(config, tmpDir);

		// Architect asks a product/requirements question
		const messages = makeMessages(
			'What color should the login button be?',
			sessionID,
		);
		await hook.messagesTransform({}, { messages });

		const eventsPath = path.join(tmpDir, '.swarm', 'events.jsonl');
		const eventsContent = await fsPromises.readFile(eventsPath, 'utf-8');
		const lines = eventsContent.trim().split('\n').filter(Boolean);
		const lastEvent = JSON.parse(lines[lines.length - 1]);

		// The critic is invoked and returns a verdict (mocked in tests without real LLM)
		expect(lastEvent.type).toBe('auto_oversight');
		expect(lastEvent.interaction_mode).toBe('question_resolution');
		expect(lastEvent.architect_output).toBe(
			'What color should the login button be?',
		);
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Test 5: Full-auto disabled → no-op handler, no events written
	// ─────────────────────────────────────────────────────────────────────────

	it('5. Full-auto disabled → messagesTransform is no-op → no events.jsonl created', async () => {
		const sessionID = 'test-session-disabled';

		startAgentSession(sessionID, 'architect', 7200000, tmpDir);

		// Config has full_auto disabled
		const config = makePluginConfig({
			enabled: false,
		});

		const hook = createFullAutoInterceptHook(config, tmpDir);

		// Even with architect output that would trigger escalation
		const messages = makeMessages('Ready for Phase 2?', sessionID);
		await hook.messagesTransform({}, { messages });

		// Verify NO events.jsonl was created (or it's empty)
		const eventsPath = path.join(tmpDir, '.swarm', 'events.jsonl');
		const exists = await fsPromises
			.access(eventsPath)
			.then(() => true)
			.catch(() => false);

		expect(exists).toBe(false);
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Test 6: No architect message → no-op
	// ─────────────────────────────────────────────────────────────────────────

	it('6. Empty messages → no event written', async () => {
		const sessionID = 'test-session-empty';
		startFullAutoSession(sessionID);

		const config = makePluginConfig({ enabled: true });
		const hook = createFullAutoInterceptHook(config, tmpDir);

		// Empty messages array
		await hook.messagesTransform({}, { messages: [] });

		const eventsPath = path.join(tmpDir, '.swarm', 'events.jsonl');
		const exists = await fsPromises
			.access(eventsPath)
			.then(() => true)
			.catch(() => false);

		expect(exists).toBe(false);
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Test 7: Non-architect message → no escalation detection
	// ─────────────────────────────────────────────────────────────────────────

	it('7. Non-architect message → no escalation triggered', async () => {
		const sessionID = 'test-session-non-architect';
		startFullAutoSession(sessionID);

		const config = makePluginConfig({ enabled: true });
		const hook = createFullAutoInterceptHook(config, tmpDir);

		// Message from a different agent (role is 'user' but agent is not architect)
		const messages = [
			{
				info: { role: 'user', agent: 'coder', sessionID },
				parts: [{ type: 'text', text: 'Ready for Phase 2?' }],
			},
		];

		await hook.messagesTransform({}, { messages });

		const eventsPath = path.join(tmpDir, '.swarm', 'events.jsonl');
		const exists = await fsPromises
			.access(eventsPath)
			.then(() => true)
			.catch(() => false);

		expect(exists).toBe(false);
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Test 8: Session without fullAutoMode → no escalation (hasActiveFullAuto returns false)
	// ─────────────────────────────────────────────────────────────────────────

	it('8. Session without fullAutoMode → hasActiveFullAuto is false → no event written', async () => {
		const sessionID = 'test-session-no-fullauto-flag';

		// Start session but do NOT set fullAutoMode
		startAgentSession(sessionID, 'architect', 7200000, tmpDir);
		// Ensure fullAutoMode is false
		const session = swarmState.agentSessions.get(sessionID);
		if (session) {
			session.fullAutoMode = false;
		}

		const config = makePluginConfig({ enabled: true });
		const hook = createFullAutoInterceptHook(config, tmpDir);

		const messages = makeMessages('Ready for Phase 2?', sessionID);
		await hook.messagesTransform({}, { messages });

		// Verify no event was written because hasActiveFullAuto returns false
		const eventsPath = path.join(tmpDir, '.swarm', 'events.jsonl');
		const exists = await fsPromises
			.access(eventsPath)
			.then(() => true)
			.catch(() => false);

		expect(exists).toBe(false);
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Test 10: Mid-sentence question marks (v1?) → no escalation
	// ─────────────────────────────────────────────────────────────────────────

	it('10. Mid-sentence question mark (version number) → no escalation triggered', async () => {
		const sessionID = 'test-session-mid-sentence';
		startFullAutoSession(sessionID);

		const config = makePluginConfig({ enabled: true });
		const hook = createFullAutoInterceptHook(config, tmpDir);

		// Version number question - should NOT trigger escalation
		const messages = makeMessages(
			'Have you considered API v1? implementation?',
			sessionID,
		);
		await hook.messagesTransform({}, { messages });

		const eventsPath = path.join(tmpDir, '.swarm', 'events.jsonl');
		const exists = await fsPromises
			.access(eventsPath)
			.then(() => true)
			.catch(() => false);

		expect(exists).toBe(false);
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Test 11: Interaction counter increments on each escalation
	// ─────────────────────────────────────────────────────────────────────────

	it('11. Interaction counter increments on each escalation', async () => {
		const sessionID = 'test-session-counter';
		startFullAutoSession(sessionID);

		const config = makePluginConfig({ enabled: true });
		const hook = createFullAutoInterceptHook(config, tmpDir);

		// First escalation
		let messages = makeMessages('Ready for Phase 2?', sessionID);
		await hook.messagesTransform({}, { messages });

		const eventsPath = path.join(tmpDir, '.swarm', 'events.jsonl');
		let eventsContent = await fsPromises.readFile(eventsPath, 'utf-8');
		let lines = eventsContent.trim().split('\n').filter(Boolean);
		let lastEvent = JSON.parse(lines[lines.length - 1]);
		expect(lastEvent.interaction_count).toBe(1);

		// Clear for second interaction
		await fsPromises.writeFile(eventsPath, '', 'utf-8');

		// Second escalation (different question to avoid deadlock detection)
		messages = makeMessages('Should I add error handling?', sessionID);
		await hook.messagesTransform({}, { messages });

		eventsContent = await fsPromises.readFile(eventsPath, 'utf-8');
		lines = eventsContent.trim().split('\n').filter(Boolean);
		lastEvent = JSON.parse(lines[lines.length - 1]);
		expect(lastEvent.interaction_count).toBe(2);
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Test 12: Deadlock detection on repeated identical questions
	// ─────────────────────────────────────────────────────────────────────────

	it('12. Repeated identical question → deadlock count increments', async () => {
		const sessionID = 'test-session-deadlock';
		startFullAutoSession(sessionID);

		const config = makePluginConfig({ enabled: true });
		const hook = createFullAutoInterceptHook(config, tmpDir);

		const question = 'Should I add error handling?';

		// First question
		let messages = makeMessages(question, sessionID);
		await hook.messagesTransform({}, { messages });

		const eventsPath = path.join(tmpDir, '.swarm', 'events.jsonl');
		let eventsContent = await fsPromises.readFile(eventsPath, 'utf-8');
		let lines = eventsContent.trim().split('\n').filter(Boolean);
		let lastEvent = JSON.parse(lines[lines.length - 1]);
		expect(lastEvent.deadlock_count).toBe(0);

		// Clear for second question
		await fsPromises.writeFile(eventsPath, '', 'utf-8');

		// Identical question (should trigger deadlock detection)
		messages = makeMessages(question, sessionID);
		await hook.messagesTransform({}, { messages });

		eventsContent = await fsPromises.readFile(eventsPath, 'utf-8');
		lines = eventsContent.trim().split('\n').filter(Boolean);
		lastEvent = JSON.parse(lines[lines.length - 1]);
		expect(lastEvent.deadlock_count).toBe(1);
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Test 13: Different question resets deadlock count
	// ─────────────────────────────────────────────────────────────────────────

	it('13. Different question → deadlock count resets to 0', async () => {
		const sessionID = 'test-session-reset-deadlock';
		startFullAutoSession(sessionID);

		const config = makePluginConfig({ enabled: true });
		const hook = createFullAutoInterceptHook(config, tmpDir);

		// First question
		let messages = makeMessages('Should I add error handling?', sessionID);
		await hook.messagesTransform({}, { messages });

		const eventsPath = path.join(tmpDir, '.swarm', 'events.jsonl');
		await fsPromises.writeFile(eventsPath, '', 'utf-8');

		// Second identical question (triggers deadlock)
		messages = makeMessages('Should I add error handling?', sessionID);
		await hook.messagesTransform({}, { messages });

		let eventsContent = await fsPromises.readFile(eventsPath, 'utf-8');
		let lines = eventsContent.trim().split('\n').filter(Boolean);
		let lastEvent = JSON.parse(lines[lines.length - 1]);
		expect(lastEvent.deadlock_count).toBe(1);

		// Clear for third question
		await fsPromises.writeFile(eventsPath, '', 'utf-8');

		// Different question (should reset deadlock count)
		messages = makeMessages('Should I add logging?', sessionID);
		await hook.messagesTransform({}, { messages });

		eventsContent = await fsPromises.readFile(eventsPath, 'utf-8');
		lines = eventsContent.trim().split('\n').filter(Boolean);
		lastEvent = JSON.parse(lines[lines.length - 1]);
		expect(lastEvent.deadlock_count).toBe(0);
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Test 14: hasActiveFullAuto returns correct value based on session fullAutoMode
	// ─────────────────────────────────────────────────────────────────────────

	it('14. hasActiveFullAuto returns true when session has fullAutoMode=true (advisory-only, no validation gate)', async () => {
		const sessionID = 'test-session-hasactive';

		// Start session without fullAutoMode
		startAgentSession(sessionID, 'architect', 7200000, tmpDir);
		expect(hasActiveFullAuto(sessionID)).toBe(false);

		// Enable fullAutoMode on session - advisory-only: validation state is ignored
		const session = swarmState.agentSessions.get(sessionID);
		session!.fullAutoMode = true;
		expect(hasActiveFullAuto(sessionID)).toBe(true);

		// Disable fullAutoMode
		session!.fullAutoMode = false;
		expect(hasActiveFullAuto(sessionID)).toBe(false);
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Test 15: createCriticAutonomousOversightAgent returns correct agent definition
	// ─────────────────────────────────────────────────────────────────────────

	it('15. createCriticAutonomousOversightAgent returns agent with correct name and prompt', async () => {
		const { createCriticAutonomousOversightAgent } = await import(
			'../../src/agents/critic'
		);

		const agent = createCriticAutonomousOversightAgent(
			'test-model',
			'some additional context',
		);

		expect(agent.name).toBe('critic_oversight');
		expect(agent.description).toContain('AUTONOMOUS OVERSIGHT');
		expect(agent.config.model).toBe('test-model');
		expect(agent.config.prompt).toContain('AUTONOMOUS OVERSIGHT');
		expect(agent.config.prompt).toContain('some additional context');
	});
});
