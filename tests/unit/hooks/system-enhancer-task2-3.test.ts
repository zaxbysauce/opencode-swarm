import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PluginConfig } from '../../../src/config';
import { createSystemEnhancerHook } from '../../../src/hooks/system-enhancer';
import { resetSwarmState } from '../../../src/state';

describe('Task 2.3: System Enhancer Tier 2 Logic (buildRetroInjection)', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'swarm-retro-23-test-'));
		resetSwarmState();
	});

	afterEach(async () => {
		try {
			await rm(tempDir, { recursive: true, force: true });
		} catch {}
	});

	async function createSwarmFiles(currentPhase = 1): Promise<void> {
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
					status: currentPhase === 1 ? 'in_progress' : 'complete',
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
		timestamp?: string,
	): Promise<string> {
		const taskDir = join(tempDir, '.swarm', 'evidence', `retro-${phaseNumber}`);
		await mkdir(taskDir, { recursive: true });

		const retroEntry = {
			type: 'retrospective',
			task_id: `retro-${phaseNumber}`,
			timestamp: timestamp || new Date().toISOString(),
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
			created_at: timestamp || new Date().toISOString(),
			updated_at: new Date().toISOString(),
			entries: [retroEntry],
		};

		const bundlePath = join(taskDir, 'evidence.json');
		await writeFile(bundlePath, JSON.stringify(bundle, null, 2));
		return bundlePath;
	}

	async function invokeHook(config: PluginConfig): Promise<string[]> {
		const hooks = createSystemEnhancerHook(config, tempDir);
		const transform = hooks['experimental.chat.system.transform'] as (
			input: { sessionID?: string },
			output: { system: string[] },
		) => Promise<void>;
		const input = { sessionID: 'test-session' };
		const output = { system: [] };
		await transform(input, output);
		return output.system;
	}

	const defaultConfig: PluginConfig = {
		max_iterations: 5,
		qa_retry_limit: 3,
		inject_phase_reminders: true,
	};

	describe('Tier 2: Phase 1 Historical Lessons', () => {
		it('Test 1: Phase 1 with recent retros (< 30 days old) → injects "## Historical Lessons" block', async () => {
			// Setup: create swarm files with current phase 1
			await createSwarmFiles(1);

			// Create recent retro bundles (1 day old)
			const recentDate = new Date(
				Date.now() - 1 * 24 * 60 * 60 * 1000,
			).toISOString();
			await createRetroBundle(
				8,
				'pass',
				['Lesson from phase 8'],
				[],
				'Phase 8 completed.',
				recentDate,
			);
			await createRetroBundle(
				7,
				'pass',
				['Lesson from phase 7'],
				[],
				'Phase 7 completed.',
				recentDate,
			);

			// Invoke the hook
			const systemOutput = await invokeHook(defaultConfig);

			// Assert historical lessons block is present
			const historicalLessons = systemOutput.find((s) =>
				s.includes('## Historical Lessons'),
			);
			expect(historicalLessons).toBeDefined();
			expect(historicalLessons).toContain(
				'Most recent retrospectives in this workspace:',
			);
			expect(historicalLessons).toContain('Phase 8');
			expect(historicalLessons).toContain('Phase 7');
			expect(historicalLessons).toContain('Key lesson:');
		});

		it('Test 2: Phase 1 with ALL retros older than 30 days → returns null (no injection)', async () => {
			// Setup: create swarm files with current phase 1
			await createSwarmFiles(1);

			// Create old retro bundles (45 days old)
			const oldDate = new Date(
				Date.now() - 45 * 24 * 60 * 60 * 1000,
			).toISOString();
			await createRetroBundle(
				8,
				'pass',
				['Old lesson'],
				[],
				'Phase 8 completed.',
				oldDate,
			);
			await createRetroBundle(
				7,
				'pass',
				['Older lesson'],
				[],
				'Phase 7 completed.',
				oldDate,
			);

			// Invoke the hook
			const systemOutput = await invokeHook(defaultConfig);

			// Assert no historical lessons block
			const historicalLessons = systemOutput.find((s) =>
				s.includes('## Historical Lessons'),
			);
			expect(historicalLessons).toBeUndefined();

			// Also ensure no retrospective injection at all
			const anyRetro = systemOutput.find(
				(s) => s.includes('Retrospective') || s.includes('retrospective'),
			);
			expect(anyRetro).toBeUndefined();
		});

		it('Test 3: Phase 1 with no retro bundles at all → returns null', async () => {
			// Setup: create swarm files with current phase 1 (no evidence)
			await createSwarmFiles(1);
			await mkdir(join(tempDir, '.swarm', 'evidence'), { recursive: true });

			// Invoke the hook
			const systemOutput = await invokeHook(defaultConfig);

			// Assert no historical lessons block
			const historicalLessons = systemOutput.find((s) =>
				s.includes('## Historical Lessons'),
			);
			expect(historicalLessons).toBeUndefined();
		});

		it('Test 4: Phase 1 with 5 retros in evidence → only top-3 most recent appear in output', async () => {
			// Setup: create swarm files with current phase 1
			await createSwarmFiles(1);

			// Create 5 retro bundles with different timestamps
			const baseDate = Date.now();
			for (let i = 1; i <= 5; i++) {
				const daysAgo = i * 2; // 2, 4, 6, 8, 10 days ago
				const timestamp = new Date(
					baseDate - daysAgo * 24 * 60 * 60 * 1000,
				).toISOString();
				await createRetroBundle(
					10 + i,
					'pass',
					[`Lesson from phase ${10 + i}`],
					[],
					`Phase ${10 + i} completed.`,
					timestamp,
				);
			}

			// Invoke the hook
			const systemOutput = await invokeHook(defaultConfig);

			// Assert historical lessons block is present
			const historicalLessons = systemOutput.find((s) =>
				s.includes('## Historical Lessons'),
			);
			expect(historicalLessons).toBeDefined();

			// Only top 3 should appear (most recent = smallest days ago)
			expect(historicalLessons).toContain('Phase 11'); // 2 days ago
			expect(historicalLessons).toContain('Phase 12'); // 4 days ago
			expect(historicalLessons).toContain('Phase 13'); // 6 days ago

			// These should NOT appear (older)
			expect(historicalLessons).not.toContain('Phase 14');
			expect(historicalLessons).not.toContain('Phase 15');
		});

		it('Test 5: Phase 1 with retro entries — date shown correctly from entry.timestamp', async () => {
			// Setup: create swarm files with current phase 1
			await createSwarmFiles(1);

			// Create retro bundle with specific timestamp
			const recentDate = new Date(
				Date.now() - 1 * 24 * 60 * 60 * 1000,
			).toISOString();
			const taskDir = join(tempDir, '.swarm', 'evidence', 'retro-8');
			await mkdir(taskDir, { recursive: true });

			// Create bundle WITH timestamp in entry
			const bundle = {
				schema_version: '1.0.0',
				task_id: 'retro-8',
				created_at: new Date(
					Date.now() - 2 * 24 * 60 * 60 * 1000,
				).toISOString(), // Different from entry timestamp
				updated_at: new Date().toISOString(),
				entries: [
					{
						type: 'retrospective',
						task_id: 'retro-8',
						timestamp: recentDate, // Use this timestamp
						agent: 'architect',
						verdict: 'pass',
						summary: 'Phase 8 completed.',
						phase_number: 8,
						total_tool_calls: 42,
						coder_revisions: 2,
						reviewer_rejections: 0,
						test_failures: 0,
						security_findings: 0,
						integration_issues: 0,
						task_count: 5,
						task_complexity: 'moderate',
						top_rejection_reasons: [],
						lessons_learned: ['Lesson from phase 8'],
					},
				],
			};

			await writeFile(
				join(taskDir, 'evidence.json'),
				JSON.stringify(bundle, null, 2),
			);

			// Invoke the hook
			const systemOutput = await invokeHook(defaultConfig);

			// Assert historical lessons block is present
			const historicalLessons = systemOutput.find((s) =>
				s.includes('## Historical Lessons'),
			);
			expect(historicalLessons).toBeDefined();

			// Should show the date from entry.timestamp (not bundle.created_at)
			const expectedDate = recentDate.split('T')[0];
			expect(historicalLessons).toContain(expectedDate);
		});

		it('Test 6: Phase 1 with verdict: "fail" retros → skipped (not included)', async () => {
			// Setup: create swarm files with current phase 1
			await createSwarmFiles(1);

			// Create mix of pass and fail retros
			const recentDate = new Date(
				Date.now() - 1 * 24 * 60 * 60 * 1000,
			).toISOString();
			await createRetroBundle(
				8,
				'pass',
				['Pass lesson'],
				[],
				'Phase 8 completed.',
				recentDate,
			);
			await createRetroBundle(
				7,
				'fail',
				['Fail lesson'],
				['Failure reason'],
				'Phase 7 failed.',
				recentDate,
			);
			await createRetroBundle(
				6,
				'pass',
				['Another pass lesson'],
				[],
				'Phase 6 completed.',
				recentDate,
			);

			// Invoke the hook
			const systemOutput = await invokeHook(defaultConfig);

			// Assert historical lessons block is present
			const historicalLessons = systemOutput.find((s) =>
				s.includes('## Historical Lessons'),
			);
			expect(historicalLessons).toBeDefined();

			// Only pass verdicts should appear
			expect(historicalLessons).toContain('Phase 8');
			expect(historicalLessons).toContain('Phase 6');

			// Fail verdict should NOT appear
			expect(historicalLessons).not.toContain('Phase 7');
		});

		it('Test 7: Phase 2 → injects "## Previous Phase Retrospective (Phase 1)" Tier 1 block (not Tier 2)', async () => {
			// Setup: create swarm files with current phase 2
			const swarmDir = join(tempDir, '.swarm');
			await mkdir(swarmDir, { recursive: true });
			await writeFile(join(swarmDir, 'plan.md'), '# Plan\n');
			await writeFile(join(swarmDir, 'context.md'), '# Context\n');

			// Create plan with both phase 1 and 2
			const plan = {
				schema_version: '1.0.0',
				title: 'Test Plan',
				swarm: 'test-swarm',
				current_phase: 2,
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
			await writeFile(
				join(swarmDir, 'plan.json'),
				JSON.stringify(plan, null, 2),
			);

			// Create retro-1 bundle
			const recentDate = new Date(
				Date.now() - 1 * 24 * 60 * 60 * 1000,
			).toISOString();
			await createRetroBundle(
				1,
				'pass',
				['Lesson from phase 1'],
				['Issue found'],
				'Phase 1 completed.',
				recentDate,
			);

			// Invoke the hook
			const systemOutput = await invokeHook(defaultConfig);

			// Find any retrospective-related output
			const retroOutput = systemOutput.find((s) => s.includes('Retrospective'));

			// Should inject Tier 1 block for previous phase, not Tier 2 Historical Lessons
			expect(retroOutput).toBeDefined();
			expect(retroOutput).toContain(
				'## Previous Phase Retrospective (Phase 1)',
			);
			expect(retroOutput).toContain('Outcome:');
			expect(retroOutput).toContain('Rejection reasons:');
			expect(retroOutput).toContain('Lessons learned:');

			// Should NOT contain Tier 2 block
			expect(retroOutput).not.toContain('## Historical Lessons');
		});

		it('Test 8: Output from top-3 retros with combined length > 800 chars → truncated with "..."', async () => {
			// Setup: create swarm files with current phase 1
			await createSwarmFiles(1);

			// Create retros with very long lessons to exceed 800 chars
			const recentDate = new Date(
				Date.now() - 1 * 24 * 60 * 60 * 1000,
			).toISOString();
			const longLesson =
				'This is a very long lesson that adds lots of characters to make the output exceed the 800 character limit and ensure truncation works correctly. '.repeat(
					10,
				);

			await createRetroBundle(
				10,
				'pass',
				[longLesson],
				[],
				'Phase 10 completed.',
				recentDate,
			);
			await createRetroBundle(
				9,
				'pass',
				[longLesson],
				[],
				'Phase 9 completed.',
				recentDate,
			);
			await createRetroBundle(
				8,
				'pass',
				[longLesson],
				[],
				'Phase 8 completed.',
				recentDate,
			);

			// Invoke the hook
			const systemOutput = await invokeHook(defaultConfig);

			// Assert historical lessons block is present
			const historicalLessons = systemOutput.find((s) =>
				s.includes('## Historical Lessons'),
			);
			expect(historicalLessons).toBeDefined();

			// Should be truncated with "..."
			expect(historicalLessons!.length).toBeLessThanOrEqual(803); // 800 + "..."
			expect(historicalLessons!.endsWith('...')).toBe(true);
		});

		it('Test 9: Phase 1 with single recent retro → shows one entry correctly', async () => {
			// Setup: create swarm files with current phase 1
			await createSwarmFiles(1);

			// Create single recent retro
			const recentDate = new Date(
				Date.now() - 1 * 24 * 60 * 60 * 1000,
			).toISOString();
			await createRetroBundle(
				5,
				'pass',
				['Key lesson learned'],
				['Minor issue'],
				'Phase 5 completed successfully.',
				recentDate,
			);

			// Invoke the hook
			const systemOutput = await invokeHook(defaultConfig);

			// Assert historical lessons block is present
			const historicalLessons = systemOutput.find((s) =>
				s.includes('## Historical Lessons'),
			);
			expect(historicalLessons).toBeDefined();

			// Should contain the expected format
			expect(historicalLessons).toContain(
				'## Historical Lessons (from recent prior projects)',
			);
			expect(historicalLessons).toContain(
				'Most recent retrospectives in this workspace:',
			);
			expect(historicalLessons).toContain('- Phase 5');
			expect(historicalLessons).toContain('Phase 5 completed successfully.');
			expect(historicalLessons).toContain('Key lesson: Key lesson learned');
		});

		it.skip('Test 10: Phase 1 with retros at exactly 30 days boundary → excluded (age > cutoff)', async () => {
			// Setup: create swarm files with current phase 1
			await createSwarmFiles(1);

			// Create retro exactly at 30 days boundary (should be excluded since ageMs > cutoff)
			const boundaryDate = new Date(
				Date.now() - 30 * 24 * 60 * 60 * 1000,
			).toISOString();
			await createRetroBundle(
				8,
				'pass',
				['Boundary lesson'],
				[],
				'Phase 8 completed.',
				boundaryDate,
			);

			// Invoke the hook
			const systemOutput = await invokeHook(defaultConfig);

			// Assert no historical lessons block (boundary excluded)
			const historicalLessons = systemOutput.find((s) =>
				s.includes('## Historical Lessons'),
			);
			expect(historicalLessons).toBeUndefined();
		});

		it('Test 11: Phase 1 with retro exactly 29 days old → included (age < cutoff)', async () => {
			// Setup: create swarm files with current phase 1
			await createSwarmFiles(1);

			// Create retro at 29 days (should be included)
			const includedDate = new Date(
				Date.now() - 29 * 24 * 60 * 60 * 1000,
			).toISOString();
			await createRetroBundle(
				8,
				'pass',
				['Included lesson'],
				[],
				'Phase 8 completed.',
				includedDate,
			);

			// Invoke the hook
			const systemOutput = await invokeHook(defaultConfig);

			// Assert historical lessons block is present
			const historicalLessons = systemOutput.find((s) =>
				s.includes('## Historical Lessons'),
			);
			expect(historicalLessons).toBeDefined();
			expect(historicalLessons).toContain('Phase 8');
		});

		it('Test 12: Phase 1 with multiple retros sorted by timestamp (most recent first)', async () => {
			// Setup: create swarm files with current phase 1
			await createSwarmFiles(1);

			// Create retros with different timestamps (not in order)
			const baseDate = Date.now();
			const date1 = new Date(baseDate - 5 * 24 * 60 * 60 * 1000).toISOString(); // 5 days ago
			const date2 = new Date(baseDate - 1 * 24 * 60 * 60 * 1000).toISOString(); // 1 day ago
			const date3 = new Date(baseDate - 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 days ago

			// Create in random order
			await createRetroBundle(
				10,
				'pass',
				['Lesson 10'],
				[],
				'Phase 10.',
				date1,
			);
			await createRetroBundle(
				11,
				'pass',
				['Lesson 11'],
				[],
				'Phase 11.',
				date2,
			);
			await createRetroBundle(
				12,
				'pass',
				['Lesson 12'],
				[],
				'Phase 12.',
				date3,
			);

			// Invoke the hook
			const systemOutput = await invokeHook(defaultConfig);

			// Assert historical lessons block is present
			const historicalLessons = systemOutput.find((s) =>
				s.includes('## Historical Lessons'),
			);
			expect(historicalLessons).toBeDefined();

			// Should be sorted by timestamp descending (most recent first)
			// Phase 11 (1 day) should appear before Phase 12 (3 days) before Phase 10 (5 days)
			const phase11Index = historicalLessons!.indexOf('Phase 11');
			const phase12Index = historicalLessons!.indexOf('Phase 12');
			const phase10Index = historicalLessons!.indexOf('Phase 10');

			expect(phase11Index).toBeLessThan(phase12Index);
			expect(phase12Index).toBeLessThan(phase10Index);
		});

		it('Test 13: Phase 1 with mixed verdicts (pass, fail, info) → only pass and info included', async () => {
			// Setup: create swarm files with current phase 1
			await createSwarmFiles(1);

			const recentDate = new Date(
				Date.now() - 1 * 24 * 60 * 60 * 1000,
			).toISOString();
			await createRetroBundle(
				8,
				'pass',
				['Pass lesson'],
				[],
				'Phase 8 pass.',
				recentDate,
			);
			await createRetroBundle(
				7,
				'fail',
				['Fail lesson'],
				['Fail reason'],
				'Phase 7 fail.',
				recentDate,
			);
			await createRetroBundle(
				6,
				'info',
				['Info lesson'],
				[],
				'Phase 6 info.',
				recentDate,
			);

			// Invoke the hook
			const systemOutput = await invokeHook(defaultConfig);

			// Assert historical lessons block is present
			const historicalLessons = systemOutput.find((s) =>
				s.includes('## Historical Lessons'),
			);
			expect(historicalLessons).toBeDefined();

			// pass and info should be included
			expect(historicalLessons).toContain('Phase 8');
			expect(historicalLessons).toContain('Phase 6');

			// fail should be excluded
			expect(historicalLessons).not.toContain('Phase 7');
		});
	});
});
