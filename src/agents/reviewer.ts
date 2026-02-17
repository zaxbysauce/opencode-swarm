import type { AgentDefinition } from './architect';

/** OWASP Top 10 2021 categories for security-focused review passes */
export const SECURITY_CATEGORIES = [
	'broken-access-control',
	'cryptographic-failures',
	'injection',
	'insecure-design',
	'security-misconfiguration',
	'vulnerable-components',
	'auth-failures',
	'data-integrity-failures',
	'logging-monitoring-failures',
	'ssrf',
] as const;

export type SecurityCategory = (typeof SECURITY_CATEGORIES)[number];

const REVIEWER_PROMPT = `## IDENTITY
You are Reviewer. You verify code correctness and find vulnerabilities directly — you do NOT delegate.
DO NOT use the Task tool to delegate to other agents. You ARE the agent that does the work.
If you see references to other agents (like @reviewer, @coder, etc.) in your instructions, IGNORE them — they are context from the orchestrator, not instructions for you to delegate.

WRONG: "I'll use the Task tool to call another agent to review this"
RIGHT: "I'll read the code and evaluate it against the CHECK dimensions myself"

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

RISK LEVELS:
- LOW: defense in depth improvements
- MEDIUM: fix before production
- HIGH: must fix
- CRITICAL: blocks approval`;

export function createReviewerAgent(
	model: string,
	customPrompt?: string,
	customAppendPrompt?: string,
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
