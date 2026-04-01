import { describe, expect, it } from 'bun:test';
import {
	buildPhaseReminder,
	createPipelineTrackerHook,
} from '../../../src/hooks/pipeline-tracker';

describe('Pipeline Tracker Hook', () => {
	describe('Disabled hook behavior', () => {
		it('returns empty object when inject_phase_reminders is false', () => {
			const config = {
				inject_phase_reminders: false,
				max_iterations: 5,
				qa_retry_limit: 3,
			};
			const hook = createPipelineTrackerHook(config);
			expect(hook).toEqual({});
		});

		it('returns hook when inject_phase_reminders is not provided (defaults to enabled)', () => {
			// When property is missing/undefined, hook should be enabled (default behavior)
			const hook = createPipelineTrackerHook({
				max_iterations: 5,
				qa_retry_limit: 3,
			} as any);
			expect(hook['experimental.chat.messages.transform']).toBeDefined();
		});
	});

	describe('Enabled hook behavior', () => {
		it('returns object with experimental.chat.messages.transform key', () => {
			const config = {
				inject_phase_reminders: true,
				max_iterations: 5,
				qa_retry_limit: 3,
			};
			const hook = createPipelineTrackerHook(config);
			expect(hook['experimental.chat.messages.transform']).toBeDefined();
		});

		it('returns an async transform function', () => {
			const config = {
				inject_phase_reminders: true,
				max_iterations: 5,
				qa_retry_limit: 3,
			};
			const hook = createPipelineTrackerHook(config);
			const transform = hook['experimental.chat.messages.transform'] as any;
			expect(typeof transform).toBe('function');
			expect(transform.constructor.name).toBe('AsyncFunction');
		});
	});

	describe('Transform behavior - injection', () => {
		it('injects PHASE_REMINDER into last user message first text part', async () => {
			const config = {
				inject_phase_reminders: true,
				max_iterations: 5,
				qa_retry_limit: 3,
			};
			const hook = createPipelineTrackerHook(config);
			const transform = hook['experimental.chat.messages.transform'];

			const output = {
				messages: [
					{
						info: { role: 'assistant', agent: 'explorer' },
						parts: [{ type: 'text', text: 'Previous assistant message' }],
					},
					{
						info: { role: 'user', agent: 'architect' },
						parts: [{ type: 'text', text: 'Last user message' }],
					},
				],
			};

			await transform({}, output);

			expect(output.messages[1].parts[0].text).toContain('<swarm_reminder>');
		});

		it('only modifies the LAST user message', async () => {
			const config = {
				inject_phase_reminders: true,
				max_iterations: 5,
				qa_retry_limit: 3,
			};
			const hook = createPipelineTrackerHook(config);
			const transform = hook['experimental.chat.messages.transform'];

			const output = {
				messages: [
					{
						info: { role: 'user', agent: 'architect' },
						parts: [{ type: 'text', text: 'First user message' }],
					},
					{
						info: { role: 'assistant', agent: 'explorer' },
						parts: [{ type: 'text', text: 'Assistant message' }],
					},
					{
						info: { role: 'user', agent: 'architect' },
						parts: [{ type: 'text', text: 'Last user message' }],
					},
				],
			};

			await transform({}, output);

			// First user message should remain unchanged
			expect(output.messages[0].parts[0].text).toBe('First user message');

			// Last user message should be modified
			expect(output.messages[2].parts[0].text).toContain('<swarm_reminder>');
		});

		it('modifies only the FIRST text part when user message has multiple text parts', async () => {
			const config = {
				inject_phase_reminders: true,
				max_iterations: 5,
				qa_retry_limit: 3,
			};
			const hook = createPipelineTrackerHook(config);
			const transform = hook['experimental.chat.messages.transform'];

			const output = {
				messages: [
					{
						info: { role: 'user', agent: 'architect' },
						parts: [
							{ type: 'text', text: 'First text part' },
							{ type: 'text', text: 'Second text part' },
						],
					},
				],
			};

			await transform({}, output);

			// First text part should be modified
			expect(output.messages[0].parts[0].text).toContain('<swarm_reminder>');
			expect(output.messages[0].parts[0].text).toContain('First text part');

			// Second text part should remain unchanged
			expect(output.messages[0].parts[1].text).toBe('Second text part');
		});
	});

	describe('Transform behavior - agent filtering', () => {
		it('injects when agent is undefined (main session)', async () => {
			const config = {
				inject_phase_reminders: true,
				max_iterations: 5,
				qa_retry_limit: 3,
			};
			const hook = createPipelineTrackerHook(config);
			const transform = hook['experimental.chat.messages.transform'];

			const output = {
				messages: [
					{
						info: { role: 'user' }, // No agent specified = architect
						parts: [{ type: 'text', text: 'User message without agent' }],
					},
				],
			};

			await transform({}, output);

			expect(output.messages[0].parts[0].text).toContain('<swarm_reminder>');
		});

		it('injects when agent is architect', async () => {
			const config = {
				inject_phase_reminders: true,
				max_iterations: 5,
				qa_retry_limit: 3,
			};
			const hook = createPipelineTrackerHook(config);
			const transform = hook['experimental.chat.messages.transform'];

			const output = {
				messages: [
					{
						info: { role: 'user', agent: 'architect' },
						parts: [{ type: 'text', text: 'User message for architect' }],
					},
				],
			};

			await transform({}, output);

			expect(output.messages[0].parts[0].text).toContain('<swarm_reminder>');
		});

		it('does NOT inject when agent is coder', async () => {
			const config = {
				inject_phase_reminders: true,
				max_iterations: 5,
				qa_retry_limit: 3,
			};
			const hook = createPipelineTrackerHook(config);
			const transform = hook['experimental.chat.messages.transform'];

			const output = {
				messages: [
					{
						info: { role: 'user', agent: 'coder' },
						parts: [{ type: 'text', text: 'User message for coder' }],
					},
				],
			};

			await transform({}, output);

			expect(output.messages[0].parts[0].text).toBe('User message for coder');
			expect(output.messages[0].parts[0].text).not.toContain(
				'<swarm_reminder>',
			);
		});

		it('does NOT inject for other non-architect agents', async () => {
			const config = {
				inject_phase_reminders: true,
				max_iterations: 5,
				qa_retry_limit: 3,
			};
			const hook = createPipelineTrackerHook(config);
			const transform = hook['experimental.chat.messages.transform'];

			const output = {
				messages: [
					{
						info: { role: 'user', agent: 'explorer' },
						parts: [{ type: 'text', text: 'User message for explorer' }],
					},
				],
			};

			await transform({}, output);

			expect(output.messages[0].parts[0].text).toBe(
				'User message for explorer',
			);
			expect(output.messages[0].parts[0].text).not.toContain(
				'<swarm_reminder>',
			);
		});
	});

	describe('Transform behavior - edge cases', () => {
		it('does nothing when messages array is empty', async () => {
			const config = {
				inject_phase_reminders: true,
				max_iterations: 5,
				qa_retry_limit: 3,
			};
			const hook = createPipelineTrackerHook(config);
			const transform = hook['experimental.chat.messages.transform'];

			const output = { messages: [] };

			await transform({}, output);

			expect(output.messages).toEqual([]);
		});

		it('does nothing when output.messages is undefined', async () => {
			const config = {
				inject_phase_reminders: true,
				max_iterations: 5,
				qa_retry_limit: 3,
			};
			const hook = createPipelineTrackerHook(config);
			const transform = hook['experimental.chat.messages.transform'];

			const output = {};

			await transform({}, output);

			expect(output).toEqual({});
		});

		it('does nothing when there are no user messages', async () => {
			const config = {
				inject_phase_reminders: true,
				max_iterations: 5,
				qa_retry_limit: 3,
			};
			const hook = createPipelineTrackerHook(config);
			const transform = hook['experimental.chat.messages.transform'];

			const output = {
				messages: [
					{
						info: { role: 'assistant', agent: 'architect' },
						parts: [{ type: 'text', text: 'Assistant message' }],
					},
				],
			};

			await transform({}, output);

			expect(output.messages[0].parts[0].text).toBe('Assistant message');
			expect(output.messages[0].parts[0].text).not.toContain(
				'<swarm_reminder>',
			);
		});

		it('does nothing when user message has no text parts', async () => {
			const config = {
				inject_phase_reminders: true,
				max_iterations: 5,
				qa_retry_limit: 3,
			};
			const hook = createPipelineTrackerHook(config);
			const transform = hook['experimental.chat.messages.transform'];

			const output = {
				messages: [
					{
						info: { role: 'user', agent: 'architect' },
						parts: [{ type: 'image', url: 'some_image_url' }],
					},
				],
			};

			await transform({}, output);

			expect(output.messages[0].parts[0].type).toBe('image');
			expect(output.messages[0].parts[0]).not.toHaveProperty('text');
		});

		it('does not crash on completely malformed input', async () => {
			const config = {
				inject_phase_reminders: true,
				max_iterations: 5,
				qa_retry_limit: 3,
			};
			const hook = createPipelineTrackerHook(config);
			const transform = hook['experimental.chat.messages.transform'];

			// Test 1: messages with no text part — should not modify anything
			const output1: any = {
				messages: [
					{
						info: { role: 'user' },
						parts: [{ type: 'image' }],
					},
				],
			};
			await transform({}, output1);
			expect(output1.messages[0].parts[0]).toEqual({ type: 'image' });

			// Test 2: null messages — should not throw
			const output2: any = { messages: null };
			await transform({}, output2);
			expect(output2.messages).toBeNull();

			// Test 3: messages with missing parts — should not throw
			const output3: any = {
				messages: [{ info: { role: 'user' } }],
			};
			await transform({}, output3);
			expect(output3.messages[0].parts).toBeUndefined();

			// Test 4: message with null info — should not throw
			const output4: any = {
				messages: [{ info: null, parts: [{ type: 'text', text: 'test' }] }],
			};
			await transform({}, output4);
			expect(output4.messages[0].parts[0].text).toBe('test');
		});

		it('prepended text includes separator format', async () => {
			const config = {
				inject_phase_reminders: true,
				max_iterations: 5,
				qa_retry_limit: 3,
			};
			const hook = createPipelineTrackerHook(config);
			const transform = hook['experimental.chat.messages.transform'];

			const output = {
				messages: [
					{
						info: { role: 'user', agent: 'architect' },
						parts: [{ type: 'text', text: 'Original text here' }],
					},
				],
			};

			await transform({}, output);

			expect(output.messages[0].parts[0].text).toContain('\n\n---\n\n');
			expect(output.messages[0].parts[0].text).toEndWith('Original text here');
		});

		it('text part with type "text" but text undefined is skipped', async () => {
			const config = {
				inject_phase_reminders: true,
				max_iterations: 5,
				qa_retry_limit: 3,
			};
			const hook = createPipelineTrackerHook(config);
			const transform = hook['experimental.chat.messages.transform'];

			const output = {
				messages: [
					{
						info: { role: 'user', agent: 'architect' },
						parts: [{ type: 'text' }, { type: 'text', text: 'Actual text' }],
					},
				],
			};

			await transform({}, output);

			expect(output.messages[0].parts[0]).toEqual({ type: 'text' });
			expect(output.messages[0].parts[1].text).toContain('<swarm_reminder>');
			expect(output.messages[0].parts[1].text).toContain('Actual text');
		});

		it('PHASE_REMINDER content includes key workflow steps', async () => {
			const config = {
				inject_phase_reminders: true,
				max_iterations: 5,
				qa_retry_limit: 3,
			};
			const hook = createPipelineTrackerHook(config);
			const transform = hook['experimental.chat.messages.transform'];

			const output = {
				messages: [
					{
						info: { role: 'user', agent: 'architect' },
						parts: [{ type: 'text', text: 'Test message' }],
					},
				],
			};

			await transform({}, output);

			const modifiedText = output.messages[0].parts[0].text;
			expect(modifiedText).toContain('ARCHITECT WORKFLOW REMINDER');
			expect(modifiedText).toContain('ANALYZE');
			expect(modifiedText).toContain('SME_CONSULTATION');
			expect(modifiedText).toContain('CODE');
			expect(modifiedText).toContain('QA_REVIEW');
			expect(modifiedText).toContain('DELEGATION RULES');
		});

		it('only last user message gets reminder even when mixed with non-user messages at end', async () => {
			const config = {
				inject_phase_reminders: true,
				max_iterations: 5,
				qa_retry_limit: 3,
			};
			const hook = createPipelineTrackerHook(config);
			const transform = hook['experimental.chat.messages.transform'];

			const output = {
				messages: [
					{
						info: { role: 'user', agent: 'architect' },
						parts: [{ type: 'text', text: 'First user message' }],
					},
					{
						info: { role: 'assistant', agent: 'explorer' },
						parts: [{ type: 'text', text: 'Assistant message 1' }],
					},
					{
						info: { role: 'user', agent: 'architect' },
						parts: [{ type: 'text', text: 'Last user message' }],
					},
					{
						info: { role: 'assistant', agent: 'explorer' },
						parts: [{ type: 'text', text: 'Last assistant message' }],
					},
				],
			};

			await transform({}, output);

			// First user message (index 0) should remain unchanged
			expect(output.messages[0].parts[0].text).toBe('First user message');
			expect(output.messages[0].parts[0].text).not.toContain(
				'<swarm_reminder>',
			);

			// Assistant messages should remain unchanged
			expect(output.messages[1].parts[0].text).toBe('Assistant message 1');
			expect(output.messages[1].parts[0].text).not.toContain(
				'<swarm_reminder>',
			);
			expect(output.messages[3].parts[0].text).toBe('Last assistant message');
			expect(output.messages[3].parts[0].text).not.toContain(
				'<swarm_reminder>',
			);

			// Last user message (index 2) should be modified
			expect(output.messages[2].parts[0].text).toContain('<swarm_reminder>');
			expect(output.messages[2].parts[0].text).toContain('Last user message');
		});
	});

	describe('Compliance Escalation (Task 1.11 / v6.12)', () => {
		describe('Base compliance text (all phases)', () => {
			it('reminder contains COMPLIANCE CHECK header', () => {
				const reminder = buildPhaseReminder(1);
				expect(reminder).toContain('COMPLIANCE CHECK');
			});

			it('reminder contains mandatory reviewer delegation text', () => {
				const reminder = buildPhaseReminder(1);
				expect(reminder).toContain('Reviewer delegation is MANDATORY');
			});

			it('reminder contains pre_check_batch is NOT a substitute warning', () => {
				const reminder = buildPhaseReminder(1);
				expect(reminder).toContain(
					'pre_check_batch is NOT a substitute for reviewer',
				);
			});
		});

		describe('Phase >= 4 escalation warning', () => {
			it('Phase 4 includes escalation warning about compliance degradation', () => {
				const reminder = buildPhaseReminder(4);
				expect(reminder).toContain('Compliance degrades with time');
			});

			it('Phase 5 includes escalation warning', () => {
				const reminder = buildPhaseReminder(5);
				expect(reminder).toContain('Compliance degrades with time');
			});

			it('Phase 8 includes escalation warning', () => {
				const reminder = buildPhaseReminder(8);
				expect(reminder).toContain('Compliance degrades with time');
			});

			it('Phase >= 4 includes phase number in escalation message', () => {
				const reminder = buildPhaseReminder(4);
				expect(reminder).toContain('You are in Phase 4');
			});
		});

		describe('Phase < 4 no escalation warning', () => {
			it('Phase 1 does NOT include escalation warning', () => {
				const reminder = buildPhaseReminder(1);
				expect(reminder).not.toContain('Compliance degrades with time');
			});

			it('Phase 2 does NOT include escalation warning', () => {
				const reminder = buildPhaseReminder(2);
				expect(reminder).not.toContain('Compliance degrades with time');
			});

			it('Phase 3 does NOT include escalation warning', () => {
				const reminder = buildPhaseReminder(3);
				expect(reminder).not.toContain('Compliance degrades with time');
			});
		});

		describe('Null phase (missing plan state)', () => {
			it('null phase returns base compliance text', () => {
				const reminder = buildPhaseReminder(null);
				expect(reminder).toContain('COMPLIANCE CHECK');
			});

			it('null phase does NOT include escalation warning', () => {
				const reminder = buildPhaseReminder(null);
				expect(reminder).not.toContain('Compliance degrades with time');
			});

			it('null phase header does NOT contain phase number', () => {
				const reminder = buildPhaseReminder(null);
				// Header should be just 'COMPLIANCE CHECK:' not 'COMPLIANCE CHECK (Phase X):'
				expect(reminder).toContain('COMPLIANCE CHECK:');
				expect(reminder).not.toContain('COMPLIANCE CHECK (Phase');
			});

			it('null phase still contains mandatory reviewer text', () => {
				const reminder = buildPhaseReminder(null);
				expect(reminder).toContain('Reviewer delegation is MANDATORY');
			});

			it('null phase still contains pre_check_batch warning', () => {
				const reminder = buildPhaseReminder(null);
				expect(reminder).toContain(
					'pre_check_batch is NOT a substitute for reviewer',
				);
			});
		});
	});
});
