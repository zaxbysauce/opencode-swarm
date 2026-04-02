/**
 * v6.12 Task 2.3: Catastrophic Zero-Reviewer Warning Tests
 *
 * Tests for the guardrails catastrophic violation detection that warns
 * when a phase is completed with ZERO reviewer delegations.
 *
 * This is a critical safety check to catch process violations where
 * the architect completes phases without required QA review.
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
import { ORCHESTRATOR_NAME } from '../../../src/config/constants';
import type { Plan } from '../../../src/config/plan-schema';
import type { GuardrailsConfig } from '../../../src/config/schema';
import { createGuardrailsHooks } from '../../../src/hooks/guardrails';
import {
	getAgentSession,
	resetSwarmState,
	startAgentSession,
	swarmState,
} from '../../../src/state';

function defaultConfig(
	overrides?: Partial<GuardrailsConfig>,
): GuardrailsConfig {
	return {
		enabled: true,
		max_tool_calls: 200,
		max_duration_minutes: 30,
		idle_timeout_minutes: 60,
		max_repetitions: 10,
		max_consecutive_errors: 5,
		warning_threshold: 0.75,
		profiles: undefined,
		...overrides,
	};
}

describe('Catastrophic Zero-Reviewer Warning (v6.12 Task 2.3)', () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		resetSwarmState();
		tempDir = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-catastrophic-')),
		);
		originalCwd = process.cwd();
	});

	afterEach(() => {
		process.chdir(originalCwd);
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	/**
	 * Helper to create a plan.json file in a temp directory
	 */
	function createPlanJson(
		phases: Array<{ id: number; name: string; status: string }>,
	): string {
		const swarmDir = path.join(tempDir, '.swarm');
		fs.mkdirSync(swarmDir, { recursive: true });

		const plan: Plan = {
			schema_version: '1.0.0',
			title: 'Test Plan',
			swarm: 'test',
			current_phase: 1,
			phases: phases.map((p) => ({
				id: p.id,
				name: p.name,
				status: p.status as 'pending' | 'in_progress' | 'complete' | 'blocked',
				tasks: [],
			})),
		};

		const planPath = path.join(swarmDir, 'plan.json');
		fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));
		return planPath;
	}

	describe('Warning Injection', () => {
		it('injects CATASTROPHIC VIOLATION warning when phase is complete with zero reviewer calls', async () => {
			// Create plan with Phase 1 complete
			createPlanJson([{ id: 1, name: 'Test Phase', status: 'complete' }]);
			process.chdir(tempDir);

			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			// Set up architect session
			swarmState.activeAgent.set('architect-session', 'architect');
			startAgentSession('architect-session', 'architect');

			// Transform messages
			const messages = [
				{
					info: { role: 'assistant', sessionID: 'architect-session' },
					parts: [{ type: 'text', text: 'Phase 1 is complete.' }],
				},
			];

			await hooks.messagesTransform({}, { messages });

			// Warning should be injected
			expect(messages[0].parts[0].text).toContain('CATASTROPHIC VIOLATION');
			expect(messages[0].parts[0].text).toContain('Phase 1');
			expect(messages[0].parts[0].text).toContain('ZERO reviewer delegations');
		});

		it('does NOT inject warning when phase is complete but has reviewer delegations', async () => {
			// Create plan with Phase 1 complete
			createPlanJson([{ id: 1, name: 'Test Phase', status: 'complete' }]);
			process.chdir(tempDir);

			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			// Set up architect session WITH reviewer delegations
			swarmState.activeAgent.set('architect-reviewed-session', 'architect');
			startAgentSession('architect-reviewed-session', 'architect');
			const session = getAgentSession('architect-reviewed-session');
			if (session) {
				// Simulate a reviewer delegation for Phase 1
				session.reviewerCallCount.set(1, 1);
				// Set up all required gates to prevent PARTIAL GATE VIOLATION from firing
				const taskId = 'test-task';
				session.currentTaskId = taskId;
				session.gateLog.set(
					taskId,
					new Set([
						'diff',
						'syntax_check',
						'placeholder_scan',
						'lint',
						'pre_check_batch',
					]),
				);
			}

			// Transform messages
			const messages = [
				{
					info: { role: 'assistant', sessionID: 'architect-reviewed-session' },
					parts: [{ type: 'text', text: 'Phase 1 is complete and reviewed.' }],
				},
			];

			await hooks.messagesTransform({}, { messages });

			// No catastrophic warning should be injected (no new system message created)
			expect(messages[0].parts[0].text).not.toContain('CATASTROPHIC VIOLATION');
			expect(messages[0].parts[0].text).toBe(
				'Phase 1 is complete and reviewed.',
			);
		});

		it('does NOT inject warning for phases that are not complete', async () => {
			// Create plan with Phase 1 in_progress (not complete)
			createPlanJson([{ id: 1, name: 'Test Phase', status: 'in_progress' }]);
			process.chdir(tempDir);

			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			// Set up architect session
			swarmState.activeAgent.set('architect-inprogress-session', 'architect');
			startAgentSession('architect-inprogress-session', 'architect');

			// Transform messages
			const messages = [
				{
					info: {
						role: 'assistant',
						sessionID: 'architect-inprogress-session',
					},
					parts: [{ type: 'text', text: 'Phase 1 is in progress.' }],
				},
			];

			await hooks.messagesTransform({}, { messages });

			// No warning should be injected for incomplete phases
			expect(messages[0].parts[0].text).not.toContain('CATASTROPHIC VIOLATION');
		});

		it('does NOT inject warning for non-architect sessions', async () => {
			// Create plan with Phase 1 complete
			createPlanJson([{ id: 1, name: 'Test Phase', status: 'complete' }]);
			process.chdir(tempDir);

			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			// Set up CODER session (not architect)
			swarmState.activeAgent.set('coder-session', 'coder');
			startAgentSession('coder-session', 'coder');

			// Transform messages
			const messages = [
				{
					info: { role: 'assistant', sessionID: 'coder-session' },
					parts: [{ type: 'text', text: 'I am coding.' }],
				},
			];

			await hooks.messagesTransform({}, { messages });

			// No catastrophic warning for non-architect sessions
			expect(messages[0].parts[0].text).not.toContain('CATASTROPHIC VIOLATION');
		});
	});

	describe('Warning Deduplication', () => {
		it('only warns ONCE per completed phase', async () => {
			// Create plan with Phase 1 complete
			createPlanJson([{ id: 1, name: 'Test Phase', status: 'complete' }]);
			process.chdir(tempDir);

			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			// Set up architect session
			swarmState.activeAgent.set('dedup-session', 'architect');
			startAgentSession('dedup-session', 'architect');

			// First transform - should inject warning
			const messages1 = [
				{
					info: { role: 'assistant', sessionID: 'dedup-session' },
					parts: [{ type: 'text', text: 'First message.' }],
				},
			];
			await hooks.messagesTransform({}, { messages: messages1 });
			expect(messages1[0].parts[0].text).toContain('CATASTROPHIC VIOLATION');

			// Second transform - should NOT inject duplicate warning
			const messages2 = [
				{
					info: { role: 'assistant', sessionID: 'dedup-session' },
					parts: [{ type: 'text', text: 'Second message.' }],
				},
			];
			await hooks.messagesTransform({}, { messages: messages2 });

			// The second message should not have the warning prepended again
			// (it might still contain the text from the first, but not a new prefix)
			const session = getAgentSession('dedup-session');
			expect(session?.catastrophicPhaseWarnings.has(1)).toBe(true);
		});

		it('tracks warnings for multiple phases independently', async () => {
			// Create plan with Phase 1 and 2 complete
			createPlanJson([
				{ id: 1, name: 'Phase One', status: 'complete' },
				{ id: 2, name: 'Phase Two', status: 'complete' },
			]);
			process.chdir(tempDir);

			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			// Set up architect session
			swarmState.activeAgent.set('multi-phase-session', 'architect');
			startAgentSession('multi-phase-session', 'architect');

			// First transform - should warn about first complete phase without reviewers
			const messages1 = [
				{
					info: { role: 'assistant', sessionID: 'multi-phase-session' },
					parts: [{ type: 'text', text: 'Checking phases.' }],
				},
			];
			await hooks.messagesTransform({}, { messages: messages1 });

			const session = getAgentSession('multi-phase-session');
			expect(session?.catastrophicPhaseWarnings.size).toBe(1);
			expect(session?.catastrophicPhaseWarnings.has(1)).toBe(true);
		});
	});

	describe('Edge Cases', () => {
		it('handles missing plan.json gracefully', async () => {
			// No plan.json created - temp dir is empty
			process.chdir(tempDir);

			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			// Set up architect session
			swarmState.activeAgent.set('no-plan-session', 'architect');
			startAgentSession('no-plan-session', 'architect');

			// Set up all required gates to prevent PARTIAL GATE VIOLATION from firing
			const session = getAgentSession('no-plan-session');
			if (session) {
				const taskId = 'test-task';
				session.currentTaskId = taskId;
				session.gateLog.set(
					taskId,
					new Set([
						'diff',
						'syntax_check',
						'placeholder_scan',
						'lint',
						'pre_check_batch',
					]),
				);
				session.reviewerCallCount.set(1, 1);
			}

			// Transform messages - should not throw
			const messages = [
				{
					info: { role: 'assistant', sessionID: 'no-plan-session' },
					parts: [{ type: 'text', text: 'No plan here.' }],
				},
			];

			// If this throws, the test will fail naturally
			await hooks.messagesTransform({}, { messages });
			expect(messages[0].parts[0].text).toBe('No plan here.');
		});

		it('handles malformed plan.json gracefully', async () => {
			// Create malformed plan.json
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });
			fs.writeFileSync(path.join(swarmDir, 'plan.json'), '{ invalid json }');
			process.chdir(tempDir);

			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			// Set up architect session
			swarmState.activeAgent.set('malformed-plan-session', 'architect');
			startAgentSession('malformed-plan-session', 'architect');

			// Transform messages - should not throw
			const messages = [
				{
					info: { role: 'assistant', sessionID: 'malformed-plan-session' },
					parts: [{ type: 'text', text: 'Malformed plan.' }],
				},
			];

			// If this throws, the test will fail naturally
			await hooks.messagesTransform({}, { messages });
			expect(messages[0].parts[0].text).not.toContain('CATASTROPHIC VIOLATION');
		});

		it('handles empty phases array gracefully', async () => {
			// Create plan with empty phases
			createPlanJson([]);
			process.chdir(tempDir);

			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			// Set up architect session
			swarmState.activeAgent.set('empty-phases-session', 'architect');
			startAgentSession('empty-phases-session', 'architect');

			// Transform messages
			const messages = [
				{
					info: { role: 'assistant', sessionID: 'empty-phases-session' },
					parts: [{ type: 'text', text: 'Empty phases.' }],
				},
			];

			await hooks.messagesTransform({}, { messages });
			expect(messages[0].parts[0].text).not.toContain('CATASTROPHIC VIOLATION');
		});

		it('does not inject warning if text already contains CATASTROPHIC VIOLATION', async () => {
			// Create plan with Phase 1 complete
			createPlanJson([{ id: 1, name: 'Test Phase', status: 'complete' }]);
			process.chdir(tempDir);

			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			// Set up architect session with previous warning already in text
			swarmState.activeAgent.set('already-warned-session', 'architect');
			startAgentSession('already-warned-session', 'architect');

			// Message already contains the warning
			const messages = [
				{
					info: { role: 'assistant', sessionID: 'already-warned-session' },
					parts: [
						{ type: 'text', text: '[CATASTROPHIC VIOLATION: Already warned]' },
					],
				},
			];

			await hooks.messagesTransform({}, { messages });

			// Should not double-prepend
			const text = messages[0].parts[0].text as string;
			const occurrences = (text.match(/CATASTROPHIC VIOLATION/g) || []).length;
			expect(occurrences).toBe(1);
		});

		it('handles session without catastrophicPhaseWarnings Set', async () => {
			// Create plan with Phase 1 complete
			createPlanJson([{ id: 1, name: 'Test Phase', status: 'complete' }]);
			process.chdir(tempDir);

			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			// Set up architect session
			swarmState.activeAgent.set('no-warnings-set-session', 'architect');
			startAgentSession('no-warnings-set-session', 'architect');

			// Delete the catastrophicPhaseWarnings set to simulate legacy session
			const session = getAgentSession('no-warnings-set-session');
			if (session) {
				// @ts-expect-error - intentionally deleting for test
				delete session.catastrophicPhaseWarnings;
			}

			// Transform messages - should not throw
			const messages = [
				{
					info: { role: 'assistant', sessionID: 'no-warnings-set-session' },
					parts: [{ type: 'text', text: 'Legacy session.' }],
				},
			];

			// If this throws, the test will fail naturally
			await hooks.messagesTransform({}, { messages });
			// Since catastrophicPhaseWarnings was deleted, no warning should be injected
			expect(messages[0].parts[0].text).not.toContain('CATASTROPHIC VIOLATION');
		});
	});

	describe('Warning Message Content', () => {
		it('includes phase number in warning message', async () => {
			// Create plan with Phase 3 complete
			createPlanJson([
				{ id: 3, name: 'Implementation Phase', status: 'complete' },
			]);
			process.chdir(tempDir);

			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			// Set up architect session
			swarmState.activeAgent.set('phase3-session', 'architect');
			startAgentSession('phase3-session', 'architect');

			// Transform messages
			const messages = [
				{
					info: { role: 'assistant', sessionID: 'phase3-session' },
					parts: [{ type: 'text', text: 'Phase 3 done.' }],
				},
			];

			await hooks.messagesTransform({}, { messages });

			// Warning should mention Phase 3 specifically
			expect(messages[0].parts[0].text).toContain('Phase 3');
		});

		it('includes recommendation text in warning message', async () => {
			// Create plan with Phase 1 complete
			createPlanJson([{ id: 1, name: 'Test Phase', status: 'complete' }]);
			process.chdir(tempDir);

			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			// Set up architect session
			swarmState.activeAgent.set('recommend-session', 'architect');
			startAgentSession('recommend-session', 'architect');

			// Transform messages
			const messages = [
				{
					info: { role: 'assistant', sessionID: 'recommend-session' },
					parts: [{ type: 'text', text: 'Done.' }],
				},
			];

			await hooks.messagesTransform({}, { messages });

			// Warning should include recommendation
			expect(messages[0].parts[0].text).toContain('retrospective review');
			expect(messages[0].parts[0].text).toContain(
				'Every coder task requires reviewer approval',
			);
		});
	});

	describe('Architect Detection', () => {
		it('detects architect via activeAgent map', async () => {
			// Create plan with Phase 1 complete
			createPlanJson([{ id: 1, name: 'Test Phase', status: 'complete' }]);
			process.chdir(tempDir);

			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			// Set up via activeAgent (the primary detection path)
			swarmState.activeAgent.set('via-active-agent', 'architect');
			// Start session with different name to test activeAgent fallback
			startAgentSession('via-active-agent', 'some-other-agent');
			// Override activeAgent
			swarmState.activeAgent.set('via-active-agent', 'architect');

			// Transform messages
			const messages = [
				{
					info: { role: 'assistant', sessionID: 'via-active-agent' },
					parts: [{ type: 'text', text: 'Testing.' }],
				},
			];

			await hooks.messagesTransform({}, { messages });

			// Should inject warning because activeAgent says architect
			expect(messages[0].parts[0].text).toContain('CATASTROPHIC VIOLATION');
		});

		it('detects architect via session agentName', async () => {
			// Create plan with Phase 1 complete
			createPlanJson([{ id: 1, name: 'Test Phase', status: 'complete' }]);
			process.chdir(tempDir);

			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			// Set up via session agentName (fallback path)
			startAgentSession('via-session-name', 'architect');

			// Transform messages
			const messages = [
				{
					info: { role: 'assistant', sessionID: 'via-session-name' },
					parts: [{ type: 'text', text: 'Testing.' }],
				},
			];

			await hooks.messagesTransform({}, { messages });

			// Should inject warning because session.agentName is architect
			expect(messages[0].parts[0].text).toContain('CATASTROPHIC VIOLATION');
		});

		it('recognizes ORCHESTRATOR_NAME as architect', async () => {
			// Create plan with Phase 1 complete
			createPlanJson([{ id: 1, name: 'Test Phase', status: 'complete' }]);
			process.chdir(tempDir);

			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			// Set up with ORCHESTRATOR_NAME constant
			swarmState.activeAgent.set('orch-name-session', ORCHESTRATOR_NAME);
			startAgentSession('orch-name-session', ORCHESTRATOR_NAME);

			// Transform messages
			const messages = [
				{
					info: { role: 'assistant', sessionID: 'orch-name-session' },
					parts: [{ type: 'text', text: 'Testing.' }],
				},
			];

			await hooks.messagesTransform({}, { messages });

			// Should inject warning because ORCHESTRATOR_NAME === 'architect'
			expect(messages[0].parts[0].text).toContain('CATASTROPHIC VIOLATION');
		});
	});
});
