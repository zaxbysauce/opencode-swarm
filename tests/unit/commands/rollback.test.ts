import { vi, describe, it, expect, beforeEach } from 'vitest';
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

// Import mocked modules
import * as fs from 'node:fs';
import { validateSwarmPath } from '../../../src/hooks/utils';

// Type assertions for mocks
const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;
const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
const mockReaddirSync = fs.readdirSync as ReturnType<typeof vi.fn>;
const mockCpSync = fs.cpSync as ReturnType<typeof vi.fn>;
const mockAppendFileSync = fs.appendFileSync as ReturnType<typeof vi.fn>;
const mockValidateSwarmPath = validateSwarmPath as ReturnType<typeof vi.fn>;

const TEST_DIR = '/test/project';

describe('handleRollbackCommand', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Default validateSwarmPath to return a simple path
		mockValidateSwarmPath.mockImplementation((dir, filename) => {
			return `${dir}/.swarm/${filename}`;
		});
		// By default, cpSync succeeds
		mockCpSync.mockImplementation(() => {
			// No-op - successful copy
		});
	});

	describe('List checkpoints (no phase argument)', () => {
		it('should return "No checkpoints found" when manifest does not exist', async () => {
			mockExistsSync.mockReturnValue(false);

			const result = await handleRollbackCommand(TEST_DIR, []);

			expect(result).toBe(
				'No checkpoints found. Use `/swarm checkpoint` to create checkpoints.',
			);
			expect(mockValidateSwarmPath).toHaveBeenCalledWith(
				TEST_DIR,
				'checkpoints/manifest.json',
			);
		});

		it('should return "No checkpoints found in manifest" when manifest has no checkpoints', async () => {
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(
				JSON.stringify({ checkpoints: [] }),
			);

			const result = await handleRollbackCommand(TEST_DIR, []);

			expect(result).toBe('No checkpoints found in manifest.');
		});

		it('should list available checkpoints', async () => {
			mockExistsSync.mockReturnValue(true);
			const timestamp = new Date('2024-03-03T12:00:00Z').toISOString();
			mockReadFileSync.mockReturnValue(
				JSON.stringify({
					checkpoints: [
						{
							phase: 1,
							label: 'Phase 1 complete',
							timestamp,
						},
						{
							phase: 2,
							label: 'Phase 2 complete',
							timestamp,
						},
					],
				}),
			);

			const result = await handleRollbackCommand(TEST_DIR, []);

			expect(result).toContain('## Available Checkpoints');
			expect(result).toContain('- Phase 1: Phase 1 complete');
			expect(result).toContain('- Phase 2: Phase 2 complete');
			expect(result).toContain('Run `/swarm rollback <phase>` to restore to a checkpoint.');
		});

		it('should list checkpoints without label', async () => {
			mockExistsSync.mockReturnValue(true);
			const timestamp = new Date('2024-03-03T12:00:00Z').toISOString();
			mockReadFileSync.mockReturnValue(
				JSON.stringify({
					checkpoints: [
						{
							phase: 1,
							timestamp,
						},
					],
				}),
			);

			const result = await handleRollbackCommand(TEST_DIR, []);

			expect(result).toContain('- Phase 1: no label');
		});
	});

	describe('Validate phase number', () => {
		it('should return error when phase is NaN', async () => {
			const result = await handleRollbackCommand(TEST_DIR, ['invalid']);

			expect(result).toBe('Error: Phase number must be a positive integer.');
		});

		it('should return error when phase is zero', async () => {
			const result = await handleRollbackCommand(TEST_DIR, ['0']);

			expect(result).toBe('Error: Phase number must be a positive integer.');
		});

		it('should return error when phase is negative', async () => {
			const result = await handleRollbackCommand(TEST_DIR, ['-1']);

			expect(result).toBe('Error: Phase number must be a positive integer.');
		});

		it('should accept valid positive integer phase', async () => {
			// Setup mocks for a valid rollback
			const timestamp = new Date('2024-03-03T12:00:00Z').toISOString();
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(
				JSON.stringify({
					checkpoints: [
						{
							phase: 1,
							label: 'Phase 1 complete',
							timestamp,
						},
					],
				}),
			);
			mockReaddirSync.mockReturnValue(['plan.md', 'context.md']);

			const result = await handleRollbackCommand(TEST_DIR, ['1']);

			expect(result).toContain('Rolled back to phase 1: Phase 1 complete');
		});
	});

	describe('Checkpoint not found', () => {
		it('should return error when manifest does not exist', async () => {
			mockExistsSync.mockReturnValue(false);

			const result = await handleRollbackCommand(TEST_DIR, ['1']);

			expect(result).toBe('Error: No checkpoints found. Cannot rollback to phase 1.');
		});

		it('should return error when checkpoint for phase does not exist', async () => {
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(
				JSON.stringify({
					checkpoints: [
						{
							phase: 2,
							label: 'Phase 2 complete',
							timestamp: new Date().toISOString(),
						},
					],
				}),
			);

			const result = await handleRollbackCommand(TEST_DIR, ['1']);

			expect(result).toBe('Error: Checkpoint for phase 1 not found. Available phases: 2');
		});

		it('should return "none" when manifest has no checkpoints', async () => {
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(JSON.stringify({ checkpoints: [] }));

			const result = await handleRollbackCommand(TEST_DIR, ['1']);

			expect(result).toBe('Error: Checkpoint for phase 1 not found. Available phases: none');
		});

		it('should return error when checkpoint directory does not exist', async () => {
			const timestamp = new Date('2024-03-03T12:00:00Z').toISOString();
			mockExistsSync.mockImplementation((path) => {
				// manifest exists, but checkpoint dir does not
				if (path.includes('manifest.json')) return true;
				return false;
			});
			mockReadFileSync.mockReturnValue(
				JSON.stringify({
					checkpoints: [
						{
							phase: 1,
							label: 'Phase 1 complete',
							timestamp,
						},
					],
				}),
			);

			const result = await handleRollbackCommand(TEST_DIR, ['1']);

			expect(result).toBe('Error: Checkpoint directory for phase 1 does not exist.');
		});

		it('should return error when checkpoint directory is empty', async () => {
			const timestamp = new Date('2024-03-03T12:00:00Z').toISOString();
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(
				JSON.stringify({
					checkpoints: [
						{
							phase: 1,
							label: 'Phase 1 complete',
							timestamp,
						},
					],
				}),
			);
			mockReaddirSync.mockReturnValue([]);

			const result = await handleRollbackCommand(TEST_DIR, ['1']);

			expect(result).toBe('Error: Checkpoint for phase 1 is empty. Cannot rollback.');
		});
	});

	describe('Copy files from checkpoint to .swarm/', () => {
		it('should copy all files from checkpoint directory', async () => {
			const timestamp = new Date('2024-03-03T12:00:00Z').toISOString();
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(
				JSON.stringify({
					checkpoints: [
						{
							phase: 1,
							label: 'Phase 1 complete',
							timestamp,
						},
					],
				}),
			);
			mockReaddirSync.mockReturnValue(['plan.md', 'context.md', 'events.jsonl']);

			const result = await handleRollbackCommand(TEST_DIR, ['1']);

			// Should have copied 3 files (events.jsonl is restored too)
			expect(mockCpSync).toHaveBeenCalledTimes(3);
			expect(mockCpSync).toHaveBeenCalledWith(
				expect.stringMatching(/phase-1[\\/]plan\.md/),
				expect.stringMatching(/[\\/]plan\.md/),
				{ recursive: true, force: true },
			);
			expect(mockCpSync).toHaveBeenCalledWith(
				expect.stringMatching(/phase-1[\\/]context\.md/),
				expect.stringMatching(/[\\/]context\.md/),
				{ recursive: true, force: true },
			);
			expect(result).toContain('Rolled back to phase 1: Phase 1 complete');
		});

		it('should use correct source and destination paths', async () => {
			const timestamp = new Date('2024-03-03T12:00:00Z').toISOString();
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(
				JSON.stringify({
					checkpoints: [
						{
							phase: 1,
							label: 'Phase 1 complete',
							timestamp,
						},
					],
				}),
			);
			mockReaddirSync.mockReturnValue(['plan.md']);

			const result = await handleRollbackCommand(TEST_DIR, ['1']);

			expect(mockValidateSwarmPath).toHaveBeenCalledWith(TEST_DIR, '');
			expect(mockValidateSwarmPath).toHaveBeenCalledWith(
				TEST_DIR,
				'checkpoints/phase-1',
			);
			expect(result).toContain('Rolled back to phase 1: Phase 1 complete');
		});
	});

	describe('Process ALL files even if some fail', () => {
		it('should continue processing files after one fails', async () => {
			const timestamp = new Date('2024-03-03T12:00:00Z').toISOString();
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(
				JSON.stringify({
					checkpoints: [
						{
							phase: 1,
							label: 'Phase 1 complete',
							timestamp,
						},
					],
				}),
			);
			mockReaddirSync.mockReturnValue(['plan.md', 'context.md', 'evidence.md']);

			// First file succeeds, second fails, third succeeds
			mockCpSync
				.mockImplementationOnce(() => {
					// plan.md succeeds
				})
				.mockImplementationOnce(() => {
					// context.md fails
					throw new Error('Permission denied');
				})
				.mockImplementationOnce(() => {
					// evidence.md succeeds
				});

			const result = await handleRollbackCommand(TEST_DIR, ['1']);

			// All three files were attempted
			expect(mockCpSync).toHaveBeenCalledTimes(3);
			// Returns partial success message
			expect(result).toContain('Rollback partially completed');
			expect(result).toContain('Successfully restored 2 files');
			expect(result).toContain('Failed on 1 files');
			expect(result).toContain('context.md');
		});

		it('should report correct success and failure counts', async () => {
			const timestamp = new Date('2024-03-03T12:00:00Z').toISOString();
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(
				JSON.stringify({
					checkpoints: [
						{
							phase: 1,
							label: 'Phase 1 complete',
							timestamp,
						},
					],
				}),
			);
			mockReaddirSync.mockReturnValue([
				'plan.md',
				'context.md',
				'evidence.md',
				'state.md',
			]);

			// Two succeed, two fail
			mockCpSync
				.mockImplementationOnce(() => {
					// plan.md succeeds
				})
				.mockImplementationOnce(() => {
					// context.md fails
					throw new Error('Disk full');
				})
				.mockImplementationOnce(() => {
					// evidence.md succeeds
				})
				.mockImplementationOnce(() => {
					// state.md fails
					throw new Error('Permission denied');
				});

			const result = await handleRollbackCommand(TEST_DIR, ['1']);

			expect(result).toContain('Successfully restored 2 files');
			expect(result).toContain('Failed on 2 files');
			expect(result).toContain('context.md, state.md');
		});

		it('should report failure when all files fail', async () => {
			const timestamp = new Date('2024-03-03T12:00:00Z').toISOString();
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(
				JSON.stringify({
					checkpoints: [
						{
							phase: 1,
							label: 'Phase 1 complete',
							timestamp,
						},
					],
				}),
			);
			mockReaddirSync.mockReturnValue(['plan.md', 'context.md']);

			mockCpSync.mockImplementation(() => {
				throw new Error('All files fail');
			});

			const result = await handleRollbackCommand(TEST_DIR, ['1']);

			expect(result).toContain('Successfully restored 0 files');
			expect(result).toContain('Failed on 2 files');
		});
	});

	describe('Write rollback event to events.jsonl', () => {
		it('should write rollback event to events.jsonl on success', async () => {
			const timestamp = new Date('2024-03-03T12:00:00Z').toISOString();
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(
				JSON.stringify({
					checkpoints: [
						{
							phase: 1,
							label: 'Phase 1 complete',
							timestamp,
						},
					],
				}),
			);
			mockReaddirSync.mockReturnValue(['plan.md']);

			const result = await handleRollbackCommand(TEST_DIR, ['1']);

			expect(mockAppendFileSync).toHaveBeenCalledTimes(1);
			expect(mockAppendFileSync).toHaveBeenCalledWith(
				expect.stringContaining('events.jsonl'),
				expect.stringContaining('"type":"rollback"'),
			);
			expect(mockAppendFileSync).toHaveBeenCalledWith(
				expect.stringContaining('events.jsonl'),
				expect.stringContaining('"phase":1'),
			);
			expect(mockAppendFileSync).toHaveBeenCalledWith(
				expect.stringContaining('events.jsonl'),
				expect.stringContaining('"label":"Phase 1 complete"'),
			);
			expect(result).toContain('Rolled back to phase 1: Phase 1 complete');
		});

		it('should include checkpoint label in rollback event', async () => {
			const timestamp = new Date('2024-03-03T12:00:00Z').toISOString();
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(
				JSON.stringify({
					checkpoints: [
						{
							phase: 1,
							label: 'Custom checkpoint label',
							timestamp,
						},
					],
				}),
			);
			mockReaddirSync.mockReturnValue(['plan.md']);

			await handleRollbackCommand(TEST_DIR, ['1']);

			expect(mockAppendFileSync).toHaveBeenCalledWith(
				expect.stringContaining('events.jsonl'),
				expect.stringContaining('"label":"Custom checkpoint label"'),
			);
		});

		it('should use empty label when checkpoint has no label', async () => {
			const timestamp = new Date('2024-03-03T12:00:00Z').toISOString();
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(
				JSON.stringify({
					checkpoints: [
						{
							phase: 1,
							timestamp,
						},
					],
				}),
			);
			mockReaddirSync.mockReturnValue(['plan.md']);

			await handleRollbackCommand(TEST_DIR, ['1']);

			expect(mockAppendFileSync).toHaveBeenCalledWith(
				expect.stringContaining('events.jsonl'),
				expect.stringContaining('"label":""'),
			);
		});

		it('should handle error when writing rollback event', async () => {
			const timestamp = new Date('2024-03-03T12:00:00Z').toISOString();
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(
				JSON.stringify({
					checkpoints: [
						{
							phase: 1,
							label: 'Phase 1 complete',
							timestamp,
						},
					],
				}),
			);
			mockReaddirSync.mockReturnValue(['plan.md']);
			mockAppendFileSync.mockImplementation(() => {
				throw new Error('Failed to write event');
			});

			// Should still return success despite append error
			const result = await handleRollbackCommand(TEST_DIR, ['1']);

			expect(result).toContain('Rolled back to phase 1: Phase 1 complete');
		});

		it('should NOT write rollback event on partial failure', async () => {
			const timestamp = new Date('2024-03-03T12:00:00Z').toISOString();
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(
				JSON.stringify({
					checkpoints: [
						{
							phase: 1,
							label: 'Phase 1 complete',
							timestamp,
						},
					],
				}),
			);
			mockReaddirSync.mockReturnValue(['plan.md', 'context.md']);
			mockCpSync.mockImplementation(() => {
				throw new Error('Copy failed');
			});

			const result = await handleRollbackCommand(TEST_DIR, ['1']);

			expect(mockAppendFileSync).not.toHaveBeenCalled();
			expect(result).toContain('Rollback partially completed');
		});
	});

	describe('Success message', () => {
		it('should return success message with checkpoint label', async () => {
			const timestamp = new Date('2024-03-03T12:00:00Z').toISOString();
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(
				JSON.stringify({
					checkpoints: [
						{
							phase: 1,
							label: 'Phase 1 complete',
							timestamp,
						},
					],
				}),
			);
			mockReaddirSync.mockReturnValue(['plan.md']);

			const result = await handleRollbackCommand(TEST_DIR, ['1']);

			expect(result).toBe('Rolled back to phase 1: Phase 1 complete');
		});

		it('should return success message with "no label" when checkpoint has no label', async () => {
			const timestamp = new Date('2024-03-03T12:00:00Z').toISOString();
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(
				JSON.stringify({
					checkpoints: [
						{
							phase: 1,
							timestamp,
						},
					],
				}),
			);
			mockReaddirSync.mockReturnValue(['plan.md']);

			const result = await handleRollbackCommand(TEST_DIR, ['1']);

			expect(result).toBe('Rolled back to phase 1: no label');
		});
	});
});
