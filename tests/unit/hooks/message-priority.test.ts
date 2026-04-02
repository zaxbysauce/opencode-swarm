/**
 * Verification + Adversarial Tests for message-priority.ts
 *
 * Tests cover:
 * - 8 verification tests for normal functionality
 * - 4 adversarial tests for attack vector mitigation
 */

import { describe, expect, it } from 'bun:test';
import {
	classifyMessage,
	classifyMessages,
	containsPlanContent,
	isDuplicateToolRead,
	isStaleError,
	isToolResult,
	MessagePriority,
	type MessageWithParts,
} from '../../../src/hooks/message-priority';

describe('Message Priority Classifier - Verification Tests', () => {
	/**
	 * Test 1: System message classified CRITICAL
	 * Input: message with info.role='system'
	 * Expected: MessagePriority.CRITICAL (0)
	 */
	it('should classify system message as CRITICAL', () => {
		const message: MessageWithParts = {
			info: {
				role: 'system',
			},
		};

		const result = classifyMessage(message, 0, 100);

		expect(result).toBe(MessagePriority.CRITICAL);
		expect(result).toBe(0);
	});

	/**
	 * Test 2: User message classified HIGH
	 * Input: message with info.role='user'
	 * Expected: MessagePriority.HIGH (1)
	 */
	it('should classify user message as HIGH', () => {
		const message: MessageWithParts = {
			info: {
				role: 'user',
			},
			parts: [
				{
					type: 'text',
					text: 'Hello, how are you?',
				},
			],
		};

		const result = classifyMessage(message, 0, 100);

		expect(result).toBe(MessagePriority.HIGH);
		expect(result).toBe(1);
	});

	/**
	 * Test 3: Recent assistant message (within last 10) classified MEDIUM
	 * Input: message with role='assistant', index=95 of 100 messages (recentWindowSize=10)
	 * Expected: MessagePriority.MEDIUM (2)
	 */
	it('should classify recent assistant message as MEDIUM', () => {
		const message: MessageWithParts = {
			info: {
				role: 'assistant',
			},
			parts: [
				{
					type: 'text',
					text: 'I will help you with that.',
				},
			],
		};

		// index=95, totalMessages=100 → positionFromEnd = 4 (within recent window of 10)
		const result = classifyMessage(message, 95, 100, 10);

		expect(result).toBe(MessagePriority.MEDIUM);
		expect(result).toBe(2);
	});

	/**
	 * Test 4: Old assistant message (outside recent window) classified LOW
	 * Input: message with role='assistant', index=5 of 100 messages (recentWindowSize=10)
	 * Expected: MessagePriority.LOW (3)
	 */
	it('should classify old assistant message as LOW', () => {
		const message: MessageWithParts = {
			info: {
				role: 'assistant',
			},
			parts: [
				{
					type: 'text',
					text: 'This is an old response.',
				},
			],
		};

		// index=5, totalMessages=100 → positionFromEnd = 94 (outside recent window of 10)
		const result = classifyMessage(message, 5, 100, 10);

		expect(result).toBe(MessagePriority.LOW);
		expect(result).toBe(3);
	});

	/**
	 * Test 5: Message with plan.md content classified CRITICAL
	 * Input: message with text containing '.swarm/plan.md'
	 * Expected: MessagePriority.CRITICAL (0) (content takes precedence)
	 */
	it('should classify plan.md content as CRITICAL regardless of role', () => {
		const message: MessageWithParts = {
			info: {
				role: 'assistant',
			},
			parts: [
				{
					type: 'text',
					text: 'Reading from .swarm/plan.md for task execution.',
				},
			],
		};

		const result = classifyMessage(message, 5, 100);

		expect(result).toBe(MessagePriority.CRITICAL);
		expect(result).toBe(0);
	});

	/**
	 * Test 6: Message with context.md content classified CRITICAL
	 * Input: message with text containing '.swarm/context.md'
	 * Expected: MessagePriority.CRITICAL (0)
	 */
	it('should classify context.md content as CRITICAL regardless of role', () => {
		const message: MessageWithParts = {
			info: {
				role: 'user',
			},
			parts: [
				{
					type: 'text',
					text: 'The .swarm/context.md contains important state.',
				},
			],
		};

		const result = classifyMessage(message, 50, 100);

		expect(result).toBe(MessagePriority.CRITICAL);
		expect(result).toBe(0);
	});

	/**
	 * Test 7: Consecutive duplicate tool reads marked DISPOSABLE
	 * Input: classifyMessages with messages that are duplicate read_file calls
	 * Expected: Older read_file marked DISPOSABLE (4)
	 */
	it('should mark consecutive duplicate tool reads as DISPOSABLE', () => {
		const messages: MessageWithParts[] = [
			{
				info: {
					role: 'assistant',
					toolName: 'read_file',
					toolArgs: { filePath: 'src/config.ts' },
				},
			},
			{
				info: {
					role: 'assistant',
					toolName: 'read_file',
					toolArgs: { filePath: 'src/config.ts' },
				},
			},
		];

		const results = classifyMessages(messages, 10);

		// First (older) message should be demoted to DISPOSABLE
		expect(results[0]).toBe(MessagePriority.DISPOSABLE);
		expect(results[0]).toBe(4);
	});

	/**
	 * Test 8: Stale error (>6 turns old) classified DISPOSABLE
	 * Input: message with error pattern text, turnsAgo=7
	 * Expected: MessagePriority.DISPOSABLE (4)
	 */
	it('should classify stale errors as DISPOSABLE', () => {
		const message: MessageWithParts = {
			info: {
				role: 'assistant',
				toolName: 'bash',
			},
			parts: [
				{
					type: 'text',
					text: 'Error: failed to execute command. Access denied.',
				},
			],
		};

		// index=89, totalMessages=100 → positionFromEnd = 10 (outside recent window, stale >6)
		const result = classifyMessage(message, 89, 100, 10);

		expect(result).toBe(MessagePriority.DISPOSABLE);
		expect(result).toBe(4);
	});
});

