import { describe, expect, test } from 'bun:test';
import { migrateLegacyPlan } from '../../../src/plan/manager';

describe('migrateLegacyPlan - Phase Headers', () => {
	test('### header creates a phase with the correct ID, name, status', () => {
		const planContent = `
### Phase 1: Setup [PENDING]
- [ ] 1.1: Initialize project [SMALL]
`;
		const result = migrateLegacyPlan(planContent);

		expect(result.phases).toHaveLength(1);
		expect(result.phases[0].id).toBe(1);
		expect(result.phases[0].name).toBe('Setup');
		expect(result.phases[0].status).toBe('pending');
	});

	test('### and ## headers in the same plan both parse correctly', () => {
		const planContent = `
### Phase 1: Foundation
- [ ] 1.1: Create repo [SMALL]
## Phase 2: Build
- [ ] 2.1: Write code [SMALL]
`;
		const result = migrateLegacyPlan(planContent);

		expect(result.phases).toHaveLength(2);
		expect(result.phases[0].id).toBe(1);
		expect(result.phases[0].name).toBe('Foundation');
		expect(result.phases[1].id).toBe(2);
		expect(result.phases[1].name).toBe('Build');
	});

	test('### header without status defaults to pending', () => {
		const planContent = `
### Phase 1: Implementation
- [ ] 1.1: Start work [SMALL]
`;
		const result = migrateLegacyPlan(planContent);

		expect(result.phases[0].status).toBe('pending');
	});
});

describe('migrateLegacyPlan - Numbered List Tasks', () => {
	test('1. Description creates a task with auto-generated ID 1.1', () => {
		const planContent = `
### Phase 1
1. First task
`;
		const result = migrateLegacyPlan(planContent);

		expect(result.phases).toHaveLength(1);
		expect(result.phases[0].tasks).toHaveLength(1);
		expect(result.phases[0].tasks[0].id).toBe('1.1');
		expect(result.phases[0].tasks[0].description).toBe('First task');
	});

	test('1. Description [MEDIUM] creates a task with size medium', () => {
		const planContent = `
### Phase 1
1. Important task [MEDIUM]
`;
		const result = migrateLegacyPlan(planContent);

		expect(result.phases[0].tasks[0].size).toBe('medium');
	});

	test('Multiple numbered tasks in sequence get IDs 1.1, 1.2, 1.3', () => {
		const planContent = `
### Phase 1
1. Task one
2. Task two
3. Task three
`;
		const result = migrateLegacyPlan(planContent);

		expect(result.phases[0].tasks).toHaveLength(3);
		expect(result.phases[0].tasks[0].id).toBe('1.1');
		expect(result.phases[0].tasks[1].id).toBe('1.2');
		expect(result.phases[0].tasks[2].id).toBe('1.3');
	});

	test('Numbered task with (depends: 1.1) extracts dependency', () => {
		const planContent = `
### Phase 1
1. First task
2. Second task (depends: 1.1)
`;
		const result = migrateLegacyPlan(planContent);

		expect(result.phases[0].tasks[1].depends).toEqual(['1.1']);
		expect(result.phases[0].tasks[1].description).toBe('Second task');
	});

	test('Numbered task outside any phase is ignored', () => {
		const planContent = `
1. Task without phase
### Phase 1
- [ ] 1.1: Real task [SMALL]
`;
		const result = migrateLegacyPlan(planContent);

		expect(result.phases[0].tasks).toHaveLength(1);
		expect(result.phases[0].tasks[0].description).toBe('Real task');
	});
});

