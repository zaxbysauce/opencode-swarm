/**
 * Guardrails Hook Module
 *
 * Circuit breaker for runaway LLM agents. Monitors tool usage via OpenCode Plugin API hooks
 * and implements two-layer protection:
 * - Layer 1 (Soft Warning @ warning_threshold): Sets warning flag for messagesTransform to inject warning
 * - Layer 2 (Hard Block @ 100%): Throws error in toolBefore to block further calls, injects STOP message
 */

import * as path from 'node:path';
import { ORCHESTRATOR_NAME } from '../config/constants';
import {
	type GuardrailsConfig,
	resolveGuardrailsConfig,
	stripKnownSwarmPrefix,
} from '../config/schema';
import { loadPlan } from '../plan/manager';
import {
	beginInvocation,
	ensureAgentSession,
	getActiveWindow,
	swarmState,
} from '../state';
import { warn } from '../utils';
import { extractCurrentPhaseFromPlan } from './extractors';

/**
 * Extracts phase number from a phase string like "Phase 3: Implementation"
 */
function extractPhaseNumber(phaseString: string | null): number {
	if (!phaseString) return 1;
	const match = phaseString.match(/^Phase (\d+):/);
	return match ? parseInt(match[1], 10) : 1;
}

/**
 * Detects if a tool is a write-class tool that modifies file contents
 */
function isWriteTool(toolName: string): boolean {
	// Strip namespace prefix (e.g., "opencode:write" -> "write")
	const normalized = toolName.replace(/^[^:]+[:.]/, '');
	const writeTools = [
		'write',
		'edit',
		'patch',
		'apply_patch',
		'create_file',
		'insert',
		'replace',
	];
	return writeTools.includes(normalized);
}

/**
 * Detects if the current session is controlled by the architect (orchestrator)
 */
function isArchitect(sessionId: string): boolean {
	// Check activeAgent map
	const activeAgent = swarmState.activeAgent.get(sessionId);
	if (activeAgent) {
		const stripped = stripKnownSwarmPrefix(activeAgent);
		if (stripped === ORCHESTRATOR_NAME) {
			return true;
		}
	}

	// Check agentSessions
	const session = swarmState.agentSessions.get(sessionId);
	if (session) {
		const stripped = stripKnownSwarmPrefix(session.agentName);
		if (stripped === ORCHESTRATOR_NAME) {
			return true;
		}
	}

	return false;
}

/**
 * Detects if a file path is outside the .swarm/ directory
 */
function isOutsideSwarmDir(filePath: string, directory: string): boolean {
	if (!filePath) return false;
	// Use path.resolve to normalize the path (handles .., ., and separators)
	const swarmDir = path.resolve(directory, '.swarm');
	const resolved = path.resolve(directory, filePath);
	// Check if resolved path is inside .swarm/ directory
	const relative = path.relative(swarmDir, resolved);
	// If relative path starts with '..', it's outside .swarm/
	return relative.startsWith('..') || path.isAbsolute(relative);
}

/**
 * v6.14: Detects if a file path is source code (not docs, config, or metadata).
 * Used to gate self-coding detection so that architect edits to README.md,
 * package.json, .github/, CHANGELOG.md etc. don't trigger false positives.
 */
function isSourceCodePath(filePath: string): boolean {
	if (!filePath) return false;
	// Normalize separators for cross-platform matching
	const normalized = filePath.replace(/\\/g, '/');
	// Paths that are NOT source code (docs, config, metadata, CI)
	const nonSourcePatterns = [
		/^README(\..+)?$/i,
		/\/README(\..+)?$/i,
		/^CHANGELOG(\..+)?$/i,
		/\/CHANGELOG(\..+)?$/i,
		/^package\.json$/,
		/\/package\.json$/,
		/^\.github\//,
		/\/\.github\//,
		/^docs\//,
		/\/docs\//,
		/^\.swarm\//,
		/\/\.swarm\//,
	];
	return !nonSourcePatterns.some((pattern) => pattern.test(normalized));
}