describe('Message Priority Classifier - Adversarial Tests', () => {
	/**
	 * Attack Vector 1: Can duplicate detection overwrite CRITICAL message?
	 * Attempt: Create duplicate where previous message has plan.md content (CRITICAL)
	 * Expected: Previous message remains CRITICAL, not demoted to DISPOSABLE
	 * Attack fails if: Guard at line `results[i-1] >= MEDIUM` prevents overwrite
	 */
	it('should NOT demote CRITICAL message to DISPOSABLE via duplicate detection', () => {
		const messages: MessageWithParts[] = [
			{
				info: {
					role: 'assistant',
					toolName: 'read_file',
					toolArgs: { filePath: '.swarm/plan.md' },
				},
				parts: [
					{
						type: 'text',
						text: 'Reading .swarm/plan.md for task execution.',
					},
				],
			},
			{
				info: {
					role: 'assistant',
					toolName: 'read_file',
					toolArgs: { filePath: '.swarm/plan.md' },
				},
			},
		];

		const results = classifyMessages(messages, 10);

		// First message has plan content → CRITICAL (0)
		// CRITICAL < MEDIUM (2), so guard at results[i-1] >= MEDIUM should NOT demote it
		expect(results[0]).toBe(MessagePriority.CRITICAL);
		expect(results[0]).toBe(0);

		// Attack fails - CRITICAL message was not demoted
	});

	/**
	 * Attack Vector 2: Can attacker claim low priority by crafting message?
	 * Attempt: Create tool result that looks like duplicate to demote important message
	 * Expected: Only actual duplicates (same tool + first arg) are marked
	 * Attack fails if: isDuplicateToolRead logic is correct
	 */
	it('should NOT mark similar tool calls with different args as duplicate', () => {
		const messages: MessageWithParts[] = [
			{
				info: {
					role: 'assistant',
					toolName: 'read_file',
					toolArgs: { filePath: 'src/important.ts' },
				},
			},
			{
				info: {
					role: 'assistant',
					toolName: 'read_file',
					toolArgs: { filePath: 'src/other.ts' }, // Different first arg
				},
			},
		];

		const results = classifyMessages(messages, 10);

		// Different args → not duplicate → should not be DISPOSABLE
		expect(results[0]).not.toBe(MessagePriority.DISPOSABLE);
	});

	/**
	 * Additional test: Different tool names should not be marked as duplicate
	 */
	it('should NOT mark different tool names as duplicate even with same args', () => {
		const messages: MessageWithParts[] = [
			{
				info: {
					role: 'assistant',
					toolName: 'read_file',
					toolArgs: { filePath: 'src/config.ts' },
				},
			},
			{
				info: {
					role: 'assistant',
					toolName: 'write_file', // Different tool
					toolArgs: { filePath: 'src/config.ts' }, // Same first arg
				},
			},
		];

		const results = classifyMessages(messages, 10);

		// Different tool → not duplicate → should not be DISPOSABLE
		expect(results[0]).not.toBe(MessagePriority.DISPOSABLE);
	});

	/**
	 * Attack Vector 3: Does plan content always win over other classifications?
	 * Attempt: Create message that's BOTH a recent assistant message AND contains plan content
	 * Expected: Plan content classification (CRITICAL) should take precedence
	 * Attack fails if: Plan check happens early enough
	 */
	it('should prioritize plan content classification over other rules', () => {
		// This is a recent assistant message (would normally be MEDIUM)
		// But it contains plan content (should be CRITICAL)
		const message: MessageWithParts = {
			info: {
				role: 'assistant',
			},
			parts: [
				{
					type: 'text',
					text: 'I checked .swarm/plan.md and will execute tasks.',
				},
			],
		};

		// Recent: index=95 of 100 → positionFromEnd = 4 (MEDIUM normally)
		const result = classifyMessage(message, 95, 100, 10);

		// Plan content check happens first (line 207), so CRITICAL wins
		expect(result).toBe(MessagePriority.CRITICAL);
		expect(result).toBe(0);
	});

	/**
	 * Additional test: Plan content wins even over system role
	 * (though both are CRITICAL, this confirms order doesn't matter)
	 */
	it('should classify system message with plan content as CRITICAL', () => {
		const message: MessageWithParts = {
			info: {
				role: 'system',
			},
			parts: [
				{
					type: 'text',
					text: 'System prompt referencing .swarm/plan.md',
				},
			],
		};

		const result = classifyMessage(message, 0, 100);

		expect(result).toBe(MessagePriority.CRITICAL);
	});

	/**
	 * Attack Vector 4: Does stale error detection correctly identify old messages?
	 * Attempt: Create error message and test isStaleError with various turnsAgo values
	 * Expected: turnsAgo <= 6 → not stale, turnsAgo > 6 → stale (DISPOSABLE)
	 * Attack fails if: Boundary is wrong
	 */
	it('should correctly enforce stale error boundary at 6 turns', () => {
		const errorText = 'Error: failed to connect to database';

		// Test boundary: turnsAgo = 6 should NOT be stale
		expect(isStaleError(errorText, 6)).toBe(false);

		// Test boundary: turnsAgo = 7 should be stale
		expect(isStaleError(errorText, 7)).toBe(true);

		// Test well within threshold
		expect(isStaleError(errorText, 0)).toBe(false);
		expect(isStaleError(errorText, 3)).toBe(false);

		// Test well outside threshold
		expect(isStaleError(errorText, 10)).toBe(true);
		expect(isStaleError(errorText, 20)).toBe(true);
	});

	/**
	 * Additional test: Non-error messages should not be marked stale regardless of age
	 */
	it('should NOT mark non-error messages as stale even if old', () => {
		const normalText = 'Operation completed successfully.';

		// Even very old non-error messages should not be stale
		expect(isStaleError(normalText, 7)).toBe(false);
		expect(isStaleError(normalText, 20)).toBe(false);
	});

	/**
	 * Additional test: Empty or null text should not cause stale error
	 */
	it('should handle empty or null text gracefully', () => {
		expect(isStaleError('', 10)).toBe(false);
		expect(isStaleError(null as unknown as string, 10)).toBe(false);
		expect(isStaleError(undefined as unknown as string, 10)).toBe(false);
	});
});