describe('migrateLegacyPlan - Checkbox Tasks Without N.M: Prefix', () => {
	test('- [ ] Create auth module [SMALL] auto-generates ID 1.1', () => {
		const planContent = `
### Phase 1
- [ ] Create auth module [SMALL]
`;
		const result = migrateLegacyPlan(planContent);

		expect(result.phases[0].tasks).toHaveLength(1);
		expect(result.phases[0].tasks[0].id).toBe('1.1');
		expect(result.phases[0].tasks[0].description).toBe('Create auth module');
		expect(result.phases[0].tasks[0].size).toBe('small');
	});

	test('- [x] Build the API auto-generates ID, status=completed', () => {
		const planContent = `
### Phase 1
- [x] Build the API
`;
		const result = migrateLegacyPlan(planContent);

		expect(result.phases[0].tasks[0].id).toBe('1.1');
		expect(result.phases[0].tasks[0].status).toBe('completed');
	});

	test('- [BLOCKED] Deploy to prod - server down auto-generates ID, status=blocked, blocked_reason', () => {
		const planContent = `
### Phase 1
- [BLOCKED] Deploy to prod - server down
`;
		const result = migrateLegacyPlan(planContent);

		expect(result.phases[0].tasks[0].id).toBe('1.1');
		expect(result.phases[0].tasks[0].status).toBe('blocked');
		expect(result.phases[0].tasks[0].blocked_reason).toBe('server down');
	});

	test('Multiple no-prefix tasks get sequential IDs', () => {
		const planContent = `
### Phase 1
- [ ] First task
- [ ] Second task
- [x] Third task
`;
		const result = migrateLegacyPlan(planContent);

		expect(result.phases[0].tasks).toHaveLength(3);
		expect(result.phases[0].tasks[0].id).toBe('1.1');
		expect(result.phases[0].tasks[1].id).toBe('1.2');
		expect(result.phases[0].tasks[2].id).toBe('1.3');
	});

	test('No-prefix task with dependency extracts it', () => {
		const planContent = `
### Phase 1
- [ ] First task
- [ ] Second task (depends: 1.1)
`;
		const result = migrateLegacyPlan(planContent);

		expect(result.phases[0].tasks[1].depends).toEqual(['1.1']);
		expect(result.phases[0].tasks[1].description).toBe('Second task');
	});
});

describe('migrateLegacyPlan - Tasks With N.M: Prefix (Regression)', () => {
	test('Standard - [ ] 1.1: Description [SMALL] still parses correctly', () => {
		const planContent = `
### Phase 1
- [ ] 1.1: Setup database [SMALL]
- [ ] 1.2: Create user table [MEDIUM]
`;
		const result = migrateLegacyPlan(planContent);

		expect(result.phases[0].tasks).toHaveLength(2);
		expect(result.phases[0].tasks[0].id).toBe('1.1');
		expect(result.phases[0].tasks[0].description).toBe('Setup database');
		expect(result.phases[0].tasks[0].size).toBe('small');
		expect(result.phases[0].tasks[1].id).toBe('1.2');
		expect(result.phases[0].tasks[1].description).toBe('Create user table');
		expect(result.phases[0].tasks[1].size).toBe('medium');
	});

	test('Primary pattern takes precedence — no duplicate tasks added', () => {
		const planContent = `
### Phase 1
- [ ] 1.1: Task with prefix
- [ ] Task without prefix
`;
		const result = migrateLegacyPlan(planContent);

		// First task matches the primary pattern (with prefix)
		// Second task matches the no-prefix pattern
		expect(result.phases[0].tasks).toHaveLength(2);
		expect(result.phases[0].tasks[0].id).toBe('1.1');
		expect(result.phases[0].tasks[0].description).toBe('Task with prefix');
		expect(result.phases[0].tasks[1].id).toBe('1.2');
		expect(result.phases[0].tasks[1].description).toBe('Task without prefix');
	});
});

describe('migrateLegacyPlan - Zero Phases Warning', () => {
	test('Empty string input triggers console.warn', () => {
		const originalWarn = console.warn;
		const warnCalls: string[] = [];
		console.warn = (...args: unknown[]) => {
			warnCalls.push(args.join(' '));
		};

		try {
			const result = migrateLegacyPlan('');

			expect(warnCalls).toHaveLength(1);
			expect(warnCalls[0]).toContain('0 phases parsed');
			expect(result.migration_status).toBe('migration_failed');
		} finally {
			console.warn = originalWarn;
		}
	});

	test('Plan with text but no phase headers triggers console.warn', () => {
		const originalWarn = console.warn;
		const warnCalls: string[] = [];
		console.warn = (...args: unknown[]) => {
			warnCalls.push(args.join(' '));
		};

		try {
			const planContent = `
This is a plan description
Some random text
No phase headers here
`;
			const result = migrateLegacyPlan(planContent);

			expect(warnCalls).toHaveLength(1);
			expect(warnCalls[0]).toContain('0 phases parsed');
			expect(result.migration_status).toBe('migration_failed');
		} finally {
			console.warn = originalWarn;
		}
	});

	test('Verify warn message contains correct details', () => {
		const originalWarn = console.warn;
		const warnCalls: string[] = [];
		console.warn = (...args: unknown[]) => {
			warnCalls.push(args.join(' '));
		};

		try {
			const planContent = 'Random content';
			migrateLegacyPlan(planContent);

			const warningMessage = warnCalls[0];
			expect(warningMessage).toContain('migrateLegacyPlan:');
			expect(warningMessage).toContain('0 phases parsed');
			expect(warningMessage).toContain('Random content');
		} finally {
			console.warn = originalWarn;
		}
	});
});

