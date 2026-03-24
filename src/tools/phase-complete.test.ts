/**
 * Tests for archivePhaseEvidence in phase-complete.ts
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { PhaseCompleteConfig } from '../config/schema';
import { archivePhaseEvidence } from './phase-complete';

describe('archivePhaseEvidence', () => {
	let tempDir: string;
	let evidenceDir: string;
	let warnings: string[];

	const createPhaseCompleteConfig = (
		archive_on_complete: boolean,
	): PhaseCompleteConfig => ({
		archive_on_complete,
		enabled: true,
		required_agents: [],
		require_docs: false,
		policy: 'warn' as const,
	});

	const createMinimalPlan = (phase: number, taskIds: string[]) => ({
		phases: [
			{
				id: phase,
				tasks: taskIds.map((id) => ({ id, status: 'completed' })),
			},
		],
	});

	beforeEach(async () => {
		tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'archive-test-'));
		evidenceDir = path.join(tempDir, '.swarm', 'evidence');
		await fsPromises.mkdir(evidenceDir, { recursive: true });
		warnings = [];
	});

	afterEach(async () => {
		await fsPromises.rm(tempDir, { recursive: true, force: true });
	});

	test('1. archive_on_complete = true, all evidence exists → files moved, warnings empty', async () => {
		const phase = 1;
		const taskIds = ['1.1', '1.2'];
		const config = createPhaseCompleteConfig(true);

		// Create plan.json
		const planPath = path.join(tempDir, '.swarm', 'plan.json');
		await fsPromises.writeFile(
			planPath,
			JSON.stringify(createMinimalPlan(phase, taskIds)),
		);

		// Create task evidence files
		for (const taskId of taskIds) {
			const evidencePath = path.join(evidenceDir, `${taskId}.json`);
			await fsPromises.writeFile(
				evidencePath,
				JSON.stringify({ task_id: taskId, status: 'done' }),
			);
		}

		// Create retro directory
		const retroPath = path.join(evidenceDir, `retro-${phase}`);
		await fsPromises.mkdir(retroPath);
		await fsPromises.writeFile(
			path.join(retroPath, 'evidence.json'),
			JSON.stringify({ phase_number: phase }),
		);

		await archivePhaseEvidence(tempDir, phase, config, warnings);

		// Verify warnings are empty
		expect(warnings).toEqual([]);

		// Verify task files moved to archive
		const archiveDir = path.join(
			tempDir,
			'.swarm',
			'archive',
			`phase-${phase}`,
		);
		for (const taskId of taskIds) {
			const archivedPath = path.join(archiveDir, `${taskId}.json`);
			expect(fs.existsSync(archivedPath)).toBe(true);
			// Original should NOT exist
			expect(fs.existsSync(path.join(evidenceDir, `${taskId}.json`))).toBe(
				false,
			);
		}

		// Verify retro moved to archive/retro/
		const archivedRetro = path.join(archiveDir, 'retro');
		expect(fs.existsSync(archivedRetro)).toBe(true);
		expect(fs.existsSync(path.join(evidenceDir, `retro-${phase}`))).toBe(false);
	});

	test('2. archive_on_complete = false → archival skipped, no warnings', async () => {
		const phase = 1;
		const taskIds = ['1.1'];
		const config = createPhaseCompleteConfig(false);

		// Create plan.json
		const planPath = path.join(tempDir, '.swarm', 'plan.json');
		await fsPromises.writeFile(
			planPath,
			JSON.stringify(createMinimalPlan(phase, taskIds)),
		);

		// Create task evidence file
		const evidencePath = path.join(evidenceDir, '1.1.json');
		await fsPromises.writeFile(
			evidencePath,
			JSON.stringify({ task_id: '1.1' }),
		);

		await archivePhaseEvidence(tempDir, phase, config, warnings);

		// No warnings should be added
		expect(warnings).toEqual([]);

		// Evidence should still exist (not moved)
		expect(fs.existsSync(evidencePath)).toBe(true);

		// Archive directory should NOT exist
		const archiveDir = path.join(
			tempDir,
			'.swarm',
			'archive',
			`phase-${phase}`,
		);
		expect(fs.existsSync(archiveDir)).toBe(false);
	});

	test('3. Evidence already archived (archive dir exists) → skipped gracefully', async () => {
		const phase = 2;
		const taskIds = ['2.1'];
		const config = createPhaseCompleteConfig(true);

		// Create plan.json
		const planPath = path.join(tempDir, '.swarm', 'plan.json');
		await fsPromises.writeFile(
			planPath,
			JSON.stringify(createMinimalPlan(phase, taskIds)),
		);

		// Create task evidence file
		const evidencePath = path.join(evidenceDir, '2.1.json');
		await fsPromises.writeFile(
			evidencePath,
			JSON.stringify({ task_id: '2.1' }),
		);

		// Pre-create archive directory (simulates already archived)
		const archiveDir = path.join(
			tempDir,
			'.swarm',
			'archive',
			`phase-${phase}`,
		);
		await fsPromises.mkdir(archiveDir, { recursive: true });

		await archivePhaseEvidence(tempDir, phase, config, warnings);

		// No warnings
		expect(warnings).toEqual([]);

		// Evidence should still exist (not moved, because archive already existed)
		expect(fs.existsSync(evidencePath)).toBe(true);
	});

	test('4. Some task evidence files missing → remaining files moved, no crash', async () => {
		const phase = 3;
		const taskIds = ['3.1', '3.2', '3.3'];
		const config = createPhaseCompleteConfig(true);

		// Create plan.json
		const planPath = path.join(tempDir, '.swarm', 'plan.json');
		await fsPromises.writeFile(
			planPath,
			JSON.stringify(createMinimalPlan(phase, taskIds)),
		);

		// Create only 3.2 evidence (3.1 and 3.3 are missing)
		const evidencePath3_2 = path.join(evidenceDir, '3.2.json');
		await fsPromises.writeFile(
			evidencePath3_2,
			JSON.stringify({ task_id: '3.2' }),
		);

		// Create retro directory
		const retroPath = path.join(evidenceDir, `retro-${phase}`);
		await fsPromises.mkdir(retroPath);

		await archivePhaseEvidence(tempDir, phase, config, warnings);

		// No warnings should be added (missing files are caught and skipped)
		expect(warnings).toEqual([]);

		// Verify 3.2 was moved
		const archiveDir = path.join(
			tempDir,
			'.swarm',
			'archive',
			`phase-${phase}`,
		);
		expect(fs.existsSync(path.join(archiveDir, '3.2.json'))).toBe(true);
		expect(fs.existsSync(evidencePath3_2)).toBe(false);

		// Verify 3.1 and 3.3 were NOT created in archive (they don't exist)
		expect(fs.existsSync(path.join(archiveDir, '3.1.json'))).toBe(false);
		expect(fs.existsSync(path.join(archiveDir, '3.3.json'))).toBe(false);

		// Verify retro was moved
		expect(fs.existsSync(path.join(archiveDir, 'retro'))).toBe(true);
	});

	test('5. Retro directory missing → task files moved, retro skipped gracefully', async () => {
		const phase = 4;
		const taskIds = ['4.1', '4.2'];
		const config = createPhaseCompleteConfig(true);

		// Create plan.json
		const planPath = path.join(tempDir, '.swarm', 'plan.json');
		await fsPromises.writeFile(
			planPath,
			JSON.stringify(createMinimalPlan(phase, taskIds)),
		);

		// Create task evidence files
		for (const taskId of taskIds) {
			const evidencePath = path.join(evidenceDir, `${taskId}.json`);
			await fsPromises.writeFile(
				evidencePath,
				JSON.stringify({ task_id: taskId }),
			);
		}

		// NOTE: retro directory is NOT created

		await archivePhaseEvidence(tempDir, phase, config, warnings);

		// No warnings
		expect(warnings).toEqual([]);

		// Verify task files were moved
		const archiveDir = path.join(
			tempDir,
			'.swarm',
			'archive',
			`phase-${phase}`,
		);
		for (const taskId of taskIds) {
			expect(fs.existsSync(path.join(archiveDir, `${taskId}.json`))).toBe(true);
			expect(fs.existsSync(path.join(evidenceDir, `${taskId}.json`))).toBe(
				false,
			);
		}

		// Verify retro was NOT created in archive
		expect(fs.existsSync(path.join(archiveDir, 'retro'))).toBe(false);
	});

	test('6. Invalid plan.json → caught, warnings added', async () => {
		const phase = 5;
		const config = createPhaseCompleteConfig(true);

		// Create invalid plan.json
		const planPath = path.join(tempDir, '.swarm', 'plan.json');
		await fsPromises.writeFile(planPath, 'not valid json {{{');

		await archivePhaseEvidence(tempDir, phase, config, warnings);

		// Warning should be added about the error
		expect(warnings.length).toBe(1);
		expect(warnings[0]).toContain('Warning: failed to archive phase evidence');
	});

	test('7. Successful move → directory structure correct', async () => {
		const phase = 6;
		const taskIds = ['6.1', '6.2', '6.3'];
		const config = createPhaseCompleteConfig(true);

		// Create plan.json
		const planPath = path.join(tempDir, '.swarm', 'plan.json');
		await fsPromises.writeFile(
			planPath,
			JSON.stringify(createMinimalPlan(phase, taskIds)),
		);

		// Create task evidence files with content
		const taskContents: Record<string, object> = {};
		for (const taskId of taskIds) {
			const content = { task_id: taskId, data: `content for ${taskId}` };
			taskContents[taskId] = content;
			const evidencePath = path.join(evidenceDir, `${taskId}.json`);
			await fsPromises.writeFile(evidencePath, JSON.stringify(content));
		}

		// Create retro directory with evidence
		const retroPath = path.join(evidenceDir, `retro-${phase}`);
		await fsPromises.mkdir(retroPath);
		const retroContent = { phase_number: phase, verdict: 'pass' };
		await fsPromises.writeFile(
			path.join(retroPath, 'evidence.json'),
			JSON.stringify(retroContent),
		);

		await archivePhaseEvidence(tempDir, phase, config, warnings);

		// Verify structure
		const archiveDir = path.join(
			tempDir,
			'.swarm',
			'archive',
			`phase-${phase}`,
		);
		expect(fs.existsSync(archiveDir)).toBe(true);
		expect(fs.statSync(archiveDir).isDirectory()).toBe(true);

		// Verify task files in archive
		for (const taskId of taskIds) {
			const archivedPath = path.join(archiveDir, `${taskId}.json`);
			expect(fs.existsSync(archivedPath)).toBe(true);
			const content = JSON.parse(fs.readFileSync(archivedPath, 'utf-8'));
			expect(content).toEqual(taskContents[taskId]);
		}

		// Verify retro directory structure
		const archivedRetro = path.join(archiveDir, 'retro');
		expect(fs.existsSync(archivedRetro)).toBe(true);
		expect(fs.statSync(archivedRetro).isDirectory()).toBe(true);
		const archivedRetroEvidence = path.join(archivedRetro, 'evidence.json');
		expect(fs.existsSync(archivedRetroEvidence)).toBe(true);
		const retroData = JSON.parse(
			fs.readFileSync(archivedRetroEvidence, 'utf-8'),
		);
		expect(retroData).toEqual(retroContent);

		// Verify original evidence is gone
		for (const taskId of taskIds) {
			expect(fs.existsSync(path.join(evidenceDir, `${taskId}.json`))).toBe(
				false,
			);
		}
		expect(fs.existsSync(path.join(evidenceDir, `retro-${phase}`))).toBe(false);
	});
});
