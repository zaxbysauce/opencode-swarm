import { describe, it, expect } from 'bun:test';
import { createDelegationGateHook } from '../../../src/hooks/delegation-gate';
import type { PluginConfig } from '../../../src/config';

function makeConfig(overrides?: Record<string, unknown>): PluginConfig {
	return {
		max_iterations: 5,
		qa_retry_limit: 3,
		inject_phase_reminders: true,
		hooks: {
			system_enhancer: true,
			compaction: true,
			agent_activity: true,
			delegation_tracker: false,
			agent_awareness_max_chars: 300,
			delegation_gate: true,
			delegation_max_chars: 4000,
			...(overrides?.hooks as Record<string, unknown>),
		},
	} as PluginConfig;
}

function makeMessages(text: string, agent?: string) {
	return {
		messages: [{
			info: { role: 'user' as const, agent, sessionID: 'test-session' },
			parts: [{ type: 'text', text }],
		}],
	};
}

describe('delegation gate hook', () => {
	it('no-op when disabled', async () => {
		const config = makeConfig({ hooks: { delegation_gate: false } });
		const hook = createDelegationGateHook(config);

		const messages = makeMessages('coder\nTASK: Add validation\nFILE: src/test.ts', 'architect');
		const originalText = messages.messages[0].parts[0].text;

		await hook({}, messages);

		expect(messages.messages[0].parts[0].text).toBe(originalText);
	});

	it('ignores non-coder delegations', async () => {
		const config = makeConfig();
		const hook = createDelegationGateHook(config);

		// Long message without coder TASK: pattern
		const longText = 'TASK: Review this very long task description ' + 'a'.repeat(5000);
		const messages = makeMessages(longText, 'architect');
		const originalText = messages.messages[0].parts[0].text;

		await hook({}, messages);

		expect(messages.messages[0].parts[0].text).toBe(originalText);
	});

	it('ignores non-architect agents', async () => {
		const config = makeConfig();
		const hook = createDelegationGateHook(config);

		// Coder delegation from non-architect agent
		const longText = 'coder\nTASK: ' + 'a'.repeat(5000);
		const messages = makeMessages(longText, 'coder');
		const originalText = messages.messages[0].parts[0].text;

		await hook({}, messages);

		expect(messages.messages[0].parts[0].text).toBe(originalText);
	});

	it('detects oversized delegation', async () => {
		const config = makeConfig();
		const hook = createDelegationGateHook(config);

		// Coder delegation > 4000 chars
		const longText = 'coder\nTASK: Add validation\nINPUT: ' + 'a'.repeat(4000) + '\nFILE: src/test.ts';
		const messages = makeMessages(longText, 'architect');

		await hook({}, messages);

		expect(messages.messages[0].parts[0].text).toContain('⚠️ DELEGATION GATE');
		expect(messages.messages[0].parts[0].text).toContain('exceeds recommended size');
	});

	it('detects multiple FILE: directives', async () => {
		const config = makeConfig();
		const hook = createDelegationGateHook(config);

		const longText = 'coder\nTASK: Add validation\nFILE: src/auth.ts\nFILE: src/login.ts';
		const messages = makeMessages(longText, 'architect');

		await hook({}, messages);

		expect(messages.messages[0].parts[0].text).toContain('⚠️ DELEGATION GATE');
		expect(messages.messages[0].parts[0].text).toContain('Multiple FILE: directives detected');
	});

	it('detects multiple TASK: sections', async () => {
		const config = makeConfig();
		const hook = createDelegationGateHook(config);

		const longText = 'coder\nTASK: Add validation\nFILE: src/test.ts\n\nTASK: Add tests';
		const messages = makeMessages(longText, 'architect');

		await hook({}, messages);

		expect(messages.messages[0].parts[0].text).toContain('⚠️ DELEGATION GATE');
		expect(messages.messages[0].parts[0].text).toContain('Multiple TASK: sections detected');
	});

	it('detects batching language', async () => {
		const config = makeConfig();
		const hook = createDelegationGateHook(config);

		const longText = 'coder\nTASK: Add validation and also add tests\nFILE: src/test.ts';
		const messages = makeMessages(longText, 'architect');

		await hook({}, messages);

		expect(messages.messages[0].parts[0].text).toContain('⚠️ DELEGATION GATE');
		expect(messages.messages[0].parts[0].text).toContain('Batching language detected');
	});

	it('no warning when delegation is small and clean', async () => {
		const config = makeConfig();
		const hook = createDelegationGateHook(config);

		const cleanText = 'coder\nTASK: Add validation\nFILE: src/test.ts\nINPUT: Validate email format';
		const messages = makeMessages(cleanText, 'architect');
		const originalText = messages.messages[0].parts[0].text;

		await hook({}, messages);

		expect(messages.messages[0].parts[0].text).toBe(originalText);
	});

	it('works when agent is undefined (main session)', async () => {
		const config = makeConfig();
		const hook = createDelegationGateHook(config);

		// Agent undefined (main session = architect)
		const longText = 'coder\nTASK: ' + 'a'.repeat(5000);
		const messages = makeMessages(longText, undefined);

		await hook({}, messages);

		expect(messages.messages[0].parts[0].text).toContain('⚠️ DELEGATION GATE');
	});

	it('custom delegation_max_chars respected', async () => {
		const config = makeConfig({ hooks: { delegation_max_chars: 100 } });
		const hook = createDelegationGateHook(config);

		// 150+ char delegation exceeds custom limit of 100
		const longText = 'coder\nTASK: ' + 'a'.repeat(150) + '\nFILE: src/test.ts';
		const messages = makeMessages(longText, 'architect');

		await hook({}, messages);

		expect(messages.messages[0].parts[0].text).toContain('⚠️ DELEGATION GATE');
		expect(messages.messages[0].parts[0].text).toContain('limit 100');
	});
});