describe('Message Priority Classifier - Edge Cases', () => {
	it('should handle messages with no parts', () => {
		const message: MessageWithParts = {
			info: {
				role: 'assistant',
			},
		};

		const result = classifyMessage(message, 50, 100);

		// Default to LOW for unknown/unclassified
		expect(result).toBe(MessagePriority.LOW);
	});

	it('should handle unknown role with default LOW priority', () => {
		const message: MessageWithParts = {
			info: {
				role: 'unknown',
			},
			parts: [
				{
					type: 'text',
					text: 'Some content from unknown role',
				},
			],
		};

		const result = classifyMessage(message, 50, 100);

		// Default to LOW for unknown/unclassified roles
		expect(result).toBe(MessagePriority.LOW);
	});

	it('should handle messages with no info', () => {
		const message: MessageWithParts = {
			parts: [
				{
					type: 'text',
					text: 'Some content',
				},
			],
		};

		const result = classifyMessage(message, 50, 100);

		// Default to LOW for unknown/unclassified
		expect(result).toBe(MessagePriority.LOW);
	});

	it('should handle empty messages array', () => {
		const results = classifyMessages([]);

		expect(results).toEqual([]);
	});

	it('should handle tool result at boundary of recent window', () => {
		const message: MessageWithParts = {
			info: {
				role: 'assistant',
				toolName: 'read_file',
				toolArgs: { filePath: 'test.txt' },
			},
			parts: [
				{
					type: 'text',
					text: 'File content',
				},
			],
		};

		// Exactly at boundary: index=90 of 100 → positionFromEnd = 9 (within window of 10)
		const result = classifyMessage(message, 90, 100, 10);

		expect(result).toBe(MessagePriority.MEDIUM);
	});

	it('should handle tool result just outside boundary of recent window', () => {
		const message: MessageWithParts = {
			info: {
				role: 'assistant',
				toolName: 'read_file',
				toolArgs: { filePath: 'test.txt' },
			},
			parts: [
				{
					type: 'text',
					text: 'File content',
				},
			],
		};

		// Just outside boundary: index=89 of 100 → positionFromEnd = 10 (outside window of 10)
		const result = classifyMessage(message, 89, 100, 10);

		expect(result).toBe(MessagePriority.LOW);
	});
});

