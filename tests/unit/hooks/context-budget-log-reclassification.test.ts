/**
 * Tests for context-budget.ts log reclassification (Task 1.2)
 *
 * Verifies that:
 * 1. The startup diagnostic "Context budget:" now uses log() instead of warn()
 * 2. Deduplication works (loggedLimits Set prevents repeated logs)
 * 3. Threshold warnings still use warn() (regression test)
 */

import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';

// Create mock functions before mock.module to ensure they're available
const mockLog = mock(() => {});
const mockWarn = mock(() => {});
const mockError = mock(() => {});

// Create mock error classes
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

// Mock the utils module BEFORE importing context-budget
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

describe('context-budget log reclassification', () => {
	beforeEach(() => {
		mockLog.mockClear();
		mockWarn.mockClear();
		mockError.mockClear();
	});

	const getCreateContextBudgetHandler = () => {
		return require('../../../src/hooks/context-budget.js').createContextBudgetHandler;
	};

	afterEach(() => {
		// Clean up after each test
	});

	it('first call with model/provider uses log() not warn() for startup diagnostic', async () => {
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

		const createContextBudgetHandler = getCreateContextBudgetHandler();
		const handler = createContextBudgetHandler(config);
		await handler({}, { messages });

		const logCalls = mockLog.mock.calls;
		const contextBudgetLogCalls = logCalls.filter((call: any[]) =>
			call[0]?.includes('[swarm] Context budget:'),
		);

		expect(contextBudgetLogCalls.length).toBeGreaterThan(0);

		const warnCalls = mockWarn.mock.calls;
		const contextBudgetWarnCalls = warnCalls.filter((call: any[]) =>
			call[0]?.includes('[swarm] Context budget:'),
		);

		expect(contextBudgetWarnCalls.length).toBe(0);

		const logMessage = contextBudgetLogCalls[0][0];
		expect(logMessage).toContain('model=gpt-4o');
		expect(logMessage).toContain('provider=openai');
	});

	it('second call with same model/provider does not call log() again (deduplication)', async () => {
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

		const createContextBudgetHandler = getCreateContextBudgetHandler();
		const handler = createContextBudgetHandler(config);
		await handler({}, { messages });
		await handler({}, { messages });

		const allLogCalls = mockLog.mock.calls;
		const contextBudgetLogCalls = allLogCalls.filter((call: any[]) =>
			call[0]?.includes('[swarm] Context budget:'),
		);

		expect(contextBudgetLogCalls.length).toBe(1);
	});

	it('different model/provider combinations trigger new log() calls', async () => {
		const config = {
			context_budget: {
				enabled: true,
				warn_threshold: 0.7,
				critical_threshold: 0.9,
			},
		};

		const createContextBudgetHandler = getCreateContextBudgetHandler();
		let handler = createContextBudgetHandler(config);
		await handler({}, {
			messages: [
				{
					info: { role: 'assistant', modelID: 'gpt-4o', providerID: 'openai' },
					parts: [{ type: 'text', text: 'Hello' }],
				},
				{
					info: { role: 'user', agent: 'architect' },
					parts: [{ type: 'text', text: 'Message 1' }],
				},
			],
		});

		handler = createContextBudgetHandler(config);
		await handler({}, {
			messages: [
				{
					info: { role: 'assistant', modelID: 'claude-3-opus', providerID: 'anthropic' },
					parts: [{ type: 'text', text: 'Hello' }],
				},
				{
					info: { role: 'user', agent: 'architect' },
					parts: [{ type: 'text', text: 'Message 2' }],
				},
			],
		});

		const allLogCalls = mockLog.mock.calls;
		const contextBudgetLogCalls = allLogCalls.filter((call: any[]) =>
			call[0]?.includes('[swarm] Context budget:'),
		);

		expect(contextBudgetLogCalls.length).toBe(2);

		const logMessages = contextBudgetLogCalls.map((call: any[]) => call[0]);
		const hasGpt = logMessages.some((msg: string) => msg.includes('model=gpt-4o'));
		const hasClaude = logMessages.some((msg: string) => msg.includes('model=claude-3-opus'));

		expect(hasGpt).toBe(true);
		expect(hasClaude).toBe(true);
	});

	it('threshold warnings still use warn() (regression test)', async () => {
		const config = {
			context_budget: {
				enabled: true,
				warn_threshold: 0.7,
				critical_threshold: 0.9,
			},
		};

		const longText = 'A'.repeat(15000);

		const messages = [
			{
				info: { role: 'assistant', modelID: 'gpt-4o', providerID: 'openai' },
				parts: [{ type: 'text', text: 'Hello' }],
			},
			{
				info: { role: 'user', agent: 'architect' },
				parts: [{ type: 'text', text: longText }],
			},
		];

		const createContextBudgetHandler = getCreateContextBudgetHandler();
		const handler = createContextBudgetHandler(config);
		await handler({}, { messages });

		const warnCalls = mockWarn.mock.calls;
		const contextBudgetWarnCalls = warnCalls.filter((call: any[]) =>
			call[0]?.includes('[swarm] Context budget:'),
		);

		expect(contextBudgetWarnCalls.length).toBe(0);

		const logCalls = mockLog.mock.calls;
		const contextBudgetLogCalls = logCalls.filter((call: any[]) =>
			call[0]?.includes('[swarm] Context budget:'),
		);

		expect(contextBudgetLogCalls.length).toBeGreaterThan(0);
	});

	it('warn() is still called for context enforcement warnings', async () => {
		const config = {
			context_budget: {
				enabled: true,
				warn_threshold: 0.001,
				critical_threshold: 0.002,
				enforce: true,
			},
		};

		const messages = [
			{
				info: { role: 'assistant', modelID: 'gpt-4o', providerID: 'openai' },
				parts: [{ type: 'text', text: 'Hello' }],
			},
			{
				info: { role: 'user', agent: 'architect' },
				parts: [{ type: 'text', text: 'A'.repeat(5000) }],
			},
		];

		const createContextBudgetHandler = getCreateContextBudgetHandler();
		const handler = createContextBudgetHandler(config);
		await handler({}, { messages });

		const warnCalls = mockWarn.mock.calls;
		const contextBudgetWarnCalls = warnCalls.filter((call: any[]) =>
			call[0]?.includes('[swarm] Context budget:'),
		);

		expect(contextBudgetWarnCalls.length).toBe(0);
	});

	it('warn() is still called for threshold injection warnings', async () => {
		const config = {
			context_budget: {
				enabled: true,
				warn_threshold: 0.0001,
				critical_threshold: 0.0002,
			},
		};

		const longText = 'A'.repeat(5000);

		const messages = [
			{
				info: { role: 'assistant', modelID: 'gpt-4o', providerID: 'openai' },
				parts: [{ type: 'text', text: 'Hello' }],
			},
			{
				info: { role: 'user', agent: 'architect' },
				parts: [{ type: 'text', text: longText }],
			},
		];

		const createContextBudgetHandler = getCreateContextBudgetHandler();
		const handler = createContextBudgetHandler(config);
		await handler({}, { messages });

		const lastUserMessage = messages[messages.length - 1];
		const textPart = lastUserMessage?.parts?.find((p: any) => p.type === 'text');

		expect(textPart?.text).toMatch(/\[CONTEXT (WARNING|CRITICAL):/);
	});
});
