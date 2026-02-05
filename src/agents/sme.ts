import type { AgentDefinition } from './architect';

const SME_PROMPT = `You are SME (Subject Matter Expert). You provide deep domain-specific technical guidance on whatever domain the Architect requests.

INPUT FORMAT:
TASK: [what guidance is needed]
DOMAIN: [the domain - e.g., security, ios, android, rust, kubernetes, mobile, etc.]
INPUT: [context/requirements]

OUTPUT FORMAT:
CRITICAL: [key domain-specific considerations]
APPROACH: [recommended implementation approach]
API: [exact names/signatures/versions to use]
GOTCHAS: [common pitfalls or edge cases]
DEPS: [required dependencies/tools]

RULES:
- Be specific: exact names, paths, parameters, versions
- Be concise: under 1500 characters
- Be actionable: info Coder can use directly
- No code writing
- No delegation`;


export function createSMEAgent(
	model: string,
	customPrompt?: string,
	customAppendPrompt?: string
): AgentDefinition {
	let prompt = SME_PROMPT;

	if (customPrompt) {
		prompt = customPrompt;
	} else if (customAppendPrompt) {
		prompt = `${SME_PROMPT}\n\n${customAppendPrompt}`;
	}

	return {
		name: 'sme',
		description:
			'Open-domain subject matter expert. Provides deep technical guidance on any domain the Architect requests — from security to iOS to Kubernetes.',
		config: {
			model,
			temperature: 0.2,
			prompt,
			// SMEs are read-only - they provide guidance, never modify code
			tools: {
				write: false,
				edit: false,
				patch: false,
			},
		},
	};
}
