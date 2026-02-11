/**
 * Guardrails Hook Module
 *
 * Circuit breaker for runaway LLM agents. Monitors tool usage via OpenCode Plugin API hooks
 * and implements two-layer protection:
 * - Layer 1 (Soft Warning @ warning_threshold): Sets warning flag for messagesTransform to inject warning
 * - Layer 2 (Hard Block @ 100%): Throws error in toolBefore to block further calls, injects STOP message
 */

import {
	type GuardrailsConfig,
	resolveGuardrailsConfig,
} from '../config/schema';
import { ensureAgentSession, getAgentSession, swarmState } from '../state';
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
			// Ensure session exists — uses activeAgent map as fallback for agent name
			const agentName = swarmState.activeAgent.get(input.sessionID);
			const session = ensureAgentSession(input.sessionID, agentName);

			// Resolve per-agent config using profile overrides
			const agentConfig = resolveGuardrailsConfig(config, session.agentName);

			// Check if hard limit was already hit
			if (session.hardLimitHit) {
				throw new Error(
					'🛑 CIRCUIT BREAKER: Agent blocked. Hard limit was previously triggered. Stop making tool calls and return your progress summary.',
				);
			}

			// Increment tool call count
			session.toolCallCount++;

			// Hash the tool args
			const hash = hashArgs(output.args);

			// Push to circular buffer (max 20)
			session.recentToolCalls.push({
				tool: input.tool,
				argsHash: hash,
				timestamp: Date.now(),
			});
			if (session.recentToolCalls.length > 20) {
				session.recentToolCalls.shift();
			}

			// Count consecutive repetitions from the end
			let repetitionCount = 0;
			if (session.recentToolCalls.length > 0) {
				const lastEntry =
					session.recentToolCalls[session.recentToolCalls.length - 1];
				for (let i = session.recentToolCalls.length - 1; i >= 0; i--) {
					const entry = session.recentToolCalls[i];
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
			const elapsedMinutes = (Date.now() - session.startTime) / 60000;

			// Check HARD limits (any one triggers circuit breaker)
			if (
				agentConfig.max_tool_calls > 0 &&
				session.toolCallCount >= agentConfig.max_tool_calls
			) {
				session.hardLimitHit = true;
				warn('Circuit breaker: tool call limit hit', {
					sessionID: input.sessionID,
					agentName: session.agentName,
					resolvedMaxCalls: agentConfig.max_tool_calls,
					currentCalls: session.toolCallCount,
				});
				throw new Error(
					`🛑 LIMIT REACHED: Tool calls exhausted (${session.toolCallCount}/${agentConfig.max_tool_calls}). Finish the current operation and return your progress summary.`,
				);
			}

			if (
				agentConfig.max_duration_minutes > 0 &&
				elapsedMinutes >= agentConfig.max_duration_minutes
			) {
				session.hardLimitHit = true;
				warn('Circuit breaker: duration limit hit', {
					sessionID: input.sessionID,
					agentName: session.agentName,
					resolvedMaxMinutes: agentConfig.max_duration_minutes,
					elapsedMinutes: Math.floor(elapsedMinutes),
				});
				throw new Error(
					`🛑 LIMIT REACHED: Duration exhausted (${Math.floor(elapsedMinutes)}/${agentConfig.max_duration_minutes} min). Finish the current operation and return your progress summary.`,
				);
			}

			if (repetitionCount >= agentConfig.max_repetitions) {
				session.hardLimitHit = true;
				throw new Error(
					`🛑 LIMIT REACHED: Repeated the same tool call ${repetitionCount} times. This suggests a loop. Return your progress summary.`,
				);
			}

			if (session.consecutiveErrors >= agentConfig.max_consecutive_errors) {
				session.hardLimitHit = true;
				throw new Error(
					`🛑 LIMIT REACHED: ${session.consecutiveErrors} consecutive tool errors detected. Return your progress summary with details of what went wrong.`,
				);
			}

			// Check IDLE timeout — detects agents stuck without successful tool calls
			const idleMinutes = (Date.now() - session.lastSuccessTime) / 60000;
			if (idleMinutes >= agentConfig.idle_timeout_minutes) {
				session.hardLimitHit = true;
				warn('Circuit breaker: idle timeout hit', {
					sessionID: input.sessionID,
					agentName: session.agentName,
					idleTimeoutMinutes: agentConfig.idle_timeout_minutes,
					idleMinutes: Math.floor(idleMinutes),
				});
				throw new Error(
					`🛑 LIMIT REACHED: No successful tool call for ${Math.floor(idleMinutes)} minutes (idle timeout: ${agentConfig.idle_timeout_minutes} min). This suggests the agent may be stuck. Return your progress summary.`,
				);
			}

			// Check SOFT limits (only if warning not already issued)
			if (!session.warningIssued) {
				const toolPct =
					agentConfig.max_tool_calls > 0
						? session.toolCallCount / agentConfig.max_tool_calls
						: 0;
				const durationPct =
					agentConfig.max_duration_minutes > 0
						? elapsedMinutes / agentConfig.max_duration_minutes
						: 0;
				const repPct = repetitionCount / agentConfig.max_repetitions;
				const errorPct =
					session.consecutiveErrors / agentConfig.max_consecutive_errors;

				const reasons: string[] = [];
				if (
					agentConfig.max_tool_calls > 0 &&
					toolPct >= agentConfig.warning_threshold
				) {
					reasons.push(
						`tool calls ${session.toolCallCount}/${agentConfig.max_tool_calls}`,
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
						`errors ${session.consecutiveErrors}/${agentConfig.max_consecutive_errors}`,
					);
				}

				if (reasons.length > 0) {
					session.warningIssued = true;
					session.warningReason = reasons.join(', ');
				}
			}
		},

		/**
		 * Tracks tool execution results and updates consecutive error count
		 */
		toolAfter: async (input, output) => {
			const session = getAgentSession(input.sessionID);
			if (!session) {
				return;
			}

			// Check if tool output indicates an error
			// Only null/undefined output counts as an error — substring matching causes false positives
			const hasError = output.output === null || output.output === undefined;

			if (hasError) {
				session.consecutiveErrors++;
			} else {
				session.consecutiveErrors = 0;
				session.lastSuccessTime = Date.now();
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

			// Try to determine sessionID from the last message
			let sessionId: string | undefined = lastMessage.info?.sessionID;

			// If no sessionID in last message, try to find any session with warning/hard limit
			if (!sessionId) {
				for (const [id, session] of swarmState.agentSessions) {
					if (session.warningIssued || session.hardLimitHit) {
						sessionId = id;
						break;
					}
				}
			}

			if (!sessionId) {
				return;
			}

			const session = getAgentSession(sessionId);
			if (!session || (!session.warningIssued && !session.hardLimitHit)) {
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
			if (session.hardLimitHit) {
				textPart.text =
					'[🛑 LIMIT REACHED: Your resource budget is exhausted. Do not make additional tool calls. Return a summary of your progress and any remaining work.]\n\n' +
					textPart.text;
			} else if (session.warningIssued) {
				const reasonSuffix = session.warningReason
					? ` (${session.warningReason})`
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
