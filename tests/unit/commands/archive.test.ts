import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as path from 'node:path';
import * as os from 'node:os';
import { mkdirSync, rmSync } from 'node:fs';
import { handleArchiveCommand } from '../../../src/commands/archive';
import { saveEvidence } from '../../../src/evidence/manager';
import type { Evidence } from '../../../src/config/evidence-schema';

describe('handleArchiveCommand', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtemp();
		mkdirSync(path.join(tempDir, '.swarm'), { recursive: true });
		mkdirSync(path.join(tempDir, '.opencode'), { recursive: true });
	});

	afterEach(() => {
		cleanup(tempDir);
	});

	test('No evidence bundles → "No evidence bundles to archive."', async () => {
		const result = await handleArchiveCommand(tempDir, []);
		expect(result).toBe('No evidence bundles to archive.');
	});

	test('--dry-run with old bundles → shows preview with task IDs', async () => {
		// Create old bundle
		const taskId = 'old-task';
		await saveEvidence(tempDir, taskId, createNoteEvidence(taskId, 'Old note'));
		await makeBundleOld(tempDir, taskId, 100);

		// Run dry-run
		const result = await handleArchiveCommand(tempDir, ['--dry-run']);

		// Should contain preview with task ID
		expect(result).toContain('## Archive Preview (dry run)');
		expect(result).toContain('**Would archive**: 1 bundle(s)');
		expect(result).toContain('**Age-based (1)**:');
		expect(result).toContain('- old-task');
	});

	test('--dry-run with no old bundles → "No evidence bundles older than X days"', async () => {
		// Create recent bundle
		const taskId = 'new-task';
		await saveEvidence(tempDir, taskId, createNoteEvidence(taskId, 'New note'));

		// Run dry-run
		const result = await handleArchiveCommand(tempDir, ['--dry-run']);

		// Should indicate no bundles to archive
		expect(result).toContain(
			'No evidence bundles older than 90 days found, and bundle count (1) is within max_bundles limit (1000).',
		);
	});

	test('Archive with old bundles → returns markdown with archived count', async () => {
		// Create old bundle
		const taskId = 'old-task';
		await saveEvidence(tempDir, taskId, createNoteEvidence(taskId, 'Old note'));
		await makeBundleOld(tempDir, taskId, 100);

		// Run archive (not dry-run)
		const result = await handleArchiveCommand(tempDir, []);

		// Should contain archived info
		expect(result).toContain('## Evidence Archived');
		expect(result).toContain('**Archived**: 1 bundle(s)');
		expect(result).toContain('- old-task');
	});

	test('Archive with only new bundles → "No evidence bundles older than X days"', async () => {
		// Create recent bundle
		const taskId = 'new-task';
		await saveEvidence(tempDir, taskId, createNoteEvidence(taskId, 'New note'));

		// Run archive (not dry-run)
		const result = await handleArchiveCommand(tempDir, []);

		// Should indicate no bundles to archive
		expect(result).toBe('No evidence bundles older than 90 days found.');
	});

	test('--dry-run with max_bundles exceeded → shows max_bundles section', async () => {
		// Create config with max_bundles=10
		const configPath = path.join(tempDir, '.opencode', 'opencode-swarm.json');
		await Bun.write(
			configPath,
			JSON.stringify({
				evidence: { max_age_days: 90, max_bundles: 10 },
			}),
		);

		// Create 15 bundles
		const taskIds = [];
		for (let i = 1; i <= 15; i++) {
			const taskId = `task-${i}`;
			taskIds.push(taskId);
			await saveEvidence(tempDir, taskId, createNoteEvidence(taskId, `Note for ${taskId}`));
		}

		// Make them with varying ages (all recent, so max_bundles will trigger)
		for (let i = 0; i < taskIds.length; i++) {
			await makeBundleOld(tempDir, taskIds[i], 30 - i * 2);
		}

		// Run dry-run
		const result = await handleArchiveCommand(tempDir, ['--dry-run']);

		// Should show max_bundles section
		expect(result).toContain('## Archive Preview (dry run)');
		expect(result).toContain('**Max bundles**: 10');
		expect(result).toContain('**Would archive**: 5 bundle(s)');
		expect(result).toContain('**Max bundles limit (5)**:');

		// Should list the 5 oldest that would be archived
		expect(result).toContain('- task-1');
		expect(result).toContain('- task-2');
		expect(result).toContain('- task-3');
		expect(result).toContain('- task-4');
		expect(result).toContain('- task-5');
	});

	test('Archive with both old bundles and max_bundles exceeded', async () => {
		// Create config with max_age_days=50, max_bundles=10
		const configPath = path.join(tempDir, '.opencode', 'opencode-swarm.json');
		await Bun.write(
			configPath,
			JSON.stringify({
				evidence: { max_age_days: 50, max_bundles: 10 },
			}),
		);

		// Create 15 bundles with varying ages
		const taskIds = [];
		for (let i = 1; i <= 15; i++) {
			const taskId = `task-${i}`;
			taskIds.push(taskId);
			await saveEvidence(tempDir, taskId, createNoteEvidence(taskId, `Note for ${taskId}`));
		}

		// Make some old, some new
		// task-1 to task-8: 100+ days (deleted by age)
		// task-9: 70 days (deleted by age)
		// task-10 to task-15: recent (kept by age)
		await makeBundleOld(tempDir, 'task-1', 120);
		await makeBundleOld(tempDir, 'task-2', 115);
		await makeBundleOld(tempDir, 'task-3', 110);
		await makeBundleOld(tempDir, 'task-4', 105);
		await makeBundleOld(tempDir, 'task-5', 100);
		await makeBundleOld(tempDir, 'task-6', 95);
		await makeBundleOld(tempDir, 'task-7', 90);
		await makeBundleOld(tempDir, 'task-8', 85);
		await makeBundleOld(tempDir, 'task-9', 70);
		await makeBundleOld(tempDir, 'task-10', 40);
		await makeBundleOld(tempDir, 'task-11', 30);
		await makeBundleOld(tempDir, 'task-12', 25);
		await makeBundleOld(tempDir, 'task-13', 20);
		await makeBundleOld(tempDir, 'task-14', 15);
		await makeBundleOld(tempDir, 'task-15', 10);

		// Run archive (not dry-run)
		// Age filter deletes task-1 to task-9 (9 bundles)
		// Remaining 6 bundles (task-10 to task-15), max_bundles=10, so none more deleted
		const result = await handleArchiveCommand(tempDir, []);

		// Should show archived count and list
		expect(result).toContain('## Evidence Archived');
		expect(result).toContain('**Archived**: 9 bundle(s)');
		expect(result).toContain('- task-1');
		expect(result).toContain('- task-2');
		expect(result).toContain('- task-3');
		expect(result).toContain('- task-4');
		expect(result).toContain('- task-5');
		expect(result).toContain('- task-6');
		expect(result).toContain('- task-7');
		expect(result).toContain('- task-8');
		expect(result).toContain('- task-9');
		expect(result).not.toContain('- task-10');
	});
});

// Helper functions
function mkdtemp(): string {
	return require('node:fs').mkdtempSync(
		path.join(os.tmpdir(), 'archive-command-test-'),
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
	const { loadEvidence } = await import('../../../src/evidence/manager');
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
