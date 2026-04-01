/**
 * Tests for consolidateSystemMessages function
 */

import { describe, expect, it } from 'bun:test';
import { consolidateSystemMessages } from '../../../src/hooks/messages-transform';

type Message = {
	role: string;
	content: unknown;
	[key: string]: unknown;
};

describe('consolidateSystemMessages', () => {
	// Helper to verify no system messages at index > 0
	function assertNoSystemAtIndexZeroPlus(result: Message[]): void {
		result.forEach((msg, idx) => {
			if (idx > 0) {
				expect(msg.role).not.toBe('system');
			}
		});
	}

	describe('Empty and minimal inputs', () => {
		it('Empty array → []', () => {
			const result = consolidateSystemMessages([]);
			expect(result).toEqual([]);
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('Empty array with contract check', () => {
			const result = consolidateSystemMessages([]);
			expect(Array.isArray(result)).toBe(true);
			expect(result.length).toBe(0);
		});
	});

	describe('Fast path behavior', () => {
		it('Single system message → fast-path returns copy', () => {
			const input: Message[] = [
				{ role: 'system', content: 'You are a helpful assistant.' },
			];
			const result = consolidateSystemMessages(input);

			expect(result).not.toBe(input); // New array
			expect(result).toEqual(input); // Same content
			expect(result.length).toBe(1);
			expect(result[0].role).toBe('system');
			expect(result[0].content).toBe('You are a helpful assistant.');
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('Single system at index 0 + extra system(name="tool") at index 1 → fast-path does NOT short-circuit; output has only the first system, tool message removed', () => {
			const input: Message[] = [
				{ role: 'system', content: 'System prompt' },
				{ role: 'system', content: 'Tool instructions', name: 'tool' },
			];
			const result = consolidateSystemMessages(input);

			expect(result.length).toBe(1);
			expect(result[0].role).toBe('system');
			expect(result[0].content).toBe('System prompt');
			assertNoSystemAtIndexZeroPlus(result);
		});
	});

	describe('Merging string system messages', () => {
		it('Two string system messages → merged with \\n\\n', () => {
			const input: Message[] = [
				{ role: 'system', content: 'First system' },
				{ role: 'system', content: 'Second system' },
			];
			const result = consolidateSystemMessages(input);

			expect(result.length).toBe(1);
			expect(result[0].role).toBe('system');
			expect(result[0].content).toBe('First system\n\nSecond system');
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('Three string system messages → merged correctly', () => {
			const input: Message[] = [
				{ role: 'system', content: 'A' },
				{ role: 'system', content: 'B' },
				{ role: 'system', content: 'C' },
			];
			const result = consolidateSystemMessages(input);

			expect(result.length).toBe(1);
			expect(result[0].role).toBe('system');
			expect(result[0].content).toBe('A\n\nB\n\nC');
			assertNoSystemAtIndexZeroPlus(result);
		});
	});

	describe('Mixed system and non-system messages', () => {
		it('System + user + system → merged system at 0, user at 1', () => {
			const input: Message[] = [
				{ role: 'system', content: 'System A' },
				{ role: 'user', content: 'Hello' },
				{ role: 'system', content: 'System B' },
			];
			const result = consolidateSystemMessages(input);

			expect(result.length).toBe(2);
			expect(result[0].role).toBe('system');
			expect(result[0].content).toBe('System A\n\nSystem B');
			expect(result[1].role).toBe('user');
			expect(result[1].content).toBe('Hello');
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('User + system → system moved to index 0 (before user)', () => {
			const input: Message[] = [
				{ role: 'user', content: 'Hello' },
				{ role: 'system', content: 'System prompt' },
			];
			const result = consolidateSystemMessages(input);

			expect(result.length).toBe(2);
			expect(result[0].role).toBe('system');
			expect(result[0].content).toBe('System prompt');
			expect(result[1].role).toBe('user');
			expect(result[1].content).toBe('Hello');
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('Preserves non-system message order', () => {
			const input: Message[] = [
				{ role: 'system', content: 'S1' },
				{ role: 'user', content: 'U1' },
				{ role: 'assistant', content: 'A1' },
				{ role: 'system', content: 'S2' },
				{ role: 'user', content: 'U2' },
			];
			const result = consolidateSystemMessages(input);

			expect(result.length).toBe(4);
			expect(result[0].role).toBe('system');
			expect(result[0].content).toBe('S1\n\nS2');
			expect(result[1].role).toBe('user');
			expect(result[1].content).toBe('U1');
			expect(result[2].role).toBe('assistant');
			expect(result[2].content).toBe('A1');
			expect(result[3].role).toBe('user');
			expect(result[3].content).toBe('U2');
			assertNoSystemAtIndexZeroPlus(result);
		});
	});

	describe('Array-style system messages (Anthropic format)', () => {
		it('System(array:[{type:"text",text:"Hello"}]) → extracted to string "Hello"', () => {
			const input: Message[] = [
				{ role: 'system', content: [{ type: 'text', text: 'Hello' }] },
			];
			const result = consolidateSystemMessages(input);

			// Fast path doesn't apply because content is not a string
			expect(result.length).toBe(1);
			expect(result[0].role).toBe('system');
			expect(result[0].content).toBe('Hello');
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('System(array:[{type:"image"}]) → no text extracted, removed', () => {
			const input: Message[] = [
				{ role: 'user', content: 'Hello' },
				{ role: 'system', content: [{ type: 'image' }] },
			];
			const result = consolidateSystemMessages(input);

			// System message should be removed (no text content)
			expect(result.length).toBe(1);
			expect(result[0].role).toBe('user');
			expect(result[0].content).toBe('Hello');
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('System with multiple text parts in array', () => {
			const input: Message[] = [
				{
					role: 'system',
					content: [
						{ type: 'text', text: 'Part 1' },
						{ type: 'text', text: 'Part 2' },
					],
				},
			];
			const result = consolidateSystemMessages(input);

			expect(result.length).toBe(1);
			expect(result[0].role).toBe('system');
			expect(result[0].content).toBe('Part 1\nPart 2');
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('System with mixed array content (text + image)', () => {
			const input: Message[] = [
				{
					role: 'system',
					content: [{ type: 'text', text: 'Text part' }, { type: 'image' }],
				},
			];
			const result = consolidateSystemMessages(input);

			expect(result.length).toBe(1);
			expect(result[0].role).toBe('system');
			expect(result[0].content).toBe('Text part');
			assertNoSystemAtIndexZeroPlus(result);
		});
	});

	describe('Empty/null/undefined content handling', () => {
		it('System(empty string) + system(valid) → empty removed, valid merged', () => {
			const input: Message[] = [
				{ role: 'system', content: '' },
				{ role: 'system', content: 'Valid content' },
			];
			const result = consolidateSystemMessages(input);

			expect(result.length).toBe(1);
			expect(result[0].role).toBe('system');
			expect(result[0].content).toBe('Valid content');
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('System(whitespace only) + system(valid) → whitespace removed, valid merged', () => {
			const input: Message[] = [
				{ role: 'system', content: '   ' },
				{ role: 'system', content: 'Valid content' },
			];
			const result = consolidateSystemMessages(input);

			expect(result.length).toBe(1);
			expect(result[0].role).toBe('system');
			expect(result[0].content).toBe('Valid content');
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('System(null content) is not merged', () => {
			const input: Message[] = [
				{ role: 'system', content: null as unknown as string },
				{ role: 'system', content: 'Valid content' },
			];
			const result = consolidateSystemMessages(input);

			// null content system message should be removed
			expect(result.length).toBe(1);
			expect(result[0].role).toBe('system');
			expect(result[0].content).toBe('Valid content');
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('System(undefined content) is not merged', () => {
			const input: Message[] = [
				{ role: 'system', content: undefined as unknown as string },
				{ role: 'system', content: 'Valid content' },
			];
			const result = consolidateSystemMessages(input);

			expect(result.length).toBe(1);
			expect(result[0].role).toBe('system');
			expect(result[0].content).toBe('Valid content');
			assertNoSystemAtIndexZeroPlus(result);
		});
	});

	describe('System messages with name or tool_call_id', () => {
		it('System(name="tool") only → kept (at index 0)', () => {
			const input: Message[] = [
				{ role: 'system', content: 'Tool instructions', name: 'tool' },
			];
			const result = consolidateSystemMessages(input);

			// Fast path doesn't apply (name field present)
			// But since it's the only system and at index 0, it should be kept
			expect(result.length).toBe(1);
			expect(result[0].role).toBe('system');
			expect(result[0].content).toBe('Tool instructions');
			expect(result[0].name).toBe('tool');
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('System(string) + user + system(name="tool") → tool message removed by safety net', () => {
			const input: Message[] = [
				{ role: 'system', content: 'System prompt' },
				{ role: 'user', content: 'Hello' },
				{ role: 'system', content: 'Tool info', name: 'tool' },
			];
			const result = consolidateSystemMessages(input);

			expect(result.length).toBe(2);
			expect(result[0].role).toBe('system');
			expect(result[0].content).toBe('System prompt');
			expect(result[1].role).toBe('user');
			expect(result[1].content).toBe('Hello');
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('System with tool_call_id is not merged', () => {
			const input: Message[] = [
				{ role: 'system', content: 'System A' },
				{ role: 'system', content: 'Tool msg', tool_call_id: 'call_123' },
			];
			const result = consolidateSystemMessages(input);

			expect(result.length).toBe(1);
			expect(result[0].role).toBe('system');
			expect(result[0].content).toBe('System A');
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('Multiple system messages all with name/tool_call_id → only index-0 kept in systemContents=0 branch', () => {
			const input: Message[] = [
				{ role: 'system', content: 'First tool', name: 'tool1' },
				{ role: 'system', content: 'Second tool', name: 'tool2' },
			];
			const result = consolidateSystemMessages(input);

			// Since no valid system content to merge, keep only index 0
			expect(result.length).toBe(1);
			expect(result[0].role).toBe('system');
			expect(result[0].content).toBe('First tool');
			expect(result[0].name).toBe('tool1');
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('Mix of regular system and named system', () => {
			const input: Message[] = [
				{ role: 'system', content: 'Regular system' },
				{ role: 'system', content: 'Named system', name: 'tool' },
			];
			const result = consolidateSystemMessages(input);

			expect(result.length).toBe(1);
			expect(result[0].role).toBe('system');
			expect(result[0].content).toBe('Regular system');
			expect(result[0].name).toBeUndefined();
			assertNoSystemAtIndexZeroPlus(result);
		});
	});

	describe('Metadata preservation', () => {
		it('Preserves metadata from first system message', () => {
			const input: Message[] = [
				{ role: 'system', content: 'System A', custom: 'metadata', foo: 'bar' },
				{ role: 'system', content: 'System B', other: 'data' },
			];
			const result = consolidateSystemMessages(input);

			expect(result.length).toBe(1);
			expect(result[0].role).toBe('system');
			expect(result[0].content).toBe('System A\n\nSystem B');
			expect(result[0].custom).toBe('metadata');
			expect(result[0].foo).toBe('bar');
			expect(result[0].other).toBeUndefined();
			assertNoSystemAtIndexZeroPlus(result);
		});
	});

	describe('Output contract enforcement', () => {
		it('Output contract: assert NO result message has role==="system" && index > 0 (on all outputs) - empty', () => {
			const result = consolidateSystemMessages([]);
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('Output contract: assert NO result message has role==="system" && index > 0 (on all outputs) - single system', () => {
			const result = consolidateSystemMessages([
				{ role: 'system', content: 'System' },
			]);
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('Output contract: assert NO result message has role==="system" && index > 0 (on all outputs) - merged', () => {
			const result = consolidateSystemMessages([
				{ role: 'system', content: 'A' },
				{ role: 'user', content: 'U' },
				{ role: 'system', content: 'B' },
			]);
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('Output contract: assert NO result message has role==="system" && index > 0 (on all outputs) - reordered', () => {
			const result = consolidateSystemMessages([
				{ role: 'user', content: 'U' },
				{ role: 'system', content: 'S' },
			]);
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('Output contract: assert NO result message has role==="system" && index > 0 (on all outputs) - complex', () => {
			const result = consolidateSystemMessages([
				{ role: 'user', content: 'U1' },
				{ role: 'system', content: 'S1' },
				{ role: 'user', content: 'U2' },
				{ role: 'system', content: 'S2' },
				{ role: 'assistant', content: 'A' },
			]);
			assertNoSystemAtIndexZeroPlus(result);
		});
	});

	describe('Edge cases', () => {
		it('Non-system messages only - unchanged', () => {
			const input: Message[] = [
				{ role: 'user', content: 'Hello' },
				{ role: 'assistant', content: 'Hi' },
			];
			const result = consolidateSystemMessages(input);

			expect(result).toEqual(input);
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('All empty system messages → first kept at index 0', () => {
			const input: Message[] = [
				{ role: 'system', content: '' },
				{ role: 'system', content: '   ' },
				{ role: 'user', content: 'Hello' },
			];
			const result = consolidateSystemMessages(input);

			// When no valid system content, keep first system at index 0
			expect(result.length).toBe(2);
			expect(result[0].role).toBe('system');
			expect(result[0].content).toBe('');
			expect(result[1].role).toBe('user');
			expect(result[1].content).toBe('Hello');
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('System at end only', () => {
			const input: Message[] = [
				{ role: 'user', content: 'Hello' },
				{ role: 'user', content: 'World' },
				{ role: 'system', content: 'System prompt' },
			];
			const result = consolidateSystemMessages(input);

			expect(result.length).toBe(3);
			expect(result[0].role).toBe('system');
			expect(result[0].content).toBe('System prompt');
			expect(result[1].role).toBe('user');
			expect(result[1].content).toBe('Hello');
			expect(result[2].role).toBe('user');
			expect(result[2].content).toBe('World');
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('Fast path with trimmed content check', () => {
			const input: Message[] = [
				{ role: 'system', content: '  System with spaces  ' },
			];
			const result = consolidateSystemMessages(input);

			// Fast path should apply after trimming
			expect(result).not.toBe(input);
			expect(result.length).toBe(1);
			expect(result[0].content).toBe('  System with spaces  ');
			assertNoSystemAtIndexZeroPlus(result);
		});
	});
});
