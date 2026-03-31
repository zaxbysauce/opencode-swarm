import { swarmState } from '../state.js';
import type { CuratorLLMDelegate } from './curator.js';

/**
 * Create a CuratorLLMDelegate that uses the opencode SDK to call
 * the Explorer agent in CURATOR_INIT or CURATOR_PHASE mode.
 *
 * Uses an ephemeral session (create → prompt → delete) to avoid
 * re-entrancy with the current session's message flow.
 *
 * Returns undefined if swarmState.opencodeClient is not set (e.g. in unit tests).
 */
export function createCuratorLLMDelegate(
	directory: string,
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

			// 2. Prompt with curator system override + read-only tool constraints
			const promptResult = await client.session.prompt({
				path: { id: ephemeralSessionId },
				body: {
					agent: 'explorer',
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

			// 3. Extract text parts from response (filter out tool/reasoning parts)
			const textParts = promptResult.data.parts.filter(
				(p): p is typeof p & { text: string } => p.type === 'text',
			);
			return textParts.map((p) => p.text).join('\n');
		} finally {
			// 4. Best-effort cleanup — never block on delete failure
			if (ephemeralSessionId) {
				client.session
					.delete({ path: { id: ephemeralSessionId } })
					.catch(() => {});
			}
		}
	};
}
