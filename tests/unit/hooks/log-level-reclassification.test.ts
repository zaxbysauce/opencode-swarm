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

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Local mock variables (NOT using vi.mocked())
const mockLog = vi.fn();
const mockWarn = vi.fn();
const mockError = vi.fn();

// Mock error classes
class MockSwarmError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SwarmError';
	}
}
const MockCLIError = MockSwarmError;
const MockConfigError = MockSwarmError;
const MockHookError = MockSwarmError;
const MockToolError = MockSwarmError;

// Mock the utils module BEFORE importing SUT modules
vi.mock('../../../src/utils/index.js', () => ({
	log: mockLog,
	warn: mockWarn,
	error: mockError,
	SwarmError: MockSwarmError,
	CLIError: MockCLIError,
	ConfigError: MockConfigError,
	HookError: MockHookError,
	ToolError: MockToolError,
}));

vi.mock('../../../src/utils', () => ({
	log: mockLog,
	warn: mockWarn,
	error: mockError,
	SwarmError: MockSwarmError,
	CLIError: MockCLIError,
	ConfigError: MockConfigError,
	HookError: MockHookError,
	ToolError: MockToolError,
}));

describe('log-level-reclassification', () => {
	beforeEach(() => {
		mockLog.mockClear();
		mockWarn.mockClear();
		mockError.mockClear();
	});

	describe('model-limits', () => {
		it('BUG-1a: warn() NOT called for "Resolved limit for" message', () => {
			// Import and call resolveModelLimit - use unique model to trigger log
			const { resolveModelLimit } = require('../../../src/hooks/model-limits.js');
			resolveModelLimit('claude-sonnet-4-6-test-unique-1', 'anthropic', {});

			// Verify warn() was NOT called with "Resolved limit for"
			const warnCalls = mockWarn.mock.calls;
			const resolvedLimitWarnCall = warnCalls.find((call) =>
				call.some((arg) => typeof arg === 'string' && arg.includes('Resolved limit for'))
			);
			expect(resolvedLimitWarnCall).toBeUndefined();
		});

		it('BUG-1a: log() IS called for "Resolved limit for" message with model info', () => {
			// Import and call resolveModelLimit - use unique model to trigger log
			const { resolveModelLimit } = require('../../../src/hooks/model-limits.js');
			resolveModelLimit('claude-sonnet-4-6-test-unique-2', 'anthropic', {});

			// Verify log() was called
			expect(mockLog).toHaveBeenCalled();

			// Verify log() was called with "Resolved limit for" and model ID
			const logCalls = mockLog.mock.calls;
			const resolvedLimitCall = logCalls.find((call) =>
				call.some(
					(arg) =>
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
			const resolvedLimitWarnCall = warnCalls.find((call) =>
				call.some((arg) => typeof arg === 'string' && arg.includes('Resolved limit for'))
			);
			expect(resolvedLimitWarnCall).toBeUndefined();
		});
	});

	describe('context-budget', () => {
		it('BUG-1b: warn() NOT called for "Context budget:" startup diagnostic', async () => {
			// Create handler with config
			const createContextBudgetHandler = require('../../../src/hooks/context-budget.js').createContextBudgetHandler;
			const handler = createContextBudgetHandler({
				context_budget: {
					enabled: true,
					warn_threshold: 0.7,
					critical_threshold: 0.9,
				},
			});

			// Invoke handler with messages containing assistant and user messages
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

			// Verify warn() was NOT called with "[swarm] Context budget:"
			const warnCalls = mockWarn.mock.calls;
			const contextBudgetWarnCall = warnCalls.find((call) =>
				call.some((arg) => typeof arg === 'string' && arg.includes('[swarm] Context budget:'))
			);
			expect(contextBudgetWarnCall).toBeUndefined();
		});

		it('BUG-1b: log() IS called for "Context budget:" with model and provider info', async () => {
			// Create handler with config
			const createContextBudgetHandler = require('../../../src/hooks/context-budget.js').createContextBudgetHandler;
			const handler = createContextBudgetHandler({
				context_budget: {
					enabled: true,
					warn_threshold: 0.7,
					critical_threshold: 0.9,
				},
			});

			// Invoke handler with messages containing assistant and user messages
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

			// Verify log() was called with "[swarm] Context budget:"
			const logCalls = mockLog.mock.calls;
			const contextBudgetLogCall = logCalls.find((call) =>
				call.some((arg) => typeof arg === 'string' && arg.includes('[swarm] Context budget:'))
			);
			expect(contextBudgetLogCall).toBeDefined();

			// Verify the log message contains model and provider info
			const logMessage = contextBudgetLogCall[0];
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
			const contextBudgetLogCall = logCalls.find((call) =>
				call.some((arg) => typeof arg === 'string' && arg.includes('[swarm] Context budget:'))
			);
			expect(contextBudgetLogCall).toBeUndefined();
		});
	});
});
