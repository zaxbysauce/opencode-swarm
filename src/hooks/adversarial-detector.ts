import type { PluginConfig } from '../config';
import { DEFAULT_MODELS } from '../config/constants';
import { stripKnownSwarmPrefix } from '../config/schema';

// Safe property lookup — prevents prototype chain pollution
function safeGet<T>(
	obj: Record<string, T> | undefined,
	key: string,
): T | undefined {
	if (!obj || !Object.hasOwn(obj, key)) return undefined;
	return obj[key];
}

/**
 * Resolve the model for a given agent by checking config overrides,
 * swarm configurations, and falling back to defaults.
 */
export function resolveAgentModel(
	agentName: string,
	config: PluginConfig,
): string {
	const baseName = stripKnownSwarmPrefix(agentName).toLowerCase();

	// Check direct agent config override
	const agentOverride = safeGet(config.agents, baseName)?.model;
	if (agentOverride) return agentOverride;

	// Check swarm agent configs
	if (config.swarms) {
		for (const swarm of Object.values(config.swarms)) {
			const swarmModel = safeGet(swarm.agents, baseName)?.model;
			if (swarmModel) return swarmModel;
		}
	}

	// Fall back to defaults
	const defaultModel = safeGet(DEFAULT_MODELS, baseName);
	return defaultModel ?? DEFAULT_MODELS.default;
}

/**
 * Detect if two agents share the same model (adversarial pair).
 * Returns the shared model string if matched, null otherwise.
 */
export function detectAdversarialPair(
	agentA: string,
	agentB: string,
	config: PluginConfig,
): string | null {
	const modelA = resolveAgentModel(agentA, config).toLowerCase();
	const modelB = resolveAgentModel(agentB, config).toLowerCase();

	return modelA === modelB ? modelA : null;
}

/**
 * Format an adversarial warning message based on policy.
 */
export function formatAdversarialWarning(
	agentA: string,
	agentB: string,
	sharedModel: string,
	policy: string,
): string {
	if (policy === 'gate') {
		return `⚠️ GATE POLICY: Same-model adversarial pair detected. Agent ${agentA} and checker ${agentB} both use model ${sharedModel}. This requires extra scrutiny — escalate if issues are found.`;
	}
	return `⚠️ Same-model adversarial pair detected. Agent ${agentA} and checker ${agentB} both use model ${sharedModel}. Review may lack independence.`;
}
