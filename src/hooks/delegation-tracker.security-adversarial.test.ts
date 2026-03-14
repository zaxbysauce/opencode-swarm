/**
 * Adversarial Security Tests for Task 2.13.1
 * Threading plugin directory into createDelegationTrackerHook
 *
 * Attack vectors: malformed inputs, oversized payloads, injection attempts, boundary violations
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDelegationTrackerHook } from './delegation-tracker';

// Mock the swarm state
vi.mock('./state', async () => {
	const actual = await vi.importActual('./state');
	return {
		...actual,
		swarmState: {
			activeAgent: new Map<string, string>(),
			agentSessions: new Map(),
			delegationChains: new Map(),
			pendingEvents: 0,
		},
		ensureAgentSession: vi.fn(() => ({
			sessionId: 'test',
			agentName: 'test',
			delegationActive: false,
			lastAgentEventTime: Date.now(),
			directory: 'test',
		})),
		beginInvocation: vi.fn(),
		recordPhaseAgentDispatch: vi.fn(),
		updateAgentEventTime: vi.fn(),
	};
});

describe('Task 2.13.1: Adversarial Security Tests - directory parameter', () => {
	let originalCwd: string;

	beforeEach(() => {
		originalCwd = process.cwd();
	});

	afterEach(() => {
		process.chdir(originalCwd);
	});

	describe('Malformed Inputs', () => {
		it('should handle null directory', () => {
			expect(() => createDelegationTrackerHook(null as any, {})).not.toThrow();
		});

		it('should handle undefined directory', () => {
			expect(() =>
				createDelegationTrackerHook(undefined as any, {}),
			).not.toThrow();
		});

		it('should handle number as directory', () => {
			expect(() => createDelegationTrackerHook(12345 as any, {})).not.toThrow();
		});

		it('should handle boolean as directory', () => {
			expect(() => createDelegationTrackerHook(true as any, {})).not.toThrow();
		});

		it('should handle array as directory', () => {
			expect(() =>
				createDelegationTrackerHook(['/dir1', '/dir2'] as any, {}),
			).not.toThrow();
		});

		it('should handle object as directory', () => {
			expect(() =>
				createDelegationTrackerHook({ path: '/test' } as any, {}),
			).not.toThrow();
		});

		it('should handle function as directory', () => {
			expect(() =>
				createDelegationTrackerHook((() => '/test') as any, {}),
			).not.toThrow();
		});

		it('should handle Symbol as directory', () => {
			expect(() =>
				createDelegationTrackerHook(Symbol('test') as any, {}),
			).not.toThrow();
		});
	});

	describe('Empty and Boundary Values', () => {
		it('should handle empty string directory', () => {
			expect(() => createDelegationTrackerHook('', {})).not.toThrow();
		});

		it('should handle whitespace-only directory', () => {
			expect(() => createDelegationTrackerHook('   ', {})).not.toThrow();
		});

		it('should handle tab and newline characters', () => {
			expect(() => createDelegationTrackerHook('\t\n\r', {})).not.toThrow();
		});
	});

	describe('Oversized Payloads', () => {
		it('should handle extremely long path (10KB)', () => {
			const longPath = '/a'.repeat(5120);
			expect(() => createDelegationTrackerHook(longPath, {})).not.toThrow();
		});

		it('should handle path with maximum safe integer', () => {
			const pathWithMaxInt = `/path/${Number.MAX_SAFE_INTEGER}`;
			expect(() =>
				createDelegationTrackerHook(pathWithMaxInt, {}),
			).not.toThrow();
		});

		it('should handle path with negative number', () => {
			expect(() =>
				createDelegationTrackerHook('/path/-12345', {}),
			).not.toThrow();
		});

		it('should handle very large object as config', () => {
			const largeConfig: Record<string, unknown> = {};
			for (let i = 0; i < 1000; i++) {
				largeConfig[`key${i}`] = `value${i}`;
			}
			expect(() =>
				createDelegationTrackerHook('/test/directory', largeConfig),
			).not.toThrow();
		});
	});

	describe('Injection Attempts', () => {
		it('should handle path traversal attempts', () => {
			const paths = [
				'../../../etc/passwd',
				'..\\..\\windows\\system32',
				'/../../etc/passwd',
				'....//....//....//etc/passwd',
				'/..%2f..%2fetc/passwd',
			];
			paths.forEach((path) => {
				expect(() => createDelegationTrackerHook(path, {})).not.toThrow();
			});
		});

		it('should handle template literal injection', () => {
			const paths = [
				'${process.env.HOME}',
				'${__dirname}',
				'`whoami`',
				'$(whoami)',
				'{{env.HOME}}',
			];
			paths.forEach((path) => {
				expect(() => createDelegationTrackerHook(path, {})).not.toThrow();
			});
		});

		it('should handle SQL injection patterns', () => {
			const paths = [
				"/test'; DROP TABLE agents;--",
				'/test" OR "1"="1',
				'/test UNION SELECT * FROM',
			];
			paths.forEach((path) => {
				expect(() => createDelegationTrackerHook(path, {})).not.toThrow();
			});
		});

		it('should handle HTML/script injection patterns', () => {
			const paths = [
				'/test/<script>alert(1)</script>',
				'/test<img src=x onerror=alert(1)>',
				'/testjavascript:alert(1)',
				'/testdata:text/html,<h1>xss</h1>',
			];
			paths.forEach((path) => {
				expect(() => createDelegationTrackerHook(path, {})).not.toThrow();
			});
		});

		it('should handle null byte injection', () => {
			const paths = ['/test\x00/inject', '/test\u0000path', '/test%00inject'];
			paths.forEach((path) => {
				expect(() => createDelegationTrackerHook(path, {})).not.toThrow();
			});
		});
	});

	describe('Unicode and Special Characters', () => {
		it('should handle Unicode path', () => {
			const paths = [
				'/日本語/テスト',
				'/中文/测试',
				'/Русский/тест',
				'/العربية/اختبار',
				'/🎉/emoji',
			];
			paths.forEach((path) => {
				expect(() => createDelegationTrackerHook(path, {})).not.toThrow();
			});
		});

		it('should handle combining characters', () => {
			expect(() =>
				createDelegationTrackerHook('/test\u0301\u0302\u0303', {}),
			).not.toThrow();
		});

		it('should handle RTL override characters', () => {
			expect(() =>
				createDelegationTrackerHook('/test\u202edir\u202c', {}),
			).not.toThrow();
		});

		it('should handle zero-width characters', () => {
			expect(() =>
				createDelegationTrackerHook('/test\u200b\u200c\u200dpath', {}),
			).not.toThrow();
		});

		it('should handle special shell characters', () => {
			const paths = [
				'/test; rm -rf /',
				'/test && echo pwned',
				'/test | cat /etc/passwd',
				'/test`whoami`',
				'/test>file.txt',
				'/test<file.txt',
			];
			paths.forEach((path) => {
				expect(() => createDelegationTrackerHook(path, {})).not.toThrow();
			});
		});
	});

	describe('Legacy Signature Compatibility', () => {
		it('should handle legacy 1-arg signature with malformed config', () => {
			expect(() => createDelegationTrackerHook({} as any)).not.toThrow();
		});

		it('should handle legacy 3-arg signature with null directory', () => {
			expect(() =>
				createDelegationTrackerHook({} as any, true, null as any),
			).not.toThrow();
		});

		it('should handle legacy 3-arg signature with empty directory', () => {
			expect(() =>
				createDelegationTrackerHook({} as any, true, ''),
			).not.toThrow();
		});
	});

	describe('Hook Execution with Malformed Inputs', () => {
		it('should execute hook with null agent', async () => {
			const hook = createDelegationTrackerHook('/test/dir', {});
			await expect(
				hook({ sessionID: 'test', agent: null as any }, {}),
			).resolves.not.toThrow();
		});

		it('should execute hook with undefined agent', async () => {
			const hook = createDelegationTrackerHook('/test/dir', {});
			await expect(
				hook({ sessionID: 'test', agent: undefined }, {}),
			).resolves.not.toThrow();
		});

		it('should execute hook with numeric agent', async () => {
			const hook = createDelegationTrackerHook('/test/dir', {});
			await expect(
				hook({ sessionID: 'test', agent: 12345 as any }, {}),
			).resolves.not.toThrow();
		});

		it('should execute hook with object agent', async () => {
			const hook = createDelegationTrackerHook('/test/dir', {});
			await expect(
				hook({ sessionID: 'test', agent: { name: 'test' } as any }, {}),
			).resolves.not.toThrow();
		});

		it('should execute hook with array agent', async () => {
			const hook = createDelegationTrackerHook('/test/dir', {});
			await expect(
				hook({ sessionID: 'test', agent: ['a1', 'a2'] as any }, {}),
			).resolves.not.toThrow();
		});

		it('should execute hook with special agent names', async () => {
			const hook = createDelegationTrackerHook('/test/dir', {});
			const agents = [
				'',
				'   ',
				'\n\t\r',
				'<script>alert(1)</script>',
				'../../../etc/passwd',
			];
			for (const agent of agents) {
				await expect(
					hook({ sessionID: 'test', agent }, {}),
				).resolves.not.toThrow();
			}
		});
	});

	describe('Hook Execution with Oversized Input', () => {
		it('should execute hook with very long session ID', async () => {
			const hook = createDelegationTrackerHook('/test/dir', {});
			const longId = 'session-' + 'x'.repeat(10000);
			await expect(
				hook({ sessionID: longId, agent: 'mega_coder' }, {}),
			).resolves.not.toThrow();
		});

		it('should execute hook with very long agent name', async () => {
			const hook = createDelegationTrackerHook('/test/dir', {});
			const longAgent = 'mega_agent_' + 'x'.repeat(10000);
			await expect(
				hook({ sessionID: 'test', agent: longAgent }, {}),
			).resolves.not.toThrow();
		});

		it('should execute hook with deeply nested output', async () => {
			const hook = createDelegationTrackerHook('/test/dir', {});
			let nested: Record<string, unknown> = {};
			for (let i = 0; i < 100; i++) {
				nested = { nested };
			}
			await expect(
				hook({ sessionID: 'test', agent: 'mega_coder' }, nested),
			).resolves.not.toThrow();
		});
	});

	describe('Edge Cases - NaN and Infinity', () => {
		it('should handle NaN directory', () => {
			expect(() => createDelegationTrackerHook(NaN as any, {})).not.toThrow();
		});

		it('should handle Infinity directory', () => {
			expect(() =>
				createDelegationTrackerHook(Infinity as any, {}),
			).not.toThrow();
		});

		it('should handle -Infinity directory', () => {
			expect(() =>
				createDelegationTrackerHook(-Infinity as any, {}),
			).not.toThrow();
		});

		it('should handle negative zero', () => {
			expect(() => createDelegationTrackerHook(-0 as any, {})).not.toThrow();
		});
	});

	describe('Config Parameter Injection', () => {
		it('should handle null config', () => {
			expect(() =>
				createDelegationTrackerHook('/test/dir', null as any),
			).not.toThrow();
		});

		it('should handle undefined config', () => {
			expect(() =>
				createDelegationTrackerHook('/test/dir', undefined as any),
			).not.toThrow();
		});

		it('should handle boolean as config', () => {
			expect(() =>
				createDelegationTrackerHook('/test/dir', true as any),
			).not.toThrow();
		});

		it('should handle string as config', () => {
			expect(() =>
				createDelegationTrackerHook('/test/dir', 'malicious' as any),
			).not.toThrow();
		});

		it('should handle number as config', () => {
			expect(() =>
				createDelegationTrackerHook('/test/dir', 12345 as any),
			).not.toThrow();
		});

		it('should handle circular reference in config', () => {
			const circular: Record<string, unknown> = {};
			circular.self = circular;
			expect(() =>
				createDelegationTrackerHook('/test/dir', circular),
			).not.toThrow();
		});

		it('should handle prototype pollution attempt', () => {
			const malicious = {
				__proto__: { polluted: true },
				constructor: { prototype: { pollute: true } },
			} as any;
			expect(() =>
				createDelegationTrackerHook('/test/dir', malicious),
			).not.toThrow();
		});
	});
});