describe('Message Priority Classifier - Helper Functions', () => {
	describe('containsPlanContent', () => {
		it('should detect .swarm/plan references', () => {
			expect(containsPlanContent('Reading .swarm/plan.md')).toBe(true);
		});

		it('should detect .swarm/context references', () => {
			expect(containsPlanContent('Checking .swarm/context.md')).toBe(true);
		});

		it('should detect swarm/plan.md references', () => {
			expect(containsPlanContent('swarm/plan.md contains tasks')).toBe(true);
		});

		it('should detect swarm/context.md references', () => {
			expect(containsPlanContent('swarm/context.md updated')).toBe(true);
		});

		it('should be case-insensitive', () => {
			expect(containsPlanContent('READING .SWARM/PLAN.MD')).toBe(true);
		});

		it('should return false for normal text', () => {
			expect(containsPlanContent('This is normal message content')).toBe(false);
		});

		it('should handle empty string', () => {
			expect(containsPlanContent('')).toBe(false);
		});

		it('should handle null input', () => {
			expect(containsPlanContent(null as unknown as string)).toBe(false);
		});
	});

	describe('isToolResult', () => {
		it('should return true for assistant message with tool info', () => {
			const message: MessageWithParts = {
				info: {
					role: 'assistant',
					toolName: 'read_file',
				},
			};

			expect(isToolResult(message)).toBe(true);
		});

		it('should return false for user message with tool info', () => {
			const message: MessageWithParts = {
				info: {
					role: 'user',
					toolName: 'read_file',
				},
			};

			expect(isToolResult(message)).toBe(false);
		});

		it('should return false for assistant message without tool name', () => {
			const message: MessageWithParts = {
				info: {
					role: 'assistant',
				},
			};

			expect(isToolResult(message)).toBe(false);
		});

		it('should return false for message without info', () => {
			const message: MessageWithParts = {
				parts: [],
			};

			expect(isToolResult(message)).toBe(false);
		});
	});

	describe('isDuplicateToolRead', () => {
		it('should return true for identical read tool calls', () => {
			const current: MessageWithParts = {
				info: {
					toolName: 'read_file',
					toolArgs: { filePath: 'test.txt' },
				},
			};
			const previous: MessageWithParts = {
				info: {
					toolName: 'read_file',
					toolArgs: { filePath: 'test.txt' },
				},
			};

			expect(isDuplicateToolRead(current, previous)).toBe(true);
		});

		it('should return false for different tool names', () => {
			const current: MessageWithParts = {
				info: {
					toolName: 'read_file',
					toolArgs: { filePath: 'test.txt' },
				},
			};
			const previous: MessageWithParts = {
				info: {
					toolName: 'write_file',
					toolArgs: { filePath: 'test.txt' },
				},
			};

			expect(isDuplicateToolRead(current, previous)).toBe(false);
		});

		it('should return false for different first args', () => {
			const current: MessageWithParts = {
				info: {
					toolName: 'read_file',
					toolArgs: { filePath: 'test.txt' },
				},
			};
			const previous: MessageWithParts = {
				info: {
					toolName: 'read_file',
					toolArgs: { filePath: 'other.txt' },
				},
			};

			expect(isDuplicateToolRead(current, previous)).toBe(false);
		});

		it('should return false for non-read tools', () => {
			const current: MessageWithParts = {
				info: {
					toolName: 'bash',
					toolArgs: { command: 'ls' },
				},
			};
			const previous: MessageWithParts = {
				info: {
					toolName: 'bash',
					toolArgs: { command: 'ls' },
				},
			};

			expect(isDuplicateToolRead(current, previous)).toBe(false);
		});

		it('should return false when tool args are missing', () => {
			const current: MessageWithParts = {
				info: {
					toolName: 'read_file',
				},
			};
			const previous: MessageWithParts = {
				info: {
					toolName: 'read_file',
				},
			};

			expect(isDuplicateToolRead(current, previous)).toBe(false);
		});

		it('should return false when messages are missing info', () => {
			const current: MessageWithParts = {};
			const previous: MessageWithParts = {};

			expect(isDuplicateToolRead(current, previous)).toBe(false);
		});
	});

	describe('isStaleError', () => {
		it('should detect various error patterns', () => {
			expect(isStaleError('Error: something went wrong', 10)).toBe(true);
			expect(isStaleError('Failed to connect', 10)).toBe(true);
			expect(isStaleError('Could not find file', 10)).toBe(true);
			expect(isStaleError('Unable to process', 10)).toBe(true);
			expect(isStaleError('Exception occurred', 10)).toBe(true);
			expect(isStaleError('Errno 42', 10)).toBe(true);
			expect(isStaleError('Cannot read file', 10)).toBe(true);
			expect(isStaleError('Not found', 10)).toBe(true);
			expect(isStaleError('Access denied', 10)).toBe(true);
			expect(isStaleError('Timeout error', 10)).toBe(true);
		});

		it('should be case-insensitive for error detection', () => {
			expect(isStaleError('ERROR: FAILED TO CONNECT', 10)).toBe(true);
			expect(isStaleError('Error: failed to connect', 10)).toBe(true);
		});

		it('should not mark non-error text as stale', () => {
			expect(isStaleError('Success! Operation completed.', 10)).toBe(false);
			expect(isStaleError('All tests passed.', 10)).toBe(false);
		});
	});
});
