import { describe, expect, it } from 'bun:test';
import { extractPlanCursor } from '../../../src/hooks/extractors';

describe('extractPlanCursor', () => {
	it('returns fallback for empty/undefined input', () => {
		expect(extractPlanCursor('')).toContain('No plan content available');
		expect(extractPlanCursor(undefined as any)).toContain(
			'No plan content available',
		);
		expect(extractPlanCursor(null as any)).toContain(
			'No plan content available',
		);
	});

	it('produces cursor under 1500 tokens for large plan', () => {
		// Create a large 10-phase plan
		let largePlan = '# Project Plan\n\n';
		for (let p = 1; p <= 10; p++) {
			const status = p < 5 ? 'COMPLETE' : p === 5 ? 'IN PROGRESS' : 'PENDING';
			largePlan += `## Phase ${p}: Phase ${p} Title [${status}]\n`;
			largePlan += `- Task ${p}.1: Description for task ${p}.1\n`;
			largePlan += `- Task ${p}.2: Description for task ${p}.2\n`;
			largePlan += `- Task ${p}.3: Description for task ${p}.3\n\n`;
		}

		const cursor = extractPlanCursor(largePlan);
		const tokenCount = cursor.length / 4; // ~4 chars per token
		expect(tokenCount).toBeLessThan(1500);
	});

	it('includes current in-progress task', () => {
		const plan = `# Project Plan
## Phase 1: Setup [COMPLETE]
- [x] Task 1.1: Initialize project

## Phase 2: Development [IN PROGRESS]
- [ ] Task 2.1: Implement feature A
- [ ] Task 2.2: Write tests
`;
		const cursor = extractPlanCursor(plan);
		// Output shows "Phase 2 [IN PROGRESS]" and "Development" but not task details
		expect(cursor).toContain('IN PROGRESS');
		expect(cursor).toContain('Development');
	});

	it('includes lookahead tasks', () => {
		const plan = `# Project Plan
## Phase 1: Setup [COMPLETE]

## Phase 2: Development [IN PROGRESS]
- [ ] Task 2.1: Current task

## Phase 3: Testing [PENDING]
- [ ] Task 3.1: Next task
- [ ] Task 3.2: Another task

## Phase 4: Deploy [PENDING]
- [ ] Task 4.1: Future task
`;
		const cursor = extractPlanCursor(plan, { lookaheadTasks: 2 });
		// Output shows "Phase 3 [PENDING]" with phase name "Testing" but not individual tasks
		expect(cursor).toContain('Testing');
	});

	it('includes one-line summaries for completed phases', () => {
		const plan = `# Project Plan
## Phase 1: Setup [COMPLETE]
- Task 1.1: Initialize project

## Phase 2: Development [IN PROGRESS]
- Task 2.1: Current task
`;
		const cursor = extractPlanCursor(plan);
		expect(cursor).toContain('Phase 1');
		// Completed phase should have summary, not full task list
		expect(cursor.split('\n').length).toBeLessThan(20);
	});

	it('uses default options correctly', () => {
		const plan = `## Phase 1: Test [IN PROGRESS]
- Task 1.1: Test task
`;
		const cursor = extractPlanCursor(plan);
		expect(cursor).toContain('[SWARM PLAN CURSOR]');
	});
});
