import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleHistoryCommand } from '../../../src/commands/history';

describe('History Command', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'swarm-history-'));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	test('No plan.md - No .swarm dir', async () => {
		const result = await handleHistoryCommand(tempDir, []);

		expect(result).toBe('No history available.');
	});

	test('Empty plan.md - Empty file', async () => {
		const planDir = join(tempDir, '.swarm');
		await mkdir(planDir, { recursive: true });
		await writeFile(join(planDir, 'plan.md'), '');

		const result = await handleHistoryCommand(tempDir, []);

		expect(result).toBe('No history available.');
	});

	test('Single completed phase', async () => {
		const planDir = join(tempDir, '.swarm');
		await mkdir(planDir, { recursive: true });
		const planContent = `## Phase 1: Setup [COMPLETE]
- [x] Task 1
- [x] Task 2`;
		await writeFile(join(planDir, 'plan.md'), planContent);

		const result = await handleHistoryCommand(tempDir, []);

		expect(result).toContain('## Swarm History');
		expect(result).toContain('| Phase | Name | Status | Tasks |');
		expect(result).toContain('1');
		expect(result).toContain('Setup');
		expect(result).toContain('✅ COMPLETE');
		expect(result).toContain('2/2');
	});

	test('Multi-phase plan', async () => {
		const planDir = join(tempDir, '.swarm');
		await mkdir(planDir, { recursive: true });
		const planContent = `## Phase 1: Setup [COMPLETE]
- [x] Task 1
- [x] Task 2

---

## Phase 2: Implement [IN PROGRESS]
- [x] Task 3
- [ ] Task 4

---

## Phase 3: Test [PENDING]
- [ ] Task 5`;
		await writeFile(join(planDir, 'plan.md'), planContent);

		const result = await handleHistoryCommand(tempDir, []);

		expect(result).toContain('## Swarm History');
		expect(result).toContain('| Phase | Name | Status | Tasks |');

		// Phase 1 checks
		expect(result).toContain('1');
		expect(result).toContain('Setup');
		expect(result).toContain('✅ COMPLETE');
		expect(result).toContain('2/2');

		// Phase 2 checks
		expect(result).toContain('2');
		expect(result).toContain('Implement');
		expect(result).toContain('🔄 IN PROGRESS');
		expect(result).toContain('1/2');

		// Phase 3 checks
		expect(result).toContain('3');
		expect(result).toContain('Test');
		expect(result).toContain('⏳ PENDING');
		expect(result).toContain('0/1');
	});

	test('Phase with no tasks', async () => {
		const planDir = join(tempDir, '.swarm');
		await mkdir(planDir, { recursive: true });
		const planContent = `## Phase 1: Empty [PENDING]`;
		await writeFile(join(planDir, 'plan.md'), planContent);

		const result = await handleHistoryCommand(tempDir, []);

		expect(result).toContain('## Swarm History');
		expect(result).toContain('| Phase | Name | Status | Tasks |');
		expect(result).toContain('1');
		expect(result).toContain('Empty');
		expect(result).toContain('⏳ PENDING');
		expect(result).toContain('-');
	});

	test('Plan with no status markers - defaults to PENDING', async () => {
		const planDir = join(tempDir, '.swarm');
		await mkdir(planDir, { recursive: true });
		const planContent = `## Phase 1: Setup
- [x] Done`;
		await writeFile(join(planDir, 'plan.md'), planContent);

		const result = await handleHistoryCommand(tempDir, []);

		expect(result).toContain('## Swarm History');
		expect(result).toContain('| Phase | Name | Status | Tasks |');
		expect(result).toContain('1');
		expect(result).toContain('Setup');
		expect(result).toContain('⏳ PENDING');
		expect(result).toContain('1/1');
	});
});
