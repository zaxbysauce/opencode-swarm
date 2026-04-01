import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

// Test: Verify stale ROLE-RELEVANCE TAGGING blocks are absent from agent files
describe('ROLE-RELEVANCE TAGGING removal', () => {
	const agentFiles = [
		'architect.ts',
		'designer.ts',
		'docs.ts',
		'test-engineer.ts',
		'explorer.ts',
		'sme.ts',
		'reviewer.ts',
		'critic.ts',
		'coder.ts',
	];

	const agentsPath = join(__dirname, '../src/agents');

	agentFiles.forEach((agentFile) => {
		it(`should not have ROLE-RELEVANCE TAGGING block in ${agentFile}`, () => {
			const content = readFileSync(join(agentsPath, agentFile), 'utf-8');
			expect(content).not.toContain('ROLE-RELEVANCE TAGGING');
		});

		it(`should not have stale tag examples in ${agentFile}`, () => {
			const content = readFileSync(join(agentsPath, agentFile), 'utf-8');
			const examples = content.match(/\[FOR:.*?\].*?"/g);
			expect(examples).toBeNull();
		});

		it(`should not have v6.19/v6.20 role-filtering note in ${agentFile}`, () => {
			const content = readFileSync(join(agentsPath, agentFile), 'utf-8');
			expect(content).not.toContain('v6.20 will use for context filtering');
			expect(content).not.toContain('informational in v6.19');
		});

		it(`should not have stale role-target prefixes in ${agentFile}`, () => {
			const content = readFileSync(join(agentsPath, agentFile), 'utf-8');
			expect(content).not.toContain('[FOR: reviewer, test_engineer]');
			expect(content).not.toContain('[FOR: architect]');
			expect(content).not.toContain('[FOR: ALL]');
		});

		it(`should not have the standard tagging example strings in ${agentFile}`, () => {
			const content = readFileSync(join(agentsPath, agentFile), 'utf-8');

			expect(content).not.toContain('Added validation — needs safety check');
			expect(content).not.toContain(
				'Research: Tree-sitter supports TypeScript AST',
			);
			expect(content).not.toContain('Breaking change: StateManager renamed');
		});
	});

	it('should have exactly 9 agent files checked', () => {
		expect(agentFiles.length).toBe(9);
	});
});
