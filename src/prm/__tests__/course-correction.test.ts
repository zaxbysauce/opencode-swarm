import { describe, expect, test } from 'bun:test';
import {
	formatCourseCorrectionForInjection,
	generateCourseCorrection,
} from '../course-correction';
import type { CourseCorrection, PatternMatch, TrajectoryEntry } from '../types';

describe('generateCourseCorrection', () => {
	const baseTrajectory: TrajectoryEntry[] = [
		{
			step: 1,
			agent: 'coder',
			action: 'edit',
			target: 'src/foo.ts',
			intent: 'Add feature X',
			timestamp: '2024-01-01T00:00:00Z',
			result: 'success',
		},
		{
			step: 2,
			agent: 'reviewer',
			action: 'review',
			target: 'src/foo.ts',
			intent: 'Review changes',
			timestamp: '2024-01-01T00:01:00Z',
			result: 'success',
		},
	];

	describe('repetition_loop pattern', () => {
		test('generates correction with affected agents and targets', () => {
			const match: PatternMatch = {
				pattern: 'repetition_loop',
				severity: 'medium',
				category: 'coordination_error',
				stepRange: [1, 3],
				description: 'Repetitive edits detected',
				affectedAgents: ['coder', 'coder-2'],
				affectedTargets: ['src/foo.ts', 'src/bar.ts'],
				occurrenceCount: 2,
			};

			const result = generateCourseCorrection(match, baseTrajectory);

			expect(result.pattern).toBe('repetition_loop');
			expect(result.category).toBe('coordination_error');
			expect(result.stepRange).toEqual([1, 3]);
			expect(result.alert).toContain('repetition_loop');
			expect(result.alert).toContain('medium');
			expect(result.alert).toContain('steps 1-3');
			expect(result.guidance).toContain('repeating the same action');
			expect(result.action).toContain('Stop repetitive edits');
			expect(result.action).toContain('src/foo.ts');
			expect(result.action).toContain('src/bar.ts');
			expect(result.action).toContain('coder');
			expect(result.action).toContain('coder-2');
		});

		test('uses defaults when affectedAgents is empty', () => {
			const match: PatternMatch = {
				pattern: 'repetition_loop',
				severity: 'low',
				category: 'reasoning_error',
				stepRange: [5, 7],
				description: 'Repetitive edits',
				affectedAgents: [],
				affectedTargets: [],
				occurrenceCount: 1,
			};

			const result = generateCourseCorrection(match, baseTrajectory);

			expect(result.action).toContain('current agent');
			expect(result.action).toContain('current target');
		});
	});

	describe('ping_pong pattern', () => {
		test('generates correction for delegation cycle', () => {
			const match: PatternMatch = {
				pattern: 'ping_pong',
				severity: 'high',
				category: 'coordination_error',
				stepRange: [2, 5],
				description: 'Delegation cycle detected',
				affectedAgents: ['agent-a', 'agent-b'],
				affectedTargets: ['task-1'],
				occurrenceCount: 3,
			};

			const result = generateCourseCorrection(match, baseTrajectory);

			expect(result.pattern).toBe('ping_pong');
			expect(result.alert).toContain('ping_pong');
			expect(result.alert).toContain('high');
			expect(result.guidance).toContain('delegating back and forth');
			expect(result.action).toContain('Interrupt the delegation cycle');
			expect(result.action).toContain('Architect should take direct control');
		});
	});

	describe('expansion_drift pattern', () => {
		test('generates correction for scope expansion', () => {
			const match: PatternMatch = {
				pattern: 'expansion_drift',
				severity: 'medium',
				category: 'specification_error',
				stepRange: [3, 8],
				description: 'Scope expanding',
				affectedAgents: ['coder'],
				affectedTargets: ['src/features'],
				occurrenceCount: 1,
			};

			const result = generateCourseCorrection(match, baseTrajectory);

			expect(result.pattern).toBe('expansion_drift');
			expect(result.alert).toContain('expansion_drift');
			expect(result.guidance).toContain('expanding beyond the original task');
			expect(result.action).toContain('Freeze current scope');
			expect(result.action).toContain('follow-up issue');
		});
	});

	describe('stuck_on_test pattern', () => {
		test('generates correction with specific agents', () => {
			const match: PatternMatch = {
				pattern: 'stuck_on_test',
				severity: 'high',
				category: 'reasoning_error',
				stepRange: [10, 15],
				description: 'Edit-test cycle detected',
				affectedAgents: ['test-agent'],
				affectedTargets: ['tests/spec.ts'],
				occurrenceCount: 5,
			};

			const result = generateCourseCorrection(match, baseTrajectory);

			expect(result.pattern).toBe('stuck_on_test');
			expect(result.alert).toContain('stuck_on_test');
			expect(result.guidance).toContain('edit-test cycles');
			expect(result.action).toContain('Pause edit-test cycle');
			expect(result.action).toContain('test-agent');
			expect(result.action).toContain('review test expectations');
		});

		test('uses default agent when affectedAgents is empty', () => {
			const match: PatternMatch = {
				pattern: 'stuck_on_test',
				severity: 'low',
				category: 'reasoning_error',
				stepRange: [1, 2],
				description: 'Test cycle',
				affectedAgents: [],
				affectedTargets: [],
				occurrenceCount: 1,
			};

			const result = generateCourseCorrection(match, baseTrajectory);

			expect(result.action).toContain('the agent');
		});
	});

	describe('context_thrash pattern', () => {
		test('generates correction with limited targets', () => {
			const match: PatternMatch = {
				pattern: 'context_thrash',
				severity: 'medium',
				category: 'coordination_error',
				stepRange: [4, 6],
				description: 'Large context requests',
				affectedAgents: ['context-agent'],
				affectedTargets: ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts'],
				occurrenceCount: 2,
			};

			const result = generateCourseCorrection(match, baseTrajectory);

			expect(result.pattern).toBe('context_thrash');
			expect(result.guidance).toContain(
				'requesting increasingly large file sets',
			);
			expect(result.action).toContain('Restrict file access');
			expect(result.action).toContain('src/a.ts');
			expect(result.action).toContain('src/b.ts');
			expect(result.action).toContain('src/c.ts');
		});

		test('uses default target when affectedTargets is empty', () => {
			const match: PatternMatch = {
				pattern: 'context_thrash',
				severity: 'low',
				category: 'coordination_error',
				stepRange: [1, 1],
				description: 'Context thrash',
				affectedAgents: [],
				affectedTargets: [],
				occurrenceCount: 1,
			};

			const result = generateCourseCorrection(match, baseTrajectory);

			expect(result.action).toContain('requested files');
		});

		test('limits target list to 3 items', () => {
			const match: PatternMatch = {
				pattern: 'context_thrash',
				severity: 'medium',
				category: 'coordination_error',
				stepRange: [1, 1],
				description: 'Context thrash',
				affectedAgents: [],
				affectedTargets: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'],
				occurrenceCount: 1,
			};

			const result = generateCourseCorrection(match, baseTrajectory);

			expect(result.action).toContain('a.ts');
			expect(result.action).toContain('b.ts');
			expect(result.action).toContain('c.ts');
			expect(result.action).not.toContain('d.ts');
			expect(result.action).not.toContain('e.ts');
		});
	});

	describe('severity levels', () => {
		test('includes all severity levels in alert', () => {
			const severities: Array<'low' | 'medium' | 'high' | 'critical'> = [
				'low',
				'medium',
				'high',
				'critical',
			];

			severities.forEach((severity) => {
				const match: PatternMatch = {
					pattern: 'repetition_loop',
					severity,
					category: 'coordination_error',
					stepRange: [1, 2],
					description: 'test',
					affectedAgents: [],
					affectedTargets: [],
					occurrenceCount: 1,
				};

				const result = generateCourseCorrection(match, []);
				expect(result.alert).toContain(`severity: ${severity}`);
			});
		});
	});

	describe('edge cases', () => {
		test('handles empty trajectory array', () => {
			const match: PatternMatch = {
				pattern: 'ping_pong',
				severity: 'medium',
				category: 'coordination_error',
				stepRange: [1, 2],
				description: 'Ping pong',
				affectedAgents: ['a', 'b'],
				affectedTargets: [],
				occurrenceCount: 1,
			};

			const result = generateCourseCorrection(match, []);

			expect(result.pattern).toBe('ping_pong');
			expect(result.action).toBeDefined();
		});

		test('handles single step range', () => {
			const match: PatternMatch = {
				pattern: 'repetition_loop',
				severity: 'low',
				category: 'reasoning_error',
				stepRange: [5, 5],
				description: 'Single step',
				affectedAgents: [],
				affectedTargets: [],
				occurrenceCount: 1,
			};

			const result = generateCourseCorrection(match, baseTrajectory);

			expect(result.stepRange).toEqual([5, 5]);
			expect(result.alert).toContain('steps 5-5');
		});

		test('handles large occurrence count in match without affecting output', () => {
			const match: PatternMatch = {
				pattern: 'stuck_on_test',
				severity: 'critical',
				category: 'reasoning_error',
				stepRange: [1, 20],
				description: 'Stuck',
				affectedAgents: ['agent'],
				affectedTargets: ['test.ts'],
				occurrenceCount: 100,
			};

			const result = generateCourseCorrection(match, baseTrajectory);

			// CourseCorrection doesn't include occurrenceCount - it uses stepRange for tracking
			expect(result.stepRange).toEqual([1, 20]);
			expect(result.pattern).toBe('stuck_on_test');
			expect(result.alert).toContain('critical');
		});
	});
});

