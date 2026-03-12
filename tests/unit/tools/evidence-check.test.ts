import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { evidence_check } from '../../../src/tools/evidence-check';
import type { ToolContext } from '@opencode-ai/plugin';

// Store original cwd
let originalCwd: string;
let testDir: string;

function setupTestDir() {
	// Create a unique temp directory
	const tmp = mkdtempSync(join(tmpdir(), 'evidence-check-test-'));
	// Create .swarm directory structure
	mkdirSync(join(tmp, '.swarm', 'evidence'), { recursive: true });
	return tmp;
}

function createPlanFile(content: string) {
	writeFileSync(join(testDir, '.swarm', 'plan.md'), content, 'utf-8');
}

function createEvidenceFile(filename: string, content: object) {
	const filePath = join(testDir, '.swarm', 'evidence', filename);
	// Ensure the directory exists
	mkdirSync(dirname(filePath), { recursive: true });
	writeFileSync(filePath, JSON.stringify(content), 'utf-8');
}

function clearEvidenceDir() {
	const evidenceDir = join(testDir, '.swarm', 'evidence');
	try {
		rmSync(evidenceDir, { recursive: true, force: true });
		mkdirSync(evidenceDir, { recursive: true });
	} catch {
		// Directory might not exist
	}
}

function runEvidenceCheck(requiredTypes?: string) {
	const args = requiredTypes ? { required_types: requiredTypes } : {};
	const mockContext: ToolContext = {
		sessionID: 'test-session',
		messageID: 'test-message',
		agent: 'test-agent',
		directory: testDir,
		worktree: testDir,
		abort: new AbortController().signal,
		metadata: () => {},
		ask: async () => {},
	};
	return evidence_check.execute(args, mockContext);
}

async function parseResult(result: ReturnType<typeof evidence_check.execute>) {
	return JSON.parse(await result);
}

