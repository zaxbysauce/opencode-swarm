/**
 * ADVERSARIAL tests for consolidateSystemMessages function
 * Focus: Attack vectors ONLY - no happy path tests
 */

import { describe, expect, it } from 'bun:test';
import { consolidateSystemMessages } from '../../../src/hooks/messages-transform';

// Use the same type as the source, but allow for adversarial role types
type AdversarialMessage = {
	role: string | number | null | undefined;
	content: unknown;
	[key: string]: unknown;
};

describe('consolidateSystemMessages - ADVERSARIAL', () => {
	// Helper to verify no system messages at index > 0
	function assertNoSystemAtIndexZeroPlus(result: AdversarialMessage[]): void {
		result.forEach((msg, idx) => {
			if (idx > 0) {
				expect(msg.role).not.toBe('system');
			}
		});
	}

	describe('1. Prototype pollution attacks', () => {
		it('content as JSON string with __proto__ payload', () => {
			const input: AdversarialMessage[] = [
				{ role: 'system', content: '{"__proto__":{"polluted":true}}' },
				{ role: 'user', content: 'Hello' },
			];
			const result = consolidateSystemMessages(input as any);

			// Should not crash, should handle as string content
			expect(result.length).toBe(2);
			expect(result[0].role).toBe('system');
			expect(result[0].content).toBe('{"__proto__":{"polluted":true}}');
			assertNoSystemAtIndexZeroPlus(result);

			// Verify no prototype pollution occurred
			expect(({} as any).polluted).toBeUndefined();
		});

		it('message with __proto__ key', () => {
			const input: AdversarialMessage[] = [
				{
					role: 'system',
					content: 'System prompt',
					__proto__: { polluted: true },
				} as any,
			];
			const result = consolidateSystemMessages(input as any);

			// Should not crash
			expect(result.length).toBe(1);
			expect(result[0].role).toBe('system');
			assertNoSystemAtIndexZeroPlus(result);

			// Verify no prototype pollution occurred
			expect(({} as any).polluted).toBeUndefined();
		});

		it('constructor property pollution attempt', () => {
			const input: AdversarialMessage[] = [
				{
					role: 'system',
					content: 'System prompt',
					constructor: { prototype: { polluted: true } },
				} as any,
				{ role: 'user', content: 'Hello' },
			];
			const result = consolidateSystemMessages(input as any);

			// Should not crash
			expect(result.length).toBe(2);
			assertNoSystemAtIndexZeroPlus(result);
		});
	});

	describe('2. Malicious content injection', () => {
		it('system message with null bytes in content', () => {
			const contentWithNullBytes = 'System\x00prompt\x00with\x00nulls';
			const input: AdversarialMessage[] = [
				{ role: 'system', content: contentWithNullBytes },
				{ role: 'user', content: 'Hello' },
			];
			const result = consolidateSystemMessages(input as any);

			// Should not crash, should preserve null bytes
			expect(result.length).toBe(2);
			expect(result[0].content).toBe(contentWithNullBytes);
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('system message with excessive newlines', () => {
			const excessiveNewlines = 'System\n\n\n\n\n\n\n\n\n\nprompt';
			const input: AdversarialMessage[] = [
				{ role: 'system', content: excessiveNewlines },
				{ role: 'user', content: 'Hello' },
			];
			const result = consolidateSystemMessages(input as any);

			// Should not crash
			expect(result.length).toBe(2);
			expect(result[0].content).toBe(excessiveNewlines);
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('system message with very long string (>100KB)', () => {
			const longString = 'A'.repeat(110 * 1024); // 110KB
			const input: AdversarialMessage[] = [
				{ role: 'system', content: longString },
				{ role: 'user', content: 'Hello' },
			];
			const result = consolidateSystemMessages(input as any);

			// Should not crash or hang
			expect(result.length).toBe(2);
			expect(result[0].content).toBe(longString);
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('system message with unicode control characters', () => {
			const controlChars = 'System\x00\x01\x02\x03\x04\x05prompt';
			const input: AdversarialMessage[] = [
				{ role: 'system', content: controlChars },
				{ role: 'user', content: 'Hello' },
			];
			const result = consolidateSystemMessages(input as any);

			// Should not crash
			expect(result.length).toBe(2);
			expect(result[0].content).toBe(controlChars);
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('system message with emoji and surrogate pairs', () => {
			const emojiString = 'System 🎉🚀🔥 prompt with 😀😁😂';
			const input: AdversarialMessage[] = [
				{ role: 'system', content: emojiString },
				{ role: 'user', content: 'Hello' },
			];
			const result = consolidateSystemMessages(input as any);

			// Should not crash
			expect(result.length).toBe(2);
			expect(result[0].content).toBe(emojiString);
			assertNoSystemAtIndexZeroPlus(result);
		});
	});

	describe('3. Boundary violations', () => {
		it('empty array (0 elements)', () => {
			const result = consolidateSystemMessages([]);
			expect(result).toEqual([]);
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('single message array (1 element)', () => {
			const input: AdversarialMessage[] = [
				{ role: 'system', content: 'System prompt' },
			];
			const result = consolidateSystemMessages(input as any);

			expect(result.length).toBe(1);
			expect(result[0].role).toBe('system');
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('huge array (10000 elements) with system at start', () => {
			const input: AdversarialMessage[] = [
				{ role: 'system', content: 'System' },
				...Array.from({ length: 9999 }, (_, i) => ({
					role: 'user',
					content: `Message ${i}`,
				})),
			];
			const result = consolidateSystemMessages(input as any);

			// Should not crash or hang
			expect(result.length).toBe(10000);
			expect(result[0].role).toBe('system');
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('huge array (10000 elements) with system at last index', () => {
			const input: AdversarialMessage[] = [
				...Array.from({ length: 9999 }, (_, i) => ({
					role: 'user',
					content: `Message ${i}`,
				})),
				{ role: 'system', content: 'System prompt at end' },
			];
			const result = consolidateSystemMessages(input as any);

			// Should not crash or hang, system should move to index 0
			expect(result.length).toBe(10000);
			expect(result[0].role).toBe('system');
			expect(result[0].content).toBe('System prompt at end');
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('array with alternating system messages', () => {
			const input: AdversarialMessage[] = Array.from(
				{ length: 100 },
				(_, i) => ({
					role: i % 2 === 0 ? 'system' : 'user',
					content: `${i % 2 === 0 ? 'System' : 'User'} ${i}`,
				}),
			);
			const result = consolidateSystemMessages(input as any);

			// Should collapse all 50 system messages into 1
			expect(result.length).toBe(51); // 1 system + 50 user
			expect(result[0].role).toBe('system');
			assertNoSystemAtIndexZeroPlus(result);
		});
	});

	describe('4. Type confusion attacks', () => {
		it('role as uppercase "SYSTEM"', () => {
			const input: AdversarialMessage[] = [
				{ role: 'SYSTEM', content: 'System prompt' },
				{ role: 'user', content: 'Hello' },
			] as any;
			const result = consolidateSystemMessages(input as any);

			// Should treat "SYSTEM" as non-system (case-sensitive)
			expect(result.length).toBe(2);
			expect(result[0].role).toBe('SYSTEM');
			expect(result[1].role).toBe('user');
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('role as mixed case "System"', () => {
			const input: AdversarialMessage[] = [
				{ role: 'System', content: 'System prompt' },
				{ role: 'user', content: 'Hello' },
			] as any;
			const result = consolidateSystemMessages(input as any);

			// Should treat "System" as non-system (case-sensitive)
			expect(result.length).toBe(2);
			expect(result[0].role).toBe('System');
			expect(result[1].role).toBe('user');
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('role as number 0', () => {
			const input: AdversarialMessage[] = [
				{ role: 0, content: 'System prompt' },
				{ role: 'user', content: 'Hello' },
			] as any;
			const result = consolidateSystemMessages(input as any);

			// Should not crash, treat as non-system
			expect(result.length).toBe(2);
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('role as null', () => {
			const input: AdversarialMessage[] = [
				{ role: null, content: 'System prompt' },
				{ role: 'user', content: 'Hello' },
			] as any;
			const result = consolidateSystemMessages(input as any);

			// Should not crash
			expect(result.length).toBe(2);
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('role as undefined', () => {
			const input: AdversarialMessage[] = [
				{ role: undefined, content: 'System prompt' },
				{ role: 'user', content: 'Hello' },
			] as any;
			const result = consolidateSystemMessages(input as any);

			// Should not crash
			expect(result.length).toBe(2);
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('mixed valid and invalid roles', () => {
			const input: AdversarialMessage[] = [
				{ role: 'system', content: 'Valid system' },
				{ role: 'SYSTEM', content: 'Uppercase system' } as any,
				{ role: null, content: 'Null role' } as any,
				{ role: 'user', content: 'User message' },
			];
			const result = consolidateSystemMessages(input as any);

			// Should not crash, only merge valid 'system' role
			// Output: 1 system + 'SYSTEM' + null + 'user' = 4 messages
			expect(result.length).toBe(4);
			expect(result[0].role).toBe('system');
			expect(result[0].content).toBe('Valid system');
			expect(result[1].role).toBe('SYSTEM');
			expect(result[2].role).toBe(null);
			expect(result[3].role).toBe('user');
			assertNoSystemAtIndexZeroPlus(result);
		});
	});

	describe('5. Circular references and object mutation', () => {
		it('original messages array should NOT be mutated', () => {
			const input: AdversarialMessage[] = [
				{ role: 'system', content: 'System A' },
				{ role: 'user', content: 'User' },
				{ role: 'system', content: 'System B' },
			];
			const originalInput = JSON.stringify(input);

			const result = consolidateSystemMessages(input as any);

			// Original array should be unchanged
			expect(JSON.stringify(input)).toBe(originalInput);

			// Result should have merged system
			expect(result[0].content).toBe('System A\n\nSystem B');
		});

		it('original message objects should NOT be mutated', () => {
			const systemMsg: AdversarialMessage = {
				role: 'system',
				content: 'System',
			};
			const input: AdversarialMessage[] = [
				systemMsg,
				{ role: 'user', content: 'Hello' },
			];
			const originalContent = systemMsg.content;

			consolidateSystemMessages(input as any);

			// Original message object should be unchanged
			expect(systemMsg.content).toBe(originalContent);
		});

		it('handles circular reference without crashing', () => {
			const circular: any = { role: 'system', content: 'System' };
			circular.self = circular;

			const input: AdversarialMessage[] = [
				circular,
				{ role: 'user', content: 'Hello' },
			];
			const result = consolidateSystemMessages(input as any);

			// Should not crash, handle gracefully
			expect(result.length).toBeGreaterThanOrEqual(1);
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('nested circular reference', () => {
			const nested: any = { deep: { self: null } };
			nested.deep.self = nested;

			const input: AdversarialMessage[] = [
				{ role: 'system', content: 'System', meta: nested },
				{ role: 'user', content: 'Hello' },
			];
			const result = consolidateSystemMessages(input as any);

			// Should not crash
			expect(result.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe('6. Edge: systemMessageIndices OOB', () => {
		it('system message with content as number', () => {
			const input: AdversarialMessage[] = [
				{ role: 'system', content: 12345 },
				{ role: 'user', content: 'Hello' },
			] as any;
			const result = consolidateSystemMessages(input as any);

			// Should not crash, remove non-string content
			expect(result.length).toBe(2);
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('system message with content as object', () => {
			const input: AdversarialMessage[] = [
				{ role: 'system', content: { foo: 'bar' } },
				{ role: 'user', content: 'Hello' },
			] as any;
			const result = consolidateSystemMessages(input as any);

			// Should not crash
			expect(result.length).toBe(2);
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('system message with content as boolean', () => {
			const input: AdversarialMessage[] = [
				{ role: 'system', content: true },
				{ role: 'user', content: 'Hello' },
			] as any;
			const result = consolidateSystemMessages(input as any);

			// Should not crash
			expect(result.length).toBe(2);
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('system message with content as function', () => {
			const input: AdversarialMessage[] = [
				{ role: 'system', content: () => 'dangerous' },
				{ role: 'user', content: 'Hello' },
			] as any;
			const result = consolidateSystemMessages(input as any);

			// Should not crash
			expect(result.length).toBe(2);
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('system message with missing content field', () => {
			const input: AdversarialMessage[] = [
				{ role: 'system' } as any,
				{ role: 'user', content: 'Hello' },
			];
			const result = consolidateSystemMessages(input as any);

			// Should not crash
			expect(result.length).toBe(2);
			assertNoSystemAtIndexZeroPlus(result);
		});
	});

	describe('7. Array content attacks', () => {
		it('content array with null text', () => {
			const input: AdversarialMessage[] = [
				{ role: 'system', content: [{ type: 'text', text: null }] },
				{ role: 'user', content: 'Hello' },
			] as any;
			const result = consolidateSystemMessages(input as any);

			// Should not crash, handle null text gracefully
			expect(result.length).toBe(2);
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('content array with empty string text', () => {
			const input: AdversarialMessage[] = [
				{ role: 'system', content: [{ type: 'text', text: '' }] },
				{ role: 'user', content: 'Hello' },
			];
			const result = consolidateSystemMessages(input as any);

			// Should not crash, empty text should be filtered out
			expect(result.length).toBe(2);
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('content array with whitespace-only text', () => {
			const input: AdversarialMessage[] = [
				{ role: 'system', content: [{ type: 'text', text: '   ' }] },
				{ role: 'user', content: 'Hello' },
			];
			const result = consolidateSystemMessages(input as any);

			// Should not crash
			expect(result.length).toBe(2);
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('content array with empty object', () => {
			const input: AdversarialMessage[] = [
				{ role: 'system', content: [{}] },
				{ role: 'user', content: 'Hello' },
			] as any;
			const result = consolidateSystemMessages(input as any);

			// Should not crash
			expect(result.length).toBe(2);
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('content array with data URL image', () => {
			const input: AdversarialMessage[] = [
				{
					role: 'system',
					content: [
						{ type: 'image', url: 'data:image/png;base64,iVBORw0KG...' },
					],
				},
				{ role: 'user', content: 'Hello' },
			] as any;
			const result = consolidateSystemMessages(input as any);

			// Should not crash, ignore image-only content
			expect(result.length).toBe(2);
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('content array with mixed null and valid text', () => {
			const input: AdversarialMessage[] = [
				{
					role: 'system',
					content: [
						{ type: 'text', text: null },
						{ type: 'text', text: 'Valid' },
						{ type: 'text', text: '' },
						{ type: 'text', text: 'Another valid' },
					],
				},
				{ role: 'user', content: 'Hello' },
			] as any;
			const result = consolidateSystemMessages(input as any);

			// Should not crash, merge only valid text parts
			expect(result.length).toBe(2);
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('content array with malicious type values', () => {
			const input: AdversarialMessage[] = [
				{
					role: 'system',
					content: [
						{ type: '__proto__', text: 'malicious' },
						{ type: 'constructor', text: 'payload' },
					],
				} as any,
				{ role: 'user', content: 'Hello' },
			];
			const result = consolidateSystemMessages(input as any);

			// Should not crash or allow prototype pollution
			expect(result.length).toBe(2);
			expect(({} as any).polluted).toBeUndefined();
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('deeply nested array structure', () => {
			const input: AdversarialMessage[] = [
				{
					role: 'system',
					content: [
						{
							type: 'text',
							text: 'Nested',
							nested: { deep: { array: [1, 2, 3] } },
						},
					],
				} as any,
				{ role: 'user', content: 'Hello' },
			];
			const result = consolidateSystemMessages(input as any);

			// Should not crash
			expect(result.length).toBe(2);
			assertNoSystemAtIndexZeroPlus(result);
		});
	});

	describe('8. Large merge operations', () => {
		it('100 system messages → exactly 1 system at index 0', () => {
			const input: AdversarialMessage[] = [
				...Array.from({ length: 100 }, (_, i) => ({
					role: 'system',
					content: `System message ${i}`,
				})),
				{ role: 'user', content: 'Hello' },
			];
			const result = consolidateSystemMessages(input as any);

			// Should merge all 100 into 1
			expect(result.length).toBe(2);
			expect(result[0].role).toBe('system');
			expect(result[0].content).toContain('System message 0');
			expect(result[0].content).toContain('System message 99');
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('100 system messages with alternating empty content', () => {
			const input: AdversarialMessage[] = Array.from(
				{ length: 100 },
				(_, i) => ({
					role: 'system',
					content: i % 2 === 0 ? `Valid ${i}` : '',
				}),
			);
			const result = consolidateSystemMessages(input as any);

			// Should merge only non-empty content
			expect(result.length).toBe(1);
			expect(result[0].role).toBe('system');
			expect(result[0].content).toContain('Valid 0');
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('100 system messages with array format', () => {
			const input: AdversarialMessage[] = Array.from(
				{ length: 100 },
				(_, i) => ({
					role: 'system',
					content: [{ type: 'text', text: `System ${i}` }],
				}),
			);
			const result = consolidateSystemMessages(input as any);

			// Should merge all array-formatted system messages
			expect(result.length).toBe(1);
			expect(result[0].role).toBe('system');
			expect(result[0].content).toContain('System 0');
			expect(result[0].content).toContain('System 99');
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('100 system messages → verify join separator is consistent', () => {
			const input: AdversarialMessage[] = Array.from(
				{ length: 100 },
				(_, i) => ({
					role: 'system',
					content: `S${i}`,
				}),
			);
			const result = consolidateSystemMessages(input as any);

			// Verify separator is \n\n
			const parts = (result[0].content as string).split('\n\n');
			expect(parts.length).toBe(100);
			expect(parts[0]).toBe('S0');
			expect(parts[99]).toBe('S99');
		});
	});

	describe('Combined attack vectors', () => {
		it('prototype pollution + large array + type confusion', () => {
			const input: AdversarialMessage[] = [
				{
					role: 'system',
					content: '{"__proto__":{"polluted":true}}',
					__proto__: { test: true },
				} as any,
				{ role: 'SYSTEM', content: 'Uppercase' } as any,
				...Array.from({ length: 50 }, (_, i) => ({
					role: 'system',
					content: `System ${i}`,
				})),
				{ role: null, content: 'Null' } as any,
			];
			const result = consolidateSystemMessages(input as any);

			// Should not crash or allow pollution
			expect(result.length).toBeGreaterThanOrEqual(1);
			expect(({} as any).polluted).toBeUndefined();
			assertNoSystemAtIndexZeroPlus(result);
		});

		it('circular refs + malicious content + boundary violation', () => {
			const circular: any = { role: 'system', content: 'Circular\x00' };
			circular.self = circular;

			const input: AdversarialMessage[] = [
				circular,
				...Array.from({ length: 99 }, (_, i) => ({
					role: 'system',
					content: `System ${i}`,
				})),
				{ role: 'user', content: 'User' },
			];
			const result = consolidateSystemMessages(input as any);

			// Should not crash
			expect(result.length).toBeGreaterThanOrEqual(1);
			assertNoSystemAtIndexZeroPlus(result);
		});
	});
});
