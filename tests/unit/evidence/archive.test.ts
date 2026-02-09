import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as path from 'node:path';
import * as os from 'node:os';
import { mkdirSync, rmSync } from 'node:fs';
import {
	archiveEvidence,
	saveEvidence,
	loadEvidence,
	deleteEvidence,
} from '../../../src/evidence/manager';
import type { Evidence } from '../../../src/config/evidence-schema';

describe('archiveEvidence', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtemp();
		mkdirSync(path.join(tempDir, '.swarm'), { recursive: true });
	});

	afterEach(() => {
		cleanup(tempDir);
	});

	test('archiveEvidence with no evidence returns empty array', async () => {
		const archived = await archiveEvidence(tempDir, 90);
		expect(archived).toEqual([]);
	});

	test('archiveEvidence deletes bundles older than maxAgeDays', async () => {
		// Create old bundle
		const taskId = 'task-1';
		await saveEvidence(tempDir, taskId, createNoteEvidence(taskId, 'Old note'));

		// Modify timestamp to be old (100 days ago)
		await makeBundleOld(tempDir, taskId, 100);

		// Archive with maxAgeDays=90
		const archived = await archiveEvidence(tempDir, 90);
		expect(archived).toEqual(['task-1']);

		// Verify deleted
		const loaded = await loadEvidence(tempDir, taskId);
		expect(loaded).toBeNull();
	});

	test('archiveEvidence keeps bundles newer than maxAgeDays', async () => {
		// Create recent bundle
		const taskId = 'task-1';
		await saveEvidence(tempDir, taskId, createNoteEvidence(taskId, 'Recent note'));

		// Archive with maxAgeDays=90
		const archived = await archiveEvidence(tempDir, 90);
		expect(archived).toEqual([]);

		// Verify still exists
		const loaded = await loadEvidence(tempDir, taskId);
		expect(loaded).not.toBeNull();
		expect(loaded?.task_id).toBe(taskId);
	});

	test('archiveEvidence with mixed old/new bundles only deletes old ones', async () => {
		// Create old bundle
		const oldTaskId = 'old-task';
		await saveEvidence(tempDir, oldTaskId, createNoteEvidence(oldTaskId, 'Old note'));
		await makeBundleOld(tempDir, oldTaskId, 100);

		// Create new bundle
		const newTaskId = 'new-task';
		await saveEvidence(tempDir, newTaskId, createNoteEvidence(newTaskId, 'New note'));

		// Archive with maxAgeDays=90
		const archived = await archiveEvidence(tempDir, 90);
		expect(archived).toEqual(['old-task']);
		expect(archived).not.toContain('new-task');

		// Verify old deleted, new exists
		expect(await loadEvidence(tempDir, oldTaskId)).toBeNull();
		expect(await loadEvidence(tempDir, newTaskId)).not.toBeNull();
	});

	test('archiveEvidence with maxBundles: if remaining > maxBundles, deletes oldest', async () => {
		// Create 5 bundles
		const taskIds = ['task-1', 'task-2', 'task-3', 'task-4', 'task-5'];
		for (const taskId of taskIds) {
			await saveEvidence(tempDir, taskId, createNoteEvidence(taskId, `Note for ${taskId}`));
		}

		// Make task-1 oldest (updated 10 days ago), task-5 newest (updated 2 days ago)
		// All are recent (< 90 days), so age filter won't delete any
		await makeBundleOld(tempDir, 'task-1', 10);
		await makeBundleOld(tempDir, 'task-2', 8);
		await makeBundleOld(tempDir, 'task-3', 6);
		await makeBundleOld(tempDir, 'task-4', 4);
		await makeBundleOld(tempDir, 'task-5', 2);

		// Archive with maxAgeDays=90 (none deleted by age) and maxBundles=3
		const archived = await archiveEvidence(tempDir, 90, 3);

		// Should delete oldest 2 (task-1, task-2)
		expect(archived).toHaveLength(2);
		expect(archived).toContain('task-1');
		expect(archived).toContain('task-2');
		expect(archived).not.toContain('task-3');
		expect(archived).not.toContain('task-4');
		expect(archived).not.toContain('task-5');

		// Verify deleted
		expect(await loadEvidence(tempDir, 'task-1')).toBeNull();
		expect(await loadEvidence(tempDir, 'task-2')).toBeNull();
		expect(await loadEvidence(tempDir, 'task-3')).not.toBeNull();
		expect(await loadEvidence(tempDir, 'task-4')).not.toBeNull();
		expect(await loadEvidence(tempDir, 'task-5')).not.toBeNull();
	});

	test('archiveEvidence with maxBundles: if remaining <= maxBundles, does not delete extra', async () => {
		// Create 3 bundles
		const taskIds = ['task-1', 'task-2', 'task-3'];
		for (const taskId of taskIds) {
			await saveEvidence(tempDir, taskId, createNoteEvidence(taskId, `Note for ${taskId}`));
		}

		// Archive with maxAgeDays=1 (none deleted by age) and maxBundles=10
		const archived = await archiveEvidence(tempDir, 1, 10);

		// Should delete nothing
		expect(archived).toEqual([]);

		// Verify all still exist
		for (const taskId of taskIds) {
			expect(await loadEvidence(tempDir, taskId)).not.toBeNull();
		}
	});

	test('archiveEvidence with both age and maxBundles: age first, then maxBundles', async () => {
		// Create 6 bundles with varying ages
		const taskIds = ['task-1', 'task-2', 'task-3', 'task-4', 'task-5', 'task-6'];
		for (const taskId of taskIds) {
			await saveEvidence(tempDir, taskId, createNoteEvidence(taskId, `Note for ${taskId}`));
		}

		// Make some old, some new
		// task-1: 100 days old (will be deleted by age)
		// task-2: 80 days old (will be deleted by age)
		// task-3: 60 days old (will be deleted by age)
		// task-4: 40 days old (kept by age, but oldest for maxBundles)
		// task-5: 20 days old (kept)
		// task-6: 10 days old (kept)
		await makeBundleOld(tempDir, 'task-1', 100);
		await makeBundleOld(tempDir, 'task-2', 80);
		await makeBundleOld(tempDir, 'task-3', 60);
		await makeBundleOld(tempDir, 'task-4', 40);
		await makeBundleOld(tempDir, 'task-5', 20);
		await makeBundleOld(tempDir, 'task-6', 10);

		// Archive with maxAgeDays=50 (deletes 1,2,3) and maxBundles=2 (after age, only 3 left: 4,5,6, delete oldest 1: task-4)
		const archived = await archiveEvidence(tempDir, 50, 2);

		// Should delete task-1, task-2, task-3 (age), and task-4 (maxBundles)
		expect(archived).toHaveLength(4);
		expect(archived).toContain('task-1');
		expect(archived).toContain('task-2');
		expect(archived).toContain('task-3');
		expect(archived).toContain('task-4');
		expect(archived).not.toContain('task-5');
		expect(archived).not.toContain('task-6');

		// Verify deleted
		expect(await loadEvidence(tempDir, 'task-1')).toBeNull();
		expect(await loadEvidence(tempDir, 'task-2')).toBeNull();
		expect(await loadEvidence(tempDir, 'task-3')).toBeNull();
		expect(await loadEvidence(tempDir, 'task-4')).toBeNull();
		expect(await loadEvidence(tempDir, 'task-5')).not.toBeNull();
		expect(await loadEvidence(tempDir, 'task-6')).not.toBeNull();
	});

	test('archiveEvidence with maxBundles=undefined: no bundle count enforcement', async () => {
		// Create 5 bundles
		const taskIds = ['task-1', 'task-2', 'task-3', 'task-4', 'task-5'];
		for (const taskId of taskIds) {
			await saveEvidence(tempDir, taskId, createNoteEvidence(taskId, `Note for ${taskId}`));
		}

		// Archive with maxAgeDays=1 (none deleted by age) and maxBundles undefined
		const archived = await archiveEvidence(tempDir, 1, undefined);

		// Should delete nothing
		expect(archived).toEqual([]);

		// Verify all still exist
		for (const taskId of taskIds) {
			expect(await loadEvidence(tempDir, taskId)).not.toBeNull();
		}
	});
});