describe('migrateLegacyPlan - Regression: Existing Behavior', () => {
	test('Full plan with ## Phase headers and checkbox tasks with N.M: prefix still parses correctly', () => {
		const planContent = `
# Project Plan

## Phase 1: Foundation
- [ ] 1.1: Initialize repository [SMALL]
- [ ] 1.2: Setup development environment [MEDIUM]
- [x] 1.3: Create project structure [SMALL]

## Phase 2: Implementation [IN PROGRESS]
- [ ] 2.1: Build core features [LARGE]
- [ ] 2.2: Write unit tests [MEDIUM] (depends: 2.1)
- [BLOCKED] 2.3: Deploy to staging - pending infrastructure

## Phase 3: Documentation
- [ ] 3.1: Write API docs [SMALL]
`;
		const result = migrateLegacyPlan(planContent);

		expect(result.title).toBe('Project Plan');
		expect(result.phases).toHaveLength(3);

		// Phase 1
		expect(result.phases[0].id).toBe(1);
		expect(result.phases[0].name).toBe('Foundation');
		expect(result.phases[0].status).toBe('pending');
		expect(result.phases[0].tasks).toHaveLength(3);
		expect(result.phases[0].tasks[0].id).toBe('1.1');
		expect(result.phases[0].tasks[0].status).toBe('pending');
		expect(result.phases[0].tasks[2].status).toBe('completed');

		// Phase 2
		expect(result.phases[1].id).toBe(2);
		expect(result.phases[1].name).toBe('Implementation');
		expect(result.phases[1].status).toBe('in_progress');
		expect(result.phases[1].tasks).toHaveLength(3);
		expect(result.phases[1].tasks[1].depends).toEqual(['2.1']);
		expect(result.phases[1].tasks[2].status).toBe('blocked');
		expect(result.phases[1].tasks[2].blocked_reason).toBe(
			'pending infrastructure',
		);

		// Phase 3
		expect(result.phases[2].id).toBe(3);
		expect(result.phases[2].name).toBe('Documentation');
		expect(result.phases[2].tasks).toHaveLength(1);

		expect(result.migration_status).toBe('migrated');
	});
});

describe('migrateLegacyPlan - Mixed Format Support', () => {
	test('Mixed ### phase headers and numbered list tasks', () => {
		const planContent = `
### Phase 1
1. Task one [SMALL]
2. Task two [MEDIUM]
### Phase 2: Build
1. Build API [LARGE]
`;
		const result = migrateLegacyPlan(planContent);

		expect(result.phases).toHaveLength(2);
		expect(result.phases[0].tasks).toHaveLength(2);
		expect(result.phases[1].tasks).toHaveLength(1);
		expect(result.phases[0].tasks[0].id).toBe('1.1');
		expect(result.phases[0].tasks[1].id).toBe('1.2');
		expect(result.phases[1].tasks[0].id).toBe('2.1');
	});

	test('Mixed task formats within same phase', () => {
		const planContent = `
## Phase 1
- [ ] 1.1: Standard task [SMALL]
1. Numbered task [MEDIUM]
- [ ] No-prefix task [SMALL]
- [x] 1.2: Another standard [SMALL]
`;
		const result = migrateLegacyPlan(planContent);

		expect(result.phases[0].tasks).toHaveLength(4);
		expect(result.phases[0].tasks[0].id).toBe('1.1');
		expect(result.phases[0].tasks[1].id).toBe('1.2');
		expect(result.phases[0].tasks[2].id).toBe('1.3');
		expect(result.phases[0].tasks[3].id).toBe('1.2'); // This will conflict and overwrite - expected behavior

		// Check the statuses
		expect(result.phases[0].tasks[1].status).toBe('pending');
		expect(result.phases[0].tasks[2].status).toBe('pending');
	});
});

