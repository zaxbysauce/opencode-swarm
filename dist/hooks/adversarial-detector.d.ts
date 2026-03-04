import type { PluginConfig } from '../config';
/**
 * Resolve the model for a given agent by checking config overrides,
 * swarm configurations, and falling back to defaults.
 */
export declare function resolveAgentModel(agentName: string, config: PluginConfig): string;
/**
 * Detect if two agents share the same model (adversarial pair).
 * Returns the shared model string if matched, null otherwise.
 */
export declare function detectAdversarialPair(agentA: string, agentB: string, config: PluginConfig): string | null;
/**
 * Format an adversarial warning message based on policy.
 */
export declare function formatAdversarialWarning(agentA: string, agentB: string, sharedModel: string, policy: string): string;
/**
 * Adversarial pattern detection for semantic analysis of agent outputs.
 * Uses string/regex matching to detect sophisticated adversarial behaviors.
 */
export interface AdversarialPatternMatch {
    pattern: 'PRECEDENT_MANIPULATION' | 'SELF_REVIEW' | 'CONTENT_EXEMPTION' | 'GATE_DELEGATION_BYPASS' | 'VELOCITY_RATIONALIZATION' | 'INTER_AGENT_MANIPULATION';
    severity: 'HIGHEST' | 'HIGH' | 'MEDIUM' | 'LOW';
    matchedText: string;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}
/**
 * Detect adversarial patterns in agent output text.
 * Returns array of matches or empty array if no patterns detected.
 */
export declare function detectAdversarialPatterns(text: string): AdversarialPatternMatch[];
/**
 * Format a precedent manipulation detection event for JSONL emission.
 */
export declare function formatPrecedentManipulationEvent(match: AdversarialPatternMatch, agentName: string, phase: number): string;