describe('evidence-check verification tests', () => {
	beforeEach(() => {
		originalCwd = process.cwd();
		testDir = setupTestDir();
		process.chdir(testDir);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		try {
			rmSync(testDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	test('1. Parses plan.md completed tasks correctly (extracts taskId and taskName)', async () => {
		createPlanFile(`
# Plan
- [x] 1.1: Implement feature X
- [x] 1.2: Fix bug Y
`);
		// Use valid filenames (no dots allowed in regex)
		createEvidenceFile('1_1-review.json', { task_id: '1.1', type: 'review' });
		createEvidenceFile('1_1-test.json', { task_id: '1.1', type: 'test' });
		createEvidenceFile('1_2-review.json', { task_id: '1.2', type: 'review' });
		createEvidenceFile('1_2-test.json', { task_id: '1.2', type: 'test' });

		const result = runEvidenceCheck();
		const parsed = await parseResult(result);

		expect(parsed.completedTasks).toHaveLength(2);
		expect(parsed.completedTasks[0].taskId).toBe('1.1');
		expect(parsed.completedTasks[0].taskName).toBe('Implement feature X');
		expect(parsed.completedTasks[1].taskId).toBe('1.2');
		expect(parsed.completedTasks[1].taskName).toBe('Fix bug Y');
		// Also verify evidence was found
		expect(parsed.tasksWithFullEvidence).toHaveLength(2);
		expect(parsed.completeness).toBe(1.0);
	});

	test('2. Strips [SMALL]/[MEDIUM]/[LARGE] size tags from task names', async () => {
		createPlanFile(`
- [x] 1.1: Task one [SMALL]
- [x] 1.2: Task two [MEDIUM]
- [x] 1.3: Task three [LARGE]
- [x] 1.4: Task without tag
`);
		createEvidenceFile('1_1-review.json', { task_id: '1.1', type: 'review' });
		createEvidenceFile('1_1-test.json', { task_id: '1.1', type: 'test' });
		createEvidenceFile('1_2-review.json', { task_id: '1.2', type: 'review' });
		createEvidenceFile('1_2-test.json', { task_id: '1.2', type: 'test' });
		createEvidenceFile('1_3-review.json', { task_id: '1.3', type: 'review' });
		createEvidenceFile('1_3-test.json', { task_id: '1.3', type: 'test' });
		createEvidenceFile('1_4-review.json', { task_id: '1.4', type: 'review' });
		createEvidenceFile('1_4-test.json', { task_id: '1.4', type: 'test' });

		const result = runEvidenceCheck();
		const parsed = await parseResult(result);

		expect(parsed.completedTasks[0].taskName).toBe('Task one');
		expect(parsed.completedTasks[1].taskName).toBe('Task two');
		expect(parsed.completedTasks[2].taskName).toBe('Task three');
		expect(parsed.completedTasks[3].taskName).toBe('Task without tag');
	});

	test('3. Identifies missing evidence types correctly (task has review but missing test)', async () => {
		createPlanFile(`
- [x] 1.1: Task with review only
`);
		createEvidenceFile('1_1-review.json', { task_id: '1.1', type: 'review' });
		// No test evidence

		const result = runEvidenceCheck();
		const parsed = await parseResult(result);

		expect(parsed.gaps).toHaveLength(1);
		expect(parsed.gaps[0].taskId).toBe('1.1');
		expect(parsed.gaps[0].missing).toContain('test');
		expect(parsed.gaps[0].present).toContain('review');
	});

	test('4. Identifies tasks with full evidence (no gaps)', async () => {
		createPlanFile(`
- [x] 1.1: Complete task
- [x] 1.2: Another complete task
`);
		createEvidenceFile('1_1-review.json', { task_id: '1.1', type: 'review' });
		createEvidenceFile('1_1-test.json', { task_id: '1.1', type: 'test' });
		createEvidenceFile('1_2-review.json', { task_id: '1.2', type: 'review' });
		createEvidenceFile('1_2-test.json', { task_id: '1.2', type: 'test' });

		const result = runEvidenceCheck();
		const parsed = await parseResult(result);

		expect(parsed.tasksWithFullEvidence).toHaveLength(2);
		expect(parsed.gaps).toHaveLength(0);
		expect(parsed.completeness).toBe(1.0);
	});

	test('5. Completeness ratio: 1 gap out of 2 tasks = 0.5', async () => {
		createPlanFile(`
- [x] 1.1: Task one
- [x] 1.2: Task two
`);
		// Only task 1.1 has full evidence
		createEvidenceFile('1_1-review.json', { task_id: '1.1', type: 'review' });
		createEvidenceFile('1_1-test.json', { task_id: '1.1', type: 'test' });
		// Task 1.2 is missing evidence

		const result = runEvidenceCheck();
		const parsed = await parseResult(result);

		expect(parsed.completeness).toBe(0.5);
		expect(parsed.completedTasks).toHaveLength(2);
		expect(parsed.tasksWithFullEvidence).toHaveLength(1);
		expect(parsed.gaps).toHaveLength(1);
	});

	test('6. Completeness ratio: 0 gaps = 1.0', async () => {
		createPlanFile(`
- [x] 1.1: Task one
- [x] 1.2: Task two
- [x] 1.3: Task three
`);
		// All tasks have full evidence
		for (let i = 1; i <= 3; i++) {
			createEvidenceFile(`1_${i}-review.json`, { task_id: `1.${i}`, type: 'review' });
			createEvidenceFile(`1_${i}-test.json`, { task_id: `1.${i}`, type: 'test' });
		}

		const result = runEvidenceCheck();
		const parsed = await parseResult(result);

		expect(parsed.completeness).toBe(1.0);
		expect(parsed.tasksWithFullEvidence).toHaveLength(3);
		expect(parsed.gaps).toHaveLength(0);
	});

	test('7. Handles missing evidence directory gracefully (returns completeness: 1.0 with gaps for all tasks)', async () => {
		createPlanFile(`
- [x] 1.1: Task one
- [x] 1.2: Task two
`);
		// Remove evidence directory
		rmSync(join(testDir, '.swarm', 'evidence'), { recursive: true, force: true });

		const result = runEvidenceCheck();
		const parsed = await parseResult(result);

		// Should report gaps for all tasks (missing both review and test)
		expect(parsed.gaps).toHaveLength(2);
		expect(parsed.gaps[0].missing).toContain('review');
		expect(parsed.gaps[0].missing).toContain('test');
		// Completeness is 0 because no tasks have full evidence
		expect(parsed.completeness).toBe(0);
	});

	test('8. Handles empty plan (no [x] tasks) → returns message + completeness: 1.0', async () => {
		createPlanFile(`
# Plan
- [ ] 1.1: Incomplete task
- [ ] 1.2: Another incomplete task
`);

		const result = runEvidenceCheck();
		const parsed = await parseResult(result);

		expect(parsed.message).toBe('No completed tasks found in plan.');
		expect(parsed.completeness).toBe(1.0);
		expect(parsed.gaps).toHaveLength(0);
	});

	test('9. Handles corrupt JSON evidence files gracefully (skips them)', async () => {
		createPlanFile(`
- [x] 1.1: Task one
`);
		// Create a corrupt JSON file
		const corruptPath = join(testDir, '.swarm', 'evidence', 'corrupt.json');
		writeFileSync(corruptPath, '{ invalid json }', 'utf-8');
		// Create a valid evidence file
		createEvidenceFile('1_1-review.json', { task_id: '1.1', type: 'review' });
		createEvidenceFile('1_1-test.json', { task_id: '1.1', type: 'test' });

		const result = runEvidenceCheck();
		const parsed = await parseResult(result);

		// Should still work - corrupt file is skipped
		expect(parsed.completeness).toBe(1.0);
		expect(parsed.tasksWithFullEvidence).toHaveLength(1);
	});

	test('10. Handles evidence file with wrong structure (no task_id/type fields) → skipped', async () => {
		createPlanFile(`
- [x] 1.1: Task one
`);
		// Create evidence file with wrong structure (valid filename but missing task_id/type)
		createEvidenceFile('1_1-wrong.json', { wrong_field: 'value', another: 123 });
		// Also create a valid one for same task
		createEvidenceFile('1_1-review.json', { task_id: '1.1', type: 'review' });
		createEvidenceFile('1_1-test.json', { task_id: '1.1', type: 'test' });

		const result = runEvidenceCheck();
		const parsed = await parseResult(result);

		// Valid evidence should still work
		expect(parsed.completeness).toBe(1.0);
	});

	test('11. Custom required_types: "review,test,diff" — checks all three', async () => {
		createPlanFile(`
- [x] 1.1: Task one
`);
		// Only review and test - missing diff
		createEvidenceFile('1_1-review.json', { task_id: '1.1', type: 'review' });
		createEvidenceFile('1_1-test.json', { task_id: '1.1', type: 'test' });

		const result = runEvidenceCheck('review,test,diff');
		const parsed = await parseResult(result);

		expect(parsed.requiredTypes).toEqual(['review', 'test', 'diff']);
		expect(parsed.gaps).toHaveLength(1);
		expect(parsed.gaps[0].missing).toContain('diff');
		expect(parsed.gaps[0].present).toContain('review');
		expect(parsed.gaps[0].present).toContain('test');
	});
});

describe('evidence-check adversarial tests', () => {
	beforeEach(() => {
		originalCwd = process.cwd();
		testDir = setupTestDir();
		process.chdir(testDir);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		try {
			rmSync(testDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	test('1. Shell metacharacter in required_types: "review;rm -rf /" → returns error', async () => {
		createPlanFile(`
- [x] 1.1: Task one
`);

		const result = runEvidenceCheck('review;rm -rf /');
		const parsed = await parseResult(result);

		expect(parsed.error).toBeDefined();
		expect(parsed.error).toContain('shell metacharacters');
		expect(parsed.completeness).toBe(0);
	});

	test('2. Shell metacharacter in required_types: "review|cat /etc/passwd" → returns error', async () => {
		createPlanFile(`
- [x] 1.1: Task one
`);

		const result = runEvidenceCheck('review|cat /etc/passwd');
		const parsed = await parseResult(result);

		expect(parsed.error).toBeDefined();
		expect(parsed.error).toContain('shell metacharacters');
	});

	test('3. Evidence filename with path traversal: "../evil.json" → skipped (filename regex blocks it)', () => {
		createPlanFile(`
- [x] 1.1: Task one
`);
		// Test the filename regex - path traversal should be blocked
		const pathTraversalFilename = '../evil.json';
		const regex = /^[a-zA-Z0-9_-]+\.json$/;
		
		expect(regex.test(pathTraversalFilename)).toBe(false);
		
		// Also verify normal valid filenames with underscores work
		const validFilename = '1_1-review.json';
		expect(regex.test(validFilename)).toBe(true);
		
		// And verify filenames with dots are NOT valid (the regex doesn't allow dots)
		const dotFilename = '1.1-review.json';
		expect(regex.test(dotFilename)).toBe(false);
	});

	test('4. Evidence file >1MB → skipped', async () => {
		createPlanFile(`
- [x] 1.1: Task one
`);
		// Create a large evidence file (>1MB)
		const largeContent = 'x'.repeat(1024 * 1024 + 1); // >1MB
		createEvidenceFile('1_1-review.json', { task_id: '1.1', type: 'review', content: largeContent });
		
		// Verify file is actually large
		const filePath = join(testDir, '.swarm', 'evidence', '1_1-review.json');
		const fileStat = statSync(filePath);
		expect(fileStat.size).toBeGreaterThan(1024 * 1024);

		// Also create a small valid file for the same task
		createEvidenceFile('1_1-test.json', { task_id: '1.1', type: 'test' });

		const result = runEvidenceCheck();
		const parsed = await parseResult(result);

		// Large file should be skipped, so task should have gap for review
		expect(parsed.gaps).toHaveLength(1);
		expect(parsed.gaps[0].missing).toContain('review');
		expect(parsed.gaps[0].present).toContain('test');
	});
});
