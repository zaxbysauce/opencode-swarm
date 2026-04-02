import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleConfigCommand } from '../../../src/commands/config';

describe('Config Command', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'swarm-config-'));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	test('Shows defaults when no config files exist', async () => {
		const result = await handleConfigCommand(tempDir, []);

		expect(result).toContain('## Swarm Configuration');
		expect(result).toContain('### Resolved Config');
		expect(result).toContain('max_iterations');
		expect(result).toContain('inject_phase_reminders');
		expect(result).toContain('5'); // default max_iterations
		expect(result).toContain('true'); // default inject_phase_reminders
	});

	test('Shows project config when present', async () => {
		const opencodeDir = join(tempDir, '.opencode');
		await mkdir(opencodeDir, { recursive: true });
		const configContent = '{"max_iterations": 10}';
		await writeFile(join(opencodeDir, 'opencode-swarm.json'), configContent);

		const result = await handleConfigCommand(tempDir, []);

		expect(result).toContain('## Swarm Configuration');
		expect(result).toContain('### Resolved Config');
		expect(result).toContain('10'); // custom max_iterations
		expect(result).toContain('true'); // default inject_phase_reminders still present
	});

	test('Shows correct config file paths', async () => {
		const result = await handleConfigCommand(tempDir, []);

		expect(result).toContain('### Config Files');
		expect(result).toContain('- User:');
		expect(result).toContain('- Project:');
	});

	test('Output contains JSON code block', async () => {
		const result = await handleConfigCommand(tempDir, []);

		expect(result).toContain('```json');
		expect(result).toContain('```');
	});
});
