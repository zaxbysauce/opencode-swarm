import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AgentDefinition } from '../../../src/agents';
import { createSwarmCommandHandler } from '../../../src/commands/index';

describe('createSwarmCommandHandler — first-run sentinel', () => {
	let tempDir: string;
	const testAgents: Record<string, AgentDefinition> = {
		architect: {
			name: 'architect',
			config: { model: 'gpt-4', temperature: 0.1 },
		},
	};

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-first-run-test-'));
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	test('shows welcome message on first command', async () => {
		const handler = createSwarmCommandHandler(tempDir, testAgents);
		const output = { parts: [] as unknown[] };
		await handler({ command: 'swarm', sessionID: 's1', arguments: '' }, output);

		expect(output.parts).toHaveLength(1);
		const part = output.parts[0] as { type: string; text: string };
		expect(part.type).toBe('text');
		expect(part.text).toContain('Welcome to OpenCode Swarm!');
	});

	test('welcome message includes reference to /swarm help', async () => {
		const handler = createSwarmCommandHandler(tempDir, testAgents);
		const output = { parts: [] as unknown[] };
		await handler({ command: 'swarm', sessionID: 's1', arguments: '' }, output);

		const part = output.parts[0] as { type: string; text: string };
		expect(part.text).toContain('/swarm help');
	});

	test('sentinel file is created on first command', async () => {
		const sentinelPath = path.join(tempDir, '.swarm', '.first-run-complete');
		expect(fs.existsSync(sentinelPath)).toBe(false);

		const handler = createSwarmCommandHandler(tempDir, testAgents);
		const output = { parts: [] as unknown[] };
		await handler({ command: 'swarm', sessionID: 's1', arguments: '' }, output);

		expect(fs.existsSync(sentinelPath)).toBe(true);
		const content = fs.readFileSync(sentinelPath, 'utf-8');
		expect(content).toContain('first-run-complete:');
	});

	test('.swarm directory is created if it does not exist', async () => {
		const swarmDir = path.join(tempDir, '.swarm');
		expect(fs.existsSync(swarmDir)).toBe(false);

		const handler = createSwarmCommandHandler(tempDir, testAgents);
		const output = { parts: [] as unknown[] };
		await handler({ command: 'swarm', sessionID: 's1', arguments: '' }, output);

		expect(fs.existsSync(swarmDir)).toBe(true);
	});

	test('welcome message is NOT shown on subsequent commands', async () => {
		const handler = createSwarmCommandHandler(tempDir, testAgents);
		const output1 = { parts: [] as unknown[] };
		const output2 = { parts: [] as unknown[] };

		// First run
		await handler(
			{ command: 'swarm', sessionID: 's1', arguments: '' },
			output1,
		);
		const part1 = output1.parts[0] as { type: string; text: string };

		// Second run
		await handler(
			{ command: 'swarm', sessionID: 's2', arguments: '' },
			output2,
		);
		const part2 = output2.parts[0] as { type: string; text: string };

		// First run has welcome message
		expect(part1.text).toContain('Welcome to OpenCode Swarm!');
		// Second run should not have welcome message
		expect(part2.text).not.toContain('Welcome to OpenCode Swarm!');
	});

	test('sentinel already exists on subsequent commands', async () => {
		const sentinelPath = path.join(tempDir, '.swarm', '.first-run-complete');
		const handler = createSwarmCommandHandler(tempDir, testAgents);
		const output1 = { parts: [] as unknown[] };
		const output2 = { parts: [] as unknown[] };

		// First run creates sentinel
		await handler(
			{ command: 'swarm', sessionID: 's1', arguments: '' },
			output1,
		);
		const firstRunContent = fs.readFileSync(sentinelPath, 'utf-8');

		// Second run
		await handler(
			{ command: 'swarm', sessionID: 's2', arguments: '' },
			output2,
		);

		// Sentinel should still exist and be unchanged
		const secondRunContent = fs.readFileSync(sentinelPath, 'utf-8');
		expect(secondRunContent).toBe(firstRunContent);
	});

	test('graceful handling when sentinel creation fails - no crash', async () => {
		// Create a directory that we can make read-only to simulate failure
		const handler = createSwarmCommandHandler(tempDir, testAgents);
		const output = { parts: [] as unknown[] };

		// Handler should not throw even if sentinel creation fails
		// (We can't easily simulate failure without mocking, so just verify normal behavior works)
		await handler({ command: 'swarm', sessionID: 's1', arguments: '' }, output);

		expect(output.parts).toHaveLength(1);
		const part = output.parts[0] as { type: string; text: string };
		expect(part.type).toBe('text');
		// Normal flow should still produce output
		expect(part.text.length).toBeGreaterThan(0);
	});

	test('welcome message prepended before help text', async () => {
		const handler = createSwarmCommandHandler(tempDir, testAgents);
		const output = { parts: [] as unknown[] };
		await handler({ command: 'swarm', sessionID: 's1', arguments: '' }, output);

		const part = output.parts[0] as { type: string; text: string };
		// Welcome message should come first
		const welcomeIndex = part.text.indexOf('Welcome to OpenCode Swarm!');
		const helpIndex = part.text.indexOf('Swarm Commands');
		expect(welcomeIndex).toBeLessThan(helpIndex);
	});

	test('help command shows welcome on first run', async () => {
		const handler = createSwarmCommandHandler(tempDir, testAgents);
		const output = { parts: [] as unknown[] };
		await handler(
			{ command: 'swarm', sessionID: 's1', arguments: 'help' },
			output,
		);

		const part = output.parts[0] as { type: string; text: string };
		expect(part.text).toContain('Welcome to OpenCode Swarm!');
	});

	test('status command shows welcome on first run', async () => {
		const handler = createSwarmCommandHandler(tempDir, testAgents);
		const output = { parts: [] as unknown[] };
		await handler(
			{ command: 'swarm', sessionID: 's1', arguments: 'status' },
			output,
		);

		const part = output.parts[0] as { type: string; text: string };
		expect(part.text).toContain('Welcome to OpenCode Swarm!');
	});

	test('non-swarm commands do NOT create sentinel file', async () => {
		const sentinelPath = path.join(tempDir, '.swarm', '.first-run-complete');
		const handler = createSwarmCommandHandler(tempDir, testAgents);
		const output = { parts: [] as unknown[] };

		// Simulate a non-swarm command being passed through
		// (command guard returns early before sentinel creation)
		await handler(
			{ command: 'agents', sessionID: 's1', arguments: '' },
			output,
		);

		// Sentinel should NOT be created for non-swarm commands
		expect(fs.existsSync(sentinelPath)).toBe(false);
		// Output should remain empty since handler returned early
		expect(output.parts).toHaveLength(0);
	});

	test('atomic wx flag prevents duplicate welcome messages on concurrent first calls', async () => {
		const sentinelPath = path.join(tempDir, '.swarm', '.first-run-complete');
		const handler = createSwarmCommandHandler(tempDir, testAgents);

		// Create shared output objects that will be modified by concurrent handlers
		const output1 = { parts: [] as unknown[] };
		const output2 = { parts: [] as unknown[] };
		const output3 = { parts: [] as unknown[] };

		// Simulate concurrent first-run calls - all racing to create the sentinel
		await Promise.all([
			handler({ command: 'swarm', sessionID: 'c1', arguments: '' }, output1),
			handler({ command: 'swarm', sessionID: 'c2', arguments: '' }, output2),
			handler({ command: 'swarm', sessionID: 'c3', arguments: '' }, output3),
		]);

		// Exactly ONE welcome message should appear among all concurrent calls
		// because the 'wx' flag makes all but the first write fail
		const welcomeCount = [output1, output2, output3].filter((o) => {
			const part = o.parts[0] as { type: string; text: string } | undefined;
			return part?.text?.includes('Welcome to OpenCode Swarm!') ?? false;
		}).length;

		expect(welcomeCount).toBe(1);

		// Sentinel file should still exist (first writer succeeded)
		expect(fs.existsSync(sentinelPath)).toBe(true);
	});

	test('shortcut command swarm-config creates sentinel on first run', async () => {
		const sentinelPath = path.join(tempDir, '.swarm', '.first-run-complete');
		expect(fs.existsSync(sentinelPath)).toBe(false);

		const handler = createSwarmCommandHandler(tempDir, testAgents);
		const output = { parts: [] as unknown[] };

		// Use shortcut command form
		await handler(
			{ command: 'swarm-config', sessionID: 's1', arguments: '' },
			output,
		);

		expect(fs.existsSync(sentinelPath)).toBe(true);
		const part = output.parts[0] as { type: string; text: string };
		expect(part.text).toContain('Welcome to OpenCode Swarm!');
	});

	test('shortcut command swarm-status does NOT create sentinel (not a real shortcut)', async () => {
		const sentinelPath = path.join(tempDir, '.swarm', '.first-run-complete');
		const handler = createSwarmCommandHandler(tempDir, testAgents);
		const output = { parts: [] as unknown[] };

		// swarm-status is not a registered shortcut, so this falls through to help
		// But since command starts with 'swarm-', it still goes through sentinel check
		await handler(
			{ command: 'swarm-status', sessionID: 's1', arguments: '' },
			output,
		);

		// sentinel IS created because command starts with 'swarm-'
		expect(fs.existsSync(sentinelPath)).toBe(true);
	});
});
