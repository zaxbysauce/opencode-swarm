import type { ToolName } from '../tools/tool-names';
export declare const QA_AGENTS: readonly ["reviewer", "critic"];
export declare const PIPELINE_AGENTS: readonly ["explorer", "coder", "test_engineer"];
export declare const ORCHESTRATOR_NAME: "architect";
export declare const ALL_SUBAGENT_NAMES: readonly ["sme", "docs", "designer", "reviewer", "critic", "explorer", "coder", "test_engineer"];
export declare const ALL_AGENT_NAMES: readonly ["architect", "sme", "docs", "designer", "reviewer", "critic", "explorer", "coder", "test_engineer"];
export type QAAgentName = (typeof QA_AGENTS)[number];
export type PipelineAgentName = (typeof PIPELINE_AGENTS)[number];
export type AgentName = (typeof ALL_AGENT_NAMES)[number];
export declare const AGENT_TOOL_MAP: Record<AgentName, ToolName[]>;
export declare const DEFAULT_MODELS: Record<string, string>;
export declare function isQAAgent(name: string): name is QAAgentName;
export declare function isSubagent(name: string): boolean;
import type { ScoringConfig } from './schema';
export declare const DEFAULT_SCORING_CONFIG: ScoringConfig;
/**
 * Resolve scoring configuration by deep-merging user config with defaults.
 * Missing scoring block → use defaults; partial weights → merge with defaults.
 *
 * @param userConfig - Optional user-provided scoring configuration
 * @returns The effective scoring configuration with all defaults applied
 */
export declare function resolveScoringConfig(userConfig?: ScoringConfig): ScoringConfig;
