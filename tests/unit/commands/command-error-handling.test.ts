import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { AgentDefinition } from '../../../src/agents/index.js';
import { createSwarmCommandHandler } from '../../../src/commands/index.js';
import type { CommandEntry } from '../../../src/commands/registry.js';

// Mock the registry module to control resolveCommand behavior
const mockResolveCommand =
	mock<
		(
			tokens: string[],
		) => { entry: CommandEntry; remainingArgs: string[] } | null
	>();

mock.module('../../../src/commands/registry.js', () => ({
	resolveCommand: mockResolveCommand,
	COMMAND_REGISTRY: {},
	VALID_COMMANDS: [],
}));

const mockAgents = {} as Record<string, AgentDefinition>;
const mockDirectory = '/test/directory';

describe('createSwarmCommandHandler — error handling', () => {
	beforeEach(() => {
		mockResolveCommand.mockReset();
	});

	afterEach(() => {
		mock.restore();
	});

	test('handler that throws Error → text contains "Error executing /swarm" and the error message', async () => {
		const expectedCmdName = 'test-cmd';
		const expectedErrorMsg = 'Something went wrong';

		mockResolveCommand.mockReturnValue({
			entry: {
				handler: async () => {
					throw new Error(expectedErrorMsg);
				},
				description: 'test',
			},
			remainingArgs: [],
		});

		const handler = createSwarmCommandHandler(mockDirectory, mockAgents);
		const output = { parts: [] as unknown[] };
		await handler(
			{ command: 'swarm', sessionID: 's1', arguments: expectedCmdName },
			output,
		);

		expect(output.parts).toHaveLength(1);
		const part = output.parts[0] as { type: string; text: string };
		expect(part.type).toBe('text');
		expect(part.text).toContain('Error executing /swarm');
		expect(part.text).toContain(expectedCmdName);
		expect(part.text).toContain(expectedErrorMsg);
	});

	test('handler that throws non-Error string → text contains the string', async () => {
		const expectedCmdName = 'string-throw';
		const thrownString = 'I am a string error';

		mockResolveCommand.mockReturnValue({
			entry: {
				handler: async () => {
					throw thrownString;
				},
				description: 'test',
			},
			remainingArgs: [],
		});

		const handler = createSwarmCommandHandler(mockDirectory, mockAgents);
		const output = { parts: [] as unknown[] };
		await handler(
			{ command: 'swarm', sessionID: 's1', arguments: expectedCmdName },
			output,
		);

		expect(output.parts).toHaveLength(1);
		const part = output.parts[0] as { type: string; text: string };
		expect(part.type).toBe('text');
		expect(part.text).toContain('Error executing /swarm');
		expect(part.text).toContain(expectedCmdName);
		expect(part.text).toContain(thrownString);
	});

	test('handler that succeeds → normal text returned', async () => {
		const expectedCmdName = 'success-cmd';
		const expectedText = 'Command succeeded with output';

		mockResolveCommand.mockReturnValue({
			entry: {
				handler: async () => {
					return expectedText;
				},
				description: 'test',
			},
			remainingArgs: [],
		});

		const handler = createSwarmCommandHandler(mockDirectory, mockAgents);
		const output = { parts: [] as unknown[] };
		await handler(
			{ command: 'swarm', sessionID: 's1', arguments: expectedCmdName },
			output,
		);

		expect(output.parts).toHaveLength(1);
		const part = output.parts[0] as { type: string; text: string };
		expect(part.type).toBe('text');
		expect(part.text).toBe(expectedText);
	});

	test('handler that returns undefined → text is undefined', async () => {
		const expectedCmdName = 'undefined-cmd';

		mockResolveCommand.mockReturnValue({
			entry: {
				handler: async () => {
					// void return — handler returns undefined implicitly
				},
				description: 'test',
			},
			remainingArgs: [],
		});

		const handler = createSwarmCommandHandler(mockDirectory, mockAgents);
		const output = { parts: [] as unknown[] };
		await handler(
			{ command: 'swarm', sessionID: 's1', arguments: expectedCmdName },
			output,
		);

		expect(output.parts).toHaveLength(1);
		const part = output.parts[0] as { type: string; text: string };
		expect(part.type).toBe('text');
		expect(part.text).toBeUndefined();
	});

	test('handler that throws object → error message uses String(err)', async () => {
		const expectedCmdName = 'object-throw';
		const thrownObj = { code: 'ERR_Oops', detail: 'something failed' };

		mockResolveCommand.mockReturnValue({
			entry: {
				handler: async () => {
					throw thrownObj;
				},
				description: 'test',
			},
			remainingArgs: [],
		});

		const handler = createSwarmCommandHandler(mockDirectory, mockAgents);
		const output = { parts: [] as unknown[] };
		await handler(
			{ command: 'swarm', sessionID: 's1', arguments: expectedCmdName },
			output,
		);

		expect(output.parts).toHaveLength(1);
		const part = output.parts[0] as { type: string; text: string };
		expect(part.type).toBe('text');
		expect(part.text).toContain('Error executing /swarm');
		expect(part.text).toContain(expectedCmdName);
		// String({code: 'ERR_Oops', detail: 'something failed'}) yields '[object Object]'
		expect(part.text).toContain('[object Object]');
	});
});
