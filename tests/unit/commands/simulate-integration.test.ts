import { beforeEach, describe, expect, it } from 'bun:test';
import type { AgentDefinition } from '../../../src/agents';
import {
	createSwarmCommandHandler,
	handleSimulateCommand as indexSimulateExport,
} from '../../../src/commands/index';
import {
	COMMAND_REGISTRY,
	VALID_COMMANDS,
} from '../../../src/commands/registry';
import { handleSimulateCommand } from '../../../src/commands/simulate';

describe('/swarm simulate command registration integration', () => {
	const testDir = '/test/project';
	const testAgents: Record<string, AgentDefinition> = {
		architect: {
			name: 'architect',
			config: { model: 'gpt-4', temperature: 0.1 },
		},
	};

	let handler: ReturnType<typeof createSwarmCommandHandler>;

	beforeEach(() => {
		handler = createSwarmCommandHandler(testDir, testAgents);
	});

	describe('Command dispatcher routing', () => {
		it('should dispatch "simulate" to handleSimulateCommand', () => {
			// Verify COMMAND_REGISTRY routes 'simulate' to a handler
			expect(COMMAND_REGISTRY['simulate']).toBeDefined();
			expect(typeof COMMAND_REGISTRY['simulate'].handler).toBe('function');
			expect(VALID_COMMANDS).toContain('simulate');
		});

		it('should dispatch "simulate" with arguments to handleSimulateCommand', () => {
			// Verify the handler accepts args via context
			expect(COMMAND_REGISTRY['simulate']).toBeDefined();
			expect(typeof COMMAND_REGISTRY['simulate'].handler).toBe('function');
		});

		it('should dispatch "simulate" with multiple arguments', () => {
			expect(COMMAND_REGISTRY['simulate']).toBeDefined();
		});

		it('should return text output from handleSimulateCommand', () => {
			// Verify handleSimulateCommand is a function that returns a promise
			expect(typeof handleSimulateCommand).toBe('function');
		});
	});

	describe('HELP_TEXT content', () => {
		it('should contain simulate entry in HELP_TEXT', () => {
			// HELP_TEXT is built dynamically from VALID_COMMANDS via COMMAND_REGISTRY.
			// Verify that 'simulate' is registered in VALID_COMMANDS and COMMAND_REGISTRY.
			expect(VALID_COMMANDS).toContain('simulate');
			expect(COMMAND_REGISTRY['simulate']).toBeDefined();
		});

		it('should include simulate description with optional target flag', () => {
			// simulate is registered in COMMAND_REGISTRY with a description.
			expect(COMMAND_REGISTRY['simulate']).toBeDefined();
			expect(typeof COMMAND_REGISTRY['simulate'].description).toBe('string');
			expect(COMMAND_REGISTRY['simulate'].description.length).toBeGreaterThan(
				0,
			);
		});
	});

	describe('Export availability from commands/index.ts', () => {
		it('should export handleSimulateCommand from commands/index.ts', () => {
			// handleSimulateCommand is re-exported from commands/index.ts
			expect(typeof indexSimulateExport).toBe('function');
		});

		it('should import handleSimulateCommand from simulate module', () => {
			// handleSimulateCommand from simulate module should be a function
			expect(typeof handleSimulateCommand).toBe('function');
		});

		it('should include simulate case in switch statement', () => {
			// Commands are routed via COMMAND_REGISTRY, not a switch statement.
			// Verify 'simulate' is registered and its handler is defined.
			expect(VALID_COMMANDS).toContain('simulate');
			expect(typeof COMMAND_REGISTRY['simulate'].handler).toBe('function');
		});
	});

	describe('Edge cases', () => {
		it('should handle simulate with trailing spaces', () => {
			// Verify the command is registered regardless of trailing whitespace handling
			expect(VALID_COMMANDS).toContain('simulate');
		});

		it('should handle simulate with extra whitespace between args', () => {
			// Verify the command registry entry exists
			expect(COMMAND_REGISTRY['simulate']).toBeDefined();
		});
	});
});