/**
 * Detect obvious traversal segments regardless of destination file type.
 * This ensures paths like `.swarm/../../../etc/passwd` are still treated as
 * architect direct edits when they escape the .swarm boundary.
 */
function hasTraversalSegments(filePath: string): boolean {
	if (!filePath) return false;
	const normalized = filePath.replace(/\\/g, '/');
	return (
		normalized.startsWith('..') ||
		normalized.includes('/../') ||
		normalized.endsWith('/..')
	);
}

/**
 * v6.12: Detects if a tool is a Stage A automated gate tool
 */
function isGateTool(toolName: string): boolean {
	const normalized = toolName.replace(/^[^:]+[:.]/, '');
	const gateTools = [
		'diff',
		'syntax_check',
		'placeholder_scan',
		'imports',
		'lint',
		'build_check',
		'pre_check_batch',
		'secretscan',
		'sast_scan',
		'quality_budget',
	];
	return gateTools.includes(normalized);
}

/**
 * v6.12: Detects if a tool call is an agent delegation (Task tool with subagent_type)
 */
function isAgentDelegation(
	toolName: string,
	args: unknown,
): { isDelegation: boolean; targetAgent: string | null } {
	const normalized = toolName.replace(/^[^:]+[:.]/, '');
	if (normalized !== 'Task' && normalized !== 'task') {
		return { isDelegation: false, targetAgent: null };
	}

	const argsObj = args as Record<string, unknown> | undefined;
	if (!argsObj) {
		return { isDelegation: false, targetAgent: null };
	}

	const subagentType = argsObj.subagent_type;
	if (typeof subagentType === 'string') {
		return { isDelegation: true, targetAgent: subagentType };
	}

	return { isDelegation: false, targetAgent: null };
}

/**
 * v6.17 Task 9.3: Get the current task ID for a session.
 * Falls back to `${sessionId}:unknown` if currentTaskId is not set.
 */
function getCurrentTaskId(sessionId: string): string {
	const session = swarmState.agentSessions.get(sessionId);
	return session?.currentTaskId ?? `${sessionId}:unknown`;
}

/**
 * Creates guardrails hooks for circuit breaker protection
 * @param directory Working directory (from plugin init context)
 * @param config Guardrails configuration
 * @returns Tool before/after hooks and messages transform hook
 */