describe('migrateLegacyPlan - Edge Cases', () => {
	test('Phase with various status formats', () => {
		const planContent = `
## Phase 1: Setup [COMPLETE]
### Phase 2: Dev [IN PROGRESS]
### Phase 3: QA [completed]
## Phase 4: Prod [inprogress]
`;
		const result = migrateLegacyPlan(planContent);

		expect(result.phases[0].status).toBe('complete');
		expect(result.phases[1].status).toBe('in_progress');
		expect(result.phases[2].status).toBe('complete');
		expect(result.phases[3].status).toBe('in_progress');
	});

	test('Multiple dependencies in one task', () => {
		const planContent = `
### Phase 1
- [ ] 1.1: Task A [SMALL]
- [ ] 1.2: Task B [SMALL]
- [ ] 1.3: Task C (depends: 1.1, 1.2) [MEDIUM]
`;
		const result = migrateLegacyPlan(planContent);

		expect(result.phases[0].tasks[2].depends).toEqual(['1.1', '1.2']);
	});

	test('Custom swarm ID parameter', () => {
		const planContent = `
## Phase 1
- [ ] 1.1: Task [SMALL]
`;
		const result = migrateLegacyPlan(planContent, 'custom-swarm-123');

		expect(result.swarm).toBe('custom-swarm-123');
	});

	test('Extract swarm from Swarm: line in content', () => {
		const planContent = `
Swarm: my-project-swarm
## Phase 1
- [ ] 1.1: Task [SMALL]
`;
		const result = migrateLegacyPlan(planContent);

		expect(result.swarm).toBe('my-project-swarm');
	});
});

