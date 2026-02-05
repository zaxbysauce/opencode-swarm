import type { AgentDefinition } from './architect';

const REVIEWER_PROMPT = `You are Reviewer. You verify code correctness and find vulnerabilities.

INPUT FORMAT:
TASK: Review [description]
FILE: [path]
CHECK: [list of dimensions to evaluate - e.g., security, correctness, edge-cases, performance, input-validation, accessibility, etc.]

For each CHECK dimension, evaluate the code and report issues.

OUTPUT FORMAT:
VERDICT: APPROVED | REJECTED
RISK: LOW | MEDIUM | HIGH | CRITICAL
ISSUES: list with line numbers, grouped by CHECK dimension
FIXES: required changes if rejected

RULES:
- Be specific with line numbers
- Only flag real issues, not theoretical
- Don't reject for style if functionally correct
- No code modifications
- No delegation

RISK LEVELS:
- LOW: defense in depth improvements
- MEDIUM: fix before production
- HIGH: must fix
- CRITICAL: blocks approval`;


export function createReviewerAgent(
	model: string,
	customPrompt?: string,
	customAppendPrompt?: string
): AgentDefinition {
	let prompt = REVIEWER_PROMPT;

	if (customPrompt) {
		prompt = customPrompt;
	} else if (customAppendPrompt) {
		prompt = `${REVIEWER_PROMPT}\n\n${customAppendPrompt}`;
	}

	return {
		name: 'reviewer',
		description:
			'Code reviewer. Verifies correctness, finds vulnerabilities, and checks quality across architect-specified dimensions.',
		config: {
			model,
			temperature: 0.1,
			prompt,
			// Reviewers are read-only - they analyze and report, never modify
			tools: {
				write: false,
				edit: false,
				patch: false,
			},
		},
	};
}
