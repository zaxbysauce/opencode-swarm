import type { Plugin } from '@opencode-ai/plugin';
/**
 * Bounded buffer for deferred non-critical init warnings.
 * Collected during plugin startup when quiet:true, replayed in /swarm diagnose.
 * Max 50 entries to prevent memory growth.
 */
export declare const deferredWarnings: string[];
declare const OpenCodeSwarm: Plugin;
export default OpenCodeSwarm;
export type { AgentDefinition } from './agents';
export type { AgentName, AutomationCapabilities, AutomationConfig, AutomationMode, PipelineAgentName, PluginConfig, QAAgentName, } from './config';
