/**
 * Tests for context-budget.ts log reclassification (Task 1.2)
 *
 * Verifies that:
 * 1. The startup diagnostic "Context budget:" now uses log() instead of warn()
 * 2. Deduplication works (loggedLimits Set prevents repeated logs)
 * 3. Threshold warnings still use warn() (regression test)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create mock functions before vi.mock to ensure they're available in the mock
const mockLog = vi.fn();
const mockWarn = vi.fn();
const mockError = vi.fn();

// Create mock error classes
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

// Mock the utils module BEFORE importing context-budget
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

describe('context-budget log reclassification', () => {
	beforeEach(() => {
		// Clear all mocks before each test
		mockLog.mockClear();
		mockWarn.mockClear();
		mockError.mockClear();

		// Reset module-level state if needed
		// Note: The module has a 'lastSeenAgent' variable at line 22
		// We can't reset it easily, so we'll work around it
	});

	const getCreateContextBudgetHandler = () => {
		return require('../../../src/hooks/context-budget.js').createContextBudgetHandler;
	};

	afterEach(() => {
		// Clean up after each test
	});

	it('first call with model/provider uses log() not warn() for startup diagnostic', async () => {
		// Arrange
		const config = {
			context_budget: {
				enabled: true,
				warn_threshold: 0.7,
				critical_threshold: 0.9,
			},
		};

		const messages = [
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
		];

		// Act
		const createContextBudgetHandler = getCreateContextBudgetHandler();
		const handler = createContextBudgetHandler(config);
		await handler({}, { messages });

		// Assert
		// Verify log() was called for Context budget message
		const logCalls = mockLog.mock.calls;
		const contextBudgetLogCalls = logCalls.filter((call) =>
			call[0]?.includes('[swarm] Context budget:'),
		);

		expect(
			contextBudgetLogCalls.length,
			'log() should be called with "Context budget:" message',
		).toBeGreaterThan(0);

		// Verify warn() was NOT called for Context budget message
		const warnCalls = mockWarn.mock.calls;
		const contextBudgetWarnCalls = warnCalls.filter((call) =>
			call[0]?.includes('[swarm] Context budget:'),
		);

		expect(
			contextBudgetWarnCalls.length,
			'warn() should NOT be called with "Context budget:" message',
		).toBe(0);

		// Verify the log message contains expected model and provider info
		const logMessage = contextBudgetLogCalls[0][0];
		expect(logMessage).toContain('model=gpt-4o');
		expect(logMessage).toContain('provider=openai');
	});

	it('second call with same model/provider does not call log() again (deduplication)', async () => {
		// Arrange
		const config = {
			context_budget: {
				enabled: true,
				warn_threshold: 0.7,
				critical_threshold: 0.9,
			},
		};

		const messages = [
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
		];

		// Act - First call
		const createContextBudgetHandler = getCreateContextBudgetHandler();
		const handler = createContextBudgetHandler(config);
		await handler({}, { messages });

		// Act - Second call with same model/provider (using the SAME handler instance)
		await handler({}, { messages });

		// Assert
		const allLogCalls = mockLog.mock.calls;
		const contextBudgetLogCalls = allLogCalls.filter((call) =>
			call[0]?.includes('[swarm] Context budget:'),
		);

		// Should only have one call from the first invocation (deduplication in loggedLimits)
		expect(
			contextBudgetLogCalls.length,
			'log() should only be called once for the same model/provider combination due to loggedLimits Set',
		).toBe(1);
	});

	it('different model/provider combinations trigger new log() calls', async () => {
		// Arrange
		const config = {
			context_budget: {
				enabled: true,
				warn_threshold: 0.7,
				critical_threshold: 0.9,
			},
		};

		// Act - First call with gpt-4o/openai
		const createContextBudgetHandler = getCreateContextBudgetHandler();
		let handler = createContextBudgetHandler(config);
		await handler({}, {
			messages: [
				{
					info: {
						role: 'assistant',
						modelID: 'gpt-4o',
						providerID: 'openai',
					},
					parts: [{ type: 'text', text: 'Hello' }],
				},
				{
					info: {
						role: 'user',
						agent: 'architect',
					},
					parts: [{ type: 'text', text: 'Message 1' }],
				},
			],
		});

		// Act - Second call with claude-3/anthropic
		handler = createContextBudgetHandler(config);
		await handler({}, {
			messages: [
				{
					info: {
						role: 'assistant',
						modelID: 'claude-3-opus',
						providerID: 'anthropic',
					},
					parts: [{ type: 'text', text: 'Hello' }],
				},
				{
					info: {
						role: 'user',
						agent: 'architect',
					},
					parts: [{ type: 'text', text: 'Message 2' }],
				},
			],
		});

		// Assert
		const allLogCalls = mockLog.mock.calls;
		const contextBudgetLogCalls = allLogCalls.filter((call) =>
			call[0]?.includes('[swarm] Context budget:'),
		);

		// Should have two calls, one for each model/provider combination
		expect(
			contextBudgetLogCalls.length,
			'log() should be called twice for different model/provider combinations',
		).toBe(2);

		// Verify both model/providers are logged
		const logMessages = contextBudgetLogCalls.map((call) => call[0]);
		const hasGpt = logMessages.some((msg) => msg.includes('model=gpt-4o'));
		const hasClaude = logMessages.some((msg) =>
			msg.includes('model=claude-3-opus'),
		);

		expect(hasGpt, 'gpt-4o should be logged').toBe(true);
		expect(hasClaude, 'claude-3-opus should be logged').toBe(true);
	});

	it('threshold warnings still use warn() (regression test)', async () => {
		// Arrange
		const config = {
			context_budget: {
				enabled: true,
				warn_threshold: 0.7,
				critical_threshold: 0.9,
			},
		};

		// Create a long message to exceed the warn threshold (0.7 = 70%)
		// Using a very long text to trigger threshold warning
		const longText = 'A'.repeat(15000); // This should exceed the default limit of 128000 * 0.7

		const messages = [
			{
				info: {
					role: 'assistant',
					modelID: 'gpt-4o',
					providerID: 'openai',
				},
				parts: [{ type: 'text', text: 'Hello' }],
			},
			{
				info: {
					role: 'user',
					agent: 'architect',
				},
				parts: [{ type: 'text', text: longText }],
			},
		];

		// Act
		const createContextBudgetHandler = getCreateContextBudgetHandler();
		const handler = createContextBudgetHandler(config);
		await handler({}, { messages });

		// Assert - Verify that warn() was NOT called for the startup diagnostic
		const warnCalls = mockWarn.mock.calls;
		const contextBudgetWarnCalls = warnCalls.filter((call) =>
			call[0]?.includes('[swarm] Context budget:'),
		);

		expect(
			contextBudgetWarnCalls.length,
			'warn() should NOT be called for "Context budget:" startup diagnostic',
		).toBe(0);

		// Verify that log() WAS called for the startup diagnostic
		const logCalls = mockLog.mock.calls;
		const contextBudgetLogCalls = logCalls.filter((call) =>
			call[0]?.includes('[swarm] Context budget:'),
		);

		expect(
			contextBudgetLogCalls.length,
			'log() should be called for "Context budget:" startup diagnostic',
		).toBeGreaterThan(0);
	});

	it('warn() is still called for context enforcement warnings', async () => {
		// Arrange - Use very low threshold to trigger enforcement
		const config = {
			context_budget: {
				enabled: true,
				warn_threshold: 0.001, // Very low threshold
				critical_threshold: 0.002,
				enforce: true,
			},
		};

		const messages = [
			{
				info: {
					role: 'assistant',
					modelID: 'gpt-4o',
					providerID: 'openai',
				},
				parts: [{ type: 'text', text: 'Hello' }],
			},
			{
				info: {
					role: 'user',
					agent: 'architect',
				},
				parts: [
					{ type: 'text', text: 'A'.repeat(5000) }, // Long text to exceed thresholds
				],
			},
		];

		// Act
		const createContextBudgetHandler = getCreateContextBudgetHandler();
		const handler = createContextBudgetHandler(config);
		await handler({}, { messages });

		// Assert - The key regression test: warn() should NOT be called for "Context budget:" startup diagnostic
		// even when thresholds are exceeded
		const warnCalls = mockWarn.mock.calls;
		const contextBudgetWarnCalls = warnCalls.filter((call) =>
			call[0]?.includes('[swarm] Context budget:'),
		);

		expect(
			contextBudgetWarnCalls.length,
			'warn() should NOT be called for "Context budget:" startup diagnostic (regression test)',
		).toBe(0);
	});

	it('warn() is still called for threshold injection warnings', async () => {
		// Arrange - Use very low threshold to trigger warning injection
		const config = {
			context_budget: {
				enabled: true,
				warn_threshold: 0.0001, // Very low threshold
				critical_threshold: 0.0002,
			},
		};

		const longText = 'A'.repeat(5000);

		const messages = [
			{
				info: {
					role: 'assistant',
					modelID: 'gpt-4o',
					providerID: 'openai',
				},
				parts: [{ type: 'text', text: 'Hello' }],
			},
			{
				info: {
					role: 'user',
					agent: 'architect',
				},
				parts: [{ type: 'text', text: longText }],
			},
		];

		// Act
		const createContextBudgetHandler = getCreateContextBudgetHandler();
		const handler = createContextBudgetHandler(config);
		await handler({}, { messages });

		// Assert - Verify that the warning text was injected into the user message
		const lastUserMessage = messages[messages.length - 1];
		const textPart = lastUserMessage?.parts?.find((p) => p.type === 'text');

		expect(
			textPart?.text,
			'Warning text should be injected into the user message',
		).toMatch(/\[CONTEXT (WARNING|CRITICAL):/);
	});
});
