/**
 * Tests for BUG-1 log reclassifications in model-limits.ts and context-budget.ts
 *
 * BUG-1a (model-limits.ts): Verifies that logFirstCall() calls log() not warn()
 * for the message "[model-limits] Resolved limit for ${modelID}@${providerID}: ${limit} (source: ${source})"
 *
 * BUG-1b (context-budget.ts): Verifies that the startup diagnostic calls log() not warn()
 * for the message "[swarm] Context budget: model=${modelID} provider=${providerID} limit=${modelLimit}"
 *
 * This combined test file ensures both reclassifications are properly verified.
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';

// Local mock functions
const mockLog = mock(() => {});
const mockWarn = mock(() => {});
const mockError = mock(() => {});

// Mock error classes
class MockSwarmError extends Error {
	readonly code: string;
	readonly guidance: string;
	constructor(message: string, code = 'SWARM_ERROR', guidance = '') {
		super(message);
		this.name = 'SwarmError';
		this.code = code;
		this.guidance = guidance;
	}
}
class MockCLIError extends MockSwarmError {
	constructor(message: string, guidance = '') {
		super(message, 'CLI_ERROR', guidance);
		this.name = 'CLIError';
	}
}
class MockConfigError extends MockSwarmError {
	constructor(message: string, guidance = '') {
		super(message, 'CONFIG_ERROR', guidance);
		this.name = 'ConfigError';
	}
}
class MockHookError extends MockSwarmError {
	constructor(message: string, guidance = '') {
		super(message, 'HOOK_ERROR', guidance);
		this.name = 'HookError';
	}
}
class MockToolError extends MockSwarmError {
	constructor(message: string, guidance = '') {
		super(message, 'TOOL_ERROR', guidance);
		this.name = 'ToolError';
	}
}

// Mock the utils module BEFORE importing SUT modules
mock.module('../../../src/utils/index.js', () => ({
	log: mockLog,
	warn: mockWarn,
	error: mockError,
	SwarmError: MockSwarmError,
	CLIError: MockCLIError,
	ConfigError: MockConfigError,
	HookError: MockHookError,
	ToolError: MockToolError,
	deepMerge: (a: any, b: any) => ({ ...a, ...b }),
	MAX_MERGE_DEPTH: 10,
	escapeRegex: (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
	simpleGlobToRegex: (s: string) => new RegExp(s),
}));

mock.module('../../../src/utils', () => ({
	log: mockLog,
	warn: mockWarn,
	error: mockError,
	SwarmError: MockSwarmError,
	CLIError: MockCLIError,
	ConfigError: MockConfigError,
	HookError: MockHookError,
	ToolError: MockToolError,
	deepMerge: (a: any, b: any) => ({ ...a, ...b }),
	MAX_MERGE_DEPTH: 10,
	escapeRegex: (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
	simpleGlobToRegex: (s: string) => new RegExp(s),
}));

mock.module('../../../src/utils/logger', () => ({
	log: mockLog,
	warn: mockWarn,
	error: mockError,
}));

describe('log-level-reclassification', () => {
	beforeEach(() => {
		mockLog.mockClear();
		mockWarn.mockClear();
		mockError.mockClear();
	});

	describe('model-limits', () => {
		it('BUG-1a: warn() NOT called for "Resolved limit for" message', () => {
			const { resolveModelLimit } = require('../../../src/hooks/model-limits.js');
			resolveModelLimit('claude-sonnet-4-6-test-unique-1', 'anthropic', {});

			const warnCalls = mockWarn.mock.calls;
			const resolvedLimitWarnCall = warnCalls.find((call: any[]) =>
				call.some((arg: any) => typeof arg === 'string' && arg.includes('Resolved limit for'))
			);
			expect(resolvedLimitWarnCall).toBeUndefined();
		});

		it('BUG-1a: log() IS called for "Resolved limit for" message with model info', () => {
			const { resolveModelLimit } = require('../../../src/hooks/model-limits.js');
			resolveModelLimit('claude-sonnet-4-6-test-unique-2', 'anthropic', {});

			expect(mockLog).toHaveBeenCalled();

			const logCalls = mockLog.mock.calls;
			const resolvedLimitCall = logCalls.find((call: any[]) =>
				call.some(
					(arg: any) =>
						typeof arg === 'string' &&
						arg.includes('Resolved limit for') &&
						arg.includes('claude-sonnet-4-6-test-unique-2')
				)
			);
			expect(resolvedLimitCall).toBeDefined();
		});

		it('BUG-1a: undefined modelID/providerID does NOT trigger warn() for "Resolved limit for"', () => {
			const { resolveModelLimit } = require('../../../src/hooks/model-limits.js');
			resolveModelLimit(undefined, undefined, {});
			const warnCalls = mockWarn.mock.calls;
			const resolvedLimitWarnCall = warnCalls.find((call: any[]) =>
				call.some((arg: any) => typeof arg === 'string' && arg.includes('Resolved limit for'))
			);
			expect(resolvedLimitWarnCall).toBeUndefined();
		});
	});

	describe('context-budget', () => {
		it('BUG-1b: warn() NOT called for "Context budget:" startup diagnostic', async () => {
			const createContextBudgetHandler = require('../../../src/hooks/context-budget.js').createContextBudgetHandler;
			const handler = createContextBudgetHandler({
				context_budget: {
					enabled: true,
					warn_threshold: 0.7,
					critical_threshold: 0.9,
				},
			});

			await handler({}, {
				messages: [
					{
						info: {
							role: 'assistant',
							modelID: 'gpt-4o',
							providerID: 'openai',
						},
						parts: [{ type: 'text', text: 'Hello world' }],
					},
					{
						info: {
							role: 'user',
							agent: 'architect',
						},
						parts: [{ type: 'text', text: 'A test message' }],
					},
				],
			});

			const warnCalls = mockWarn.mock.calls;
			const contextBudgetWarnCall = warnCalls.find((call: any[]) =>
				call.some((arg: any) => typeof arg === 'string' && arg.includes('[swarm] Context budget:'))
			);
			expect(contextBudgetWarnCall).toBeUndefined();
		});

		it('BUG-1b: log() IS called for "Context budget:" with model and provider info', async () => {
			const createContextBudgetHandler = require('../../../src/hooks/context-budget.js').createContextBudgetHandler;
			const handler = createContextBudgetHandler({
				context_budget: {
					enabled: true,
					warn_threshold: 0.7,
					critical_threshold: 0.9,
				},
			});

			await handler({}, {
				messages: [
					{
						info: {
							role: 'assistant',
							modelID: 'gpt-4o',
							providerID: 'openai',
						},
						parts: [{ type: 'text', text: 'Hello world' }],
					},
					{
						info: {
							role: 'user',
							agent: 'architect',
						},
						parts: [{ type: 'text', text: 'A test message' }],
					},
				],
			});

			const logCalls = mockLog.mock.calls;
			const contextBudgetLogCall = logCalls.find((call: any[]) =>
				call.some((arg: any) => typeof arg === 'string' && arg.includes('[swarm] Context budget:'))
			);
			expect(contextBudgetLogCall).toBeDefined();

			const logMessage = (contextBudgetLogCall as any[])[0];
			expect(logMessage).toContain('model=gpt-4o');
			expect(logMessage).toContain('provider=openai');
		});

		it('BUG-1b: enabled:false returns no-op without calling log() or warn()', async () => {
			const createContextBudgetHandler = require('../../../src/hooks/context-budget.js').createContextBudgetHandler;
			const handler = createContextBudgetHandler({
				context_budget: { enabled: false },
			});
			await handler({}, {
				messages: [
					{
						info: { role: 'assistant', modelID: 'gpt-4o', providerID: 'openai' },
						parts: [{ type: 'text', text: 'Hello world' }],
					},
				],
			});
			expect(mockLog).not.toHaveBeenCalled();
			expect(mockWarn).not.toHaveBeenCalled();
		});

		it('BUG-1b: empty messages array returns early without logging "Context budget:"', async () => {
			const createContextBudgetHandler = require('../../../src/hooks/context-budget.js').createContextBudgetHandler;
			const handler = createContextBudgetHandler({
				context_budget: { enabled: true, warn_threshold: 0.7, critical_threshold: 0.9 },
			});
			await handler({}, { messages: [] });
			const logCalls = mockLog.mock.calls;
			const contextBudgetLogCall = logCalls.find((call: any[]) =>
				call.some((arg: any) => typeof arg === 'string' && arg.includes('[swarm] Context budget:'))
			);
			expect(contextBudgetLogCall).toBeUndefined();
		});
	});
});
