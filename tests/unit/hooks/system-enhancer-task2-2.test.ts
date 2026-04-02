import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EvidenceBundle } from '../../../src/config/evidence-schema';
import {
	listEvidenceTaskIds,
	loadEvidence,
} from '../../../src/evidence/manager';

describe('Task 2.2: System Enhancer Retrospective Deduplication', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'swarm-retro-22-test-'));
	});

	afterEach(async () => {
		try {
			await rm(tempDir, { recursive: true, force: true });
		} catch {}
	});

	async function createRetroBundle(
		phaseNumber: number,
		verdict: 'pass' | 'fail' | 'info',
		lessons: string[] = [],
		rejections: string[] = [],
		summary: string = 'Phase completed.',
		entries: any[] | null = null,
	): Promise<string> {
		const taskDir = join(tempDir, '.swarm', 'evidence', `retro-${phaseNumber}`);
		await mkdir(taskDir, { recursive: true });

		const retroEntry = {
			type: 'retrospective',
			task_id: `retro-${phaseNumber}`,
			timestamp: new Date().toISOString(),
			agent: 'architect',
			verdict,
			summary,
			phase_number: phaseNumber,
			total_tool_calls: 42,
			coder_revisions: 2,
			reviewer_rejections: rejections.length,
			test_failures: 0,
			security_findings: 0,
			integration_issues: 0,
			task_count: 5,
			task_complexity: 'moderate',
			top_rejection_reasons: rejections,
			lessons_learned: lessons,
		};

		const bundle: EvidenceBundle = {
			schema_version: '1.0.0',
			task_id: `retro-${phaseNumber}`,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			entries: entries !== null ? entries : [retroEntry],
		};

		const bundlePath = join(taskDir, 'evidence.json');
		await writeFile(bundlePath, JSON.stringify(bundle, null, 2));
		return bundlePath;
	}

	async function createEvidenceDirectory(
		directoryName: string,
	): Promise<string> {
		const taskDir = join(tempDir, '.swarm', 'evidence', directoryName);
		await mkdir(taskDir, { recursive: true });
		return taskDir;
	}

	// Test 1: The source file does NOT contain readdirSync inside the retrospective injection section
	it('Test 1: The source file does NOT contain readdirSync inside the retrospective injection section', () => {
		const sourcePath = join(process.cwd(), 'src/hooks/system-enhancer.ts');
		const sourceContent = readFileSync(sourcePath, 'utf-8');

		// Check that readdirSync does not appear anywhere in the file
		expect(sourceContent).not.toContain('readdirSync');
	});

	// Test 2: The source file does NOT contain reviewer_rejections > 2 anywhere
	it('Test 2: The source file does NOT contain reviewer_rejections > 2 anywhere', () => {
		const sourcePath = join(process.cwd(), 'src/hooks/system-enhancer.ts');
		const sourceContent = readFileSync(sourcePath, 'utf-8');

		// Check that the old pattern is not present
		expect(sourceContent).not.toContain('reviewer_rejections > 2');
	});

	// Test 3: The source file contains exactly 2 calls to buildRetroInjection
	it('Test 3: The source file contains exactly 2 calls to buildRetroInjection', () => {
		const sourcePath = join(process.cwd(), 'src/hooks/system-enhancer.ts');
		const sourceContent = readFileSync(sourcePath, 'utf-8');

		// Count occurrences of await buildRetroInjection( (actual calls, not the definition)
		const matches = sourceContent.match(/await\s+buildRetroInjection\(/g);
		expect(matches).toHaveLength(2);
	});

	// Test 4: The source file does NOT contain the old hints_b.push pattern
	it('Test 4: The source file does NOT contain the old hints_b.push pattern', () => {
		const sourcePath = join(process.cwd(), 'src/hooks/system-enhancer.ts');
		const sourceContent = readFileSync(sourcePath, 'utf-8');

		// Check that the old pattern is not present
		expect(sourceContent).not.toContain('hints_b.push');
	});

	// Test 5: The source file does NOT contain const files_b = fs.readdirSync
	it('Test 5: The source file does NOT contain const files_b = fs.readdirSync', () => {
		const sourcePath = join(process.cwd(), 'src/hooks/system-enhancer.ts');
		const sourceContent = readFileSync(sourcePath, 'utf-8');

		// Check that the old pattern is not present
		expect(sourceContent).not.toContain('const files_b = fs.readdirSync');
	});

	// Test 6: loadEvidence correctly returns not_found for missing task IDs
	it.skip('Test 6: loadEvidence correctly returns not_found for missing task IDs', async () => {
		// Create a valid retro bundle
		await createRetroBundle(1, 'pass', ['lesson A']);

		// Try to load a non-existent task ID
		const result = await loadEvidence(tempDir, 'nonexistent-task');

		// Should return not_found status
		expect(result.status).toBe('not_found');
	});

	// Test 7: A retro bundle with no entries returns found status from loadEvidence
	it('Test 7: A retro bundle with no entries returns found status from loadEvidence', async () => {
		// Create a bundle with empty entries array
		const taskDir = join(tempDir, '.swarm', 'evidence', 'retro-1');
		await mkdir(taskDir, { recursive: true });

		const bundle: EvidenceBundle = {
			schema_version: '1.0.0',
			task_id: 'retro-1',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			entries: [], // Empty entries array
		};

		const bundlePath = join(taskDir, 'evidence.json');
		await writeFile(bundlePath, JSON.stringify(bundle, null, 2));

		// Load the bundle - should return found status (bundle is valid)
		const result = await loadEvidence(tempDir, 'retro-1');

		// The bundle itself is loaded successfully (it's valid)
		// but for our purposes, we're testing that the evidence manager
		// handles it correctly
		expect(result.status).toBe('found');
		expect(result.bundle.entries).toEqual([]);
	});

	// Test 8: listEvidenceTaskIds with mixed directory contents returns all IDs
	it.skip('Test 8: listEvidenceTaskIds with mixed directory contents (retro-1, retro-2, some non-retro IDs) returns all IDs', async () => {
		// Create retro-1 and retro-2 bundles
		await createRetroBundle(1, 'pass', ['lesson A']);
		await createRetroBundle(2, 'fail', ['lesson B']);

		// Create some non-retro directories
		await createEvidenceDirectory('task-1');
		await createEvidenceDirectory('task-2');

		// Get all task IDs
		const taskIds = await listEvidenceTaskIds(tempDir);

		// Should contain all IDs including retro-1, retro-2, task-1, task-2
		expect(taskIds).toContain('retro-1');
		expect(taskIds).toContain('retro-2');
		expect(taskIds).toContain('task-1');
		expect(taskIds).toContain('task-2');

		// Should have exactly 4 IDs
		expect(taskIds).toHaveLength(4);
	});

	// Test 9: A retro bundle with verdict='pass' but empty lessons_learned still produces a valid structure
	it('Test 9: A retro bundle with verdict pass but empty lessons_learned still produces valid evidence', async () => {
		// Create a retro bundle with pass verdict but empty lessons_learned
		await createRetroBundle(3, 'pass', [], ['reason X'], 'Phase 3 completed.');

		// Load the bundle
		const result = await loadEvidence(tempDir, 'retro-3');

		// Bundle should be loaded
		expect(result.status).toBe('found');
		const bundle = result.bundle;
		expect(bundle.task_id).toBe('retro-3');

		// Get the retrospective entry
		const retroEntry = bundle.entries.find(
			(e): e is any => e.type === 'retrospective',
		);

		// Entry should exist and have pass verdict
		expect(retroEntry).toBeDefined();
		expect(retroEntry.verdict).toBe('pass');
		expect(retroEntry.lessons_learned).toEqual([]);
	});

	// Test 10: A retro bundle with phase_number=5 can be loaded (for fallback scan)
	it('Test 10: A retro bundle with phase_number=5 can be loaded when direct lookup for phase 4 fails', async () => {
		// Create only a phase 5 retro bundle
		await createRetroBundle(
			5,
			'pass',
			['lesson from phase 5'],
			['reason Y'],
			'Phase 5 completed.',
		);

		// Verify we can load the phase 5 bundle directly
		const result = await loadEvidence(tempDir, 'retro-5');
		expect(result.status).toBe('found');
		const bundle = result.bundle;
		expect(bundle.task_id).toBe('retro-5');

		// Get the retrospective entry
		const retroEntry = bundle.entries.find(
			(e): e is any => e.type === 'retrospective',
		);

		// Entry should have phase_number=5
		expect(retroEntry).toBeDefined();
		expect(retroEntry.phase_number).toBe(5);

		// Verify phase 4 doesn't exist
		const bundle4 = await loadEvidence(tempDir, 'retro-4');
		expect(bundle4.status).toBe('not_found');

		// List all task IDs - should include retro-5
		const allTaskIds = await listEvidenceTaskIds(tempDir);
		expect(allTaskIds).toContain('retro-5');
		expect(allTaskIds).not.toContain('retro-4');
	});
});
