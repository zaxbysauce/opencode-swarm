/**
 * Skill definition with versioning and per-agent overlays
 */

export interface AgentOverlay {
	agent: string;
	prompt?: string;
	model?: string;
}

export interface SkillDefinition {
	id: string;
	name: string;
	description: string;
	SKILL_VERSION: number;
	basePrompt?: string;
	agents?: AgentOverlay[];
}

// Built-in skills
export const skills: SkillDefinition[] = [
	{
		id: 'default',
		name: 'Default',
		description: 'Default skill for general tasks',
		SKILL_VERSION: 1,
	},
];

// Agent overlay definitions for custom behavior
export const AGENT_OVERLAYS: Record<string, AgentOverlay[]> = {
	// Add per-agent customizations here as needed
};

/**
 * Get skill by ID
 */
export function getSkill(id: string): SkillDefinition | undefined {
	return skills.find((s) => s.id === id);
}

/**
 * Get agent overlay for a skill
 */
export function getAgentOverlay(
	skillId: string,
	agent: string,
): AgentOverlay | undefined {
	const skill = getSkill(skillId);
	return skill?.agents?.find((a) => a.agent === agent);
}

/**
 * Resolve effective prompt for an agent on a skill
 */
export function resolveAgentPrompt(
	skillId: string,
	agent: string,
	defaultPrompt: string,
): string {
	const overlay = getAgentOverlay(skillId, agent);
	return overlay?.prompt || defaultPrompt;
}
