import type { Plugin } from '@opencode-ai/plugin';
/**
 * OpenCode Swarm Plugin
 *
 * Architect-centric agentic swarm for code generation.
 * Hub-and-spoke architecture with:
 * - Architect as central orchestrator
 * - Dynamic SME consultation (serial)
 * - Code generation with QA review
 * - Iterative refinement with triage
 */
declare const OpenCodeSwarm: Plugin;
export default OpenCodeSwarm;
export type { AgentDefinition } from './agents';
export type { AgentName, AutomationCapabilities, AutomationConfig, AutomationMode, PipelineAgentName, PluginConfig, QAAgentName, } from './config';
