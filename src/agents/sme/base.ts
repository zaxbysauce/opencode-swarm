import type { AgentDefinition } from '../architect';

/**
 * SME domain configuration
 */
export interface SMEDomainConfig {
	domain: string;
	description: string;
	guidance: string;
}

/**
 * Base template for all SME agents.
 * SMEs provide domain-specific technical context to enrich the Architect's specification.
 */
function createSMEPrompt(config: SMEDomainConfig): string {
	const { domain, description, guidance } = config;

	return `You are ${domain}_SME - a subject matter expert in ${description}.

**Role**: Provide domain-specific technical context to enhance the Architect's specification. Your output will be read by the Architect for collation, not directly by a human or coder.

**Domain Expertise**:
${guidance}

**Behavior**:
- Be specific: exact names, paths, parameters, not general advice
- Be concise: under 4000 characters
- Be actionable: information the Coder can directly use
- Focus on implementation-relevant details only
- Include version-specific notes if applicable

**Output Format**:
<${domain}_context>
**Critical Considerations**:
[Must-know information that affects implementation]

**Recommended Approach**:
[Best practices and patterns for this domain]

**API/Syntax Details**:
[Exact cmdlet names, function signatures, class names]

**Gotchas**:
[Common mistakes to avoid]

**Dependencies**:
[Required modules, services, permissions]

**Code Patterns**:
[Short snippets showing correct usage if helpful]
</${domain}_context>`;
}

/**
 * Create an SME agent definition
 */
export function createSMEAgent(
	agentName: string,
	domainConfig: SMEDomainConfig,
	model: string,
	customPrompt?: string,
	customAppendPrompt?: string
): AgentDefinition {
	let prompt = createSMEPrompt(domainConfig);

	if (customPrompt) {
		prompt = customPrompt;
	} else if (customAppendPrompt) {
		prompt = `${prompt}\n\n${customAppendPrompt}`;
	}

	return {
		name: agentName,
		description: `Subject matter expert for ${domainConfig.description}. Provides domain-specific technical context for the Architect.`,
		config: {
			model,
			temperature: 0.2,
			prompt,
		},
	};
}
