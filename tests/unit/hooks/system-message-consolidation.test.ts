import { describe, it, expect } from 'bun:test';
import { consolidateSystemMessages } from '../../../src/hooks/messages-transform';

describe('consolidateSystemMessages', () => {
	describe('basic functionality', () => {
		it('returns unchanged array (new reference) when there are no system messages', () => {
			const messages = [
				{ role: 'user', content: 'Hello' },
				{ role: 'assistant', content: 'Hi there!' },
			];

			const result = consolidateSystemMessages(messages);

			expect(result.length).toBe(2);
			expect(result[0].role).toBe('user');
			expect(result[1].role).toBe('assistant');
		});

		it('returns unchanged array (new reference) for empty messages array', () => {
			const messages: any[] = [];

			const result = consolidateSystemMessages(messages);

			expect(result).toEqual([]);
			expect(result).not.toBe(messages);
		});

		it('returns new array when single system message is at index 0 (fast path)', () => {
			const messages = [{ role: 'system', content: 'You are a helpful assistant.' }];

			const result = consolidateSystemMessages(messages);

			expect(result).not.toBe(messages);
			expect(result.length).toBe(1);
			expect(result[0].role).toBe('system');
			expect(result[0].content).toBe('You are a helpful assistant.');
		});

		it('moves single system message not at index 0 to index 0', () => {
			const messages = [
				{ role: 'user', content: 'Hello' },
				{ role: 'system', content: 'You are a helpful assistant.' },
				{ role: 'assistant', content: 'Hi there!' },
			];

			const result = consolidateSystemMessages(messages);

			expect(result.length).toBe(3);
			expect(result[0].role).toBe('system');
			expect(result[0].content).toBe('You are a helpful assistant.');
			expect(result[1].role).toBe('user');
			expect(result[2].role).toBe('assistant');
		});

		it('merges multiple system messages into one at index 0 with double newline separator', () => {
			const messages = [
				{ role: 'system', content: 'You are OpenCode.' },
				{ role: 'user', content: 'Hello' },
				{ role: 'system', content: 'You are also a coding assistant.' },
				{ role: 'assistant', content: 'Hi!' },
			];

			const result = consolidateSystemMessages(messages);

			expect(result.length).toBe(3);
			expect(result[0].role).toBe('system');
			expect(result[0].content).toBe('You are OpenCode.\n\nYou are also a coding assistant.');
			expect(result[1].role).toBe('user');
			expect(result[2].role).toBe('assistant');
		});

		it('preserves interleaved conversation order after merging system messages', () => {
			const messages = [
				{ role: 'system', content: 'System prompt 1' },
				{ role: 'user', content: 'Question 1' },
				{ role: 'system', content: 'System prompt 2' },
				{ role: 'assistant', content: 'Answer 1' },
				{ role: 'user', content: 'Question 2' },
			];

			const result = consolidateSystemMessages(messages);

			expect(result.length).toBe(4);
			expect(result[0].role).toBe('system');
			expect(result[0].content).toBe('System prompt 1\n\nSystem prompt 2');
			expect(result[1].role).toBe('user');
			expect(result[1].content).toBe('Question 1');
			expect(result[2].role).toBe('assistant');
			expect(result[2].content).toBe('Answer 1');
			expect(result[3].role).toBe('user');
			expect(result[3].content).toBe('Question 2');
		});
	});

	describe('extra fields preservation', () => {
		it('preserves extra fields on non-system messages after consolidation', () => {
			const messages = [
				{ role: 'system', content: 'System prompt' },
				{
					role: 'user',
					content: 'Hello',
					name: 'user123',
					tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'test', arguments: '{}' } }],
				},
				{
					role: 'assistant',
					content: 'Hi',
					tool_calls: [{ id: 'call_2', type: 'function', function: { name: 'test2', arguments: '{}' } }],
				},
			];

			const result = consolidateSystemMessages(messages);

			expect(result[1].name).toBe('user123');
			expect(result[1].tool_calls).toEqual([
				{ id: 'call_1', type: 'function', function: { name: 'test', arguments: '{}' } },
			]);
			expect(result[2].tool_calls).toEqual([
				{ id: 'call_2', type: 'function', function: { name: 'test2', arguments: '{}' } },
			]);
		});

		it('preserves extra fields from first system message when merging', () => {
			const messages = [
				{
					role: 'system',
					content: 'System prompt 1',
					extraField: 'preserved',
					anotherField: 123,
			 },
				{ role: 'user', content: 'Hello' },
				{ role: 'system', content: 'System prompt 2' },
			];

			const result = consolidateSystemMessages(messages);

			expect(result[0].extraField).toBe('preserved');
			expect(result[0].anotherField).toBe(123);
		});
	});

	describe('original array immutability', () => {
		it('does not mutate the original array', () => {
			const originalMessages = [
				{ role: 'system', content: 'System prompt 1' },
				{ role: 'user', content: 'Hello' },
				{ role: 'system', content: 'System prompt 2' },
			];
			const originalCopy = JSON.parse(JSON.stringify(originalMessages));

			consolidateSystemMessages(originalMessages);

			expect(originalMessages).toEqual(originalCopy);
		});

		it('returns a new array instance even when no changes needed', () => {
			const messages = [{ role: 'user', content: 'Hello' }];

			const result = consolidateSystemMessages(messages);

			expect(result).not.toBe(messages);
		});
	});

	describe('non-mergeable system messages', () => {
		it('leaves system message with array-type content (Anthropic-style) in original position', () => {
			const messages = [
				{
					role: 'system',
					content: [{ type: 'text', text: 'Anthropic style content' }],
				},
				{ role: 'user', content: 'Hello' },
			];

			const result = consolidateSystemMessages(messages);

			// Should return unchanged because the system message has non-string content
			expect(result).not.toBe(messages);
			expect(result.length).toBe(2);
			// The system message should still be at index 0
			expect(result[0].role).toBe('system');
			expect(result[0].content).toEqual([{ type: 'text', text: 'Anthropic style content' }]);
		});

		it('leaves system message with name field in place and does not merge', () => {
			const messages = [
				{ role: 'system', content: 'System prompt', name: 'system_message' },
				{ role: 'user', content: 'Hello' },
			];

			const result = consolidateSystemMessages(messages);

			// Should return unchanged because the system message has a name field
			expect(result).not.toBe(messages);
			expect(result.length).toBe(2);
			expect(result[0].role).toBe('system');
			expect(result[0].content).toBe('System prompt');
			expect(result[0].name).toBe('system_message');
		});

		it('leaves system message with tool_call_id field in place and does not merge', () => {
			const messages = [
				{ role: 'system', content: 'Tool result content', tool_call_id: 'call_123' },
				{ role: 'user', content: 'Hello' },
			];

			const result = consolidateSystemMessages(messages);

			// Should return unchanged because the system message has tool_call_id
			expect(result).not.toBe(messages);
			expect(result.length).toBe(2);
			expect(result[0].role).toBe('system');
			expect(result[0].content).toBe('Tool result content');
			expect(result[0].tool_call_id).toBe('call_123');
		});

		it('excludes empty/whitespace-only system content from merged output', () => {
			const messages = [
				{ role: 'system', content: 'Valid system prompt' },
				{ role: 'user', content: 'Hello' },
				{ role: 'system', content: '   ' },
				{ role: 'system', content: '' },
				{ role: 'assistant', content: 'Hi!' },
			];

			const result = consolidateSystemMessages(messages);

			// Empty/whitespace system messages are kept in place but not merged
			expect(result.length).toBe(5);
			expect(result[0].role).toBe('system');
			expect(result[0].content).toBe('Valid system prompt');
			// No stray \n\n from empty messages in merged content
			expect(result[0].content).not.toContain('\n\n\n');
			// Empty system messages are preserved in their original positions
			expect(result[2].role).toBe('system');
			expect(result[2].content).toBe('   ');
			expect(result[3].role).toBe('system');
			expect(result[3].content).toBe('');
		});

		it('handles mix of mergeable and non-mergeable system messages correctly', () => {
			const messages = [
				{ role: 'system', content: 'Valid system prompt 1' },
				{ role: 'user', content: 'Hello' },
				{ role: 'system', content: [{ type: 'text', text: 'Anthropic style' }] },
				{ role: 'system', content: 'Valid system prompt 2' },
				{ role: 'system', content: '   ' }, // whitespace-only - removed
				{ role: 'assistant', content: 'Hi!' },
			];

			const result = consolidateSystemMessages(messages);

			// Whitespace-only system message is filtered out, not added to result
			expect(result.length).toBe(4);
			expect(result[0].role).toBe('system');
			// Only the two valid string system messages should be merged
			expect(result[0].content).toBe('Valid system prompt 1\n\nValid system prompt 2');
			expect(result[1].role).toBe('user');
			// Anthropic-style message stays in place
			expect(result[2].role).toBe('system');
			expect(result[2].content).toEqual([{ type: 'text', text: 'Anthropic style' }]);
			// Whitespace-only message is removed
			expect(result[3].role).toBe('assistant');
		});

		it('handles multiple system messages with name fields - none merged', () => {
			const messages = [
				{ role: 'system', content: 'System 1', name: 'name1' },
				{ role: 'system', content: 'System 2', name: 'name2' },
				{ role: 'user', content: 'Hello' },
			];

			const result = consolidateSystemMessages(messages);

			// No string-only system messages without name/tool_call_id, so return unchanged
			expect(result).not.toBe(messages);
			expect(result.length).toBe(3);
		});
	});

	describe('strict template model compatibility', () => {
		it('swarm agent injection does not produce multiple system messages', () => {
			// This is the exact scenario from the bug report:
			// OpenCode base prompt + swarm agent prompt should result in a single system message
			const messages = [
				{
					role: 'system',
					content:
						'You are OpenCode, an AI-powered IDE assistant...\n\n# Tools\nYou have access to various tools...',
				},
				{
					role: 'user',
					content: 'Create a new file',
				},
				{
					role: 'system',
					content:
						'## Swarm Agent Context\nYou are a swarm agent with specialized capabilities...',
				},
				{
					role: 'assistant',
					content: 'I can help with that.',
				},
			];

			const result = consolidateSystemMessages(messages);

			// Should have exactly one system message at index 0
			const systemMessages = result.filter((m) => m.role === 'system');
			expect(systemMessages.length).toBe(1);

			// The content should contain both prompts joined
			expect(result[0].content).toContain('You are OpenCode');
			expect(result[0].content).toContain('Swarm Agent Context');

			// Conversation order should be preserved
			expect(result[1].role).toBe('user');
			expect(result[2].role).toBe('assistant');
		});

		it('handles strict template with only base system message', () => {
			// Fast path: only one system message at index 0 with string content
			const messages = [
				{
					role: 'system',
					content: 'You are OpenCode, an AI-powered IDE assistant.',
				},
				{ role: 'user', content: 'Hello' },
			];

			const result = consolidateSystemMessages(messages);

			// Should return new array but not merge anything
			expect(result.length).toBe(2);
			expect(result[0].role).toBe('system');
			expect(result[0].content).toBe('You are OpenCode, an AI-powered IDE assistant.');
		});

		it('handles strict template with multiple consecutive system messages from different sources', () => {
			const messages = [
				{ role: 'system', content: 'Base system prompt from OpenCode' },
				{ role: 'system', content: 'Additional system instruction' },
				{ role: 'system', content: 'Yet another system instruction' },
				{ role: 'user', content: 'Hello' },
			];

			const result = consolidateSystemMessages(messages);

			// Should merge all three into one
			const systemMessages = result.filter((m) => m.role === 'system');
			expect(systemMessages.length).toBe(1);
			expect(result[0].content).toBe(
				'Base system prompt from OpenCode\n\nAdditional system instruction\n\nYet another system instruction',
			);
		});

		it('swarm agent injection does not produce multiple system messages', () => {
			// Simulate: OpenCode system prompt + swarm-injected agent prompt + conversation
			const input = [
				{ role: 'system', content: 'You are a helpful assistant.' },
				{ role: 'user', content: 'Fix the bug in auth.ts' },
				{ role: 'assistant', content: 'I will delegate to the coder.' },
				{ role: 'system', content: 'You are the coder agent. Follow all QA gates...' },
			];
			const result = consolidateSystemMessages(input);

			// Exactly one system message
			const systemMessages = result.filter((m) => m.role === 'system');
			expect(systemMessages).toHaveLength(1);

			// It is at index 0
			expect(result[0].role).toBe('system');

			// Contains both prompts
			expect(result[0].content).toContain('You are a helpful assistant.');
			expect(result[0].content).toContain('You are the coder agent.');

			// Conversation order preserved
			const nonSystem = result.filter((m) => m.role !== 'system');
			expect(nonSystem[0]).toEqual({ role: 'user', content: 'Fix the bug in auth.ts' });
			expect(nonSystem[1]).toEqual({ role: 'assistant', content: 'I will delegate to the coder.' });
		});
	});
});
