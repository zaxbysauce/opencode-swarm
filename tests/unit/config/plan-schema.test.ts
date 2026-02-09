import { describe, it, expect } from 'bun:test';
import {
	TaskSchema,
	PhaseSchema,
	PlanSchema,
	TaskStatusSchema,
	TaskSizeSchema,
	PhaseStatusSchema,
	MigrationStatusSchema,
} from '../../../src/config/plan-schema';

describe('TaskStatusSchema', () => {
	it('valid values: pending, in_progress, completed, blocked all parse', () => {
		const pending = TaskStatusSchema.safeParse('pending');
		expect(pending.success).toBe(true);

		const inProgress = TaskStatusSchema.safeParse('in_progress');
		expect(inProgress.success).toBe(true);

		const completed = TaskStatusSchema.safeParse('completed');
		expect(completed.success).toBe(true);

		const blocked = TaskStatusSchema.safeParse('blocked');
		expect(blocked.success).toBe(true);
	});

	it('invalid value: done throws', () => {
		const result = TaskStatusSchema.safeParse('done');
		expect(result.success).toBe(false);
	});
});

describe('TaskSizeSchema', () => {
	it('valid values: small, medium, large all parse', () => {
		const small = TaskSizeSchema.safeParse('small');
		expect(small.success).toBe(true);

		const medium = TaskSizeSchema.safeParse('medium');
		expect(medium.success).toBe(true);

		const large = TaskSizeSchema.safeParse('large');
		expect(large.success).toBe(true);
	});

	it('invalid value: huge throws', () => {
		const result = TaskSizeSchema.safeParse('huge');
		expect(result.success).toBe(false);
	});
});

describe('PhaseStatusSchema', () => {
	it('valid values: pending, in_progress, complete, blocked all parse', () => {
		const pending = PhaseStatusSchema.safeParse('pending');
		expect(pending.success).toBe(true);

		const inProgress = PhaseStatusSchema.safeParse('in_progress');
		expect(inProgress.success).toBe(true);

		const complete = PhaseStatusSchema.safeParse('complete');
		expect(complete.success).toBe(true);

		const blocked = PhaseStatusSchema.safeParse('blocked');
		expect(blocked.success).toBe(true);
	});

	it('invalid: finished throws', () => {
		const result = PhaseStatusSchema.safeParse('finished');
		expect(result.success).toBe(false);
	});
});

describe('MigrationStatusSchema', () => {
	it('valid: native, migrated, migration_failed all parse', () => {
		const native = MigrationStatusSchema.safeParse('native');
		expect(native.success).toBe(true);

		const migrated = MigrationStatusSchema.safeParse('migrated');
		expect(migrated.success).toBe(true);

		const migrationFailed = MigrationStatusSchema.safeParse('migration_failed');
		expect(migrationFailed.success).toBe(true);
	});

	it('invalid: unknown throws', () => {
		const result = MigrationStatusSchema.safeParse('unknown');
		expect(result.success).toBe(false);
	});
});

describe('TaskSchema', () => {
	it('valid minimal task parses with defaults (status=pending, size=small, depends=[], files_touched=[])', () => {
		const task = {
			id: '1.1',
			phase: 1,
			description: 'Test',
		};
		const result = TaskSchema.safeParse(task);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.status).toBe('pending');
			expect(result.data.size).toBe('small');
			expect(result.data.depends).toEqual([]);
			expect(result.data.files_touched).toEqual([]);
		}
	});

	it('valid full task with all fields set', () => {
		const task = {
			id: '1.1',
			phase: 1,
			status: 'in_progress' as const,
			size: 'medium' as const,
			description: 'Test task',
			depends: ['1.1', '1.2'],
			acceptance: 'Must be done',
			files_touched: ['file1.ts', 'file2.ts'],
			evidence_path: 'evidence/1.1',
			blocked_reason: 'Waiting for review',
		};
		const result = TaskSchema.safeParse(task);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual(task);
		}
	});

	it('invalid: missing description (empty string) throws', () => {
		const task = {
			id: '1.1',
			phase: 1,
			description: '',
		};
		const result = TaskSchema.safeParse(task);
		expect(result.success).toBe(false);
	});

	it('invalid: phase < 1 throws', () => {
		const task = {
			id: '1.1',
			phase: 0,
			description: 'Test',
		};
		const result = TaskSchema.safeParse(task);
		expect(result.success).toBe(false);
	});

	it('invalid: bad status throws', () => {
		const task = {
			id: '1.1',
			phase: 1,
			status: 'done' as const,
			description: 'Test',
		};
		const result = TaskSchema.safeParse(task);
		expect(result.success).toBe(false);
	});
});

