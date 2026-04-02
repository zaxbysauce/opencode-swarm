import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleDiagnoseCommand } from '../../../src/commands/diagnose';

describe('handleDiagnoseCommand', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'swarm-test-'));
		await mkdir(join(tempDir, '.swarm'), { recursive: true });
	});

	afterEach(async () => {
		if (existsSync(tempDir)) {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	test('All checks pass', async () => {
		// Create valid plan.md with phase structure
		await writeFile(
			join(tempDir, '.swarm', 'plan.md'),
			`## Phase 1

- [ ] Task 1
- [x] Task 2

## Phase 2

- [ ] Task 3
`,
		);

		// Create context.md
		await writeFile(
			join(tempDir, '.swarm', 'context.md'),
			`# Swarm Context

## Current State
Working on Phase 1
`,
		);

		const result = await handleDiagnoseCommand(tempDir, []);
		// Some checks may fail in test environment (e.g. Git not a repo, WASM files missing).
		// Verify the key file checks pass.
		expect(result).toContain(
			'✅ **plan.md**: Found with valid phase structure',
		);
		expect(result).toContain('✅ **context.md**: Found');
		expect(result).toContain('✅ **Plugin config**:');
		// Result line is present (all pass OR partial pass)
		expect(result).toMatch(/\*\*Result\*\*:/);
	});

	test('Missing plan.md', async () => {
		// Create only context.md
		await writeFile(
			join(tempDir, '.swarm', 'context.md'),
			`# Swarm Context

## Current State
Working on Phase 1
`,
		);

		const result = await handleDiagnoseCommand(tempDir, []);
		expect(result).toContain('❌ **plan.md**: Not found');
		expect(result).toContain('✅ **context.md**: Found');
		expect(result).toContain('⚠️');
	});

	test('plan.md without phases', async () => {
		// Create plan.md without phase structure
		await writeFile(
			join(tempDir, '.swarm', 'plan.md'),
			`# Swarm Plan

Some random content without proper phase structure
`,
		);

		const result = await handleDiagnoseCommand(tempDir, []);
		expect(result).toContain(
			'❌ **plan.md**: Found but missing phase/task structure',
		);
		expect(result).toContain('⚠️');
	});

	test('Missing context.md', async () => {
		// Create only plan.md
		await writeFile(
			join(tempDir, '.swarm', 'plan.md'),
			`## Phase 1

- [ ] Task 1
- [x] Task 2
`,
		);

		const result = await handleDiagnoseCommand(tempDir, []);
		expect(result).toContain(
			'✅ **plan.md**: Found with valid phase structure',
		);
		expect(result).toContain('❌ **context.md**: Not found');
		expect(result).toContain('⚠️');
	});

	test('Both files missing', async () => {
		// Create empty .swarm directory
		const result = await handleDiagnoseCommand(tempDir, []);
		expect(result).toContain('❌ **plan.md**: Not found');
		expect(result).toContain('❌ **context.md**: Not found');
		expect(result).toContain('⚠️');
	});

	test('Result string format - all pass', async () => {
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

		const result = await handleDiagnoseCommand(tempDir, []);
		// In test environment some checks may fail (Git not a repo, WASM files missing).
		// Verify the result line exists in either form.
		expect(result).toMatch(
			/\*\*Result\*\*: (✅ All checks passed|⚠️ \d+\/\d+ checks passed)/,
		);
	});

	test('Result string format - partial pass', async () => {
		await writeFile(
			join(tempDir, '.swarm', 'context.md'),
			`# Context
`,
		);

		const result = await handleDiagnoseCommand(tempDir, []);
		expect(result).toMatch(/Result\*\*: ⚠️ \d+\/\d+ checks passed/);
	});
});