describe('migrateLegacyPlan - Adversarial', () => {
	test('handles very long lines without catastrophic backtracking', () => {
		const start = Date.now();
		const longLine = '- [ ] ' + 'A'.repeat(10000) + ' [SMALL]';
		const plan = `## Phase 1\n${longLine}`;
		migrateLegacyPlan(plan);
		expect(Date.now() - start).toBeLessThan(100);
	});

	test('handles long phase headers without catastrophic backtracking', () => {
		const start = Date.now();
		const longPhaseName = 'X'.repeat(10000);
		const plan = `### Phase 1: ${longPhaseName}\n- [ ] 1.1: Task [SMALL]`;
		migrateLegacyPlan(plan);
		expect(Date.now() - start).toBeLessThan(100);
	});

	test('handles long numbered list tasks without catastrophic backtracking', () => {
		const start = Date.now();
		const longTask = '1. ' + 'B'.repeat(10000) + ' [MEDIUM]';
		const plan = `## Phase 1\n${longTask}`;
		migrateLegacyPlan(plan);
		expect(Date.now() - start).toBeLessThan(100);
	});

	test('handles very long dependency lists without catastrophic backtracking', () => {
		const start = Date.now();
		const deps = Array.from({ length: 1000 }, (_, i) => `1.${i}`).join(', ');
		const task = `- [ ] 1.1: Task with many deps (depends: ${deps}) [SMALL]`;
		const plan = `## Phase 1\n${task}`;
		migrateLegacyPlan(plan);
		expect(Date.now() - start).toBeLessThan(100);
	});

	test('handles special characters in task descriptions without breaking JSON output', () => {
		const specialChars =
			'Test with "quotes" and \'apostrophes\' and \\backslashes\\';
		const plan = `
## Phase 1
- [ ] 1.1: ${specialChars} [SMALL]
- [ ] 1.2: Test with {braces} and [brackets] and <angles> [MEDIUM]
- [ ] 1.3: Test with &ampersand* and equals=value [LARGE]
`;
		const result = migrateLegacyPlan(plan);

		// Verify the result can be serialized to valid JSON
		const json = JSON.stringify(result);
		expect(json).toBeDefined();
		expect(() => JSON.parse(json)).not.toThrow();

		// Verify descriptions are preserved correctly
		expect(result.phases[0].tasks[0].description).toContain('quotes');
		expect(result.phases[0].tasks[1].description).toContain('braces');
		expect(result.phases[0].tasks[2].description).toContain('ampersand');
	});

	test('handles injection attempt with template literal syntax in description', () => {
		const maliciousDesc = '${process.exit(1)} - XSS attempt';
		const plan = `
## Phase 1
- [ ] 1.1: ${maliciousDesc} [SMALL]
`;
		const result = migrateLegacyPlan(plan);

		// The description should be treated as a literal string, not evaluated
		expect(result.phases[0].tasks[0].description).toContain(
			'${process.exit(1)}',
		);

		// Verify JSON serialization is safe
		const json = JSON.stringify(result);
		expect(json).toBeDefined();
	});

	test('detects ID collision when plan has both explicit and auto-generated tasks', () => {
		// This tests if a plan with BOTH "- [ ] 1.1: Task" AND "- [ ] Task" (no-prefix)
		// could produce duplicate IDs (though the implementation overwrites)
		const plan = `
## Phase 1
- [ ] 1.1: First task with explicit ID [SMALL]
- [ ] Second task without prefix - should get 1.2 [MEDIUM]
`;
		const result = migrateLegacyPlan(plan);

		expect(result.phases[0].tasks).toHaveLength(2);

		// The no-prefix task should get auto-generated ID 1.2, not 1.1
		const taskIds = result.phases[0].tasks.map((t) => t.id);
		expect(taskIds).toContain('1.1');
		expect(taskIds).toContain('1.2');
	});

	test('handles phase overflow with 100+ phase headers', () => {
		const start = Date.now();
		const phases = Array.from(
			{ length: 100 },
			(_, i) =>
				`### Phase ${i + 1}: Test Phase\n- [ ] ${i + 1}.1: Task [SMALL]`,
		).join('\n');
		const plan = phases;

		const result = migrateLegacyPlan(plan);

		// Should complete in reasonable time
		expect(Date.now() - start).toBeLessThan(1000);

		// Should have all phases
		expect(result.phases).toHaveLength(100);

		// Verify phase IDs are correct
		expect(result.phases[0].id).toBe(1);
		expect(result.phases[99].id).toBe(100);
	});

	test('handles malformed numbered list - "1.1. Not actually a number" should NOT match', () => {
		const plan = `
## Phase 1
1.1. This should NOT match as a numbered task
1. This SHOULD match as a numbered task
`;
		const result = migrateLegacyPlan(plan);

		// Only the valid "1. Task" should match
		expect(result.phases[0].tasks).toHaveLength(1);
		expect(result.phases[0].tasks[0].id).toBe('1.1');
		expect(result.phases[0].tasks[0].description).toBe(
			'This SHOULD match as a numbered task',
		);
	});

	test('handles numbered list with non-numeric prefix', () => {
		const plan = `
## Phase 1
A. This should NOT match - not a number
1. This SHOULD match - it is a number
`;
		const result = migrateLegacyPlan(plan);

		// Only the valid "1. Task" should match
		expect(result.phases[0].tasks).toHaveLength(1);
		expect(result.phases[0].tasks[0].id).toBe('1.1');
	});

	test('handles Unicode and emoji in descriptions without throwing', () => {
		const plan = `
## Phase 1
- [ ] 1.1: Task with emoji 🔥 and Unicode café, 日本語, العربية [SMALL]
- [ ] 1.2: Special chars: © ® ™ € £ ¥ ¢ [MEDIUM]
- [ ] 1.3: Math symbols: ∑ ∫ √ ∞ ≠ ≤ ≥ [LARGE]
- [ ] 1.4: Arrow symbols: ← → ↑ ↓ ↔ [SMALL]
`;
		const result = migrateLegacyPlan(plan);

		expect(result.phases[0].tasks).toHaveLength(4);
		expect(result.phases[0].tasks[0].description).toContain('🔥');
		expect(result.phases[0].tasks[0].description).toContain('café');
		expect(result.phases[0].tasks[0].description).toContain('日本語');
		expect(result.phases[0].tasks[1].description).toContain('©');
		expect(result.phases[0].tasks[2].description).toContain('∑');
		expect(result.phases[0].tasks[3].description).toContain('←');

		// Verify JSON serialization works with Unicode
		const json = JSON.stringify(result);
		expect(json).toBeDefined();
	});

	test('handles null bytes and invalid UTF-8 in task descriptions gracefully', () => {
		const plan = `
## Phase 1
- [ ] 1.1: Normal task [SMALL]
- [ ] 1.2: Task with null byte \0 - may cause issues [MEDIUM]
`;
		// This should not crash
		const result = migrateLegacyPlan(plan);

		expect(result.phases[0].tasks).toHaveLength(2);
	});

	test('handles circular dependency references without infinite loop', () => {
		const start = Date.now();
		const plan = `
## Phase 1
- [ ] 1.1: First task (depends: 1.3) [SMALL]
- [ ] 1.2: Second task (depends: 1.1) [MEDIUM]
- [ ] 1.3: Third task (depends: 1.2) [LARGE]
`;
		// Should complete without infinite loop
		const result = migrateLegacyPlan(plan);

		expect(Date.now() - start).toBeLessThan(100);
		expect(result.phases[0].tasks).toHaveLength(3);

		// Dependencies should be stored even if circular
		expect(result.phases[0].tasks[0].depends).toEqual(['1.3']);
		expect(result.phases[0].tasks[1].depends).toEqual(['1.1']);
		expect(result.phases[0].tasks[2].depends).toEqual(['1.2']);
	});

	test('handles self-referencing dependency without infinite loop', () => {
		const start = Date.now();
		const plan = `
## Phase 1
- [ ] 1.1: Task that depends on itself (depends: 1.1) [SMALL]
`;
		// Should complete without infinite loop
		const result = migrateLegacyPlan(plan);

		expect(Date.now() - start).toBeLessThan(100);
		expect(result.phases[0].tasks[0].depends).toEqual(['1.1']);
	});

	test('handles extremely long phase names with special characters', () => {
		const start = Date.now();
		const longName =
			'Phase with special chars: #$%^&*()_+-=[]{}|;:\'",.<>?/ ~`' +
			'X'.repeat(1000);
		const plan = `### Phase 1: ${longName}\n- [ ] 1.1: Task [SMALL]`;

		const result = migrateLegacyPlan(plan);

		expect(Date.now() - start).toBeLessThan(100);
		expect(result.phases[0].name).toContain('special chars');
	});

	test('handles tasks with empty dependencies', () => {
		const plan = `
## Phase 1
- [ ] 1.1: Task with empty deps (depends: ) [SMALL]
- [ ] 1.2: Normal task [MEDIUM]
`;
		const result = migrateLegacyPlan(plan);

		// Empty dependency creates array with empty string (implementation behavior)
		expect(result.phases[0].tasks[0].depends).toEqual(['']);
		expect(result.phases[0].tasks[1].depends).toEqual([]);
	});

	test('handles malformed checkbox states', () => {
		const plan = `
## Phase 1
- [INVALID] 1.1: Task with invalid checkbox [SMALL]
- [ ] 1.2: Normal pending task [MEDIUM]
- [x] 1.3: Normal completed task [SMALL]
`;
		const result = migrateLegacyPlan(plan);

		// Invalid checkbox should default to pending
		expect(result.phases[0].tasks[0].status).toBe('pending');
		expect(result.phases[0].tasks[1].status).toBe('pending');
		expect(result.phases[0].tasks[2].status).toBe('completed');
	});

	test('handles invalid size values', () => {
		const plan = `
## Phase 1
- [ ] 1.1: Task with invalid size [HUGE]
- [ ] 1.2: Task with another invalid size [TINY]
- [ ] 1.3: Task with no size
`;
		const result = migrateLegacyPlan(plan);

		// Invalid sizes should default to 'small'
		expect(result.phases[0].tasks[0].size).toBe('small');
		expect(result.phases[0].tasks[1].size).toBe('small');
		expect(result.phases[0].tasks[2].size).toBe('small');
	});

	test('handles tasks with multiple [brackets] in description', () => {
		const plan = `
## Phase 1
- [ ] 1.1: Task with [multiple] [brackets] in description [SMALL]
- [ ] 1.2: Task with nested [brackets [inside]] [MEDIUM]
`;
		const result = migrateLegacyPlan(plan);

		// Should correctly parse the first [SMALL] as size, include others in description
		expect(result.phases[0].tasks[0].description).toContain('[multiple]');
		expect(result.phases[0].tasks[0].description).toContain('[brackets]');
		expect(result.phases[0].tasks[0].size).toBe('small');
	});
});
