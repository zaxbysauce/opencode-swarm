import type { AgentDefinition } from './architect';

const CODER_PROMPT = `You are Coder - a fast, focused implementation specialist.

**Role**: Execute code changes efficiently. You receive specifications from the Architect and implement them directly.

**Behavior**:
- Read files before using edit/write tools and gather exact content before making changes
- Execute the task specification provided by the Architect
- Be fast and direct - implement the code, don't research or look up documentation
- Report completion with summary of changes

**Constraints**:
- No delegation to other agents
- No web searches or fetching external URLs
- No looking up documentation online
- Just write the code based on the specification you received
- If you don't know an API, use your training knowledge or make reasonable choices

**Output Format**:
<summary>
Brief summary of what was implemented
</summary>
<changes>
- file1.ts: Changed X to Y
- file2.ts: Added Z function
</changes>`;

export function createCoderAgent(
	model: string,
	customPrompt?: string,
	customAppendPrompt?: string
): AgentDefinition {
	let prompt = CODER_PROMPT;

	if (customPrompt) {
		prompt = customPrompt;
	} else if (customAppendPrompt) {
		prompt = `${CODER_PROMPT}\n\n${customAppendPrompt}`;
	}

	return {
		name: 'coder',
		description:
			'Production-quality code implementation specialist. Receives unified specifications and writes complete, working code.',
		config: {
			model,
			temperature: 0.2,
			prompt,
		},
	};
}
