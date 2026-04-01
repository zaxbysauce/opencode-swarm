import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleResetCommand } from '../../../src/commands/reset';

describe('handleResetCommand', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'swarm-reset-test-'));
		await mkdir(join(tempDir, '.swarm'), { recursive: true });
	});

	afterEach(async () => {
		if (existsSync(tempDir)) {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	test('Without --confirm - returns warning text, files NOT deleted', async () => {
		// Create both files
		await writeFile(
			join(tempDir, '.swarm', 'plan.md'),
			`## Phase 1

- [ ] Task 1
`,
		);

		await writeFile(
			join(tempDir, '.swarm', 'context.md'),
			`# Context
`,
		);

		const result = await handleResetCommand(tempDir, []);

		expect(result).toContain('## Swarm Reset');
		expect(result).toContain(
			'⚠️ This will delete plan.md and context.md from .swarm/',
		);
		expect(result).toContain(
			'Tip**: Run `/swarm export` first to backup your state.',
		);
		expect(result).toContain('To confirm, run: `/swarm reset --confirm`');

		// Verify files still exist
		expect(existsSync(join(tempDir, '.swarm', 'plan.md'))).toBe(true);
		expect(existsSync(join(tempDir, '.swarm', 'context.md'))).toBe(true);
	});

	test('With --confirm - files ARE deleted', async () => {
		// Create both files
		await writeFile(
			join(tempDir, '.swarm', 'plan.md'),
			`## Phase 1

- [ ] Task 1
`,
		);

		await writeFile(
			join(tempDir, '.swarm', 'context.md'),
			`# Context
`,
		);

		const result = await handleResetCommand(tempDir, ['--confirm']);

		expect(result).toContain('## Swarm Reset Complete');
		expect(result).toContain('✅ Deleted plan.md');
		expect(result).toContain('✅ Deleted context.md');
		expect(result).toContain(
			'Swarm state has been cleared. Start fresh with a new plan.',
		);

		// Verify files are deleted
		expect(existsSync(join(tempDir, '.swarm', 'plan.md'))).toBe(false);
		expect(existsSync(join(tempDir, '.swarm', 'context.md'))).toBe(false);
	});

	test('With --confirm, files already missing - reports not found', async () => {
		// Don't create any files
		const result = await handleResetCommand(tempDir, ['--confirm']);

		expect(result).toContain('## Swarm Reset Complete');
		expect(result).toContain('⏭️ plan.md not found (skipped)');
		expect(result).toContain('⏭️ context.md not found (skipped)');
		expect(result).toContain(
			'Swarm state has been cleared. Start fresh with a new plan.',
		);
	});

	test('With --confirm, only plan.md exists - deletes plan.md, skips context.md', async () => {
		// Create only plan.md
		await writeFile(
			join(tempDir, '.swarm', 'plan.md'),
			`## Phase 1

- [ ] Task 1
`,
		);

		const result = await handleResetCommand(tempDir, ['--confirm']);

		expect(result).toContain('## Swarm Reset Complete');
		expect(result).toContain('✅ Deleted plan.md');
		expect(result).toContain('⏭️ context.md not found (skipped)');
		expect(result).toContain(
			'Swarm state has been cleared. Start fresh with a new plan.',
		);

		// Verify plan.md is deleted but context.md was never created
		expect(existsSync(join(tempDir, '.swarm', 'plan.md'))).toBe(false);
		expect(existsSync(join(tempDir, '.swarm', 'context.md'))).toBe(false);
	});

	test('Warning message includes tip about /swarm export', async () => {
		const result = await handleResetCommand(tempDir, []);

		expect(result).toContain(
			'Tip**: Run `/swarm export` first to backup your state.',
		);
	});

	test('With --confirm flag', async () => {
		const result = await handleResetCommand(tempDir, ['--confirm']);

		expect(result).toContain('## Swarm Reset Complete');
	});

	test('With additional args alongside --confirm', async () => {
		// Create both files
		await writeFile(
			join(tempDir, '.swarm', 'plan.md'),
			`## Phase 1

- [ ] Task 1
`,
		);

		await writeFile(
			join(tempDir, '.swarm', 'context.md'),
			`# Context
`,
		);

		const result = await handleResetCommand(tempDir, [
			'--confirm',
			'extra',
			'args',
		]);

		expect(result).toContain('## Swarm Reset Complete');
		expect(result).toContain('✅ Deleted plan.md');
		expect(result).toContain('✅ Deleted context.md');
	});
});
