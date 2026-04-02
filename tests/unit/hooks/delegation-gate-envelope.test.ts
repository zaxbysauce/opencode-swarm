import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
	parseDelegationEnvelope,
	validateDelegationEnvelope,
} from '../../../src/hooks/delegation-gate';
import { resetSwarmState } from '../../../src/state';

describe('delegation envelope validation', () => {
	beforeEach(() => {
		resetSwarmState();
	});

	afterEach(() => {
		resetSwarmState();
	});

	describe('validateDelegationEnvelope', () => {
		const validContext = {
			planTasks: ['1.1', '1.2', '2.1'],
			validAgents: [
				'architect',
				'coder',
				'test_engineer',
				'reviewer',
				'explorer',
			],
		};

		it('valid envelope passes validation', () => {
			const envelope = {
				taskId: '1.1',
				targetAgent: 'coder',
				action: 'implement',
				commandType: 'task',
				files: ['src/auth.ts'],
				acceptanceCriteria: ['User can login'],
				technicalContext: 'Using Express.js',
			};

			const result = validateDelegationEnvelope(envelope, validContext);

			expect(result.valid).toBe(true);
		});

		it('invalid taskId rejected', () => {
			const envelope = {
				taskId: '999.999',
				targetAgent: 'coder',
				action: 'implement',
				commandType: 'task',
				files: ['src/auth.ts'],
				acceptanceCriteria: ['User can login'],
				technicalContext: 'Using Express.js',
			};

			const result = validateDelegationEnvelope(envelope, validContext);

			expect(result.valid).toBe(false);
			expect((result as { valid: false; reason: string }).reason).toBe(
				'taskId_not_in_plan',
			);
		});

		it('taskId validation skipped when planTasks is empty', () => {
			const envelope = {
				taskId: 'any-task-id',
				targetAgent: 'coder',
				action: 'implement',
				commandType: 'task',
				files: ['src/auth.ts'],
				acceptanceCriteria: ['User can login'],
				technicalContext: 'Using Express.js',
			};

			const contextWithEmptyPlan = {
				planTasks: [],
				validAgents: ['architect', 'coder', 'test_engineer', 'reviewer'],
			};

			const result = validateDelegationEnvelope(envelope, contextWithEmptyPlan);

			expect(result.valid).toBe(true);
		});

		it('invalid targetAgent rejected', () => {
			const envelope = {
				taskId: '1.1',
				targetAgent: 'unknown_agent',
				action: 'implement',
				commandType: 'task',
				files: ['src/auth.ts'],
				acceptanceCriteria: ['User can login'],
				technicalContext: 'Using Express.js',
			};

			const result = validateDelegationEnvelope(envelope, validContext);

			expect(result.valid).toBe(false);
			expect((result as { valid: false; reason: string }).reason).toBe(
				'invalid_target_agent',
			);
		});

		it('stripKnownSwarmPrefix used for agent normalization', () => {
			const envelope = {
				taskId: '1.1',
				targetAgent: 'mega_coder',
				action: 'implement',
				commandType: 'task',
				files: ['src/auth.ts'],
				acceptanceCriteria: ['User can login'],
				technicalContext: 'Using Express.js',
			};

			const result = validateDelegationEnvelope(envelope, validContext);

			// mega_coder should be normalized to coder via stripKnownSwarmPrefix
			expect(result.valid).toBe(true);
		});

		it('prefixed agent like paid_coder normalized correctly', () => {
			const envelope = {
				taskId: '1.1',
				targetAgent: 'paid_coder',
				action: 'implement',
				commandType: 'task',
				files: ['src/auth.ts'],
				acceptanceCriteria: ['User can login'],
				technicalContext: 'Using Express.js',
			};

			const result = validateDelegationEnvelope(envelope, validContext);

			expect(result.valid).toBe(true);
		});

		it('empty files array for implement action rejected', () => {
			const envelope = {
				taskId: '1.1',
				targetAgent: 'coder',
				action: 'implement',
				commandType: 'task',
				files: [],
				acceptanceCriteria: ['User can login'],
				technicalContext: 'Using Express.js',
			};

			const result = validateDelegationEnvelope(envelope, validContext);

			expect(result.valid).toBe(false);
			expect((result as { valid: false; reason: string }).reason).toBe(
				'files_required_for_action',
			);
		});

		it('empty files array for review action rejected', () => {
			const envelope = {
				taskId: '1.1',
				targetAgent: 'reviewer',
				action: 'review',
				commandType: 'task',
				files: [],
				acceptanceCriteria: ['Code follows standards'],
				technicalContext: 'Using Express.js',
			};

			const result = validateDelegationEnvelope(envelope, validContext);

			expect(result.valid).toBe(false);
			expect((result as { valid: false; reason: string }).reason).toBe(
				'files_required_for_action',
			);
		});

		it('files allowed for other actions like query', () => {
			const envelope = {
				taskId: '1.1',
				targetAgent: 'explorer',
				action: 'query',
				commandType: 'task',
				files: [],
				acceptanceCriteria: ['Found relevant files'],
				technicalContext: 'Using Express.js',
			};

			const result = validateDelegationEnvelope(envelope, validContext);

			expect(result.valid).toBe(true);
		});

		it('empty acceptanceCriteria rejected', () => {
			const envelope = {
				taskId: '1.1',
				targetAgent: 'coder',
				action: 'implement',
				commandType: 'task',
				files: ['src/auth.ts'],
				acceptanceCriteria: [],
				technicalContext: 'Using Express.js',
			};

			const result = validateDelegationEnvelope(envelope, validContext);

			expect(result.valid).toBe(false);
			expect((result as { valid: false; reason: string }).reason).toBe(
				'acceptanceCriteria_required',
			);
		});

		it('commandType slash_command rejected', () => {
			const envelope = {
				taskId: '1.1',
				targetAgent: 'coder',
				action: 'implement',
				commandType: 'slash_command',
				files: ['src/auth.ts'],
				acceptanceCriteria: ['User can login'],
				technicalContext: 'Using Express.js',
			};

			const result = validateDelegationEnvelope(envelope, validContext);

			expect(result.valid).toBe(false);
			expect((result as { valid: false; reason: string }).reason).toBe(
				'slash_command_delegation_blocked',
			);
		});

		it('rejects non-object envelope', () => {
			const result = validateDelegationEnvelope('not an object', validContext);

			expect(result.valid).toBe(false);
			expect((result as { valid: false; reason: string }).reason).toBe(
				'envelope_not_object',
			);
		});

		it('rejects null envelope', () => {
			const result = validateDelegationEnvelope(null, validContext);

			expect(result.valid).toBe(false);
			expect((result as { valid: false; reason: string }).reason).toBe(
				'envelope_not_object',
			);
		});

		it('rejects missing required fields', () => {
			const envelope = {
				taskId: '1.1',
				// missing targetAgent, action, commandType, files, acceptanceCriteria
			};

			const result = validateDelegationEnvelope(envelope, validContext);

			expect(result.valid).toBe(false);
			expect((result as { valid: false; reason: string }).reason).toContain(
				'missing_field_',
			);
		});
	});

	describe('parseDelegationEnvelope', () => {
		it('freeform text without envelope structure returns null', () => {
			const text = 'Please implement the authentication module';

			const result = parseDelegationEnvelope(text);

			expect(result).toBeNull();
		});

		it('freeform text with less than 3 envelope fields returns null', () => {
			const text = 'taskId: 1.1\ntargetAgent: coder';

			const result = parseDelegationEnvelope(text);

			expect(result).toBeNull();
		});

		it('parses valid envelope structure', () => {
			const text = `taskId: 1.1
targetAgent: coder
action: implement
commandType: task
files: src/auth.ts, src/login.ts
acceptanceCriteria: User can login, User can logout
technicalContext: Using Express.js`;

			const result = parseDelegationEnvelope(text);

			expect(result).not.toBeNull();
			expect(result?.taskId).toBe('1.1');
			expect(result?.targetAgent).toBe('coder');
			expect(result?.action).toBe('implement');
			expect(result?.commandType).toBe('task');
			expect(result?.files).toEqual(['src/auth.ts', 'src/login.ts']);
			expect(result?.acceptanceCriteria).toEqual([
				'User can login',
				'User can logout',
			]);
			expect(result?.technicalContext).toBe('Using Express.js');
		});

		it('parses files separated by semicolon', () => {
			const text = `taskId: 1.1
targetAgent: coder
action: implement
commandType: task
files: src/a.ts; src/b.ts
acceptanceCriteria: Tests pass
technicalContext: Using Express.js`;

			const result = parseDelegationEnvelope(text);

			expect(result?.files).toEqual(['src/a.ts', 'src/b.ts']);
		});

		it('handles missing optional fields', () => {
			const text = `taskId: 1.1
targetAgent: coder
action: implement
commandType: task
files: src/auth.ts
acceptanceCriteria: User can login
technicalContext: Using Express.js`;

			const result = parseDelegationEnvelope(text);

			expect(result).not.toBeNull();
			expect(result?.technicalContext).toBe('Using Express.js');
			expect(result?.errorStrategy).toBeUndefined();
			expect(result?.platformNotes).toBeUndefined();
		});

		it('returns slash_command commandType correctly', () => {
			const text = `taskId: 1.1
targetAgent: coder
action: implement
commandType: slash_command
files: src/auth.ts
acceptanceCriteria: User can login
technicalContext: Using Express.js`;

			const result = parseDelegationEnvelope(text);

			expect(result?.commandType).toBe('slash_command');
		});

		it('handles case-insensitive field names', () => {
			const text = `TaskID: 1.1
TargetAgent: coder
ACTION: implement
CommandType: task
Files: src/auth.ts
AcceptanceCriteria: User can login
TechnicalContext: Using Express.js`;

			const result = parseDelegationEnvelope(text);

			expect(result).not.toBeNull();
			expect(result?.taskId).toBe('1.1');
			expect(result?.targetAgent).toBe('coder');
		});

		it('returns null when required fields missing', () => {
			const text = `taskId: 1.1
targetAgent: coder
files: src/auth.ts
acceptanceCriteria: User can login`;

			const result = parseDelegationEnvelope(text);

			// Missing action field
			expect(result).toBeNull();
		});
	});
});
