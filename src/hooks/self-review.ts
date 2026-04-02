import { ORCHESTRATOR_NAME } from '../config/constants';
import { stripKnownSwarmPrefix } from '../config/schema';
import { swarmState } from '../state';
import { normalizeToolName } from './normalize-tool-name';

export interface SelfReviewConfig {
	enabled: boolean;
	skip_in_turbo: boolean;
}

export function createSelfReviewHook(
	config: Partial<SelfReviewConfig>,
	injectAdvisory: (sessionId: string, message: string) => void,
): {
	toolAfter: (
		input: { tool: string; sessionID: string; callID: string },
		output: { args?: Record<string, unknown>; output?: unknown },
	) => Promise<void>;
} {
	const enabled = config.enabled ?? true;
	const skipInTurbo = config.skip_in_turbo ?? true;

	return {
		toolAfter: async (input, output) => {
			if (!enabled) return;

			// Only fire for update_task_status tool
			const toolName = normalizeToolName(input.tool);
			if (toolName !== 'update_task_status') return;

			// Only fire when status is 'in_progress' (advances state to coder_delegated)
			const args = output.args as Record<string, unknown> | undefined;
			if (args?.status !== 'in_progress') return;

			const taskId =
				typeof args?.task_id === 'string' ? args.task_id : 'unknown';

			// Only inject to architect sessions
			const sessionId = input.sessionID;
			const agentName =
				swarmState.activeAgent.get(sessionId) ??
				swarmState.agentSessions.get(sessionId)?.agentName ??
				'';
			if (stripKnownSwarmPrefix(agentName) !== ORCHESTRATOR_NAME) return;

			// Check turbo mode — skip advisory when turbo is active
			if (skipInTurbo) {
				const session = swarmState.agentSessions.get(sessionId);
				if (session && session.turboMode === true) return;
			}

			const advisory = [
				`[SELF-REVIEW] Task ${taskId} is now delegated to coder.`,
				`After coder completes, review for:`,
				`  • Broken conditionals (inverted if/else, wrong comparisons)`,
				`  • Off-by-one errors (array bounds, loop indices)`,
				`  • Assumptions contradicting existing codebase patterns`,
				`  • Missing error handling (uncaught exceptions, unhandled promises)`,
				`  • Scope creep (changes outside the declared task spec)`,
				`Delegate to critic with self-review focus before marking complete.`,
			].join('\n');

			try {
				injectAdvisory(sessionId, advisory);
			} catch {
				/* non-blocking — advisory failures must never affect tool execution */
			}
		},
	};
}
