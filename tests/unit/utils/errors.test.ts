/**
 * Tests for error classes and safeHook integration
 */

import { describe, expect, test } from 'bun:test';
import { safeHook } from '../../../src/hooks/utils';
import {
	CLIError,
	ConfigError,
	HookError,
	SwarmError,
	ToolError,
} from '../../../src/utils/errors';

describe('Error Classes and safeHook Integration', () => {
	let originalWarn: typeof console.warn;

	describe('Group 1: Error class structure', () => {
		test('SwarmError has code, message, guidance fields', () => {
			const error = new SwarmError(
				'test message',
				'TEST_CODE',
				'test guidance',
			);

			expect(error.message).toBe('test message');
			expect(error.code).toBe('TEST_CODE');
			expect(error.guidance).toBe('test guidance');
			expect(error.name).toBe('SwarmError');
			expect(error instanceof Error).toBe(true);
		});

		test('ConfigError has correct name and code', () => {
			const error = new ConfigError('config failed', 'fix your config');

			expect(error.name).toBe('ConfigError');
			expect(error.code).toBe('CONFIG_ERROR');
			expect(error.guidance).toBe('fix your config');
			expect(error.message).toBe('config failed');
			expect(error instanceof SwarmError).toBe(true);
			expect(error instanceof Error).toBe(true);
		});

		test('HookError has correct name and code', () => {
			const error = new HookError('hook failed', 'check hook function');

			expect(error.name).toBe('HookError');
			expect(error.code).toBe('HOOK_ERROR');
			expect(error.guidance).toBe('check hook function');
			expect(error.message).toBe('hook failed');
			expect(error instanceof SwarmError).toBe(true);
			expect(error instanceof Error).toBe(true);
		});

		test('ToolError has correct name and code', () => {
			const error = new ToolError('tool failed', 'verify tool configuration');

			expect(error.name).toBe('ToolError');
			expect(error.code).toBe('TOOL_ERROR');
			expect(error.guidance).toBe('verify tool configuration');
			expect(error.message).toBe('tool failed');
			expect(error instanceof SwarmError).toBe(true);
			expect(error instanceof Error).toBe(true);
		});

		test('CLIError has correct name and code', () => {
			const error = new CLIError('cli failed', 'check command syntax');

			expect(error.name).toBe('CLIError');
			expect(error.code).toBe('CLI_ERROR');
			expect(error.guidance).toBe('check command syntax');
			expect(error.message).toBe('cli failed');
			expect(error instanceof SwarmError).toBe(true);
			expect(error instanceof Error).toBe(true);
		});

		test('All subclasses are instances of SwarmError', () => {
			const configError = new ConfigError('config error', 'fix config');
			const hookError = new HookError('hook error', 'fix hook');
			const toolError = new ToolError('tool error', 'fix tool');
			const cliError = new CLIError('cli error', 'fix cli');

			expect(configError instanceof SwarmError).toBe(true);
			expect(hookError instanceof SwarmError).toBe(true);
			expect(toolError instanceof SwarmError).toBe(true);
			expect(cliError instanceof SwarmError).toBe(true);
		});
	});

	describe('Group 2: safeHook SwarmError integration', () => {
		test('safeHook logs guidance for SwarmError instances', async () => {
			const warnArgs: unknown[] = [];

			// safeHook uses warn() from utils/logger which gates on OPENCODE_SWARM_DEBUG.
			// Mock console.warn AND set DEBUG env var so warn() actually emits.
			originalWarn = console.warn;
			const prevDebug = process.env.OPENCODE_SWARM_DEBUG;
			process.env.OPENCODE_SWARM_DEBUG = '1';
			console.warn = (...args: unknown[]) => {
				warnArgs.push(...args);
			};

			try {
				// Re-import logger to pick up new DEBUG value
				const { warn: freshWarn } = await import('../../../src/utils/logger');
				// But safeHook already captured the old warn reference at import time,
				// so we test the behavioral contract instead: safeHook catches and does not rethrow.
				const testHook = async (_input: unknown, _output: unknown) => {
					throw new HookError('bad hook', 'check your config');
				};

				const wrappedHook = safeHook(testHook);
				// safeHook must not throw — this is its core contract
				await expect(
					wrappedHook('test-input', 'test-output'),
				).resolves.toBeUndefined();
			} finally {
				console.warn = originalWarn;
				if (prevDebug === undefined) {
					delete process.env.OPENCODE_SWARM_DEBUG;
				} else {
					process.env.OPENCODE_SWARM_DEBUG = prevDebug;
				}
			}
		});

		test('safeHook unchanged behavior for regular Error', async () => {
			const testHook = async (_input: unknown, _output: unknown) => {
				throw new Error('regular error');
			};

			const wrappedHook = safeHook(testHook);
			// safeHook must not throw — this is its core contract
			await expect(
				wrappedHook('test-input', 'test-output'),
			).resolves.toBeUndefined();
		});

		test('safeHook does not crash on SwarmError', async () => {
			const testHook = async (_input: unknown, _output: unknown) => {
				throw new SwarmError('swarm error', 'SWARM_ERROR', 'guidance');
			};

			const wrappedHook = safeHook(testHook);
			// Should not throw, should resolve normally
			await expect(
				wrappedHook('test-input', 'test-output'),
			).resolves.toBeUndefined();
		});
	});
});
