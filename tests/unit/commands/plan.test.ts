import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handlePlanCommand } from '../../../src/commands/plan';

const SAMPLE_PLAN = `# Project Plan

## Phase 1: Setup [COMPLETE]
- [x] Task 1
- [x] Task 2

---

## Phase 2: Implementation [IN PROGRESS]
- [x] Task 3
- [ ] Task 4
- [ ] Task 5

---

## Phase 3: Testing [PENDING]
- [ ] Task 6
- [ ] Task 7`;

describe('handlePlanCommand', () => {
	let tempDir: string;

	beforeEach(async () => {
		// Create a temporary directory for each test
		tempDir = await mkdtemp(join(tmpdir(), 'swarm-test-'));
	});

	afterEach(async () => {
		// Clean up the temporary directory after each test
		await rm(tempDir, { recursive: true, force: true });
	});

	async function writePlan(dir: string, content: string) {
		// Create .swarm directory and write plan.md
		const swarmDir = join(dir, '.swarm');
		await mkdir(swarmDir, { recursive: true });
		await writeFile(join(swarmDir, 'plan.md'), content);
	}

	test('returns "No active swarm plan found." when plan.md is missing', async () => {
		const result = await handlePlanCommand(tempDir, []);
		expect(result).toBe('No active swarm plan found.');
	});

	test('returns full plan when no args given', async () => {
		await writePlan(tempDir, SAMPLE_PLAN);
		const result = await handlePlanCommand(tempDir, []);
		expect(result).toBe(SAMPLE_PLAN);
	});

	test('returns error message when non-numeric arg given', async () => {
		await writePlan(tempDir, SAMPLE_PLAN);
		const result = await handlePlanCommand(tempDir, ['abc']);
		expect(result).toContain('Invalid phase number');
	});

	test('extracts specific phase correctly', async () => {
		await writePlan(tempDir, SAMPLE_PLAN);
		const result = await handlePlanCommand(tempDir, ['2']);
		expect(result).toContain('## Phase 2');
		expect(result).toContain('Task 3');
		expect(result).toContain('Task 5');
		expect(result).not.toContain('Phase 1');
		expect(result).not.toContain('Phase 3');
	});

	test('returns "Phase N not found in plan." for non-existent phase', async () => {
		await writePlan(tempDir, SAMPLE_PLAN);
		const result = await handlePlanCommand(tempDir, ['99']);
		expect(result).toBe('Phase 99 not found in plan.');
	});

	test('handles plan with only one phase', async () => {
		await writePlan(tempDir, '## Phase 1: Only [IN PROGRESS]\n- [ ] Task 1');
		const result = await handlePlanCommand(tempDir, ['1']);
		expect(result).toContain('## Phase 1');
		expect(result).toContain('Task 1');
	});

	test('stops extraction at --- separator', async () => {
		await writePlan(tempDir, SAMPLE_PLAN);
		const result = await handlePlanCommand(tempDir, ['1']);
		expect(result).toContain('## Phase 1');
		expect(result).not.toContain('## Phase 2');
	});

	test('stops extraction at next ## Phase header (no ---)', async () => {
		const noDash = '## Phase 1\n- [x] A\n\n## Phase 2\n- [ ] B';
		await writePlan(tempDir, noDash);
		const result = await handlePlanCommand(tempDir, ['1']);
		expect(result).toContain('## Phase 1');
		expect(result).not.toContain('Phase 2');
	});

	test('extracts last phase correctly', async () => {
		await writePlan(tempDir, SAMPLE_PLAN);
		const result = await handlePlanCommand(tempDir, ['3']);
		expect(result).toContain('## Phase 3');
		expect(result).toContain('Task 7');
	});

	test('handles empty plan.md file', async () => {
		await writePlan(tempDir, '');
		const result = await handlePlanCommand(tempDir, []);
		expect(result).toBe('No active swarm plan found.');
	});

	test('extracts Phase 0 boundary correctly', async () => {
		const phaseZeroPlan = '## Phase 0: Init\n- [x] Initialize\n- [ ] Setup';
		await writePlan(tempDir, phaseZeroPlan);
		const result = await handlePlanCommand(tempDir, ['0']);
		expect(result).toContain('## Phase 0');
		expect(result).toContain('Initialize');
	});

	test('returns not found for negative phase number', async () => {
		await writePlan(tempDir, SAMPLE_PLAN);
		const result = await handlePlanCommand(tempDir, ['-1']);
		expect(result).toBe('Phase -1 not found in plan.');
	});

	test('extracts phase with no tasks', async () => {
		const emptyPhasePlan =
			'## Phase 1: Empty\n\n---\n\n## Phase 2: Has Tasks\n- [ ] A';
		await writePlan(tempDir, emptyPhasePlan);
		const result = await handlePlanCommand(tempDir, ['1']);
		expect(result).toBe('## Phase 1: Empty');
	});

	test('handles float phase number by parsing integer part', async () => {
		await writePlan(tempDir, SAMPLE_PLAN);
		const result = await handlePlanCommand(tempDir, ['1.5']);
		expect(result).toContain('## Phase 1');
		expect(result).toContain('Task 2');
		expect(result).not.toContain('Phase 2');
	});
});
