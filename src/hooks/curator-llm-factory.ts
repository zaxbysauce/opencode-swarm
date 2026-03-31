import { swarmState } from '../state.js';
import type { CuratorLLMDelegate } from './curator.js';

/**
 * Resolve the registered curator agent name for the currently active swarm.
 *
 * Works for any number of swarms — default, single named, or 5+ named swarms.
 *
 * Algorithm:
 *   1. For each registered curator name, derive its swarm prefix by stripping
 *      the known base suffix ('curator_init' or 'curator_phase'). e.g.
 *        'swarm1_curator_init' → prefix = 'swarm1_'
 *        'curator_init'        → prefix = '' (default swarm)
 *   2. Scan swarmState.activeAgent for any currently active agent. For each,
 *      find the registered curator whose prefix is a prefix of the active agent
 *      name (e.g. 'swarm1_' is a prefix of 'swarm1_architect'). Prefer the
 *      longest match to avoid the empty-prefix default swarm false-matching.
 *   3. If no active-agent match: fall back to the default-swarm curator (empty
 *      prefix) if registered, otherwise the first registered name.
 *
 * This is called lazily at delegate invocation time — not at factory creation
 * time — so the active session map is populated by the time we resolve.
 */
function resolveCuratorAgentName(
	mode: 'init' | 'phase',
): string {
	const suffix = mode === 'init' ? 'curator_init' : 'curator_phase';
	const registeredNames =
		mode === 'init'
			? swarmState.curatorInitAgentNames
			: swarmState.curatorPhaseAgentNames;

	// Fast path: only one registered (single-swarm or default-only)
	if (registeredNames.length === 1) return registeredNames[0];
	// Ultimate fallback if none registered
	if (registeredNames.length === 0) return suffix;

	// Build a map from swarm prefix → full registered agent name.
	// Prefix is the portion before the curator suffix.
	//   'swarm1_curator_init' → prefix='swarm1_', name='swarm1_curator_init'
	//   'curator_init'        → prefix='',        name='curator_init'
	const prefixMap = new Map<string, string>();
	for (const name of registeredNames) {
		const prefix = name.endsWith(suffix)
			? name.slice(0, name.length - suffix.length)
			: '';
		prefixMap.set(prefix, name);
	}

	// Scan active agent sessions and find the longest matching prefix.
	let bestPrefix = '';
	let bestName = '';
	for (const activeAgentName of swarmState.activeAgent.values()) {
		for (const [prefix, agentName] of prefixMap) {
			if (prefix && activeAgentName.startsWith(prefix)) {
				if (prefix.length > bestPrefix.length) {
					bestPrefix = prefix;
					bestName = agentName;
				}
			}
		}
		if (bestName) break; // found a named-swarm match — stop scanning
	}
	if (bestName) return bestName;

	// No named-swarm match: use default swarm curator (empty prefix) if present,
	// otherwise the first registered (preserves original single-swarm behavior).
	return prefixMap.get('') ?? registeredNames[0];
}

/**
 * Create a CuratorLLMDelegate that uses the opencode SDK to call
 * the registered curator agent in CURATOR_INIT or CURATOR_PHASE mode.
 *
 * Uses an ephemeral session (create → prompt → delete) to avoid
 * re-entrancy with the current session's message flow.
 *
 * The `mode` parameter determines which registered named agent is used:
 *   - 'init'  → curator_init  (e.g. 'curator_init' or 'swarm1_curator_init')
 *   - 'phase' → curator_phase (e.g. 'curator_phase' or 'swarm1_curator_phase')
 *
 * Agent name resolution is lazy (at delegate call time, not factory call time)
 * so multi-swarm deployments always get the curator for the currently active
 * swarm — regardless of how many swarms are configured.
 *
 * Returns undefined if swarmState.opencodeClient is not set (e.g. in unit tests).
 */
export function createCuratorLLMDelegate(
	directory: string,
	mode: 'init' | 'phase' = 'init',
): CuratorLLMDelegate | undefined {
	const client = swarmState.opencodeClient;
	if (!client) return undefined;

	return async (systemPrompt: string, userInput: string): Promise<string> => {
		let ephemeralSessionId: string | undefined;
		try {
			// 1. Create ephemeral session scoped to project directory
			const createResult = await client.session.create({
				query: { directory },
			});
			if (!createResult.data) {
				throw new Error(
					`Failed to create curator session: ${JSON.stringify(createResult.error)}`,
				);
			}
			ephemeralSessionId = createResult.data.id;

			// 2. Resolve the curator agent name for the currently active swarm.
			// This is done lazily so activeAgent reflects the running session.
			const agentName = resolveCuratorAgentName(mode);

			// 3. Prompt using the registered curator agent.
			// The system: field overrides the agent's baked-in prompt with the
			// mode-specific context assembled by runCuratorInit / runCuratorPhase.
			const promptResult = await client.session.prompt({
				path: { id: ephemeralSessionId },
				body: {
					agent: agentName,
					system: systemPrompt,
					tools: { write: false, edit: false, patch: false },
					parts: [{ type: 'text', text: userInput }],
				},
			});

			if (!promptResult.data) {
				throw new Error(
					`Curator LLM prompt failed: ${JSON.stringify(promptResult.error)}`,
				);
			}

			// 4. Extract text parts from response (filter out tool/reasoning parts)
			const textParts = promptResult.data.parts.filter(
				(p): p is typeof p & { text: string } => p.type === 'text',
			);
			return textParts.map((p) => p.text).join('\n');
		} finally {
			// 5. Best-effort cleanup — never block on delete failure
			if (ephemeralSessionId) {
				client.session
					.delete({ path: { id: ephemeralSessionId } })
					.catch(() => {});
			}
		}
	};
}
