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
export declare const skills: SkillDefinition[];
export declare const AGENT_OVERLAYS: Record<string, AgentOverlay[]>;
/**
 * Get skill by ID
 */
export declare function getSkill(id: string): SkillDefinition | undefined;
/**
 * Get agent overlay for a skill
 */
export declare function getAgentOverlay(skillId: string, agent: string): AgentOverlay | undefined;
/**
 * Resolve effective prompt for an agent on a skill
 */
export declare function resolveAgentPrompt(skillId: string, agent: string, defaultPrompt: string): string;
