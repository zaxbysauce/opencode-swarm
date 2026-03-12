import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSwarmCommandHandler } from '../../../src/commands/index';
import { handleRollbackCommand } from '../../../src/commands/rollback';

// Mock fs module
vi.mock('node:fs', () => ({
	existsSync: vi.fn(),
	readFileSync: vi.fn(),
	readdirSync: vi.fn(),
	cpSync: vi.fn(),
	appendFileSync: vi.fn(),
}));

// Mock validateSwarmPath
vi.mock('../../../src/hooks/utils', () => ({
	validateSwarmPath: vi.fn(),
}));

// Mock loadPluginConfig
vi.mock('../../../src/config/loader', () => ({
	loadPluginConfig: vi.fn(),
}));

describe('Rollback Command Integration Tests', () => {
	const TEST_DIR = '/test/project';
	const MOCK_AGENTS: Record<string, { name: string; config: { model: string; temperature: number } }> = {
		architect: {
			name: 'architect',
			config: { model: 'gpt-4', temperature: 0.1 },
		},
	};

	describe('1. Command dispatcher routes "rollback" to handleRollbackCommand', () => {
		it('should route /swarm rollback command to handleRollbackCommand', async () => {
			// Mock the handleRollbackCommand to track calls
			const mockHandleRollbackCommand = vi
				.spyOn(await import('../../../src/commands/rollback'), 'handleRollbackCommand')
				.mockResolvedValue('Test rollback response');

			const handler = createSwarmCommandHandler(TEST_DIR, MOCK_AGENTS);
			const output: { parts: unknown[] } = { parts: [] };

			// Execute /swarm rollback command
			await handler(
				{
					command: 'swarm',
					sessionID: 'test-session',
					arguments: 'rollback 1',
				},
				output,
			);

			// Verify handleRollbackCommand was called with correct arguments
			expect(mockHandleRollbackCommand).toHaveBeenCalledWith(TEST_DIR, ['1']);

			// Verify output was set
			expect(output.parts).toHaveLength(1);
			expect(output.parts[0]).toHaveProperty('type', 'text');

			mockHandleRollbackCommand.mockRestore();
		});

		it('should route /swarm rollback with no arguments', async () => {
			const mockHandleRollbackCommand = vi
				.spyOn(await import('../../../src/commands/rollback'), 'handleRollbackCommand')
				.mockResolvedValue('Available checkpoints list');

			const handler = createSwarmCommandHandler(TEST_DIR, MOCK_AGENTS);
			const output: { parts: unknown[] } = { parts: [] };

			await handler(
				{
					command: 'swarm',
					sessionID: 'test-session',
					arguments: 'rollback',
				},
				output,
			);

			expect(mockHandleRollbackCommand).toHaveBeenCalledWith(TEST_DIR, []);
			expect(output.parts).toHaveLength(1);

			mockHandleRollbackCommand.mockRestore();
		});

		it('should route /swarm rollback with phase argument', async () => {
			const mockHandleRollbackCommand = vi
				.spyOn(await import('../../../src/commands/rollback'), 'handleRollbackCommand')
				.mockResolvedValue('Rolled back to phase 2');

			const handler = createSwarmCommandHandler(TEST_DIR, MOCK_AGENTS);
			const output: { parts: unknown[] } = { parts: [] };

			await handler(
				{
					command: 'swarm',
					sessionID: 'test-session',
					arguments: 'rollback 2',
				},
				output,
			);

			expect(mockHandleRollbackCommand).toHaveBeenCalledWith(TEST_DIR, ['2']);
			expect(output.parts).toHaveLength(1);

			mockHandleRollbackCommand.mockRestore();
		});

		it('should route /swarm rollback with extra arguments', async () => {
			const mockHandleRollbackCommand = vi
				.spyOn(await import('../../../src/commands/rollback'), 'handleRollbackCommand')
				.mockResolvedValue('Rollback response');

			const handler = createSwarmCommandHandler(TEST_DIR, MOCK_AGENTS);
			const output: { parts: unknown[] } = { parts: [] };

			await handler(
				{
					command: 'swarm',
					sessionID: 'test-session',
					arguments: 'rollback 3 extra args',
				},
				output,
			);

			// The function receives all arguments as an array
			expect(mockHandleRollbackCommand).toHaveBeenCalledWith(TEST_DIR, ['3', 'extra', 'args']);

			mockHandleRollbackCommand.mockRestore();
		});

		it('should ignore non-swarm commands', async () => {
			const mockHandleRollbackCommand = vi
				.spyOn(await import('../../../src/commands/rollback'), 'handleRollbackCommand')
				.mockResolvedValue('Should not be called');

			const handler = createSwarmCommandHandler(TEST_DIR, MOCK_AGENTS);
			const output: { parts: unknown[] } = { parts: [] };

			await handler(
				{
					command: 'other',
					sessionID: 'test-session',
					arguments: 'rollback 1',
				},
				output,
			);

			// handleRollbackCommand should NOT be called for non-swarm commands
			expect(mockHandleRollbackCommand).not.toHaveBeenCalled();

			mockHandleRollbackCommand.mockRestore();
		});
	});

	describe('2. HELP_TEXT includes rollback entry', () => {
		it('should return HELP_TEXT for unknown commands containing rollback-related strings', async () => {
			const mockHandleRollbackCommand = vi
				.spyOn(await import('../../../src/commands/rollback'), 'handleRollbackCommand')
				.mockResolvedValue('Should not be called');

			const handler = createSwarmCommandHandler(TEST_DIR, MOCK_AGENTS);
			const output: { parts: unknown[] } = { parts: [] };

			// Test with unknown subcommand
			await handler(
				{
					command: 'swarm',
					sessionID: 'test-session',
					arguments: 'unknown-command',
				},
				output,
			);

			// Should return help text for unknown subcommand (contains '## Swarm Commands')
			const outputText = (output.parts[0] as any).text;
			expect(outputText).toContain('## Swarm Commands');
			// The help text should include all commands including rollback
			expect(outputText).toContain('/swarm rollback');

			mockHandleRollbackCommand.mockRestore();
		});
	});

	describe('3. Export is available from commands/index.ts', () => {
		it('should export handleRollbackCommand from commands/index.ts', async () => {
			// Dynamic import to test actual export
			const commandsModule = await import('../../../src/commands/index');
			expect(commandsModule.handleRollbackCommand).toBeDefined();
		});

		it('should export handleRollbackCommand as a function', async () => {
			const commandsModule = await import('../../../src/commands/index');
			expect(typeof commandsModule.handleRollbackCommand).toBe('function');
		});

		it('should have handleRollbackCommand as a named export', async () => {
			// This verifies that the export matches what we import
			const { handleRollbackCommand: exportedHandler } = await import(
				'../../../src/commands/index'
			);
			expect(exportedHandler).toBeDefined();
			expect(exportedHandler).toBe(handleRollbackCommand);
		});
	});

	describe('4. Individual command registration exists', () => {
		it('should have rollback case in command dispatcher switch statement', async () => {
			// This is implicitly tested by the routing tests, but we can verify
			// the structure by ensuring the handler processes rollback commands
			const mockHandleRollbackCommand = vi
				.spyOn(await import('../../../src/commands/rollback'), 'handleRollbackCommand')
				.mockResolvedValue('Rollback executed');

			const handler = createSwarmCommandHandler(TEST_DIR, MOCK_AGENTS);
			const output: { parts: unknown[] } = { parts: [] };

			await handler(
				{
					command: 'swarm',
					sessionID: 'test-session',
					arguments: 'rollback',
				},
				output,
			);

			// If rollback is registered, the handler should call it
			expect(mockHandleRollbackCommand).toHaveBeenCalled();

			mockHandleRollbackCommand.mockRestore();
		});

		it('should only process rollback when subcommand is exactly "rollback"', async () => {
			const mockHandleRollbackCommand = vi
				.spyOn(await import('../../../src/commands/rollback'), 'handleRollbackCommand')
				.mockResolvedValue('Should not be called');

			const handler = createSwarmCommandHandler(TEST_DIR, MOCK_AGENTS);
			const output: { parts: unknown[] } = { parts: [] };

			// Test with a similar but different subcommand
			await handler(
				{
					command: 'swarm',
					sessionID: 'test-session',
					arguments: 'rollbacksomething',
				},
				output,
			);

			// Should NOT be called for "rollbacksomething"
			expect(mockHandleRollbackCommand).not.toHaveBeenCalled();
			// Should return help text for unknown subcommand (contains '## Swarm Commands')
			expect((output.parts[0] as any).text).toContain('## Swarm Commands');

			mockHandleRollbackCommand.mockRestore();
		});

		it('should handle rollback subcommand case-sensitively', async () => {
			const mockHandleRollbackCommand = vi
				.spyOn(await import('../../../src/commands/rollback'), 'handleRollbackCommand')
				.mockResolvedValue('Should not be called');

			const handler = createSwarmCommandHandler(TEST_DIR, MOCK_AGENTS);
			const output: { parts: unknown[] } = { parts: [] };

			// Test with uppercase (should not match)
			await handler(
				{
					command: 'swarm',
					sessionID: 'test-session',
					arguments: 'ROLLBACK',
				},
				output,
			);

			// Should NOT be called for "ROLLBACK"
			expect(mockHandleRollbackCommand).not.toHaveBeenCalled();
			// Should return help text for unknown subcommand
			expect((output.parts[0] as any).text).toContain('## Swarm Commands');

			mockHandleRollbackCommand.mockRestore();
		});
	});

	describe('Integration: End-to-end rollback command flow', () => {
		it('should complete full flow from command to handler execution', async () => {
			const mockHandleRollbackCommand = vi
				.spyOn(await import('../../../src/commands/rollback'), 'handleRollbackCommand')
				.mockResolvedValue('Rolled back to phase 1: Phase 1 complete');

			const handler = createSwarmCommandHandler(TEST_DIR, MOCK_AGENTS);
			const output: { parts: unknown[] } = { parts: [] };

			// Execute the full command
			await handler(
				{
					command: 'swarm',
					sessionID: 'test-session-id',
					arguments: 'rollback 1',
				},
				output,
			);

			// Verify complete flow
			expect(mockHandleRollbackCommand).toHaveBeenCalledTimes(1);
			expect(mockHandleRollbackCommand).toHaveBeenCalledWith(TEST_DIR, ['1']);
			expect(output.parts).toHaveLength(1);
			expect(output.parts[0]).toEqual({
				type: 'text',
				text: 'Rolled back to phase 1: Phase 1 complete',
			});

			mockHandleRollbackCommand.mockRestore();
		});
	});
});
