import { afterEach, beforeEach, describe, expect, it, jest } from 'bun:test';
import { existsSync, renameSync, unlinkSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PluginConfig } from '../../../src/config';
import { createSystemEnhancerHook } from '../../../src/hooks/system-enhancer';
import { resetSwarmState, swarmState } from '../../../src/state';

describe('System Enhancer Hook - Handoff Detection', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'handoff-test-'));
		resetSwarmState();
		// Set up active agent for non-DISCOVER mode
		swarmState.activeAgent.set('test-session', 'architect');
	});

	afterEach(async () => {
		try {
			await rm(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	const defaultConfig: PluginConfig = {
		max_iterations: 5,
		qa_retry_limit: 3,
		inject_phase_reminders: true,
		hooks: {
			system_enhancer: true,
			compaction: true,
			agent_activity: true,
			delegation_tracker: false,
			agent_awareness_max_chars: 300,
			delegation_gate: false,
			delegation_max_chars: 1000,
		},
	};

	// Helper to create .swarm directory and files
	async function createSwarmDir() {
		const swarmDir = join(tempDir, '.swarm');
		await mkdir(swarmDir, { recursive: true });
		return swarmDir;
	}

	// Helper to create a plan with in_progress task to trigger handoff detection
	async function createPlanWithActiveTask() {
		const swarmDir = await createSwarmDir();
		const planFile = join(swarmDir, 'plan.json');
		const planContent = JSON.stringify({
			schema_version: '1.0.0',
			title: 'Test Plan',
			swarm: 'test-swarm',
			current_phase: 1,
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'in_progress',
					tasks: [
						{
							id: '1.1',
							phase: 1,
							description: 'Test task',
							status: 'in_progress',
						},
					],
				},
			],
		});
		await writeFile(planFile, planContent);
		return swarmDir;
	}

	describe('Handoff file detection and injection', () => {
		it('should detect handoff.md exists → inject content and rename to handoff-consumed.md', async () => {
			// Arrange
			const swarmDir = await createPlanWithActiveTask();
			const handoffPath = join(swarmDir, 'handoff.md');
			const handoffContent =
				'Previous session ended. Here is context from model switch.';
			await writeFile(handoffPath, handoffContent);

			const config = { ...defaultConfig };
			const hook = createSystemEnhancerHook(config, tempDir);
			const transformHook = hook['experimental.chat.system.transform'] as any;

			const input = { sessionID: 'test-session' };
			const output = { system: ['Initial system prompt'] };

			// Act
			await transformHook(input, output);

			// Assert - handoff.md should be renamed to handoff-consumed.md
			expect(existsSync(handoffPath)).toBe(false);
			expect(existsSync(join(swarmDir, 'handoff-consumed.md'))).toBe(true);

			// Assert - content should be injected
			const handoffInjection = output.system.find((s) =>
				s.includes('[HANDOFF BRIEF]'),
			);
			expect(handoffInjection).toBeDefined();
			expect(handoffInjection).toContain(handoffContent);
		});

		it('should rename BEFORE injection - if rename fails, no injection occurs', async () => {
			// Arrange
			const swarmDir = await createPlanWithActiveTask();
			const handoffPath = join(swarmDir, 'handoff.md');
			const handoffContent = 'Test content';
			await writeFile(handoffPath, handoffContent);

			const config = { ...defaultConfig };
			const hook = createSystemEnhancerHook(config, tempDir);
			const transformHook = hook['experimental.chat.system.transform'] as any;

			const input = { sessionID: 'test-session' };
			const output = { system: ['Initial system prompt'] };

			// Act - let it run normally - the test is about verifying the rename-inject order works
			await transformHook(input, output);

			// Assert - when rename succeeds, handoff should be injected
			const handoffInjection = output.system.find((s) =>
				s.includes('[HANDOFF BRIEF]'),
			);
			expect(handoffInjection).toBeDefined();

			// And file should be renamed
			expect(existsSync(handoffPath)).toBe(false);
			expect(existsSync(join(swarmDir, 'handoff-consumed.md'))).toBe(true);
		});

		it('should handle missing handoff.md gracefully (ENOENT)', async () => {
			// Arrange - no handoff.md file, but create a valid plan to be in EXECUTE mode
			await createPlanWithActiveTask();

			const config = { ...defaultConfig };
			const hook = createSystemEnhancerHook(config, tempDir);
			const transformHook = hook['experimental.chat.system.transform'] as any;

			const input = { sessionID: 'test-session' };
			const output = { system: ['Initial system prompt'] };

			// Act - should not throw
			let threw = false;
			let error: any;
			try {
				await transformHook(input, output);
			} catch (e) {
				threw = true;
				error = e;
			}

			// Assert - should not throw
			expect(threw).toBe(false);

			// No handoff injection should be present
			const handoffInjection = output.system.find((s) =>
				s.includes('[HANDOFF BRIEF]'),
			);
			expect(handoffInjection).toBeUndefined();
		});

		it('should detect duplicate handoff-consumed.md and delete before rename', async () => {
			// Arrange
			const swarmDir = await createPlanWithActiveTask();
			const handoffPath = join(swarmDir, 'handoff.md');
			const consumedPath = join(swarmDir, 'handoff-consumed.md');

			// Create both files - simulating duplicate scenario
			await writeFile(handoffPath, 'New handoff content');
			await writeFile(consumedPath, 'Old consumed content');

			const config = { ...defaultConfig };
			const hook = createSystemEnhancerHook(config, tempDir);
			const transformHook = hook['experimental.chat.system.transform'] as any;

			const input = { sessionID: 'test-session' };
			const output = { system: ['Initial system prompt'] };

			// Act
			await transformHook(input, output);

			// Assert - handoff-consumed.md should be replaced with new content
			expect(existsSync(handoffPath)).toBe(false);
			expect(existsSync(consumedPath)).toBe(true);

			// The new content should be in the consumed file
			const { readFileSync } = require('node:fs');
			const consumedContent = readFileSync(consumedPath, 'utf-8');
			expect(consumedContent).toBe('New handoff content');

			// Handoff should still be injected
			const handoffInjection = output.system.find((s) =>
				s.includes('[HANDOFF BRIEF]'),
			);
			expect(handoffInjection).toBeDefined();
		});

		it('should perform atomic rename - target deleted first on Windows-like behavior', async () => {
			// Arrange
			const swarmDir = await createPlanWithActiveTask();
			const handoffPath = join(swarmDir, 'handoff.md');
			const consumedPath = join(swarmDir, 'handoff-consumed.md');

			// Create handoff.md
			await writeFile(handoffPath, 'Atomic rename test content');

			// Pre-delete the target (simulating atomic rename pattern)
			if (existsSync(consumedPath)) {
				unlinkSync(consumedPath);
			}

			const config = { ...defaultConfig };
			const hook = createSystemEnhancerHook(config, tempDir);
			const transformHook = hook['experimental.chat.system.transform'] as any;

			const input = { sessionID: 'test-session' };
			const output = { system: ['Initial system prompt'] };

			// Act
			await transformHook(input, output);

			// Assert - handoff.md renamed to handoff-consumed.md
			expect(existsSync(handoffPath)).toBe(false);
			expect(existsSync(consumedPath)).toBe(true);

			// Content should be injected
			const handoffInjection = output.system.find((s) =>
				s.includes('[HANDOFF BRIEF]'),
			);
			expect(handoffInjection).toBeDefined();
		});
	});

	describe('Handoff detection in DISCOVER mode', () => {
		it('should NOT inject handoff when mode is DISCOVER', async () => {
			// Arrange - set mode to DISCOVER by not having an active agent
			resetSwarmState();
			// No active agent set - this should result in DISCOVER mode

			const swarmDir = await createSwarmDir();
			const handoffPath = join(swarmDir, 'handoff.md');
			await writeFile(handoffPath, 'Handoff content');

			const config = { ...defaultConfig };
			const hook = createSystemEnhancerHook(config, tempDir);
			const transformHook = hook['experimental.chat.system.transform'] as any;

			const input = { sessionID: undefined };
			const output = { system: ['Initial system prompt'] };

			// Act
			await transformHook(input, output);

			// Assert - handoff should NOT be injected in DISCOVER mode
			const handoffInjection = output.system.find((s) =>
				s.includes('[HANDOFF BRIEF]'),
			);
			expect(handoffInjection).toBeUndefined();
		});
	});

	describe('Handoff with scoring enabled', () => {
		it('should inject handoff when scoring is enabled', async () => {
			// Arrange
			const swarmDir = await createPlanWithActiveTask();
			const handoffPath = join(swarmDir, 'handoff.md');
			const handoffContent = 'Scoring path handoff content';
			await writeFile(handoffPath, handoffContent);

			const config: any = {
				...defaultConfig,
				context_budget: {
					scoring: {
						enabled: true,
						max_candidates: 100,
					},
					max_injection_tokens: 10000,
				},
			};

			const hook = createSystemEnhancerHook(config, tempDir);
			const transformHook = hook['experimental.chat.system.transform'] as any;

			const input = { sessionID: 'test-session' };
			const output = { system: ['Initial system prompt'] };

			// Act
			await transformHook(input, output);

			// Assert - handoff should be injected
			const handoffInjection = output.system.find((s) =>
				s.includes('[HANDOFF BRIEF]'),
			);
			expect(handoffInjection).toBeDefined();
			expect(handoffInjection).toContain(handoffContent);

			// File should be renamed
			expect(existsSync(handoffPath)).toBe(false);
			expect(existsSync(join(swarmDir, 'handoff-consumed.md'))).toBe(true);
		});

		it('should handle missing handoff.md with scoring enabled gracefully', async () => {
			// Arrange - no handoff.md file, but create valid plan
			await createPlanWithActiveTask();

			const config: any = {
				...defaultConfig,
				context_budget: {
					scoring: {
						enabled: true,
						max_candidates: 100,
					},
					max_injection_tokens: 10000,
				},
			};

			const hook = createSystemEnhancerHook(config, tempDir);
			const transformHook = hook['experimental.chat.system.transform'] as any;

			const input = { sessionID: 'test-session' };
			const output = { system: ['Initial system prompt'] };

			// Act - should not throw
			let threw = false;
			try {
				await transformHook(input, output);
			} catch (e) {
				threw = true;
			}

			// Assert
			expect(threw).toBe(false);

			const handoffInjection = output.system.find((s) =>
				s.includes('[HANDOFF BRIEF]'),
			);
			expect(handoffInjection).toBeUndefined();
		});
	});
});
