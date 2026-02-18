/**
 * Guardrails Hook Module
 *
 * Circuit breaker for runaway LLM agents. Monitors tool usage via OpenCode Plugin API hooks
 * and implements two-layer protection:
 * - Layer 1 (Soft Warning @ warning_threshold): Sets warning flag for messagesTransform to inject warning
 * - Layer 2 (Hard Block @ 100%): Throws error in toolBefore to block further calls, injects STOP message
 */

import { ORCHESTRATOR_NAME } from '../config/constants';
import {
	type GuardrailsConfig,
	resolveGuardrailsConfig,
	stripKnownSwarmPrefix,
} from '../config/schema';
import {
	beginInvocation,
	ensureAgentSession,
	getActiveWindow,
	swarmState,
} from '../state';
import { warn } from '../utils';

/**
 * Creates guardrails hooks for circuit breaker protection
 * @param config Guardrails configuration
 * @returns Tool before/after hooks and messages transform hook
 */
export function createGuardrailsHooks(config: GuardrailsConfig): {
	toolBefore: (
		input: { tool: string; sessionID: string; callID: string },
		output: { args: unknown },
	) => Promise<void>;
	toolAfter: (
		input: { tool: string; sessionID: string; callID: string },
		output: { title: string; output: string; metadata: unknown },
	) => Promise<void>;
	messagesTransform: (
		input: Record<string, never>,
		output: {
			messages?: Array<{
				info: { role: string; agent?: string; sessionID?: string };
				parts: Array<{ type: string; text?: string; [key: string]: unknown }>;
			}>;
		},
	) => Promise<void>;
} {
	// If guardrails are disabled, return no-op handlers
	if (config.enabled === false) {
		return {
			toolBefore: async () => {},
			toolAfter: async () => {},
			messagesTransform: async () => {},
		};
	}

	return {
		/**
		 * Checks guardrail limits before allowing a tool call
		 */
		toolBefore: async (input, output) => {
			// Architect is structurally exempt from guardrails — early return
			// This prevents false circuit breaker trips from complex delegation state resolution
			//
			// Check 1: Use activeAgent map (may be stale up to 60s when delegation ends)
			const rawActiveAgent = swarmState.activeAgent.get(input.sessionID);
			const strippedAgent = rawActiveAgent
				? stripKnownSwarmPrefix(rawActiveAgent)
				: undefined;
			if (strippedAgent === ORCHESTRATOR_NAME) {
				return;
			}

			// Check 2: Fallback to session state if activeAgent is missing/undefined
			const existingSession = swarmState.agentSessions.get(input.sessionID);
			if (existingSession) {
				const sessionAgent = stripKnownSwarmPrefix(existingSession.agentName);
				if (sessionAgent === ORCHESTRATOR_NAME) {
					return;
				}
			}

			// Ensure session exists — uses activeAgent map as fallback for agent name
			const agentName = swarmState.activeAgent.get(input.sessionID);
			const session = ensureAgentSession(input.sessionID, agentName);

			// SECOND exemption check: after session resolution
			const resolvedName = stripKnownSwarmPrefix(session.agentName);
			if (resolvedName === ORCHESTRATOR_NAME) {
				return;
			}

			// Resolve per-agent config using profile overrides
			const agentConfig = resolveGuardrailsConfig(config, session.agentName);

			// FOURTH exemption check: If resolved config shows 0 limits (architect-like), exempt
			if (
				agentConfig.max_duration_minutes === 0 &&
				agentConfig.max_tool_calls === 0
			) {
				return;
			}

			// Fallback: If tool call arrives before delegation-tracker fires, start window
			if (!getActiveWindow(input.sessionID)) {
				const fallbackAgent =
					swarmState.activeAgent.get(input.sessionID) ?? session.agentName;
				const stripped = stripKnownSwarmPrefix(fallbackAgent);
				if (stripped !== ORCHESTRATOR_NAME) {
					beginInvocation(input.sessionID, fallbackAgent);
				}
			}

			// Get active window (returns undefined for architect)
			const window = getActiveWindow(input.sessionID);
			if (!window) {
				// Architect or window missing → exempt
				return;
			}

			// Check if hard limit was already hit
			if (window.hardLimitHit) {
				throw new Error(
					'🛑 CIRCUIT BREAKER: Agent blocked. Hard limit was previously triggered. Stop making tool calls and return your progress summary.',
				);
			}

			// Increment tool call count
			window.toolCalls++;

			// Hash the tool args
			const hash = hashArgs(output.args);

			// Push to circular buffer (max 20)
			window.recentToolCalls.push({
				tool: input.tool,
				argsHash: hash,
				timestamp: Date.now(),
			});
			if (window.recentToolCalls.length > 20) {
				window.recentToolCalls.shift();
			}

			// Count consecutive repetitions from the end
			let repetitionCount = 0;
			if (window.recentToolCalls.length > 0) {
				const lastEntry =
					window.recentToolCalls[window.recentToolCalls.length - 1];
				for (let i = window.recentToolCalls.length - 1; i >= 0; i--) {
					const entry = window.recentToolCalls[i];
					if (
						entry.tool === lastEntry.tool &&
						entry.argsHash === lastEntry.argsHash
					) {
						repetitionCount++;
					} else {
						break;
					}
				}
			}

			// Compute elapsed minutes
			const elapsedMinutes = (Date.now() - window.startedAtMs) / 60000;

			// Check HARD limits (any one triggers circuit breaker)
			if (
				agentConfig.max_tool_calls > 0 &&
				window.toolCalls >= agentConfig.max_tool_calls
			) {
				window.hardLimitHit = true;
				warn('Circuit breaker: tool call limit hit', {
					sessionID: input.sessionID,
					agentName: window.agentName,
					invocationId: window.id,
					windowKey: `${window.agentName}:${window.id}`,
					resolvedMaxCalls: agentConfig.max_tool_calls,
					currentCalls: window.toolCalls,
				});
				throw new Error(
					`🛑 LIMIT REACHED: Tool calls exhausted (${window.toolCalls}/${agentConfig.max_tool_calls}). Finish the current operation and return your progress summary.`,
				);
			}

			if (
				agentConfig.max_duration_minutes > 0 &&
				elapsedMinutes >= agentConfig.max_duration_minutes
			) {
				window.hardLimitHit = true;
				warn('Circuit breaker: duration limit hit', {
					sessionID: input.sessionID,
					agentName: window.agentName,
					invocationId: window.id,
					windowKey: `${window.agentName}:${window.id}`,
					resolvedMaxMinutes: agentConfig.max_duration_minutes,
					elapsedMinutes: Math.floor(elapsedMinutes),
				});
				throw new Error(
					`🛑 LIMIT REACHED: Duration exhausted (${Math.floor(elapsedMinutes)}/${agentConfig.max_duration_minutes} min). Finish the current operation and return your progress summary.`,
				);
			}

			if (repetitionCount >= agentConfig.max_repetitions) {
				window.hardLimitHit = true;
				throw new Error(
					`🛑 LIMIT REACHED: Repeated the same tool call ${repetitionCount} times. This suggests a loop. Return your progress summary.`,
				);
			}

			if (window.consecutiveErrors >= agentConfig.max_consecutive_errors) {
				window.hardLimitHit = true;
				throw new Error(
					`🛑 LIMIT REACHED: ${window.consecutiveErrors} consecutive tool errors detected. Return your progress summary with details of what went wrong.`,
				);
			}

			// Check IDLE timeout — detects agents stuck without successful tool calls
			const idleMinutes = (Date.now() - window.lastSuccessTimeMs) / 60000;
			if (idleMinutes >= agentConfig.idle_timeout_minutes) {
				window.hardLimitHit = true;
				warn('Circuit breaker: idle timeout hit', {
					sessionID: input.sessionID,
					agentName: window.agentName,
					invocationId: window.id,
					windowKey: `${window.agentName}:${window.id}`,
					idleTimeoutMinutes: agentConfig.idle_timeout_minutes,
					idleMinutes: Math.floor(idleMinutes),
				});
				throw new Error(
					`🛑 LIMIT REACHED: No successful tool call for ${Math.floor(idleMinutes)} minutes (idle timeout: ${agentConfig.idle_timeout_minutes} min). This suggests the agent may be stuck. Return your progress summary.`,
				);
			}

			// Check SOFT limits (only if warning not already issued)
			if (!window.warningIssued) {
				const toolPct =
					agentConfig.max_tool_calls > 0
						? window.toolCalls / agentConfig.max_tool_calls
						: 0;
				const durationPct =
					agentConfig.max_duration_minutes > 0
						? elapsedMinutes / agentConfig.max_duration_minutes
						: 0;
				const repPct = repetitionCount / agentConfig.max_repetitions;
				const errorPct =
					window.consecutiveErrors / agentConfig.max_consecutive_errors;

				const reasons: string[] = [];
				if (
					agentConfig.max_tool_calls > 0 &&
					toolPct >= agentConfig.warning_threshold
				) {
					reasons.push(
						`tool calls ${window.toolCalls}/${agentConfig.max_tool_calls}`,
					);
				}
				if (durationPct >= agentConfig.warning_threshold) {
					reasons.push(
						`duration ${Math.floor(elapsedMinutes)}/${agentConfig.max_duration_minutes} min`,
					);
				}
				if (repPct >= agentConfig.warning_threshold) {
					reasons.push(
						`repetitions ${repetitionCount}/${agentConfig.max_repetitions}`,
					);
				}
				if (errorPct >= agentConfig.warning_threshold) {
					reasons.push(
						`errors ${window.consecutiveErrors}/${agentConfig.max_consecutive_errors}`,
					);
				}

				if (reasons.length > 0) {
					window.warningIssued = true;
					window.warningReason = reasons.join(', ');
				}
			}
		},

		/**
		 * Tracks tool execution results and updates consecutive error count
		 */
		toolAfter: async (input, output) => {
			const window = getActiveWindow(input.sessionID);
			if (!window) return; // Architect or window missing

			// Check if tool output indicates an error
			// Only null/undefined output counts as an error — substring matching causes false positives
			const hasError = output.output === null || output.output === undefined;

			if (hasError) {
				window.consecutiveErrors++;
			} else {
				window.consecutiveErrors = 0;
				window.lastSuccessTimeMs = Date.now();
			}
		},

		/**
		 * Injects warning or stop messages into the conversation
		 */
		messagesTransform: async (_input, output) => {
			const messages = output.messages;
			if (!messages || messages.length === 0) {
				return;
			}

			// Find the last message
			const lastMessage = messages[messages.length - 1];

			// Determine sessionID from the last message — if absent, skip injection
			const sessionId: string | undefined = lastMessage.info?.sessionID;
			if (!sessionId) {
				return;
			}

			// Only check the window for THIS session — never scan other sessions
			const targetWindow = getActiveWindow(sessionId);
			if (
				!targetWindow ||
				(!targetWindow.warningIssued && !targetWindow.hardLimitHit)
			) {
				return;
			}

			// Find the first text part in the last message
			const textPart = lastMessage.parts.find(
				(part): part is { type: string; text: string } =>
					part.type === 'text' && typeof part.text === 'string',
			);

			if (!textPart) {
				return;
			}

			// Prepend appropriate message
			if (targetWindow.hardLimitHit) {
				textPart.text =
					'[🛑 LIMIT REACHED: Your resource budget is exhausted. Do not make additional tool calls. Return a summary of your progress and any remaining work.]\n\n' +
					textPart.text;
			} else if (targetWindow.warningIssued) {
				const reasonSuffix = targetWindow.warningReason
					? ` (${targetWindow.warningReason})`
					: '';
				textPart.text =
					`[⚠️ APPROACHING LIMITS${reasonSuffix}: You still have capacity to finish your current step. Complete what you're working on, then return your results.]\n\n` +
					textPart.text;
			}
		},
	};
}

/**
 * Hashes tool arguments for repetition detection
 * @param args Tool arguments to hash
 * @returns Numeric hash (0 if hashing fails)
 */
export function hashArgs(args: unknown): number {
	try {
		if (typeof args !== 'object' || args === null) {
			return 0;
		}
		const sortedKeys = Object.keys(args as Record<string, unknown>).sort();
		return Number(Bun.hash(JSON.stringify(args, sortedKeys)));
	} catch {
		return 0;
	}
}
