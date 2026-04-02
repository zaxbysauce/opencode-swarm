import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { handleCheckpointCommand } from '../../../src/commands/checkpoint';

describe('checkpoint command', () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		// Create a unique temp directory for each test
		tempDir = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), 'checkpoint-cmd-test-')),
		);
		originalCwd = process.cwd();

		// Initialize a git repo in temp directory
		process.chdir(tempDir);
		execSync('git init', { encoding: 'utf-8' });
		execSync('git config user.email "test@test.com"', { encoding: 'utf-8' });
		execSync('git config user.name "Test"', { encoding: 'utf-8' });
		// Disable commit signing for this local repo (overrides any global gpg config)
		execSync('git config commit.gpgsign false', { encoding: 'utf-8' });
		// Create initial commit
		fs.writeFileSync(path.join(tempDir, 'initial.txt'), 'initial');
		execSync('git add .', { encoding: 'utf-8' });
		execSync('git commit -m "initial"', { encoding: 'utf-8' });
	});

	afterEach(() => {
		// Restore original directory
		process.chdir(originalCwd);
		// Clean up temp directory
		try {
			fs.rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	describe('save subcommand', () => {
		test('creates checkpoint and returns success message', async () => {
			const result = await handleCheckpointCommand(tempDir, [
				'save',
				'my-checkpoint',
			]);

			expect(result).toContain('✓');
			expect(result).toContain('Checkpoint saved');
			expect(result).toContain('my-checkpoint');
		});

		test('returns error when label is missing', async () => {
			const result = await handleCheckpointCommand(tempDir, ['save']);

			expect(result).toContain('Error');
			expect(result).toContain('Label required');
			expect(result).toContain('/swarm checkpoint save <label>');
		});

		test('handles label with spaces', async () => {
			const result = await handleCheckpointCommand(tempDir, [
				'save',
				'my checkpoint name',
			]);

			expect(result).toContain('✓');
			expect(result).toContain('my checkpoint name');
		});

		test('handles label with special characters', async () => {
			const result = await handleCheckpointCommand(tempDir, [
				'save',
				'test-label_123',
			]);

			expect(result).toContain('✓');
		});
	});

	describe('restore subcommand', () => {
		test('restores checkpoint and returns success message', async () => {
			// First save a checkpoint
			await handleCheckpointCommand(tempDir, ['save', 'restore-me']);

			// Make a new commit
			fs.writeFileSync(path.join(tempDir, 'new.txt'), 'new content');
			execSync('git add .', { encoding: 'utf-8' });
			execSync('git commit -m "new commit"', { encoding: 'utf-8' });

			// Now restore
			const result = await handleCheckpointCommand(tempDir, [
				'restore',
				'restore-me',
			]);

			expect(result).toContain('✓');
			expect(result).toContain('Restored');
			expect(result).toContain('restore-me');
		});

		test('returns error when label is missing', async () => {
			const result = await handleCheckpointCommand(tempDir, ['restore']);

			expect(result).toContain('Error');
			expect(result).toContain('Label required');
			expect(result).toContain('/swarm checkpoint restore <label>');
		});

		test('returns error for non-existent checkpoint', async () => {
			const result = await handleCheckpointCommand(tempDir, [
				'restore',
				'does-not-exist',
			]);

			expect(result).toContain('Error');
			expect(result).toContain('not found');
		});
	});

	describe('delete subcommand', () => {
		test('deletes checkpoint and returns success message', async () => {
			// First save a checkpoint
			await handleCheckpointCommand(tempDir, ['save', 'to-delete']);

			// Now delete
			const result = await handleCheckpointCommand(tempDir, [
				'delete',
				'to-delete',
			]);

			expect(result).toContain('✓');
			expect(result).toContain('Checkpoint deleted');
			expect(result).toContain('to-delete');
		});

		test('returns error when label is missing', async () => {
			const result = await handleCheckpointCommand(tempDir, ['delete']);

			expect(result).toContain('Error');
			expect(result).toContain('Label required');
			expect(result).toContain('/swarm checkpoint delete <label>');
		});

		test('returns error for non-existent checkpoint', async () => {
			const result = await handleCheckpointCommand(tempDir, [
				'delete',
				'does-not-exist',
			]);

			expect(result).toContain('Error');
			expect(result).toContain('not found');
		});
	});

	describe('list subcommand', () => {
		test('shows checkpoints when they exist', async () => {
			// Save some checkpoints
			await handleCheckpointCommand(tempDir, ['save', 'first']);
			await new Promise((r) => setTimeout(r, 10));
			await handleCheckpointCommand(tempDir, ['save', 'second']);

			// List checkpoints
			const result = await handleCheckpointCommand(tempDir, ['list']);

			expect(result).toContain('## Checkpoints');
			expect(result).toContain('first');
			expect(result).toContain('second');
			expect(result).toContain('/swarm checkpoint save <label>');
			expect(result).toContain('/swarm checkpoint restore <label>');
			expect(result).toContain('/swarm checkpoint delete <label>');
		});

		test('shows empty message when no checkpoints', async () => {
			const result = await handleCheckpointCommand(tempDir, ['list']);

			expect(result).toContain('No checkpoints found');
			expect(result).toContain('/swarm checkpoint save <label>');
		});

		test('default subcommand is list', async () => {
			const result = await handleCheckpointCommand(tempDir, []);

			// Should behave like list
			expect(result).toContain('No checkpoints found');
		});
	});

	describe('label parameter', () => {
		test('label is passed correctly to save', async () => {
			const result = await handleCheckpointCommand(tempDir, [
				'save',
				'custom-label',
			]);

			expect(result).toContain('custom-label');
		});

		test('label is passed correctly to restore', async () => {
			await handleCheckpointCommand(tempDir, ['save', 'label-test']);
			const result = await handleCheckpointCommand(tempDir, [
				'restore',
				'label-test',
			]);

			expect(result).toContain('label-test');
		});

		test('label is passed correctly to delete', async () => {
			await handleCheckpointCommand(tempDir, ['save', 'delete-label-test']);
			const result = await handleCheckpointCommand(tempDir, [
				'delete',
				'delete-label-test',
			]);

			expect(result).toContain('delete-label-test');
		});
	});

	describe('error messages', () => {
		test('save without label shows user-friendly error', async () => {
			const result = await handleCheckpointCommand(tempDir, ['save']);

			expect(result).toBe(
				'Error: Label required. Usage: `/swarm checkpoint save <label>`',
			);
		});

		test('restore without label shows user-friendly error', async () => {
			const result = await handleCheckpointCommand(tempDir, ['restore']);

			expect(result).toBe(
				'Error: Label required. Usage: `/swarm checkpoint restore <label>`',
			);
		});

		test('delete without label shows user-friendly error', async () => {
			const result = await handleCheckpointCommand(tempDir, ['delete']);

			expect(result).toBe(
				'Error: Label required. Usage: `/swarm checkpoint delete <label>`',
			);
		});

		test('invalid subcommand falls back to list', async () => {
			const result = await handleCheckpointCommand(tempDir, ['invalid']);

			// Should fall back to list behavior
			expect(result).toContain('No checkpoints found');
		});

		test('handles tool execution errors gracefully', async () => {
			// Try to restore from a non-existent checkpoint - should get error from tool
			const result = await handleCheckpointCommand(tempDir, [
				'restore',
				'non-existent',
			]);

			expect(result).toContain('Error');
			expect(result).toContain('not found');
		});
	});

	describe('full workflow', () => {
		test('complete checkpoint workflow: save, list, restore, delete', async () => {
			// 1. Save a checkpoint
			const saveResult = await handleCheckpointCommand(tempDir, [
				'save',
				'workflow-test',
			]);
			expect(saveResult).toContain('✓');

			// 2. List checkpoints - should show our checkpoint
			const listResult = await handleCheckpointCommand(tempDir, ['list']);
			expect(listResult).toContain('workflow-test');

			// 3. Make a new commit
			fs.writeFileSync(path.join(tempDir, 'workflow.txt'), 'workflow content');
			execSync('git add .', { encoding: 'utf-8' });
			execSync('git commit -m "workflow commit"', { encoding: 'utf-8' });

			// 4. Restore to checkpoint
			const restoreResult = await handleCheckpointCommand(tempDir, [
				'restore',
				'workflow-test',
			]);
			expect(restoreResult).toContain('✓');
			expect(restoreResult).toContain('workflow-test');

			// 5. Delete checkpoint
			const deleteResult = await handleCheckpointCommand(tempDir, [
				'delete',
				'workflow-test',
			]);
			expect(deleteResult).toContain('✓');
			expect(deleteResult).toContain('workflow-test');

			// 6. List again - should be empty
			const finalListResult = await handleCheckpointCommand(tempDir, ['list']);
			expect(finalListResult).toContain('No checkpoints found');
		});
	});
});
