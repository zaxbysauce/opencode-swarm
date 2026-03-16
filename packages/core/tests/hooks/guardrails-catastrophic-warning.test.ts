import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ORCHESTRATOR_NAME } from '../../src/config/constants';
import { createGuardrailsHooks } from '../../src/hooks/guardrails';
import { resetSwarmState, swarmState, startAgentSession, getAgentSession } from '../../src/state';
import type { GuardrailsConfig } from '../../src/config/schema';
import type { Plan } from '../../src/config/plan-schema';

function defaultConfig(overrides?: Partial<GuardrailsConfig>): GuardrailsConfig {
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
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-catastrophic-'));
		originalCwd = process.cwd();
	});

	afterEach(() => {
		process.chdir(originalCwd);
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	function createPlanJson(phases: Array<{ id: number; name: string; status: string }>): string {
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
			createPlanJson([{ id: 1, name: 'Test Phase', status: 'complete' }]);
			process.chdir(tempDir);

			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			swarmState.activeAgent.set('architect-session', 'architect');
			startAgentSession('architect-session', 'architect');

			const messages = [{
				info: { role: 'assistant', sessionID: 'architect-session' },
				parts: [{ type: 'text', text: 'Phase 1 is complete.' }],
			}];

			await hooks.messagesTransform({}, { messages });

			expect(messages[0].parts[0].text).toContain('CATASTROPHIC VIOLATION');
			expect(messages[0].parts[0].text).toContain('Phase 1');
			expect(messages[0].parts[0].text).toContain('ZERO reviewer delegations');
		});

		it('does NOT inject warning when phase is complete but has reviewer delegations', async () => {
			createPlanJson([{ id: 1, name: 'Test Phase', status: 'complete' }]);
			process.chdir(tempDir);

			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			swarmState.activeAgent.set('architect-reviewed-session', 'architect');
			startAgentSession('architect-reviewed-session', 'architect');
			const session = getAgentSession('architect-reviewed-session');
			if (session) {
				session.reviewerCallCount.set(1, 1);
				const taskId = 'test-task';
				session.currentTaskId = taskId;
				session.gateLog.set(taskId, new Set(['diff', 'syntax_check', 'placeholder_scan', 'lint', 'pre_check_batch']));
			}

			const messages = [{
				info: { role: 'assistant', sessionID: 'architect-reviewed-session' },
				parts: [{ type: 'text', text: 'Phase 1 is complete and reviewed.' }],
			}];

			await hooks.messagesTransform({}, { messages });

			expect(messages[0].parts[0].text).not.toContain('CATASTROPHIC VIOLATION');
			expect(messages[0].parts[0].text).toBe('Phase 1 is complete and reviewed.');
		});

		it('does NOT inject warning for phases that are not complete', async () => {
			createPlanJson([{ id: 1, name: 'Test Phase', status: 'in_progress' }]);
			process.chdir(tempDir);

			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			swarmState.activeAgent.set('architect-inprogress-session', 'architect');
			startAgentSession('architect-inprogress-session', 'architect');

			const messages = [{
				info: { role: 'assistant', sessionID: 'architect-inprogress-session' },
				parts: [{ type: 'text', text: 'Phase 1 is in progress.' }],
			}];

			await hooks.messagesTransform({}, { messages });

			expect(messages[0].parts[0].text).not.toContain('CATASTROPHIC VIOLATION');
		});

		it('does NOT inject warning for non-architect sessions', async () => {
			createPlanJson([{ id: 1, name: 'Test Phase', status: 'complete' }]);
			process.chdir(tempDir);

			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			swarmState.activeAgent.set('coder-session', 'coder');
			startAgentSession('coder-session', 'coder');

			const messages = [{
				info: { role: 'assistant', sessionID: 'coder-session' },
				parts: [{ type: 'text', text: 'I am coding.' }],
			}];

			await hooks.messagesTransform({}, { messages });

			expect(messages[0].parts[0].text).not.toContain('CATASTROPHIC VIOLATION');
		});
	});

	describe('Warning Deduplication', () => {
		it('only warns ONCE per completed phase', async () => {
			createPlanJson([{ id: 1, name: 'Test Phase', status: 'complete' }]);
			process.chdir(tempDir);

			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			swarmState.activeAgent.set('dedup-session', 'architect');
			startAgentSession('dedup-session', 'architect');

			const messages1 = [{
				info: { role: 'assistant', sessionID: 'dedup-session' },
				parts: [{ type: 'text', text: 'First message.' }],
			}];
			await hooks.messagesTransform({}, { messages: messages1 });
			expect(messages1[0].parts[0].text).toContain('CATASTROPHIC VIOLATION');

			const messages2 = [{
				info: { role: 'assistant', sessionID: 'dedup-session' },
				parts: [{ type: 'text', text: 'Second message.' }],
			}];
			await hooks.messagesTransform({}, { messages: messages2 });

			const session = getAgentSession('dedup-session');
			expect(session?.catastrophicPhaseWarnings.has(1)).toBe(true);
		});

		it('tracks warnings for multiple phases independently', async () => {
			createPlanJson([
				{ id: 1, name: 'Phase One', status: 'complete' },
				{ id: 2, name: 'Phase Two', status: 'complete' },
			]);
			process.chdir(tempDir);

			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			swarmState.activeAgent.set('multi-phase-session', 'architect');
			startAgentSession('multi-phase-session', 'architect');

			const messages1 = [{
				info: { role: 'assistant', sessionID: 'multi-phase-session' },
				parts: [{ type: 'text', text: 'Checking phases.' }],
			}];
			await hooks.messagesTransform({}, { messages: messages1 });

			const session = getAgentSession('multi-phase-session');
			expect(session?.catastrophicPhaseWarnings.size).toBe(1);
			expect(session?.catastrophicPhaseWarnings.has(1)).toBe(true);
		});
	});

	describe('Edge Cases', () => {
		it('handles missing plan.json gracefully', async () => {
			process.chdir(tempDir);

			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			swarmState.activeAgent.set('no-plan-session', 'architect');
			startAgentSession('no-plan-session', 'architect');

			const session = getAgentSession('no-plan-session');
			if (session) {
				const taskId = 'test-task';
				session.currentTaskId = taskId;
				session.gateLog.set(taskId, new Set(['diff', 'syntax_check', 'placeholder_scan', 'lint', 'pre_check_batch']));
				session.reviewerCallCount.set(1, 1);
			}

			const messages = [{
				info: { role: 'assistant', sessionID: 'no-plan-session' },
				parts: [{ type: 'text', text: 'No plan here.' }],
			}];

			await hooks.messagesTransform({}, { messages });
			expect(messages[0].parts[0].text).toBe('No plan here.');
		});

		it('handles malformed plan.json gracefully', async () => {
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });
			fs.writeFileSync(path.join(swarmDir, 'plan.json'), '{ invalid json }');
			process.chdir(tempDir);

			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			swarmState.activeAgent.set('malformed-plan-session', 'architect');
			startAgentSession('malformed-plan-session', 'architect');

			const messages = [{
				info: { role: 'assistant', sessionID: 'malformed-plan-session' },
				parts: [{ type: 'text', text: 'Malformed plan.' }],
			}];

			await hooks.messagesTransform({}, { messages });
			expect(messages[0].parts[0].text).not.toContain('CATASTROPHIC VIOLATION');
		});

		it('handles empty phases array gracefully', async () => {
			createPlanJson([]);
			process.chdir(tempDir);

			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			swarmState.activeAgent.set('empty-phases-session', 'architect');
			startAgentSession('empty-phases-session', 'architect');

			const messages = [{
				info: { role: 'assistant', sessionID: 'empty-phases-session' },
				parts: [{ type: 'text', text: 'Empty phases.' }],
			}];

			await hooks.messagesTransform({}, { messages });
			expect(messages[0].parts[0].text).not.toContain('CATASTROPHIC VIOLATION');
		});
	});

	describe('Architect Detection', () => {
		it('detects architect via activeAgent map', async () => {
			createPlanJson([{ id: 1, name: 'Test Phase', status: 'complete' }]);
			process.chdir(tempDir);

			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			swarmState.activeAgent.set('via-active-agent', 'architect');
			startAgentSession('via-active-agent', 'some-other-agent');
			swarmState.activeAgent.set('via-active-agent', 'architect');

			const messages = [{
				info: { role: 'assistant', sessionID: 'via-active-agent' },
				parts: [{ type: 'text', text: 'Testing.' }],
			}];

			await hooks.messagesTransform({}, { messages });

			expect(messages[0].parts[0].text).toContain('CATASTROPHIC VIOLATION');
		});

		it('detects architect via session agentName', async () => {
			createPlanJson([{ id: 1, name: 'Test Phase', status: 'complete' }]);
			process.chdir(tempDir);

			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			startAgentSession('via-session-name', 'architect');

			const messages = [{
				info: { role: 'assistant', sessionID: 'via-session-name' },
				parts: [{ type: 'text', text: 'Testing.' }],
			}];

			await hooks.messagesTransform({}, { messages });

			expect(messages[0].parts[0].text).toContain('CATASTROPHIC VIOLATION');
		});

		it('recognizes ORCHESTRATOR_NAME as architect', async () => {
			createPlanJson([{ id: 1, name: 'Test Phase', status: 'complete' }]);
			process.chdir(tempDir);

			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			swarmState.activeAgent.set('orch-name-session', ORCHESTRATOR_NAME);
			startAgentSession('orch-name-session', ORCHESTRATOR_NAME);

			const messages = [{
				info: { role: 'assistant', sessionID: 'orch-name-session' },
				parts: [{ type: 'text', text: 'Testing.' }],
			}];

			await hooks.messagesTransform({}, { messages });

			expect(messages[0].parts[0].text).toContain('CATASTROPHIC VIOLATION');
		});
	});
});
