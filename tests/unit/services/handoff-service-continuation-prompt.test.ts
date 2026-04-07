import { describe, expect, test } from 'bun:test';
import {
	formatContinuationPrompt,
	type HandoffData,
} from '../../../src/services/handoff-service.js';

describe('formatContinuationPrompt', () => {
	describe('Scenario 1: Full HandoffData - all fields rendered correctly', () => {
		test('should render all fields when provided complete HandoffData', () => {
			const data: HandoffData = {
				generated: '2024-01-01T00:00:00.000Z',
				currentPhase: 'Phase 1: Implementation',
				currentTask: '1.2',
				incompleteTasks: ['1.2', '1.3', '2.1'],
				pendingQA: { taskId: '1.1', lastFailure: 'lint-check' },
				activeAgent: 'coder',
				recentDecisions: [
					'Use bun:test for unit tests',
					'Skip spec.md for atomic fixes',
				],
				delegationState: null,
			};

			const result = formatContinuationPrompt(data);

			expect(result).toContain('**Phase**: Phase 1: Implementation');
			expect(result).toContain('**Current Task**: 1.2');
			expect(result).toContain('**Next Task**: 1.3');
			expect(result).toContain('**Pending QA Blocker**: 1.1');
			expect(result).toContain('  - Last failure: lint-check');
			expect(result).toContain('**Recent Decisions (do not revisit)**:');
			expect(result).toContain('- Use bun:test for unit tests');
			expect(result).toContain('- Skip spec.md for atomic fixes');
			expect(result).toContain('**To resume**:');
			expect(result).toContain('Read `.swarm/handoff.md` for full context');
			expect(result).toContain(
				'Use `knowledge_recall` to recall relevant lessons before starting',
			);
		});
	});

	describe('Scenario 2: Minimal HandoffData (all nulls) - graceful degradation', () => {
		test('should show only reminders when all fields are null/empty', () => {
			const data: HandoffData = {
				generated: '2024-01-01T00:00:00.000Z',
				currentPhase: null,
				currentTask: null,
				incompleteTasks: [],
				pendingQA: null,
				activeAgent: null,
				recentDecisions: [],
				delegationState: null,
			};

			const result = formatContinuationPrompt(data);

			expect(result).not.toContain('**Phase**:');
			expect(result).not.toContain('**Current Task**:');
			expect(result).not.toContain('**Next Task**:');
			expect(result).not.toContain('**Pending QA Blocker**:');
			expect(result).not.toContain('**Recent Decisions (do not revisit)**:');
			expect(result).toContain('**To resume**:');
			expect(result).toContain('Read `.swarm/handoff.md` for full context');
			expect(result).toContain(
				'Use `knowledge_recall` to recall relevant lessons before starting',
			);
		});
	});

	describe('Scenario 3: No incomplete tasks - next task shows none', () => {
		test('should omit next task when no incomplete tasks exist', () => {
			const data: HandoffData = {
				generated: '2024-01-01T00:00:00.000Z',
				currentPhase: 'Phase 2: Review',
				currentTask: null,
				incompleteTasks: [],
				pendingQA: null,
				activeAgent: null,
				recentDecisions: [],
				delegationState: null,
			};

			const result = formatContinuationPrompt(data);

			expect(result).toContain('**Phase**: Phase 2: Review');
			expect(result).not.toContain('**Next Task**:');
		});
	});

	describe('Scenario 4: No pending QA - pending QA section omitted', () => {
		test('should omit pending QA section when pendingQA is null', () => {
			const data: HandoffData = {
				generated: '2024-01-01T00:00:00.000Z',
				currentPhase: 'Phase 1: Implementation',
				currentTask: '1.1',
				incompleteTasks: ['1.1', '1.2'],
				pendingQA: null,
				activeAgent: null,
				recentDecisions: [],
				delegationState: null,
			};

			const result = formatContinuationPrompt(data);

			expect(result).not.toContain('**Pending QA Blocker**:');
			expect(result).not.toContain('Last failure:');
		});
	});

	describe('Scenario 5: No recent decisions - omitted gracefully', () => {
		test('should omit recent decisions section when array is empty', () => {
			const data: HandoffData = {
				generated: '2024-01-01T00:00:00.000Z',
				currentPhase: 'Phase 1: Implementation',
				currentTask: '1.1',
				incompleteTasks: ['1.1', '1.2'],
				pendingQA: null,
				activeAgent: null,
				recentDecisions: [],
				delegationState: null,
			};

			const result = formatContinuationPrompt(data);

			expect(result).not.toContain('**Recent Decisions (do not revisit)**:');
		});
	});

	describe('Scenario 6: Current task equals first incomplete - next task shows second', () => {
		test('should skip to second incomplete when current task is first', () => {
			const data: HandoffData = {
				generated: '2024-01-01T00:00:00.000Z',
				currentPhase: 'Phase 1: Implementation',
				currentTask: '1.1',
				incompleteTasks: ['1.1', '1.2', '1.3'],
				pendingQA: null,
				activeAgent: null,
				recentDecisions: [],
				delegationState: null,
			};

			const result = formatContinuationPrompt(data);

			expect(result).toContain('**Current Task**: 1.1');
			expect(result).toContain('**Next Task**: 1.2');
			expect(result).not.toContain('**Next Task**: 1.1');
		});

		test('should show first incomplete when current task is not in list', () => {
			const data: HandoffData = {
				generated: '2024-01-01T00:00:00.000Z',
				currentPhase: 'Phase 1: Implementation',
				currentTask: '1.5',
				incompleteTasks: ['1.1', '1.2', '1.3'],
				pendingQA: null,
				activeAgent: null,
				recentDecisions: [],
				delegationState: null,
			};

			const result = formatContinuationPrompt(data);

			expect(result).toContain('**Next Task**: 1.1');
		});

		test('should show no next task when current is only incomplete', () => {
			const data: HandoffData = {
				generated: '2024-01-01T00:00:00.000Z',
				currentPhase: 'Phase 1: Implementation',
				currentTask: '1.1',
				incompleteTasks: ['1.1'],
				pendingQA: null,
				activeAgent: null,
				recentDecisions: [],
				delegationState: null,
			};

			const result = formatContinuationPrompt(data);

			expect(result).toContain('**Current Task**: 1.1');
			expect(result).not.toContain('**Next Task**:');
		});
	});

	describe('Scenario 7: Output wrapped in markdown code block', () => {
		test('should wrap output in ```markdown code block', () => {
			const data: HandoffData = {
				generated: '2024-01-01T00:00:00.000Z',
				currentPhase: null,
				currentTask: null,
				incompleteTasks: [],
				pendingQA: null,
				activeAgent: null,
				recentDecisions: [],
				delegationState: null,
			};

			const result = formatContinuationPrompt(data);

			expect(result).toStartWith('```markdown');
			expect(result).toEndWith('```');
		});

		test('code block should contain all the content', () => {
			const data: HandoffData = {
				generated: '2024-01-01T00:00:00.000Z',
				currentPhase: 'Phase 1: Test',
				currentTask: '1.1',
				incompleteTasks: ['1.1', '1.2'],
				pendingQA: { taskId: '1.0', lastFailure: null },
				activeAgent: null,
				recentDecisions: ['Decision 1'],
				delegationState: null,
			};

			const result = formatContinuationPrompt(data);
			const withoutFence = result
				.replace(/^```markdown\n/, '')
				.replace(/\n```$/, '');

			expect(withoutFence).toContain('**Phase**: Phase 1: Test');
			expect(withoutFence).toContain('**Current Task**: 1.1');
			expect(withoutFence).toContain('**Next Task**: 1.2');
			expect(withoutFence).toContain('**Pending QA Blocker**: 1.0');
			expect(withoutFence).toContain('**Recent Decisions (do not revisit)**:');
			expect(withoutFence).toContain('**To resume**:');
		});
	});

	describe('Recent decisions limit', () => {
		test('should only show last 3 recent decisions', () => {
			const data: HandoffData = {
				generated: '2024-01-01T00:00:00.000Z',
				currentPhase: null,
				currentTask: null,
				incompleteTasks: [],
				pendingQA: null,
				activeAgent: null,
				recentDecisions: [
					'Decision 1',
					'Decision 2',
					'Decision 3',
					'Decision 4',
					'Decision 5',
				],
				delegationState: null,
			};

			const result = formatContinuationPrompt(data);

			expect(result).toContain('Decision 3');
			expect(result).toContain('Decision 4');
			expect(result).toContain('Decision 5');
			expect(result).not.toContain('Decision 1');
			expect(result).not.toContain('Decision 2');
		});
	});
});