// Helper functions
function mkdtemp(): string {
	return require('node:fs').mkdtempSync(
		path.join(os.tmpdir(), 'evidence-archive-test-'),
	);
}

function cleanup(dir: string): void {
	rmSync(dir, { recursive: true, force: true });
}

async function makeBundleOld(
	directory: string,
	taskId: string,
	daysOld: number,
): Promise<void> {
	const bundle = await loadEvidence(directory, taskId);
	if (!bundle) {
		throw new Error(`Bundle not found for task ${taskId}`);
	}

	// Set updated_at and created_at to old date
	const oldDate = new Date();
	oldDate.setDate(oldDate.getDate() - daysOld);
	const oldIso = oldDate.toISOString();

	bundle.updated_at = oldIso;
	bundle.created_at = oldIso;

	// Write back
	const evidencePath = path.join(
		directory,
		'.swarm',
		'evidence',
		taskId,
		'evidence.json',
	);
	await Bun.write(evidencePath, JSON.stringify(bundle));
}

// Helper function to create note evidence with required fields
function createNoteEvidence(taskId: string, summary: string): Evidence {
	return {
		type: 'note',
		task_id: taskId,
		timestamp: new Date().toISOString(),
		agent: 'test-agent',
		verdict: 'info',
		summary,
	};
}