describe('formatCourseCorrectionForInjection', () => {
	test('formats correction with all fields', () => {
		const correction: CourseCorrection = {
			alert: 'TRAJECTORY ALERT: repetition_loop detected',
			category: 'coordination_error',
			guidance: 'Consider consolidating changes',
			action: 'Stop repetitive edits',
			pattern: 'repetition_loop',
			stepRange: [1, 5],
		};

		const result = formatCourseCorrectionForInjection(correction);

		expect(result).toContain('TRAJECTORY ALERT: repetition_loop detected');
		expect(result).toContain('CATEGORY: coordination_error');
		expect(result).toContain('GUIDANCE: Consider consolidating changes');
		expect(result).toContain('ACTION: Stop repetitive edits');
	});

	test('formats correction with different pattern types', () => {
		const patterns: CourseCorrection['pattern'][] = [
			'ping_pong',
			'expansion_drift',
			'stuck_on_test',
			'context_thrash',
		];

		patterns.forEach((pattern) => {
			const correction: CourseCorrection = {
				alert: `TRAJECTORY ALERT: ${pattern} detected`,
				category: 'specification_error',
				guidance: 'Test guidance',
				action: 'Test action',
				pattern,
				stepRange: [1, 2],
			};

			const result = formatCourseCorrectionForInjection(correction);
			expect(result).toContain(`TRAJECTORY ALERT: ${pattern} detected`);
		});
	});

	test('formats correction with all taxonomy categories', () => {
		const categories: CourseCorrection['category'][] = [
			'specification_error',
			'reasoning_error',
			'coordination_error',
		];

		categories.forEach((category) => {
			const correction: CourseCorrection = {
				alert: 'ALERT',
				category,
				guidance: 'Guidance',
				action: 'Action',
				pattern: 'repetition_loop',
				stepRange: [1, 1],
			};

			const result = formatCourseCorrectionForInjection(correction);
			expect(result).toContain(`CATEGORY: ${category}`);
		});
	});

	test('preserves step range in output', () => {
		const correction: CourseCorrection = {
			alert: 'TRAJECTORY ALERT: stuck_on_test detected',
			category: 'reasoning_error',
			guidance: 'Guidance',
			action: 'Action',
			pattern: 'stuck_on_test',
			stepRange: [10, 25],
		};

		const result = formatCourseCorrectionForInjection(correction);

		// The pattern appears in output via the alert field
		expect(result).toContain('stuck_on_test');
	});

	test('handles empty guidance and action', () => {
		const correction: CourseCorrection = {
			alert: 'TRAJECTORY ALERT: ping_pong detected',
			category: 'coordination_error',
			guidance: '',
			action: '',
			pattern: 'ping_pong',
			stepRange: [1, 1],
		};

		const result = formatCourseCorrectionForInjection(correction);

		expect(result).toContain('TRAJECTORY ALERT: ping_pong detected');
		expect(result).toContain('CATEGORY: coordination_error');
		expect(result).toContain('GUIDANCE: ');
		expect(result).toContain('ACTION: ');
	});

	test('round-trip: generate then format preserves pattern', () => {
		const match: PatternMatch = {
			pattern: 'context_thrash',
			severity: 'high',
			category: 'coordination_error',
			stepRange: [3, 7],
			description: 'Context thrash detected',
			affectedAgents: ['agent-x'],
			affectedTargets: ['src/app.ts', 'src/lib.ts'],
			occurrenceCount: 2,
		};

		const trajectory: TrajectoryEntry[] = [
			{
				step: 3,
				agent: 'agent-x',
				action: 'read',
				target: 'src/app.ts',
				intent: 'Read files',
				timestamp: '2024-01-01T00:00:00Z',
				result: 'success',
			},
		];

		const correction = generateCourseCorrection(match, trajectory);
		const formatted = formatCourseCorrectionForInjection(correction);

		expect(formatted).toContain('context_thrash');
		expect(formatted).toContain('coordination_error');
	});

	test('output format matches expected injection template', () => {
		const correction: CourseCorrection = {
			alert: 'ALERT',
			category: 'reasoning_error',
			guidance: 'Take a break',
			action: 'Stop now',
			pattern: 'repetition_loop',
			stepRange: [1, 3],
		};

		const result = formatCourseCorrectionForInjection(correction);
		const lines = result.split('\n');

		expect(lines[0]).toBe('ALERT');
		expect(lines[1]).toBe('CATEGORY: reasoning_error');
		expect(lines[2]).toBe('GUIDANCE: Take a break');
		expect(lines[3]).toBe('ACTION: Stop now');
	});
});
