import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ORCHESTRATOR_NAME } from '../../../src/config/constants.js';
import type { GuardrailsConfig } from '../../../src/config/schema.js';
import { createGuardrailsHooks } from '../../../src/hooks/guardrails.js';
import {
	beginInvocation,
	getAgentSession,
	resetSwarmState,
	startAgentSession,
	swarmState,
} from '../../../src/state.js';

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

function createTempPlan(tempDir: string, currentPhase = 1): void {
	const swarmDir = path.join(tempDir, '.swarm');
	fs.mkdirSync(swarmDir, { recursive: true });
	const plan = {
		schema_version: '1.0.0',
		title: 'Test Plan',
		swarm: 'mega',
		current_phase: currentPhase,
		phases: [
			{
				id: currentPhase,
				name: `Phase ${currentPhase}`,
				status: 'in_progress',
				tasks: [],
			},
		],
	};
	fs.writeFileSync(
		path.join(swarmDir, 'plan.json'),
		JSON.stringify(plan, null, 2),
	);
}

describe('v6.17 Task 9.3/9.4: Guardrails per-task enforcement', () => {
	// Store original cwd before any tests run
	const originalCwd = process.cwd();
	let tempDir: string;

	beforeEach(() => {
		resetSwarmState();
		tempDir = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), 'guardrails-test-')),
		);
		process.chdir(tempDir);
		createTempPlan(tempDir, 1);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		fs.rmSync(tempDir, { recursive: true, force: true });
		resetSwarmState();
	});

	/**
	 * Test 1: Per-task gate tracking isolation (Task 9.3)
	 * Task A has gates logged under taskId "task-1.1". Task B then runs with currentTaskId "task-2.1".
	 * The gate log for task "task-2.1" should be empty — task A's gates do NOT leak into task B.
	 */
	it('per-task gate tracking isolation - task A gates do not leak to task B', async () => {
		const config = defaultConfig();
		const hooks = createGuardrailsHooks(config);

		const sid = 'isolation-test';

		// Start session with architect as active agent
		startAgentSession(sid, ORCHESTRATOR_NAME);
		beginInvocation(sid, ORCHESTRATOR_NAME);
		swarmState.activeAgent.set(sid, ORCHESTRATOR_NAME);

		// Get session and set up task A state
		const session = getAgentSession(sid)!;
		session.currentTaskId = 'task-1.1';

		// Task A has all gates completed
		session.gateLog.set(
			'task-1.1',
			new Set([
				'diff',
				'syntax_check',
				'placeholder_scan',
				'lint',
				'pre_check_batch',
			]),
		);
		session.reviewerCallCount.set(1, 1);
		session.partialGateWarningsIssuedForTask.add('task-1.1'); // task A already warned

		// Now switch to task B: set currentTaskId to task-2.1
		session.currentTaskId = 'task-2.1';
		// session.gateLog does NOT have 'task-2.1' (no gates logged yet for task B)

		// Run messagesTransform with messages containing text 'Starting task B'
		const messages = [
			{
				info: { role: 'assistant', sessionID: sid },
				parts: [{ type: 'text', text: 'Starting task B' }],
			},
		];
		await hooks.messagesTransform({}, { messages });

		// EXPECT: warning IS injected (task-2.1 has no gates and no reviewer for this task's gateLog)
		expect(messages[0].parts[0].text).toContain('PARTIAL GATE VIOLATION');

		// EXPECT: message does NOT contain 'task-1.1' in warning (it's about task-2.1 state)
		// The warning should reference the missing gates for task-2.1, not task-1.1
		// Meaningful isolation check: warning should mention the specific missing gates for task-2.1
		// Task-1.1 had all gates complete, but task-2.1 has NO gates logged, so all REQUIRED_GATES should be missing
		expect(messages[0].parts[0].text).toContain('diff');
		expect(messages[0].parts[0].text).toContain('syntax_check');
		expect(messages[0].parts[0].text).toContain('placeholder_scan');
		expect(messages[0].parts[0].text).toContain('lint');
	});

	/**
	 * Test 2: Partial gate warning fires ONCE per task (Task 9.4)
	 * Same task ID, partial gates only. First messagesTransform call → warning injected.
	 * Second call with same task ID → warning suppressed (already in set).
	 */
	it('partial gate warning fires ONCE per task - second call suppressed', async () => {
		const config = defaultConfig();
		const hooks = createGuardrailsHooks(config);

		const sid = 'warn-once';

		// Start session with architect as active agent
		startAgentSession(sid, ORCHESTRATOR_NAME);
		beginInvocation(sid, ORCHESTRATOR_NAME);
		swarmState.activeAgent.set(sid, ORCHESTRATOR_NAME);

		// Get session and set up task state
		const session = getAgentSession(sid)!;
		session.currentTaskId = 'task-3.1';
		session.gateLog.set('task-3.1', new Set(['syntax_check'])); // incomplete
		session.reviewerCallCount.set(1, 0); // no reviewer

		// FIRST messagesTransform call: EXPECT warning injected (partialGateWarningsIssuedForTask does not have 'task-3.1')
		const messages1 = [
			{
				info: { role: 'assistant', sessionID: sid },
				parts: [{ type: 'text', text: 'First message for task-3.1' }],
			},
		];
		await hooks.messagesTransform({}, { messages: messages1 });
		expect(messages1[0].parts[0].text).toContain('PARTIAL GATE VIOLATION');

		// Verify task-3.1 is now in the set
		expect(session.partialGateWarningsIssuedForTask.has('task-3.1')).toBe(true);

		// SECOND messagesTransform call (same session, same task): EXPECT no NEW warning
		const messages2 = [
			{
				info: { role: 'assistant', sessionID: sid },
				parts: [{ type: 'text', text: 'Next message' }],
			},
		];
		await hooks.messagesTransform({}, { messages: messages2 });

		// The second message should NOT have double-warning
		expect(messages2[0].parts[0].text).not.toContain('PARTIAL GATE VIOLATION');
	});

	/**
	 * Test 3: Warning reissued for NEW task after first task completes
	 * Task "task-4.1" was warned (in set). Then a new coder delegation fires for "task-4.2".
	 * Now messagesTransform sees "task-4.2" which is NOT in the set → warning fires again.
	 */
	it('warning reissued for NEW task after first task completes', async () => {
		const config = defaultConfig();
		const hooks = createGuardrailsHooks(config);

		const sid = 'warn-reissued';

		// Start session with architect as active agent
		startAgentSession(sid, ORCHESTRATOR_NAME);
		beginInvocation(sid, ORCHESTRATOR_NAME);
		swarmState.activeAgent.set(sid, ORCHESTRATOR_NAME);

		// Get session and set up first task state
		const session = getAgentSession(sid)!;
		session.currentTaskId = 'task-4.1';
		session.gateLog.set('task-4.1', new Set(['syntax_check'])); // incomplete
		session.reviewerCallCount.set(1, 0);

		// First messagesTransform: get warning for task-4.1
		const messages1 = [
			{
				info: { role: 'assistant', sessionID: sid },
				parts: [{ type: 'text', text: 'First task message' }],
			},
		];
		await hooks.messagesTransform({}, { messages: messages1 });
		expect(messages1[0].parts[0].text).toContain('PARTIAL GATE VIOLATION');

		// Verify task-4.1 is in the warnings set
		expect(session.partialGateWarningsIssuedForTask.has('task-4.1')).toBe(true);

		// Simulate new coder delegation: session.currentTaskId = 'task-4.2' (new task)
		session.currentTaskId = 'task-4.2';
		// session.gateLog does NOT have 'task-4.2'

		// Second messagesTransform call with fresh message
		const messages2 = [
			{
				info: { role: 'assistant', sessionID: sid },
				parts: [{ type: 'text', text: 'Second task message' }],
			},
		];
		await hooks.messagesTransform({}, { messages: messages2 });

		// EXPECT: warning IS injected again (because 'task-4.2' is not in warningsIssuedForTask set)
		expect(messages2[0].parts[0].text).toContain('PARTIAL GATE VIOLATION');
	});

	/**
	 * Test 4: No warning for task with complete gates
	 * All required gates run, reviewer delegation exists.
	 * messagesTransform should NOT inject any warning.
	 */
	it('no warning for task with complete gates', async () => {
		const config = defaultConfig();
		const hooks = createGuardrailsHooks(config);

		const sid = 'complete-gates';

		// Start session with architect as active agent
		startAgentSession(sid, ORCHESTRATOR_NAME);
		beginInvocation(sid, ORCHESTRATOR_NAME);
		swarmState.activeAgent.set(sid, ORCHESTRATOR_NAME);

		// Get session and set up task with complete gates
		const session = getAgentSession(sid)!;
		session.currentTaskId = 'task-5.1';
		session.gateLog.set(
			'task-5.1',
			new Set([
				'diff',
				'syntax_check',
				'placeholder_scan',
				'lint',
				'pre_check_batch',
			]),
		);
		session.reviewerCallCount.set(1, 2); // has reviewer delegations

		// messagesTransform: EXPECT no 'PARTIAL GATE VIOLATION'
		const messages = [
			{
				info: { role: 'assistant', sessionID: sid },
				parts: [{ type: 'text', text: 'Task with all gates complete' }],
			},
		];
		await hooks.messagesTransform({}, { messages });

		expect(messages[0].parts[0].text).not.toContain('PARTIAL GATE VIOLATION');
	});

	/**
	 * Test 5: Warning reissued after coder re-delegation clears the warning set entry
	 * After warning is injected and task is added to partialGateWarningsIssuedForTask,
	 * if coder re-delegation causes the entry to be deleted (simulating toolAfter behavior),
	 * a subsequent messagesTransform should re-inject the warning.
	 */
	it('warning reissued after coder re-delegation clears the warning set entry', async () => {
		const config = defaultConfig();
		const hooks = createGuardrailsHooks(config);

		const sid = 'redelegate-reset';

		startAgentSession(sid, ORCHESTRATOR_NAME);
		beginInvocation(sid, ORCHESTRATOR_NAME);
		swarmState.activeAgent.set(sid, ORCHESTRATOR_NAME);

		const session = getAgentSession(sid)!;
		session.currentTaskId = 'task-6.1';
		session.gateLog.set('task-6.1', new Set(['syntax_check'])); // incomplete
		session.reviewerCallCount.set(1, 0);

		// First messagesTransform: warning injected, task-6.1 added to set
		const messages1 = [
			{
				info: { role: 'assistant', sessionID: sid },
				parts: [{ type: 'text', text: 'First attempt' }],
			},
		];
		await hooks.messagesTransform({}, { messages: messages1 });
		expect(messages1[0].parts[0].text).toContain('PARTIAL GATE VIOLATION');
		expect(session.partialGateWarningsIssuedForTask.has('task-6.1')).toBe(true);

		// Simulate coder re-delegation: delete the warning set entry (as toolAfter would)
		session.partialGateWarningsIssuedForTask.delete('task-6.1');
		expect(session.partialGateWarningsIssuedForTask.has('task-6.1')).toBe(
			false,
		);

		// Second messagesTransform: warning should fire again since entry was deleted
		const messages2 = [
			{
				info: { role: 'assistant', sessionID: sid },
				parts: [{ type: 'text', text: 'Second attempt after re-delegation' }],
			},
		];
		await hooks.messagesTransform({}, { messages: messages2 });
		expect(messages2[0].parts[0].text).toContain('PARTIAL GATE VIOLATION');
	});

	/**
	 * Test 6: Warn when gateLog is completely empty for current task
	 * Even when session exists and has a currentTaskId, if gateLog has no entries at all
	 * (size === 0), the warning should still fire because all required gates are missing.
	 */
	it('warns when gateLog is completely empty for current task', async () => {
		const config = defaultConfig();
		const hooks = createGuardrailsHooks(config);

		const sid = 'empty-gatelog';

		startAgentSession(sid, ORCHESTRATOR_NAME);
		beginInvocation(sid, ORCHESTRATOR_NAME);
		swarmState.activeAgent.set(sid, ORCHESTRATOR_NAME);

		const session = getAgentSession(sid)!;
		// Set currentTaskId but do NOT add any gates to gateLog
		session.currentTaskId = 'task-7.1';
		// session.gateLog has NO entry for 'task-7.1' (size === 0)
		session.reviewerCallCount.set(1, 0);

		const messages = [
			{
				info: { role: 'assistant', sessionID: sid },
				parts: [{ type: 'text', text: 'Task with zero gates logged' }],
			},
		];
		await hooks.messagesTransform({}, { messages });

		// Warning should fire even though gateLog is completely empty
		expect(messages[0].parts[0].text).toContain('PARTIAL GATE VIOLATION');
		// All required gates should be listed as missing
		expect(messages[0].parts[0].text).toContain('diff');
		expect(messages[0].parts[0].text).toContain('syntax_check');
	});
});
