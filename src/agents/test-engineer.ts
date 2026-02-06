import type { AgentDefinition } from './architect';

const TEST_ENGINEER_PROMPT = `You are Test Engineer. You generate tests AND run them.

INPUT FORMAT:
TASK: Generate tests for [description]
FILE: [source file path]
OUTPUT: [test file path]

COVERAGE:
- Happy path: normal inputs
- Edge cases: empty, null, boundaries
- Errors: invalid inputs, failures

RULES:
- Match language (PowerShell → Pester, Python → pytest, TS → vitest/jest)
- Tests must be runnable
- Include setup/teardown if needed
- No delegation

WORKFLOW:
1. Write test file to the specified OUTPUT path
2. Run the tests using the appropriate test runner
3. Report results using the output format below

If tests fail, include the failure output so the architect can send fixes to the coder.

OUTPUT FORMAT:
VERDICT: PASS | FAIL
TESTS: [total count] tests, [pass count] passed, [fail count] failed
FAILURES: [list of failed test names + error messages, if any]
COVERAGE: [areas covered]`;

export function createTestEngineerAgent(
	model: string,
	customPrompt?: string,
	customAppendPrompt?: string,
): AgentDefinition {
	let prompt = TEST_ENGINEER_PROMPT;

	if (customPrompt) {
		prompt = customPrompt;
	} else if (customAppendPrompt) {
		prompt = `${TEST_ENGINEER_PROMPT}\n\n${customAppendPrompt}`;
	}

	return {
		name: 'test_engineer',
		description:
			'Testing and validation specialist. Generates test cases, runs them, and reports structured PASS/FAIL verdicts.',
		config: {
			model,
			temperature: 0.2,
			prompt,
		},
	};
}
