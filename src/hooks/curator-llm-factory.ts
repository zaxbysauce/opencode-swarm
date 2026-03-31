import { swarmState } from '../state.js';
import type { CuratorLLMDelegate } from './curator.js';

/**
 * Create a CuratorLLMDelegate that uses the opencode SDK to call
 * the registered curator agent in CURATOR_INIT or CURATOR_PHASE mode.
 *
 * Uses an ephemeral session (create → prompt → delete) to avoid
 * re-entrancy with the current session's message flow.
 *
 * The `mode` parameter determines which registered named agent is used:
 *   - 'init'  → swarmState.curatorInitAgentName  (e.g. 'curator_init' or 'local_curator_init')
 *   - 'phase' → swarmState.curatorPhaseAgentName (e.g. 'curator_phase' or 'local_curator_phase')
 *
 * The curator agents are registered with their role-specific system prompts
 * baked in at plugin init (following the same pattern as critic_sounding_board /
 * critic_drift_verifier). The `system:` field passed via session.prompt serves
 * as a runtime override — this matches how curator.ts prepares mode-specific
 * context (CURATOR_INIT vs CURATOR_PHASE prompts).
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

			// 2. Resolve the registered curator agent name for this mode.
			// The agent names include the swarm prefix when active (e.g. 'local_curator_init'),
			// so the OpenCode server can look them up correctly in the agent registry.
			// Fallback to bare name if swarmState was not populated (should not happen in prod).
			const agentName =
				mode === 'init'
					? (swarmState.curatorInitAgentName ?? 'curator_init')
					: (swarmState.curatorPhaseAgentName ?? 'curator_phase');

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
