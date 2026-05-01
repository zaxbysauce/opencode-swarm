import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AgentDefinition } from '../../../src/agents';
import { createSwarmCommandHandler } from '../../../src/commands/index';

// ---------------------------------------------------------------------------
// createSwarmCommandHandler() — deprecation warning in output
// ---------------------------------------------------------------------------
describe('createSwarmCommandHandler() — deprecation warning in output', () => {
	let tempDir: string;
	let handler: ReturnType<typeof createSwarmCommandHandler>;
	const testAgents: Record<string, AgentDefinition> = {
		architect: {
			name: 'architect',
			config: { model: 'gpt-4', temperature: 0.1 },
		},
	};

	beforeEach(async () => {
		// Create a unique temp directory for each test to avoid first-run sentinel conflicts
		tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'swarm-test-'));
		// Pre-create .swarm directory and mark first-run as complete to avoid welcome message
		const swarmDir = path.join(tempDir, '.swarm');
		await fs.promises.mkdir(swarmDir, { recursive: true });
		await fs.promises.writeFile(
			path.join(swarmDir, '.first-run-complete'),
			'first-run-complete\n',
		);
		handler = createSwarmCommandHandler(tempDir, testAgents);
	});

	afterEach(async () => {
		// Clean up temp directory
		try {
			await fs.promises.rm(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	describe('deprecated alias shows warning in output', () => {
		test('"diagnosis" shows deprecation warning in output', async () => {
			const output = { parts: [] as unknown[] };
			await handler(
				{ command: 'swarm', sessionID: 's1', arguments: 'diagnosis' },
				output,
			);
			expect(output.parts).toHaveLength(1);
			const part = output.parts[0] as any;
			expect(part.type).toBe('text');
			expect(part.text).toContain('⚠️');
			expect(part.text).toContain('/swarm diagnosis');
			expect(part.text).toContain('/swarm diagnose');
			expect(part.text).toContain('deprecated');
		});

		test('"config-doctor" shows deprecation warning in output', async () => {
			const output = { parts: [] as unknown[] };
			await handler(
				{ command: 'swarm', sessionID: 's1', arguments: 'config-doctor' },
				output,
			);
			expect(output.parts).toHaveLength(1);
			const part = output.parts[0] as any;
			expect(part.text).toContain('⚠️ "/swarm config-doctor" is deprecated');
			expect(part.text).toContain('/swarm config doctor');
		});

		test('"evidence-summary" shows deprecation warning in output', async () => {
			const output = { parts: [] as unknown[] };
			await handler(
				{ command: 'swarm', sessionID: 's1', arguments: 'evidence-summary' },
				output,
			);
			expect(output.parts).toHaveLength(1);
			const part = output.parts[0] as any;
			expect(part.text).toContain('⚠️ "/swarm evidence-summary" is deprecated');
			expect(part.text).toContain('/swarm evidence summary');
		});
	});

	describe('warning format is correct in handler output', () => {
		test('warning is prepended to the command output', async () => {
			const output = { parts: [] as unknown[] };
			await handler(
				{ command: 'swarm', sessionID: 's1', arguments: 'diagnosis' },
				output,
			);
			const part = output.parts[0] as any;
			// Warning should come first, followed by a newline and the actual output
			expect(part.text.startsWith('⚠️')).toBe(true);
		});

		test('warning message appears in output with correct format', async () => {
			const output = { parts: [] as unknown[] };
			await handler(
				{ command: 'swarm', sessionID: 's1', arguments: 'diagnosis' },
				output,
			);
			const part = output.parts[0] as any;
			// The warning is prepended, so it starts the output
			expect(
				part.text.startsWith(
					'⚠️ "/swarm diagnosis" is deprecated. Use "/swarm diagnose" instead.',
				),
			).toBe(true);
			// Followed by newline, newline, then actual output
			expect(part.text).toContain('\n\n## Swarm Health Check');
		});
	});

	describe('non-deprecated commands show no warning', () => {
		test('"status" has no deprecation warning', async () => {
			const output = { parts: [] as unknown[] };
			await handler(
				{ command: 'swarm', sessionID: 's1', arguments: 'status' },
				output,
			);
			expect(output.parts).toHaveLength(1);
			const part = output.parts[0] as any;
			// No deprecated warning pattern
			expect(part.text).not.toContain('is deprecated. Use');
			expect(part.text).not.toContain('/swarm status" is deprecated');
		});

		test('"diagnose" (canonical) has no deprecation warning', async () => {
			const output = { parts: [] as unknown[] };
			await handler(
				{ command: 'swarm', sessionID: 's1', arguments: 'diagnose' },
				output,
			);
			expect(output.parts).toHaveLength(1);
			const part = output.parts[0] as any;
			// Canonical commands don't have the deprecation warning pattern
			// Note: diagnose output may contain "⚠️" for check results, but not the deprecation warning
			expect(part.text).not.toContain('is deprecated. Use');
			expect(part.text).not.toContain('/swarm diagnose" is deprecated');
		});

		test('"agents" has no deprecation warning', async () => {
			const output = { parts: [] as unknown[] };
			await handler(
				{ command: 'swarm', sessionID: 's1', arguments: 'agents' },
				output,
			);
			expect(output.parts).toHaveLength(1);
			const part = output.parts[0] as any;
			expect(part.text).not.toContain('is deprecated. Use');
			expect(part.text).not.toContain('/swarm agents" is deprecated');
		});
	});

	describe('command execution continues despite warning', () => {
		test('deprecated alias still executes and returns command output', async () => {
			const output = { parts: [] as unknown[] };
			await handler(
				{ command: 'swarm', sessionID: 's1', arguments: 'diagnosis' },
				output,
			);
			expect(output.parts).toHaveLength(1);
			const part = output.parts[0] as any;
			// Should contain both the warning AND the actual diagnose output
			expect(part.text).toContain('diagnose');
			expect(part.text.length).toBeGreaterThan(
				'⚠️ "/swarm diagnosis" is deprecated. Use "/swarm diagnose" instead.\n\n'
					.length,
			);
		});

		test('deprecated alias with extra args still executes', async () => {
			const output = { parts: [] as unknown[] };
			await handler(
				{ command: 'swarm', sessionID: 's1', arguments: 'diagnosis --verbose' },
				output,
			);
			expect(output.parts).toHaveLength(1);
			const part = output.parts[0] as any;
			expect(part.text).toContain('⚠️');
		});
	});

	describe('shortcut command handling with deprecated alias', () => {
		test('shortcut command "swarm-config-doctor" shows deprecation warning', async () => {
			const output = { parts: [] as unknown[] };
			await handler(
				{ command: 'swarm-config-doctor', sessionID: 's1', arguments: '' },
				output,
			);
			expect(output.parts).toHaveLength(1);
			const part = output.parts[0] as any;
			expect(part.text).toContain('⚠️');
			expect(part.text).toContain('config-doctor');
			expect(part.text).toContain('config doctor');
		});
	});
});
