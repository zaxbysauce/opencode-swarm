import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

const CODER_PROMPT_PATH = join(process.cwd(), 'src/agents/coder.ts');
const coderPromptContent = readFileSync(CODER_PROMPT_PATH, 'utf-8');

describe('Task 3.1: PRE-SUBMIT CHECKS in coder prompt', () => {
	describe('PRE-SUBMIT CHECKS section structure', () => {
		it('PRE-SUBMIT CHECKS section exists before SELF-AUDIT', () => {
			const preSubmitIndex = coderPromptContent.indexOf('## PRE-SUBMIT CHECKS');
			const selfAuditIndex = coderPromptContent.indexOf(
				'SELF-AUDIT (run before marking any task complete)',
			);

			expect(preSubmitIndex).toBeGreaterThan(0);
			expect(selfAuditIndex).toBeGreaterThan(0);
			expect(preSubmitIndex).toBeLessThan(selfAuditIndex);
		});

		it('TODO/FIXME SCAN check is defined', () => {
			expect(coderPromptContent).toContain('CHECK 1: TODO/FIXME SCAN');
			expect(coderPromptContent).toContain('TODO');
			expect(coderPromptContent).toContain('FIXME');
			expect(coderPromptContent).toContain('HACK');
			expect(coderPromptContent).toContain('XXX');
			expect(coderPromptContent).toContain('PLACEHOLDER');
			expect(coderPromptContent).toContain('STUB');
		});

		it('MECHANICAL COMPLETENESS check is defined', () => {
			expect(coderPromptContent).toContain('CHECK 2: MECHANICAL COMPLETENESS');
			expect(coderPromptContent).toContain('return statement');
			expect(coderPromptContent).toContain('error path');
			expect(coderPromptContent).toContain('unused imports');
			expect(coderPromptContent).toContain('unreachable code');
		});

		it('CONSOLE/DEBUG CLEANUP check is defined', () => {
			expect(coderPromptContent).toContain('CHECK 3: CONSOLE/DEBUG CLEANUP');
			expect(coderPromptContent).toContain('console.log');
			expect(coderPromptContent).toContain('console.debug');
			expect(coderPromptContent).toContain('debugger');
		});
	});

	describe('Exception handling', () => {
		it('Future-task TODO exception is stated', () => {
			expect(coderPromptContent).toContain(
				'Exception: TODOs that reference a future task ID from the plan are acceptable',
			);
			expect(coderPromptContent).toContain('TODO(Task-7)');
		});
	});

	describe('Event emission', () => {
		it('coder_presubmit_results event is defined', () => {
			expect(coderPromptContent).toContain('coder_presubmit_results');
			expect(coderPromptContent).toContain('todosResolved');
			expect(coderPromptContent).toContain('stubsCompleted');
			expect(coderPromptContent).toContain('debugRemoved');
			expect(coderPromptContent).toContain('status');
		});
	});

	describe('Token count requirement', () => {
		it('PRE-SUBMIT CHECKS core instructions are ≤200 tokens', () => {
			// Count tokens for the core CHECK instructions (not reporting format or event emission)
			// From CHECK 1 to just before "Report pre-submit results"
			const check1Start = coderPromptContent.indexOf(
				'CHECK 1: TODO/FIXME SCAN',
			);
			const reportStart = coderPromptContent.indexOf(
				'Report pre-submit results',
			);
			const coreChecks = coderPromptContent.slice(check1Start, reportStart);

			// Token estimation for English text: words count ≈ tokens
			const words = coreChecks.split(/\s+/).filter((w) => w.length > 0).length;
			const estimatedTokens = words;

			console.log('Core checks word count:', words);

			expect(estimatedTokens).toBeLessThanOrEqual(200);
		});
	});

	describe('Completion message format', () => {
		it('reports pre-submit results in completion message', () => {
			expect(coderPromptContent).toContain('PRE-SUBMIT:');
			expect(coderPromptContent).toContain('TODOs resolved');
			expect(coderPromptContent).toContain('stubs completed');
			expect(coderPromptContent).toContain('debug statements removed');
			expect(coderPromptContent).toContain('PRE-SUBMIT: CLEAN');
		});
	});
});
