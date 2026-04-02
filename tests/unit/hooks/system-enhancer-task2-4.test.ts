import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PluginConfig } from '../../../src/config';
import { createSystemEnhancerHook } from '../../../src/hooks/system-enhancer';
import { resetSwarmState, swarmState } from '../../../src/state';

describe('Task 2.4: System Enhancer Coder Retrospective Injection', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'swarm-retro-24-test-'));
		resetSwarmState();
	});

	afterEach(async () => {
		try {
			await rm(tempDir, { recursive: true, force: true });
		} catch {}
	});

	async function createSwarmFiles(currentPhase = 2): Promise<void> {
		const swarmDir = join(tempDir, '.swarm');
		await mkdir(swarmDir, { recursive: true });
		await writeFile(join(swarmDir, 'plan.md'), '# Plan\n');
		await writeFile(join(swarmDir, 'context.md'), '# Context\n');

		// Create plan.json with required fields
		const plan = {
			schema_version: '1.0.0',
			title: 'Test Plan',
			swarm: 'test-swarm',
			current_phase: currentPhase,
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'complete',
					tasks: [],
				},
				{
					id: 2,
					name: 'Phase 2',
					status: 'in_progress',
					tasks: [],
				},
			],
		};
		await writeFile(join(swarmDir, 'plan.json'), JSON.stringify(plan, null, 2));
	}

	async function createRetroBundle(
		phaseNumber: number,
		verdict: 'pass' | 'fail' | 'info',
		lessons: string[] = [],
		rejections: string[] = [],
		summary: string = 'Phase completed.',
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

		const bundle = {
			schema_version: '1.0.0',
			task_id: `retro-${phaseNumber}`,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			entries: [retroEntry],
		};

		const bundlePath = join(taskDir, 'evidence.json');
		await writeFile(bundlePath, JSON.stringify(bundle, null, 2));
		return bundlePath;
	}

	async function invokeHook(
		config: PluginConfig,
		sessionId: string = 'test-session',
		activeAgent: string | null = null,
	): Promise<string[]> {
		const hooks = createSystemEnhancerHook(config, tempDir);
		const transform = hooks['experimental.chat.system.transform'] as (
			input: { sessionID?: string },
			output: { system: string[] },
		) => Promise<void>;

		// Set active agent if provided
		if (activeAgent) {
			swarmState.activeAgent.set(sessionId, activeAgent);
		}

		const input = { sessionID: sessionId };
		const output = { system: [] };
		await transform(input, output);
		return output.system;
	}

	const defaultConfig: PluginConfig = {
		max_iterations: 5,
		qa_retry_limit: 3,
		inject_phase_reminders: true,
	};

	describe('VERIFICATION TESTS', () => {
		it('Test 1: Phase 2, agent=mega_coder, retro-1 exists with lessons → system message contains "[SWARM RETROSPECTIVE] From Phase 1:"', async () => {
			// Setup: create swarm files with current phase 2
			await createSwarmFiles(2);

			// Create retro-1 bundle with lessons
			await createRetroBundle(
				1,
				'pass',
				['lesson A', 'lesson B'],
				['reason X'],
				'Phase 1 completed successfully.',
			);

			// Invoke the hook with mega_coder active
			const systemOutput = await invokeHook(
				defaultConfig,
				'test-session',
				'mega_coder',
			);

			// Assert SWARM RETROSPECTIVE injection is present
			const coderRetro = systemOutput.find((s) =>
				s.includes('[SWARM RETROSPECTIVE] From Phase 1:'),
			);
			expect(coderRetro).toBeDefined();
			expect(coderRetro).toContain('Phase 1 completed successfully.');
			expect(coderRetro).toContain('lesson A');
			expect(coderRetro).toContain('lesson B');

			// Should NOT contain the full "## Previous Phase Retrospective" block
			const fullRetro = systemOutput.find((s) =>
				s.includes('## Previous Phase Retrospective'),
			);
			expect(fullRetro).toBeUndefined();
		});

		it('Test 2: Phase 1, agent=mega_coder, retro-0 does not exist → no SWARM RETROSPECTIVE injection', async () => {
			// Setup: create swarm files with current phase 1
			const swarmDir = join(tempDir, '.swarm');
			await mkdir(swarmDir, { recursive: true });
			await writeFile(join(swarmDir, 'plan.md'), '# Plan\n');
			await writeFile(join(swarmDir, 'context.md'), '# Context\n');

			const plan = {
				schema_version: '1.0.0',
				title: 'Test Plan',
				swarm: 'test-swarm',
				current_phase: 1,
				phases: [
					{
						id: 1,
						name: 'Phase 1',
						status: 'in_progress',
						tasks: [],
					},
				],
			};
			await writeFile(
				join(swarmDir, 'plan.json'),
				JSON.stringify(plan, null, 2),
			);

			// Invoke the hook with mega_coder active (no retro-0 exists)
			const systemOutput = await invokeHook(
				defaultConfig,
				'test-session',
				'mega_coder',
			);

			// Assert NO SWARM RETROSPECTIVE injection
			const anyRetro = systemOutput.find((s) =>
				s.includes('[SWARM RETROSPECTIVE]'),
			);
			expect(anyRetro).toBeUndefined();
		});

		it('Test 3: Phase 2, agent=mega_coder, retro-1 verdict=fail → no SWARM RETROSPECTIVE injection', async () => {
			// Setup: create swarm files with current phase 2
			await createSwarmFiles(2);

			// Create retro-1 bundle with FAIL verdict
			await createRetroBundle(
				1,
				'fail',
				['lesson about failure'],
				['reason for failure'],
				'Phase 1 failed.',
			);

			// Invoke the hook with mega_coder active
			const systemOutput = await invokeHook(
				defaultConfig,
				'test-session',
				'mega_coder',
			);

			// Assert NO SWARM RETROSPECTIVE injection (fail verdict should be skipped)
			const coderRetro = systemOutput.find((s) =>
				s.includes('[SWARM RETROSPECTIVE]'),
			);
			expect(coderRetro).toBeUndefined();
		});

		it('Test 4: Phase 2, agent=mega_architect → system message contains "## Previous Phase Retrospective" (full block), NOT "[SWARM RETROSPECTIVE]"', async () => {
			// Setup: create swarm files with current phase 2
			await createSwarmFiles(2);

			// Create retro-1 bundle
			await createRetroBundle(
				1,
				'pass',
				['lesson A', 'lesson B'],
				['reason X'],
				'Phase 1 completed successfully.',
			);

			// Invoke the hook with mega_architect active
			const systemOutput = await invokeHook(
				defaultConfig,
				'test-session',
				'mega_architect',
			);

			// Assert full "## Previous Phase Retrospective" block is present
			const fullRetro = systemOutput.find((s) =>
				s.includes('## Previous Phase Retrospective'),
			);
			expect(fullRetro).toBeDefined();
			expect(fullRetro).toContain('Outcome:');
			expect(fullRetro).toContain('Rejection reasons:');
			expect(fullRetro).toContain('Lessons learned:');

			// Should NOT contain the condensed coder format
			const coderRetro = systemOutput.find((s) =>
				s.includes('[SWARM RETROSPECTIVE]'),
			);
			expect(coderRetro).toBeUndefined();
		});

		it('Test 5: Phase 2, agent=mega_coder, long lessons_learned → coder injection is capped at ≤ 400 chars', async () => {
			// Setup: create swarm files with current phase 2
			await createSwarmFiles(2);

			// Create retro-1 bundle with very long lessons
			const longLesson =
				'This is a very long lesson that adds lots of characters. '.repeat(20);
			await createRetroBundle(
				1,
				'pass',
				[
					longLesson,
					'Another long lesson that extends beyond limit. '.repeat(20),
				],
				[],
				'Phase 1 completed successfully.',
			);

			// Invoke the hook with mega_coder active
			const systemOutput = await invokeHook(
				defaultConfig,
				'test-session',
				'mega_coder',
			);

			// Assert coder retro is present and capped at 400 chars
			const coderRetro = systemOutput.find((s) =>
				s.includes('[SWARM RETROSPECTIVE] From Phase 1:'),
			);
			expect(coderRetro).toBeDefined();
			expect(coderRetro!.length).toBeLessThanOrEqual(400);
			// Should be truncated with "..."
			expect(coderRetro!.endsWith('...')).toBe(true);
		});

		it('Test 6: Phase 2, agent=mega_coder, retro-1 has summary → header includes summary text', async () => {
			// Setup: create swarm files with current phase 2
			await createSwarmFiles(2);

			// Create retro-1 bundle with summary
			await createRetroBundle(
				1,
				'pass',
				['lesson A'],
				[],
				'Phase 1 completed with great success and important insights.',
			);

			// Invoke the hook with mega_coder active
			const systemOutput = await invokeHook(
				defaultConfig,
				'test-session',
				'mega_coder',
			);

			// Assert summary appears in header
			const coderRetro = systemOutput.find((s) =>
				s.includes('[SWARM RETROSPECTIVE] From Phase 1:'),
			);
			expect(coderRetro).toBeDefined();
			expect(coderRetro).toContain(
				'Phase 1 completed with great success and important insights.',
			);
			expect(coderRetro).toContain('lesson A');
		});

		it('Test 7: Phase 2, agent=mega_coder, retro-1 has multiple lessons → all lessons appear (or are truncated within cap)', async () => {
			// Setup: create swarm files with current phase 2
			await createSwarmFiles(2);

			// Create retro-1 bundle with multiple lessons
			await createRetroBundle(
				1,
				'pass',
				['lesson one', 'lesson two', 'lesson three', 'lesson four'],
				[],
				'Phase 1 completed.',
			);

			// Invoke the hook with mega_coder active
			const systemOutput = await invokeHook(
				defaultConfig,
				'test-session',
				'mega_coder',
			);

			// Assert all lessons appear
			const coderRetro = systemOutput.find((s) =>
				s.includes('[SWARM RETROSPECTIVE] From Phase 1:'),
			);
			expect(coderRetro).toBeDefined();
			expect(coderRetro).toContain('lesson one');
			expect(coderRetro).toContain('lesson two');
			expect(coderRetro).toContain('lesson three');
			expect(coderRetro).toContain('lesson four');
		});
	});

	describe('ADVERSARIAL TESTS', () => {
		it('Test 8: Phase 2, agent=mega_coder, retro-1 bundle has no entries → graceful null, no crash', async () => {
			// Setup: create swarm files with current phase 2
			await createSwarmFiles(2);

			// Create retro-1 bundle with NO entries (empty array)
			const taskDir = join(tempDir, '.swarm', 'evidence', 'retro-1');
			await mkdir(taskDir, { recursive: true });

			const bundle = {
				schema_version: '1.0.0',
				task_id: 'retro-1',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				entries: [], // Empty entries array
			};
			const bundlePath = join(taskDir, 'evidence.json');
			await writeFile(bundlePath, JSON.stringify(bundle, null, 2));

			// Invoke the hook with mega_coder active - should NOT crash
			const systemOutput = await invokeHook(
				defaultConfig,
				'test-session',
				'mega_coder',
			);

			// Assert NO SWARM RETROSPECTIVE injection (graceful null)
			const coderRetro = systemOutput.find((s) =>
				s.includes('[SWARM RETROSPECTIVE]'),
			);
			expect(coderRetro).toBeUndefined();
		});

		it('Test 9: Phase 2, agent=mega_coder, retro-1 summary is 500+ chars → injection still capped at 400', async () => {
			// Setup: create swarm files with current phase 2
			await createSwarmFiles(2);

			// Create retro-1 bundle with very long summary
			const longSummary =
				'This is an extremely long summary that exceeds the character limit. '.repeat(
					15,
				);
			await createRetroBundle(1, 'pass', ['lesson A'], [], longSummary);

			// Invoke the hook with mega_coder active
			const systemOutput = await invokeHook(
				defaultConfig,
				'test-session',
				'mega_coder',
			);

			// Assert injection is capped at 400 chars
			const coderRetro = systemOutput.find((s) =>
				s.includes('[SWARM RETROSPECTIVE] From Phase 1:'),
			);
			expect(coderRetro).toBeDefined();
			expect(coderRetro!.length).toBeLessThanOrEqual(400);
			expect(coderRetro!.endsWith('...')).toBe(true);
		});

		it('Test 10: Phase 2, agent=mega_coder, lessons_learned is empty array → only header line, no crash', async () => {
			// Setup: create swarm files with current phase 2
			await createSwarmFiles(2);

			// Create retro-1 bundle with empty lessons_learned array
			await createRetroBundle(
				1,
				'pass',
				[], // Empty lessons
				[],
				'Phase 1 completed.',
			);

			// Invoke the hook with mega_coder active - should NOT crash
			const systemOutput = await invokeHook(
				defaultConfig,
				'test-session',
				'mega_coder',
			);

			// Assert injection contains header but no lessons
			const coderRetro = systemOutput.find((s) =>
				s.includes('[SWARM RETROSPECTIVE] From Phase 1:'),
			);
			expect(coderRetro).toBeDefined();
			expect(coderRetro).toContain('Phase 1 completed.');
			// Header should be present
			expect(coderRetro!.length).toBeGreaterThan(0);
		});
	});
});