describe('PhaseSchema', () => {
	it('valid minimal: parses with defaults (status=pending, tasks=[])', () => {
		const phase = {
			id: 1,
			name: 'Phase 1',
		};
		const result = PhaseSchema.safeParse(phase);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.status).toBe('pending');
			expect(result.data.tasks).toEqual([]);
		}
	});

	it('valid with tasks array', () => {
		const phase = {
			id: 1,
			name: 'Phase 1',
			status: 'in_progress' as const,
			tasks: [
				{
					id: '1.1',
					phase: 1,
					description: 'Task one',
				},
			],
		};
		const result = PhaseSchema.safeParse(phase);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.id).toBe(phase.id);
			expect(result.data.name).toBe(phase.name);
			expect(result.data.status).toBe(phase.status);
			expect(result.data.tasks.length).toBe(1);
			// Task defaults are applied
			expect(result.data.tasks[0].status).toBe('pending');
			expect(result.data.tasks[0].size).toBe('small');
			expect(result.data.tasks[0].depends).toEqual([]);
			expect(result.data.tasks[0].files_touched).toEqual([]);
		}
	});

	it('invalid: missing name throws', () => {
		const phase = {
			id: 1,
			name: '',
		};
		const result = PhaseSchema.safeParse(phase);
		expect(result.success).toBe(false);
	});

	it('invalid: id < 1 throws', () => {
		const phase = {
			id: 0,
			name: 'Phase 1',
		};
		const result = PhaseSchema.safeParse(phase);
		expect(result.success).toBe(false);
	});
});

describe('PlanSchema', () => {
	it('valid minimal plan with one phase', () => {
		const plan = {
			schema_version: '1.0.0' as const,
			title: 'Test Plan',
			swarm: 'test-swarm',
			current_phase: 1,
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					tasks: [],
				},
			],
		};
		const result = PlanSchema.safeParse(plan);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.schema_version).toBe(plan.schema_version);
			expect(result.data.title).toBe(plan.title);
			expect(result.data.swarm).toBe(plan.swarm);
			expect(result.data.current_phase).toBe(plan.current_phase);
			expect(result.data.phases.length).toBe(1);
			// Phase defaults are applied
			expect(result.data.phases[0].status).toBe('pending');
			expect(result.data.phases[0].tasks).toEqual([]);
		}
	});

	it('valid full plan with multiple phases, tasks, dependencies', () => {
		const plan = {
			schema_version: '1.0.0' as const,
			title: 'Full Test Plan',
			swarm: 'full-swarm',
			current_phase: 1,
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'in_progress' as const,
					tasks: [
						{
							id: '1.1',
							phase: 1,
							description: 'Task one',
							status: 'completed' as const,
							size: 'small' as const,
							depends: [],
						},
						{
							id: '1.2',
							phase: 1,
							description: 'Task two',
							status: 'in_progress' as const,
							size: 'medium' as const,
							depends: ['1.1'],
						},
					],
				},
				{
					id: 2,
					name: 'Phase 2',
					status: 'pending' as const,
					tasks: [
						{
							id: '2.1',
							phase: 2,
							description: 'Task three',
							status: 'pending' as const,
							size: 'large' as const,
							depends: ['1.2'],
						},
					],
				},
			],
			migration_status: 'migrated' as const,
		};
		const result = PlanSchema.safeParse(plan);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.schema_version).toBe(plan.schema_version);
			expect(result.data.title).toBe(plan.title);
			expect(result.data.swarm).toBe(plan.swarm);
			expect(result.data.current_phase).toBe(plan.current_phase);
			expect(result.data.phases.length).toBe(2);
			expect(result.data.migration_status).toBe('migration_status' in plan ? 'migrated' : undefined);
			// Check first phase
			expect(result.data.phases[0].id).toBe(1);
			expect(result.data.phases[0].name).toBe('Phase 1');
			expect(result.data.phases[0].status).toBe('in_progress');
			expect(result.data.phases[0].tasks.length).toBe(2);
			// Check first task
			expect(result.data.phases[0].tasks[0].id).toBe('1.1');
			expect(result.data.phases[0].tasks[0].description).toBe('Task one');
			expect(result.data.phases[0].tasks[0].status).toBe('completed');
			expect(result.data.phases[0].tasks[0].size).toBe('small');
			expect(result.data.phases[0].tasks[0].depends).toEqual([]);
			expect(result.data.phases[0].tasks[0].files_touched).toEqual([]);
		}
	});

	it('invalid: wrong schema_version throws', () => {
		const plan = {
			schema_version: '0.9.0' as const,
			title: 'Test Plan',
			swarm: 'test-swarm',
			current_phase: 1,
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					tasks: [],
				},
			],
		};
		const result = PlanSchema.safeParse(plan);
		expect(result.success).toBe(false);
	});

	it('invalid: empty title throws', () => {
		const plan = {
			schema_version: '1.0.0' as const,
			title: '',
			swarm: 'test-swarm',
			current_phase: 1,
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					tasks: [],
				},
			],
		};
		const result = PlanSchema.safeParse(plan);
		expect(result.success).toBe(false);
	});

	it('invalid: no phases (empty array) throws', () => {
		const plan = {
			schema_version: '1.0.0' as const,
			title: 'Test Plan',
			swarm: 'test-swarm',
			current_phase: 1,
			phases: [],
		};
		const result = PlanSchema.safeParse(plan);
		expect(result.success).toBe(false);
	});

	it('invalid: current_phase < 1 throws', () => {
		const plan = {
			schema_version: '1.0.0' as const,
			title: 'Test Plan',
			swarm: 'test-swarm',
			current_phase: 0,
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					tasks: [],
				},
			],
		};
		const result = PlanSchema.safeParse(plan);
		expect(result.success).toBe(false);
	});

	it('optional: migration_status is optional, defaults to undefined', () => {
		const plan = {
			schema_version: '1.0.0' as const,
			title: 'Test Plan',
			swarm: 'test-swarm',
			current_phase: 1,
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					tasks: [],
				},
			],
		};
		const result = PlanSchema.safeParse(plan);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.migration_status).toBeUndefined();
		}
	});
});