export function createGuardrailsHooks(
	directory: string,
	config: GuardrailsConfig,
): {
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

	// v6.12: Track input args by callID for delegation detection in toolAfter
	const inputArgsByCallID = new Map<string, unknown>();

	return {
		/**
		 * Checks guardrail limits before allowing a tool call
		 */
		toolBefore: async (input, output) => {
			// v6.12: Self-coding detection — MUST be first, before any exemptions
			// ISSUE #17 FIX: tool.execute.before fires before chat.message updates activeAgent
			// from "architect" to "coder". This causes false positives when a delegated coder
			// uses edit/write tools. The delegationActive flag (maintained by delegation-tracker.ts)
			// is deterministic and correctly indicates when a subagent is active. We check it FIRST
			// to skip self-coding detection entirely for delegated tool calls.
			const currentSession = swarmState.agentSessions.get(input.sessionID);
			if (currentSession?.delegationActive) {
				// A subagent is using this tool — not the architect
				// Skip self-coding detection entirely for this tool call
			} else if (isArchitect(input.sessionID) && isWriteTool(input.tool)) {
				const args = output.args as Record<string, unknown> | undefined;
				const targetPath =
					args?.filePath ?? args?.path ?? args?.file ?? args?.target;

				// Fallback: apply_patch / patch tools send args as a single diff string
				// Parse file paths from patch content
				if (
					!targetPath &&
					(input.tool === 'apply_patch' || input.tool === 'patch')
				) {
					const patchText = (args?.input ??
						args?.patch ??
						(Array.isArray(args?.cmd) ? args.cmd[1] : undefined)) as
						| string
						| undefined;

					if (typeof patchText === 'string') {
						// Match "*** Update File: <path>", "*** Add File: <path>", "*** Delete File: <path>"
						const patchPathPattern =
							/\*\*\*\s+(?:Update|Add|Delete)\s+File:\s*(.+)/gi;
						// Match "+++ b/<path>" (standard unified diff format)
						const diffPathPattern = /\+\+\+\s+b\/(.+)/gm;
						const paths = new Set<string>();
						let match: RegExpExecArray | null;

						while ((match = patchPathPattern.exec(patchText)) !== null) {
							paths.add(match[1].trim());
						}
						while ((match = diffPathPattern.exec(patchText)) !== null) {
							const p = match[1].trim();
							if (p !== '/dev/null') paths.add(p);
						}

						for (const p of paths) {
							if (
								isOutsideSwarmDir(p, directory) &&
								(isSourceCodePath(p) || hasTraversalSegments(p))
							) {
								const session = swarmState.agentSessions.get(input.sessionID);
								if (session) {
									session.architectWriteCount++;
									warn('Architect direct code edit detected via apply_patch', {
										tool: input.tool,
										sessionID: input.sessionID,
										targetPath: p,
										writeCount: session.architectWriteCount,
									});
								}
								break; // One increment per tool call is sufficient
							}
						}
					}
				}

				if (
					typeof targetPath === 'string' &&
					isOutsideSwarmDir(targetPath, directory) &&
					(isSourceCodePath(targetPath) || hasTraversalSegments(targetPath))
				) {
					const session = swarmState.agentSessions.get(input.sessionID);
					if (session) {
						session.architectWriteCount++;
						warn('Architect direct code edit detected', {
							tool: input.tool,
							sessionID: input.sessionID,
							targetPath,
							writeCount: session.architectWriteCount,
						});

						// v6.12 Task 2.5: Self-fix detection
						// Check if this write is happening shortly after a gate failure
						if (
							session.lastGateFailure &&
							Date.now() - session.lastGateFailure.timestamp < 120_000 // 2 minutes
						) {
							const failedGate = session.lastGateFailure.tool;
							const failedTaskId = session.lastGateFailure.taskId;
							warn('Self-fix after gate failure detected', {
								failedGate,
								failedTaskId,
								currentTool: input.tool,
								sessionID: input.sessionID,
							});
							// Set flag so messagesTransform knows to inject warning
							session.selfFixAttempted = true;
							// The warning will be injected via messagesTransform based on lastGateFailure
						}
					}
				}
			}

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

			// Ensure session exists — uses activeAgent map as fallback for agent name.
			// Fall back to ORCHESTRATOR_NAME (never undefined) to prevent seeding an
			// "unknown" identity that would inherit base guardrails (30 min limit).
			const agentName =
				swarmState.activeAgent.get(input.sessionID) ?? ORCHESTRATOR_NAME;
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

			// v6.12: Store input args for delegation detection in toolAfter
			inputArgsByCallID.set(input.callID, output.args);
		},

		/**
		 * Tracks tool execution results and updates consecutive error count
		 */
		toolAfter: async (input, output) => {
			// v6.12: Gate completion tracking (moved above window check for architect sessions)
			const session = swarmState.agentSessions.get(input.sessionID);
			if (session) {
				// Track gate tools
				if (isGateTool(input.tool)) {
					// v6.12: Use session-aware task ID to avoid cross-session collisions
					const taskId = getCurrentTaskId(input.sessionID);
					if (!session.gateLog.has(taskId)) {
						session.gateLog.set(taskId, new Set());
					}
					session.gateLog.get(taskId)?.add(input.tool);

					// Track gate failures for Task 2.5
					const outputStr =
						typeof output.output === 'string' ? output.output : '';
					const hasFailure =
						output.output === null ||
						output.output === undefined ||
						outputStr.includes('FAIL') ||
						outputStr.includes('error') ||
						outputStr.toLowerCase().includes('gates_passed: false');
					if (hasFailure) {
						session.lastGateFailure = {
							tool: input.tool,
							taskId,
							timestamp: Date.now(),
						};
					} else {
						session.lastGateFailure = null; // Clear on pass
					}
				}

				// v6.12: Track reviewer AND test_engineer delegations
				// Use input args stored from toolBefore (not output.metadata)
				const inputArgs = inputArgsByCallID.get(input.callID);
				// v6.12: Clean up to prevent memory leak
				inputArgsByCallID.delete(input.callID);
				const delegation = isAgentDelegation(input.tool, inputArgs);
				if (
					delegation.isDelegation &&
					(delegation.targetAgent === 'reviewer' ||
						delegation.targetAgent === 'test_engineer')
				) {
					// v6.12: Get current phase from plan
					let currentPhase = 1; // Default to phase 1
					try {
						const plan = await loadPlan(directory);
						if (plan) {
							const phaseString = extractCurrentPhaseFromPlan(plan);
							currentPhase = extractPhaseNumber(phaseString);
						}
					} catch {
						// Use default phase 1 if plan loading fails
					}
					const count = session.reviewerCallCount.get(currentPhase) ?? 0;
					session.reviewerCallCount.set(currentPhase, count + 1);
				}

				// v6.17 Task 9.3: Track currentTaskId when coder delegation completes
				// Sync currentTaskId from lastCoderDelegationTaskId so gate tracking is per-task
				if (
					delegation.isDelegation &&
					delegation.targetAgent === 'coder' &&
					session.lastCoderDelegationTaskId
				) {
					session.currentTaskId = session.lastCoderDelegationTaskId;
					// Reset partial gate warning for this task so re-delegation gets fresh warning
					session.partialGateWarningsIssuedForTask?.delete(
						session.currentTaskId,
					);
				}
			}

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

			// v6.12: Self-coding warning injection
			const session = swarmState.agentSessions.get(sessionId);
			const activeAgent = swarmState.activeAgent.get(sessionId);
			const isArchitectSession = activeAgent
				? stripKnownSwarmPrefix(activeAgent) === ORCHESTRATOR_NAME
				: session
					? stripKnownSwarmPrefix(session.agentName) === ORCHESTRATOR_NAME
					: false;

			if (isArchitectSession && session && session.architectWriteCount > 0) {
				// Find text part and prepend warning
				const textPart = lastMessage.parts.find(
					(part): part is { type: string; text: string } =>
						part.type === 'text' && typeof part.text === 'string',
				);
				if (textPart) {
					textPart.text =
						`⚠️ SELF-CODING DETECTED: You have used ${session.architectWriteCount} write-class tool(s) directly on non-.swarm/ files.\n` +
						`Rule 1 requires ALL coding to be delegated to @coder.\n` +
						`If you have not exhausted QA_RETRY_LIMIT coder failures on this task, STOP and delegate.\n\n` +
						textPart.text;
				}
			}

			// v6.12 Task 2.5: Self-fix warning injection
			// Only warn after an actual write attempt (flag set in toolBefore)
			if (
				isArchitectSession &&
				session &&
				session.selfFixAttempted &&
				session.lastGateFailure &&
				Date.now() - session.lastGateFailure.timestamp < 120_000
			) {
				const textPart = lastMessage.parts.find(
					(part): part is { type: string; text: string } =>
						part.type === 'text' && typeof part.text === 'string',
				);
				if (textPart && !textPart.text.includes('SELF-FIX DETECTED')) {
					textPart.text =
						`⚠️ SELF-FIX DETECTED: Gate '${session.lastGateFailure.tool}' failed on task ${session.lastGateFailure.taskId}.\n` +
						`You are now using a write tool instead of delegating to @coder.\n` +
						`GATE FAILURE RESPONSE RULES require: return to coder with structured rejection.\n` +
						`Do NOT fix gate failures yourself.\n\n` +
						textPart.text;
					// Clear flag to avoid repeated warnings
					session.selfFixAttempted = false;
				}
			}

			// v6.12: Partial gate violation detection
			// Check if this is the architect session and has gate log
			const isArchitectSessionForGates = activeAgent
				? stripKnownSwarmPrefix(activeAgent) === ORCHESTRATOR_NAME
				: session
					? stripKnownSwarmPrefix(session.agentName) === ORCHESTRATOR_NAME
					: false;
			if (isArchitectSessionForGates && session) {
				// v6.12: Use session-aware task ID for gate log lookup
				const taskId = getCurrentTaskId(sessionId);
				// Only warn once per task ID (not once per session)
				if (!session.partialGateWarningsIssuedForTask.has(taskId)) {
					const gates = session.gateLog.get(taskId);
					// v6.17 Task 9.3: Warn if task has no gates logged (gates is undefined)
					// or if task has partial gates (gates exists but incomplete)
					// v6.12: Check ALL required Stage A gates (not just pre_check_batch)
					// Required gates: diff, syntax_check, placeholder_scan, lint, pre_check_batch
					// Optional gates: imports, build_check, secretscan, sast_scan, quality_budget
					const REQUIRED_GATES = [
						'diff',
						'syntax_check',
						'placeholder_scan',
						'lint',
						'pre_check_batch',
					];
					const missingGates: string[] = [];
					// If gates is undefined (no gates logged for this task), all required gates are missing
					// If gates exists, check which ones are missing
					if (!gates) {
						missingGates.push(...REQUIRED_GATES);
					} else {
						for (const gate of REQUIRED_GATES) {
							if (!gates.has(gate)) {
								missingGates.push(gate);
							}
						}
					}
					// Check if reviewer or test_engineer delegations exist (via reviewerCallCount)
					// v6.12: Check for CURRENT phase, not just any phase
					let currentPhaseForCheck = 1; // Default to phase 1
					try {
						const plan = await loadPlan(directory);
						if (plan) {
							const phaseString = extractCurrentPhaseFromPlan(plan);
							currentPhaseForCheck = extractPhaseNumber(phaseString);
						}
					} catch {
						// Use default phase 1 if plan loading fails
					}
					const hasReviewerDelegation =
						(session.reviewerCallCount.get(currentPhaseForCheck) ?? 0) > 0;
					if (missingGates.length > 0 || !hasReviewerDelegation) {
						const textPart = lastMessage.parts.find(
							(part): part is { type: string; text: string } =>
								part.type === 'text' && typeof part.text === 'string',
						);
						if (textPart && !textPart.text.includes('PARTIAL GATE VIOLATION')) {
							const missing = [...missingGates];
							if (!hasReviewerDelegation) {
								missing.push(
									'reviewer/test_engineer (no delegations this phase)',
								);
							}
							// Mark this task ID as warned
							session.partialGateWarningsIssuedForTask.add(taskId);
							textPart.text =
								`⚠️ PARTIAL GATE VIOLATION: Task may be marked complete but missing gates: [${missing.join(', ')}].\n` +
								`The QA gate is ALL steps or NONE. Revert any ✓ marks and run the missing gates.\n\n` +
								textPart.text;
						}
					}
				}
			}

			// v6.12 Task 2.3: Catastrophic zero-reviewer warning
			// Check if any completed phase has ZERO reviewer delegations
			if (
				isArchitectSessionForGates &&
				session &&
				session.catastrophicPhaseWarnings
			) {
				try {
					const plan = await loadPlan(directory);
					if (plan?.phases) {
						for (const phase of plan.phases) {
							if (phase.status === 'complete') {
								const phaseNum = phase.id;
								// Check if already warned for this phase
								if (!session.catastrophicPhaseWarnings.has(phaseNum)) {
									const reviewerCount =
										session.reviewerCallCount.get(phaseNum) ?? 0;
									if (reviewerCount === 0) {
										// Inject warning once
										session.catastrophicPhaseWarnings.add(phaseNum);
										const textPart = lastMessage.parts.find(
											(part): part is { type: string; text: string } =>
												part.type === 'text' && typeof part.text === 'string',
										);
										if (
											textPart &&
											!textPart.text.includes('CATASTROPHIC VIOLATION')
										) {
											textPart.text =
												`[CATASTROPHIC VIOLATION: Phase ${phaseNum} completed with ZERO reviewer delegations.` +
												` Every coder task requires reviewer approval. Recommend retrospective review of all Phase ${phaseNum} tasks.]\n\n` +
												textPart.text;
										}
										// Only warn once, break after first warning to avoid spam
										break;
									}
								}
							}
						}
					}
				} catch {
					// Silently skip if plan loading fails
				}
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
