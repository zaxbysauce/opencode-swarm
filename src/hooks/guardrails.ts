/**
 * Guardrails Hook Module
 *
 * Circuit breaker for runaway LLM agents. Monitors tool usage via OpenCode Plugin API hooks
 * and implements two-layer protection:
 * - Layer 1 (Soft Warning @ warning_threshold): Sets warning flag for messagesTransform to inject warning
 * - Layer 2 (Hard Block @ 100%): Throws error in toolBefore to block further calls, injects STOP message
 */

import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import picomatch from 'picomatch';
import QuickLRU from 'quick-lru';
import { getSwarmAgents, resolveFallbackModel } from '../agents/index';
import {
	isLowCapabilityModel,
	ORCHESTRATOR_NAME,
	WRITE_TOOL_NAMES,
} from '../config/constants';
import {
	type AuthorityConfig,
	type GuardrailsConfig,
	resolveGuardrailsConfig,
	stripKnownSwarmPrefix,
} from '../config/schema';
import { classifyFile, type FileZone } from '../context/zone-classifier';
import { loadPlan } from '../plan/manager';
import {
	advanceTaskState,
	beginInvocation,
	ensureAgentSession,
	getActiveWindow,
	type InvocationWindow,
	swarmState,
} from '../state';
import { telemetry } from '../telemetry.js';
import { log, warn } from '../utils';
import { resolveAgentConflict } from './conflict-resolution';
import { extractCurrentPhaseFromPlan } from './extractors';
import { detectLoop } from './loop-detector';
import { extractModelInfo } from './model-limits';
import { normalizeToolName } from './normalize-tool-name';

/**
 * v6.12: Module-level storage for tool input args by callID.
 * Used by guardrails for delegation detection, exposed via safe accessor helpers.
 */
const storedInputArgs = new Map<string, unknown>();

/**
 * v6.33: Regex pattern for transient model errors that should trigger fallback.
 * Matches: rate limits, overloaded, timeouts, model not found, temporary failures.
 */
const TRANSIENT_MODEL_ERROR_PATTERN =
	/rate.?limit|429|503|timeout|overloaded|model.?not.?found|temporarily unavailable|server error/i;

/**
 * Retrieves stored input args for a given callID.
 * Used by other hooks (e.g., delegation-gate) to access tool input args.
 * @param callID The callID to look up
 * @returns The stored args or undefined if not found
 */
export function getStoredInputArgs(callID: string): unknown | undefined {
	return storedInputArgs.get(callID);
}

/**
 * Stores input args for a given callID.
 * Used by guardrails toolBefore hook; may be used by other hooks if needed.
 * @param callID The callID to store args under
 * @param args The tool input args to store
 */
export function setStoredInputArgs(callID: string, args: unknown): void {
	storedInputArgs.set(callID, args);
}

/**
 * Deletes stored input args for a given callID (cleanup after retrieval).
 * @param callID The callID to delete
 */
export function deleteStoredInputArgs(callID: string): void {
	storedInputArgs.delete(callID);
}

/**
 * v6.33.1: No-op work detector state.
 * Tracks tool calls since last file write per session (transient, not persisted).
 */
const toolCallsSinceLastWrite = new Map<string, number>();
const noOpWarningIssued = new Set<string>();
const consecutiveNoToolTurns = new Map<string, number>();

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
	const normalized = normalizeToolName(toolName);
	return (WRITE_TOOL_NAMES as readonly string[]).includes(normalized);
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
	const normalized = normalizeToolName(toolName);
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
	const normalized = normalizeToolName(toolName);
	if (normalized !== 'Task' && normalized !== 'task') {
		return { isDelegation: false, targetAgent: null };
	}

	const argsObj = args as Record<string, unknown> | undefined;
	if (!argsObj) {
		return { isDelegation: false, targetAgent: null };
	}

	const subagentType = argsObj.subagent_type;
	if (typeof subagentType === 'string') {
		return {
			isDelegation: true,
			targetAgent: stripKnownSwarmPrefix(subagentType),
		};
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
 * v6.21 Task 5.4: Check if a file path is within declared scope entries.
 * Handles both exact matches and directory containment.
 */
function isInDeclaredScope(
	filePath: string,
	scopeEntries: string[],
	cwd?: string,
): boolean {
	const dir = cwd ?? process.cwd();
	const resolvedFile = path.resolve(dir, filePath);
	return scopeEntries.some((scope) => {
		const resolvedScope = path.resolve(dir, scope);
		// Exact match: file IS the scope entry
		if (resolvedFile === resolvedScope) return true;
		// Directory containment: file is inside a scope directory
		const rel = path.relative(resolvedScope, resolvedFile);
		return rel.length > 0 && !rel.startsWith('..') && !path.isAbsolute(rel);
	});
}

/**
 * Creates guardrails hooks for circuit breaker protection
 * @param directory Working directory from plugin init context (required)
 * @param directoryOrConfig Guardrails configuration object (when passed as second arg, replaces legacy config param)
 * @param config Guardrails configuration (optional)
 * @returns Tool before/after hooks and messages transform hook
 */
export function createGuardrailsHooks(
	directory: string,
	directoryOrConfig?: string | GuardrailsConfig,
	config?: GuardrailsConfig,
	authorityConfig?: AuthorityConfig,
): {
	toolBefore: (
		input: { tool: string; sessionID: string; callID: string },
		output: { args: unknown },
	) => Promise<void>;
	toolAfter: (
		input: {
			tool: string;
			sessionID: string;
			callID: string;
			args?: Record<string, unknown>;
		},
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
	// Backward compatibility: detect if called with legacy signature (config only)
	let guardrailsConfig: GuardrailsConfig | undefined;

	if (directory && typeof directory === 'object' && 'enabled' in directory) {
		// Legacy call: createGuardrailsHooks(config) — directory param is the config object
		console.warn(
			'[guardrails] Legacy call without directory, falling back to process.cwd()',
		);
		guardrailsConfig = directory as GuardrailsConfig;
	} else if (
		directoryOrConfig &&
		typeof directoryOrConfig === 'object' &&
		'enabled' in directoryOrConfig
	) {
		// New signature: createGuardrailsHooks(directory, config)
		guardrailsConfig = directoryOrConfig as GuardrailsConfig;
	} else {
		// No config provided — use config param
		guardrailsConfig = config;
	}

	// Normalize directory: legacy calls pass the config object as the first arg, so fall back to cwd
	const effectiveDirectory =
		typeof directory === 'string' ? directory : process.cwd();

	// If guardrails are disabled, return no-op handlers
	if (guardrailsConfig?.enabled === false) {
		return {
			toolBefore: async () => {},
			toolAfter: async () => {},
			messagesTransform: async () => {},
		};
	}

	// Pre-compute effective authority rules once — authorityConfig is immutable after plugin init
	const precomputedAuthorityRules = buildEffectiveRules(authorityConfig);

	// TypeScript narrowing: guardrailsConfig must be defined if we reach here
	const cfg = guardrailsConfig!;
	const requiredQaGates = cfg.qa_gates?.required_tools ?? [
		'diff',
		'syntax_check',
		'placeholder_scan',
		'lint',
		'pre_check_batch',
	];
	const requireReviewerAndTestEngineer =
		cfg.qa_gates?.require_reviewer_test_engineer ?? true;

	/**
	 * Check if a bash/shell command is potentially destructive and should be blocked.
	 * Only active when block_destructive_commands is not false.
	 */
	function checkDestructiveCommand(tool: string, args: unknown): void {
		if (tool !== 'bash' && tool !== 'shell') return;
		if (cfg.block_destructive_commands === false) return;
		const toolArgs = args as Record<string, unknown> | undefined;
		const command =
			typeof toolArgs?.command === 'string' ? toolArgs.command.trim() : '';
		if (!command) return;

		// Fork bomb patterns
		if (/:\s*\(\s*\)\s*\{[^}]*\|[^}]*:/.test(command)) {
			throw new Error(
				`BLOCKED: Potentially destructive shell command detected: fork bomb pattern`,
			);
		}

		// rm -rf / rm -r -f with non-safe paths
		const rmFlagPattern = /^rm\s+(-r\s+-f|-f\s+-r|-rf|-fr)\s+(.+)$/;
		const rmMatch = rmFlagPattern.exec(command);
		if (rmMatch) {
			const targetPart = rmMatch[2].trim();
			const targets = targetPart.split(/\s+/);
			const safeTargets = /^(node_modules|\.git)$/;
			const allSafe = targets.every((t) => safeTargets.test(t));
			if (!allSafe) {
				throw new Error(
					`BLOCKED: Potentially destructive shell command: rm -rf on unsafe path(s): ${targetPart}`,
				);
			}
		}

		// git push --force or -f
		if (/^git\s+push\b.*?(--force|-f)\b/.test(command)) {
			throw new Error(
				`BLOCKED: Force push detected — git push --force is not allowed`,
			);
		}

		// git reset --hard
		if (/^git\s+reset\s+--hard/.test(command)) {
			throw new Error(
				`BLOCKED: "git reset --hard" detected — use --soft or --mixed with caution`,
			);
		}

		// git reset --mixed with target commit
		if (/^git\s+reset\s+--mixed\s+\S+/.test(command)) {
			throw new Error(
				`BLOCKED: "git reset --mixed" with a target branch/commit is not allowed`,
			);
		}

		// kubectl delete
		if (/^kubectl\s+delete\b/.test(command)) {
			throw new Error(
				`BLOCKED: "kubectl delete" detected — destructive cluster operation`,
			);
		}

		// docker system prune
		if (/^docker\s+system\s+prune\b/.test(command)) {
			throw new Error(
				`BLOCKED: "docker system prune" detected — destructive container operation`,
			);
		}

		// SQL DROP TABLE/DATABASE/SCHEMA
		if (/^\s*DROP\s+(TABLE|DATABASE|SCHEMA)\b/i.test(command)) {
			throw new Error(
				`BLOCKED: SQL DROP command detected — destructive database operation`,
			);
		}

		// SQL TRUNCATE TABLE
		if (/^\s*TRUNCATE\s+TABLE\b/i.test(command)) {
			throw new Error(
				`BLOCKED: SQL TRUNCATE command detected — destructive database operation`,
			);
		}

		// mkfs disk format
		if (/^mkfs[./]/.test(command)) {
			throw new Error(
				`BLOCKED: Disk format command (mkfs) detected — disk formatting operation`,
			);
		}
	}

	/**
	 * Checks gate limits (hard limits, idle timeout, soft warnings) for the current invocation.
	 * Extracted from toolBefore for maintainability.
	 */
	async function checkGateLimits(params: {
		sessionID: string;
		window: InvocationWindow;
		agentConfig: GuardrailsConfig;
		elapsedMinutes: number;
		repetitionCount: number;
	}): Promise<void> {
		const { sessionID, window, agentConfig, elapsedMinutes, repetitionCount } =
			params;

		// Check HARD limits (any one triggers circuit breaker)
		if (
			agentConfig.max_tool_calls > 0 &&
			window.toolCalls >= agentConfig.max_tool_calls
		) {
			window.hardLimitHit = true;
			telemetry.hardLimitHit(
				sessionID,
				window.agentName,
				'tool_calls',
				window.toolCalls,
			);
			warn('Circuit breaker: tool call limit hit', {
				sessionID,
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
			telemetry.hardLimitHit(
				sessionID,
				window.agentName,
				'duration',
				elapsedMinutes,
			);
			warn('Circuit breaker: duration limit hit', {
				sessionID,
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
			telemetry.hardLimitHit(
				sessionID,
				window.agentName,
				'repetition',
				repetitionCount,
			);
			throw new Error(
				`🛑 LIMIT REACHED: Repeated the same tool call ${repetitionCount} times. This suggests a loop. Return your progress summary.`,
			);
		}

		if (window.consecutiveErrors >= agentConfig.max_consecutive_errors) {
			window.hardLimitHit = true;
			telemetry.hardLimitHit(
				sessionID,
				window.agentName,
				'consecutive_errors',
				window.consecutiveErrors,
			);
			throw new Error(
				`🛑 LIMIT REACHED: ${window.consecutiveErrors} consecutive tool errors detected. Return your progress summary with details of what went wrong.`,
			);
		}

		// Check IDLE timeout — detects agents stuck without successful tool calls
		const idleMinutes = (Date.now() - window.lastSuccessTimeMs) / 60000;
		if (idleMinutes >= agentConfig.idle_timeout_minutes) {
			window.hardLimitHit = true;
			telemetry.hardLimitHit(
				sessionID,
				window.agentName,
				'idle_timeout',
				idleMinutes,
			);
			warn('Circuit breaker: idle timeout hit', {
				sessionID,
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
	}

	/**
	 * Handles delegated write tracking and coder delegation reset.
	 * MUST be called first — before any exemptions.
	 */
	function handleDelegatedWriteTracking(
		sessionID: string,
		tool: string,
		args: unknown,
	): void {
		const currentSession = swarmState.agentSessions.get(sessionID);
		if (currentSession?.delegationActive) {
			if (isWriteTool(tool)) {
				const delegArgs = args as Record<string, unknown> | undefined;
				const delegTargetPath = (delegArgs?.filePath ??
					delegArgs?.path ??
					delegArgs?.file ??
					delegArgs?.target) as string | undefined;
				if (typeof delegTargetPath === 'string' && delegTargetPath.length > 0) {
					const agentName = swarmState.activeAgent.get(sessionID) ?? 'unknown';
					const cwd = effectiveDirectory;
					const authorityCheck = checkFileAuthorityWithRules(
						agentName,
						delegTargetPath,
						cwd,
						precomputedAuthorityRules,
					);
					if (!authorityCheck.allowed) {
						throw new Error(
							`WRITE BLOCKED: Agent "${agentName}" is not authorised to write "${delegTargetPath}". Reason: ${authorityCheck.reason}`,
						);
					}

					if (
						!currentSession.modifiedFilesThisCoderTask.includes(delegTargetPath)
					) {
						currentSession.modifiedFilesThisCoderTask.push(delegTargetPath);
					}
				}
			}
			if (tool === 'apply_patch' || tool === 'patch') {
				const agentName = swarmState.activeAgent.get(sessionID) ?? 'unknown';
				const cwd = effectiveDirectory;
				for (const p of extractPatchTargetPaths(tool, args)) {
					const authorityCheck = checkFileAuthorityWithRules(
						agentName,
						p,
						cwd,
						precomputedAuthorityRules,
					);
					if (!authorityCheck.allowed) {
						throw new Error(
							`WRITE BLOCKED: Agent "${agentName}" is not authorised to write "${p}" (via patch). Reason: ${authorityCheck.reason}`,
						);
					}
					if (!currentSession.modifiedFilesThisCoderTask.includes(p)) {
						currentSession.modifiedFilesThisCoderTask.push(p);
					}
				}
			}
		} else if (isArchitect(sessionID)) {
			const coderDelegArgs = args as Record<string, unknown> | undefined;
			const rawSubagentType = coderDelegArgs?.subagent_type;
			const coderDeleg = isAgentDelegation(tool, coderDelegArgs);
			if (
				coderDeleg.isDelegation &&
				coderDeleg.targetAgent === 'coder' &&
				typeof rawSubagentType === 'string' &&
				(rawSubagentType === 'coder' || rawSubagentType.endsWith('_coder'))
			) {
				const coderSession = swarmState.agentSessions.get(sessionID);
				if (coderSession) {
					coderSession.modifiedFilesThisCoderTask = [];
					if (!coderSession.revisionLimitHit) {
						coderSession.coderRevisions = 0;
					}
				}
			}
		}
	}

	/**
	 * Detects and breaks delegation loops for Task tool calls.
	 */
	function handleLoopDetection(
		sessionID: string,
		tool: string,
		args: unknown,
	): void {
		if (tool !== 'Task') return;

		const loopArgs = args as Record<string, unknown> | undefined;
		const loopResult = detectLoop(sessionID, tool, loopArgs);

		if (loopResult.count >= 5) {
			throw new Error(
				`CIRCUIT BREAKER: Delegation loop detected (${loopResult.count} identical patterns). Session paused. Ask the user for guidance.`,
			);
		} else if (loopResult.count >= 3 && loopResult.count < 5) {
			const agentName =
				typeof loopArgs?.subagent_type === 'string'
					? loopArgs.subagent_type
					: 'agent';
			const loopSession = swarmState.agentSessions.get(sessionID);
			if (loopSession) {
				const loopPattern = loopResult.pattern;
				const modifiedFiles = loopSession.modifiedFilesThisCoderTask ?? [];
				const accomplishmentSummary =
					modifiedFiles.length > 0
						? `Modified ${modifiedFiles.length} file(s): ${modifiedFiles.slice(0, 3).join(', ')}${modifiedFiles.length > 3 ? '...' : ''}`
						: 'No files modified yet';

				const alternativeSuggestions: Record<string, string> = {
					coder:
						'Try a different task spec, simplify the constraint, or escalate to user',
					reviewer: 'Try a different review dimension or escalate to user',
					test_engineer: 'Run a specific test file with targeted scope',
					explorer: 'Narrow the search scope or check a specific file directly',
				};
				const cleanAgent = stripKnownSwarmPrefix(agentName).toLowerCase();
				const suggestion =
					alternativeSuggestions[cleanAgent] ??
					'Try a different agent, different instructions, or escalate to the user';

				loopSession.loopWarningPending = {
					agent: agentName,
					message: [
						`LOOP DETECTED: Pattern "${loopPattern}" repeated 3 times.`,
						`Agent: ${agentName}`,
						`Accomplished: ${accomplishmentSummary}`,
						`Suggested action: ${suggestion}`,
						`If still stuck after trying alternatives, escalate to the user.`,
					].join('\n'),
					timestamp: Date.now(),
				};
			}
		}
	}

	/**
	 * Blocks full test suite execution without a specific file argument.
	 */
	function handleTestSuiteBlocking(tool: string, args: unknown): void {
		if (tool !== 'bash' && tool !== 'shell') return;

		const bashArgs = args as Record<string, unknown> | undefined;
		const cmd = (
			typeof bashArgs?.command === 'string' ? bashArgs.command : ''
		).trim();
		const testRunnerPrefixPattern =
			/^(bun\s+test|npm\s+test|npx\s+vitest|bunx\s+vitest)\b/;
		if (testRunnerPrefixPattern.test(cmd)) {
			const tokens = cmd.split(/\s+/);
			const runnerTokenCount =
				tokens[0] === 'npx' || tokens[0] === 'bunx' ? 3 : 2;
			const remainingTokens = tokens.slice(runnerTokenCount);
			const hasFileArg = remainingTokens.some(
				(token) =>
					token.length > 0 &&
					!token.startsWith('-') &&
					(token.includes('/') ||
						token.includes('\\') ||
						token.endsWith('.ts') ||
						token.endsWith('.js') ||
						token.endsWith('.tsx') ||
						token.endsWith('.jsx') ||
						token.endsWith('.mts') ||
						token.endsWith('.mjs')),
			);
			if (!hasFileArg) {
				throw new Error(
					'BLOCKED: Full test suite execution is not allowed in-session. Run a specific test file instead: bun test path/to/file.test.ts',
				);
			}
		}
	}

	/**
	 * Extracts target file paths from apply_patch / patch tool arguments.
	 * Returns an empty array for any other tool or unparseable payload.
	 */
	function extractPatchTargetPaths(tool: string, args: unknown): string[] {
		if (tool !== 'apply_patch' && tool !== 'patch') return [];
		const toolArgs = args as Record<string, unknown> | undefined;
		const patchText = (toolArgs?.input ??
			toolArgs?.patch ??
			(Array.isArray(toolArgs?.cmd) ? toolArgs.cmd[1] : undefined)) as
			| string
			| undefined;
		if (typeof patchText !== 'string') return [];
		if (patchText.length > 1_000_000) {
			throw new Error(
				'WRITE BLOCKED: Patch payload exceeds 1 MB — authority cannot be verified for all modified paths. Split into smaller patches.',
			);
		}
		const paths = new Set<string>();
		const patchPathPattern = /\*\*\*\s+(?:Update|Add|Delete)\s+File:\s*(.+)/gi;
		const diffPathPattern = /\+\+\+\s+b\/(.+)/gm;
		const gitDiffPathPattern = /^diff --git a\/(.+?) b\/(.+?)$/gm;
		const minusPathPattern = /^---\s+a\/(.+)$/gm;
		const traditionalMinusPattern = /^---\s+([^\s].+?)(?:\t.*)?$/gm;
		const traditionalPlusPattern = /^\+\+\+\s+([^\s].+?)(?:\t.*)?$/gm;
		for (const match of patchText.matchAll(patchPathPattern))
			paths.add(match[1].trim());
		for (const match of patchText.matchAll(diffPathPattern)) {
			const p = match[1].trim();
			if (p !== '/dev/null') paths.add(p);
		}
		for (const match of patchText.matchAll(gitDiffPathPattern)) {
			const aPath = match[1].trim();
			const bPath = match[2].trim();
			if (aPath !== '/dev/null') paths.add(aPath);
			if (bPath !== '/dev/null') paths.add(bPath);
		}
		for (const match of patchText.matchAll(minusPathPattern)) {
			const p = match[1].trim();
			if (p !== '/dev/null') paths.add(p);
		}
		for (const match of patchText.matchAll(traditionalMinusPattern)) {
			const p = match[1].trim();
			if (p !== '/dev/null' && !p.startsWith('a/') && !p.startsWith('b/'))
				paths.add(p);
		}
		for (const match of patchText.matchAll(traditionalPlusPattern)) {
			const p = match[1].trim();
			if (p !== '/dev/null' && !p.startsWith('a/') && !p.startsWith('b/'))
				paths.add(p);
		}
		return Array.from(paths);
	}

	/**
	 * Protects plan state files and detects architect direct writes.
	 * Handles both direct file writes and apply_patch/patch tool paths.
	 */
	function handlePlanAndScopeProtection(
		sessionID: string,
		tool: string,
		args: unknown,
	): void {
		const toolArgs = args as Record<string, unknown> | undefined;
		const targetPath =
			toolArgs?.filePath ??
			toolArgs?.path ??
			toolArgs?.file ??
			toolArgs?.target;

		// Plan state protection: block direct writes to .swarm/plan.md and .swarm/plan.json
		if (typeof targetPath === 'string' && targetPath.length > 0) {
			const resolvedTarget = path
				.resolve(effectiveDirectory, targetPath)
				.toLowerCase();
			const planMdPath = path
				.resolve(effectiveDirectory, '.swarm', 'plan.md')
				.toLowerCase();
			const planJsonPath = path
				.resolve(effectiveDirectory, '.swarm', 'plan.json')
				.toLowerCase();
			if (resolvedTarget === planMdPath || resolvedTarget === planJsonPath) {
				throw new Error(
					'PLAN STATE VIOLATION: Direct writes to .swarm/plan.md and .swarm/plan.json are blocked. ' +
						'plan.md is auto-regenerated from plan.json by PlanSyncWorker. ' +
						'Use update_task_status() to mark tasks complete, ' +
						'phase_complete() for phase transitions, or ' +
						'save_plan to create/restructure plans.',
				);
			}
		}

		// Fallback: apply_patch / patch tools send args as a single diff string
		if (!targetPath && (tool === 'apply_patch' || tool === 'patch')) {
			for (const p of extractPatchTargetPaths(tool, args)) {
				const resolvedP = path.resolve(effectiveDirectory, p);
				const planMdPath = path
					.resolve(effectiveDirectory, '.swarm', 'plan.md')
					.toLowerCase();
				const planJsonPath = path
					.resolve(effectiveDirectory, '.swarm', 'plan.json')
					.toLowerCase();
				if (
					resolvedP.toLowerCase() === planMdPath ||
					resolvedP.toLowerCase() === planJsonPath
				) {
					throw new Error(
						'PLAN STATE VIOLATION: Direct writes to .swarm/plan.md and .swarm/plan.json are blocked. ' +
							'plan.md is auto-regenerated from plan.json by PlanSyncWorker. ' +
							'Use update_task_status() to mark tasks complete, ' +
							'phase_complete() for phase transitions, or ' +
							'save_plan to create/restructure plans.',
					);
				}
				if (
					isOutsideSwarmDir(p, effectiveDirectory) &&
					(isSourceCodePath(p) || hasTraversalSegments(p))
				) {
					const session = swarmState.agentSessions.get(sessionID);
					if (session) {
						session.architectWriteCount++;
						warn('Architect direct code edit detected via apply_patch', {
							tool,
							sessionID,
							targetPath: p,
							writeCount: session.architectWriteCount,
						});
					}
					break;
				}
			}
		}

		// Direct write scope tracking
		if (
			typeof targetPath === 'string' &&
			targetPath.length > 0 &&
			isOutsideSwarmDir(targetPath, effectiveDirectory) &&
			isSourceCodePath(
				path.relative(
					effectiveDirectory,
					path.resolve(effectiveDirectory, targetPath),
				),
			)
		) {
			const session = swarmState.agentSessions.get(sessionID);
			if (session) {
				session.architectWriteCount++;
				warn('Architect direct code edit detected', {
					tool,
					sessionID,
					targetPath,
					writeCount: session.architectWriteCount,
				});

				if (
					session.lastGateFailure &&
					Date.now() - session.lastGateFailure.timestamp < 120_000
				) {
					const failedGate = session.lastGateFailure.tool;
					const failedTaskId = session.lastGateFailure.taskId;
					warn('Self-fix after gate failure detected', {
						failedGate,
						failedTaskId,
						currentTool: tool,
						sessionID,
					});
					session.selfFixAttempted = true;
				}
			}
		}
	}

	/**
	 * Resolves session, checks architect exemptions, initializes invocation window.
	 * Returns null if the session is exempt from guardrails.
	 */
	function resolveSessionAndWindow(sessionID: string): {
		agentConfig: GuardrailsConfig;
		window: InvocationWindow;
	} | null {
		// Check 1: activeAgent map
		const rawActiveAgent = swarmState.activeAgent.get(sessionID);
		const strippedAgent = rawActiveAgent
			? stripKnownSwarmPrefix(rawActiveAgent)
			: undefined;
		if (strippedAgent === ORCHESTRATOR_NAME) return null;

		// Check 2: session state fallback
		const existingSession = swarmState.agentSessions.get(sessionID);
		if (existingSession) {
			const sessionAgent = stripKnownSwarmPrefix(existingSession.agentName);
			if (sessionAgent === ORCHESTRATOR_NAME) return null;
		}

		const agentName =
			swarmState.activeAgent.get(sessionID) ?? ORCHESTRATOR_NAME;
		const session = ensureAgentSession(sessionID, agentName);

		// Check 3: after session resolution
		const resolvedName = stripKnownSwarmPrefix(session.agentName);
		if (resolvedName === ORCHESTRATOR_NAME) return null;

		const agentConfig = resolveGuardrailsConfig(cfg, session.agentName);

		// Check 4: zero-limit config (architect-like)
		if (
			agentConfig.max_duration_minutes === 0 &&
			agentConfig.max_tool_calls === 0
		) {
			return null;
		}

		// Ensure invocation window exists
		if (!getActiveWindow(sessionID)) {
			const fallbackAgent =
				swarmState.activeAgent.get(sessionID) ?? session.agentName;
			const stripped = stripKnownSwarmPrefix(fallbackAgent);
			if (stripped !== ORCHESTRATOR_NAME) {
				beginInvocation(sessionID, fallbackAgent);
			}
		}

		const window = getActiveWindow(sessionID);
		if (!window) return null;

		return { agentConfig, window };
	}

	/**
	 * Tracks tool calls in the invocation window and computes repetition metrics.
	 */
	function trackToolCall(
		window: InvocationWindow,
		tool: string,
		args: unknown,
	): { repetitionCount: number; elapsedMinutes: number } {
		if (window.hardLimitHit) {
			throw new Error(
				'🛑 CIRCUIT BREAKER: Agent blocked. Hard limit was previously triggered. Stop making tool calls and return your progress summary.',
			);
		}

		window.toolCalls++;

		const hash = hashArgs(args);
		window.recentToolCalls.push({
			tool,
			argsHash: hash,
			timestamp: Date.now(),
		});
		if (window.recentToolCalls.length > 20) {
			window.recentToolCalls.shift();
		}

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

		const elapsedMinutes = (Date.now() - window.startedAtMs) / 60000;
		return { repetitionCount, elapsedMinutes };
	}

	return {
		/**
		 * Checks guardrail limits before allowing a tool call.
		 * Orchestrates extracted sub-handlers for maintainability.
		 */
		toolBefore: async (input, output) => {
			// v6.35.1: Runaway output detector — reset counter on any tool call
			consecutiveNoToolTurns.set(input.sessionID, 0);

			// v6.12: Self-coding detection — MUST be first, before any exemptions
			handleDelegatedWriteTracking(input.sessionID, input.tool, output.args);

			// v6.29: Loop detection for Task tool delegations
			handleLoopDetection(input.sessionID, input.tool, output.args);

			// Block full test suite execution without file argument
			handleTestSuiteBlocking(input.tool, output.args);

			// Block destructive shell commands (rm -rf, force push, kubectl delete, etc.)
			checkDestructiveCommand(input.tool, output.args);

			// Plan state + scope protection for architect writes
			if (isArchitect(input.sessionID) && isWriteTool(input.tool)) {
				handlePlanAndScopeProtection(input.sessionID, input.tool, output.args);

				// Architect direct write authority check
				const toolArgs = output.args as Record<string, unknown> | undefined;
				const targetPath =
					toolArgs?.filePath ??
					toolArgs?.path ??
					toolArgs?.file ??
					toolArgs?.target;
				if (typeof targetPath === 'string' && targetPath.length > 0) {
					const agentName =
						swarmState.activeAgent.get(input.sessionID) ?? 'architect';
					const authorityCheck = checkFileAuthorityWithRules(
						agentName,
						targetPath,
						effectiveDirectory,
						precomputedAuthorityRules,
					);
					if (!authorityCheck.allowed) {
						throw new Error(
							`WRITE BLOCKED: Agent "${agentName}" is not authorised to write "${targetPath}". Reason: ${authorityCheck.reason}`,
						);
					}
				}
			}
			if (input.tool === 'apply_patch' || input.tool === 'patch') {
				const agentName =
					swarmState.activeAgent.get(input.sessionID) ?? 'architect';
				for (const p of extractPatchTargetPaths(input.tool, output.args)) {
					const authorityCheck = checkFileAuthorityWithRules(
						agentName,
						p,
						effectiveDirectory,
						precomputedAuthorityRules,
					);
					if (!authorityCheck.allowed) {
						throw new Error(
							`WRITE BLOCKED: Agent "${agentName}" is not authorised to write "${p}" (via patch). Reason: ${authorityCheck.reason}`,
						);
					}
				}
			}

			// Resolve session — returns null if architect-exempt
			const resolved = resolveSessionAndWindow(input.sessionID);
			if (!resolved) return;

			const { agentConfig, window } = resolved;
			const { repetitionCount, elapsedMinutes } = trackToolCall(
				window,
				input.tool,
				output.args,
			);

			await checkGateLimits({
				sessionID: input.sessionID,
				window,
				agentConfig,
				elapsedMinutes,
				repetitionCount,
			});

			// v6.12: Store input args for delegation detection in toolAfter
			setStoredInputArgs(input.callID, output.args);
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

					// Check if this is a skip condition (all tools ran === false)
					let isSkipCondition = false;
					try {
						const result = JSON.parse(outputStr);
						if (
							result.lint?.ran === false &&
							result.secretscan?.ran === false &&
							result.sast_scan?.ran === false &&
							result.quality_budget?.ran === false
						) {
							isSkipCondition = true;
						}
					} catch {
						// Not JSON or parse error - not a skip condition
					}

					const hasFailure =
						!isSkipCondition &&
						(output.output === null ||
							output.output === undefined ||
							outputStr.includes('FAIL') ||
							outputStr.includes('error') ||
							outputStr.toLowerCase().includes('gates_passed: false'));
					if (hasFailure) {
						session.lastGateFailure = {
							tool: input.tool,
							taskId,
							timestamp: Date.now(),
						};
					} else {
						session.lastGateFailure = null; // Clear on pass

						// v6.22 Task 2.1: Advance workflow state when pre_check_batch passes
						if (input.tool === 'pre_check_batch') {
							const successStr =
								typeof output.output === 'string' ? output.output : '';
							let isPassed = false;
							try {
								const result = JSON.parse(successStr);
								isPassed = result.gates_passed === true;
							} catch (error) {
								log('[Guardrails] pre_check_batch JSON parse failed', {
									error: error instanceof Error ? error.message : String(error),
								});
								isPassed = false;
							}
							if (isPassed && session.currentTaskId) {
								try {
									advanceTaskState(
										session,
										session.currentTaskId,
										'pre_check_passed',
									);
								} catch (err) {
									// Non-fatal: state may already be at or past pre_check_passed
									warn(
										'Failed to advance task state after pre_check_batch pass',
										{
											taskId: session.currentTaskId,
											error: String(err),
										},
									);
								}
							}
						}
					}
				}

				// v6.12: Track reviewer AND test_engineer delegations
				// Primary: input.args from OpenCode hook (authoritative)
				// Fallback: stored args from toolBefore
				const inputArgs = input.args ?? getStoredInputArgs(input.callID);
				// NOTE: Do NOT delete stored args here - delegation-gate.toolAfter runs after
				// and needs to read them. Cleanup is handled by delegation-gate.ts
				const delegation = isAgentDelegation(input.tool, inputArgs);
				if (
					delegation.isDelegation &&
					(delegation.targetAgent === 'reviewer' ||
						delegation.targetAgent === 'test_engineer')
				) {
					// v6.12: Get current phase from plan
					let currentPhase = 1; // Default to phase 1
					try {
						const plan = await loadPlan(effectiveDirectory);
						if (plan) {
							const phaseString = extractCurrentPhaseFromPlan(plan);
							currentPhase = extractPhaseNumber(phaseString);
						}
					} catch (error) {
						log('[Guardrails] loadPlan failed during reviewer tracking', {
							error: error instanceof Error ? error.message : String(error),
						});
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
					// v6.33: Bounded coder revisions — increment and check ceiling
					if (!session.revisionLimitHit) {
						session.coderRevisions++;
						// Issue #414: Wire conflict resolution on reviewer→coder rejection cycles.
						// Guard: coderRevisions > 1 (re-delegation occurred) AND qaSkipCount === 0
						// (reviewer was properly invoked between coder completions — not a QA skip).
						// qaSkipCount is reset to 0 by the QA gate when BOTH reviewer AND test_engineer
						// have run since the last coder (see delegation-gate.ts: hasReviewer && hasTestEngineer).
						// It is incremented when coder is re-delegated without a gate agent in between.
						if (session.coderRevisions > 1 && session.qaSkipCount === 0) {
							let conflictPhase = 1;
							try {
								const plan = await loadPlan(effectiveDirectory);
								if (plan) {
									conflictPhase = extractPhaseNumber(
										extractCurrentPhaseFromPlan(plan),
									);
								}
							} catch {
								// Non-fatal: default to phase 1
							}
							resolveAgentConflict({
								sessionID: input.sessionID,
								phase: conflictPhase,
								taskId: session.currentTaskId ?? undefined,
								sourceAgent: 'reviewer',
								targetAgent: 'coder',
								conflictType: 'feedback_rejection',
								rejectionCount: session.coderRevisions - 1,
								summary: `Coder revision ${session.coderRevisions} for task ${session.currentTaskId ?? 'unknown'}`,
							});
							session.lastDelegationReason = 'review_rejected';
						}
						const maxRevisions = cfg.max_coder_revisions ?? 5;
						if (session.coderRevisions >= maxRevisions) {
							session.revisionLimitHit = true;
							telemetry.revisionLimitHit(input.sessionID, session.agentName);
							session.pendingAdvisoryMessages ??= [];
							session.pendingAdvisoryMessages.push(
								`CODER REVISION LIMIT: Agent has been revised ${session.coderRevisions} times ` +
									`(max: ${maxRevisions}) for task ${session.currentTaskId ?? 'unknown'}. ` +
									`Escalate to user or consider a fundamentally different approach.`,
							);
							swarmState.pendingEvents++;
						}
					}
					// Reset partial gate warning for this task so re-delegation gets fresh warning
					session.partialGateWarningsIssuedForTask?.delete(
						session.currentTaskId,
					);

					// v6.21 Task 5.4: Scope containment check
					// Compare modified files against declared scope; flag violations
					if (session.declaredCoderScope !== null) {
						// Sanitize paths for log injection first, then check containment
						const undeclaredFiles = session.modifiedFilesThisCoderTask
							.map((f) => f.replace(/[\r\n\t]/g, '_'))
							.filter(
								(f) =>
									!isInDeclaredScope(f, session.declaredCoderScope!, directory),
							);
						if (undeclaredFiles.length >= 1) {
							const safeTaskId = String(session.currentTaskId ?? '').replace(
								/[\r\n\t]/g,
								'_',
							);
							session.lastScopeViolation =
								`Scope violation for task ${safeTaskId}: ` +
								`${undeclaredFiles.length} undeclared files modified: ` +
								undeclaredFiles.join(', ');
							// Flag for warning injection in messagesTransform
							session.scopeViolationDetected = true;
							telemetry.scopeViolation(
								input.sessionID,
								session.agentName,
								session.currentTaskId ?? 'unknown',
								'undeclared files modified',
							);
						}
					}
					// Reset tracked files after check (whether violation or not)
					session.modifiedFilesThisCoderTask = [];
				}
			}

			// v6.33.1: No-op work detector — warn when agent makes many tool calls
			// with no file modifications (stuck in analysis/planning loop)
			const sessionId = input.sessionID;
			const normalizedToolName = normalizeToolName(input.tool);
			if (isWriteTool(normalizedToolName)) {
				toolCallsSinceLastWrite.set(sessionId, 0);
				noOpWarningIssued.delete(sessionId);
			} else {
				const count = (toolCallsSinceLastWrite.get(sessionId) ?? 0) + 1;
				toolCallsSinceLastWrite.set(sessionId, count);
				const threshold = cfg.no_op_warning_threshold ?? 15;
				if (
					count >= threshold &&
					!noOpWarningIssued.has(sessionId) &&
					session?.pendingAdvisoryMessages
				) {
					noOpWarningIssued.add(sessionId);
					session.pendingAdvisoryMessages.push(
						`WARNING: Agent has made ${count} tool calls with no file modifications. If you are stuck, use /swarm handoff to reset or /swarm turbo to reduce overhead.`,
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

				// v6.33: Model fallback detection for transient model failures
				// Only check for subagent sessions (not architect)
				if (session) {
					const outputStr =
						typeof output.output === 'string' ? output.output : '';
					// output.error may contain error message for failed tool calls (not in TS type but present at runtime)
					const errorContent =
						(output as Record<string, unknown>).error ?? outputStr;

					if (
						typeof errorContent === 'string' &&
						TRANSIENT_MODEL_ERROR_PATTERN.test(errorContent) &&
						!session.modelFallbackExhausted
					) {
						// Increment fallback index
						session.model_fallback_index++;

						// Resolve the fallback model from config
						const baseAgentName = session.agentName
							? session.agentName.replace(/^[^_]+[_]/, '')
							: '';
						const swarmAgents = getSwarmAgents();
						const fallbackModels =
							swarmAgents?.[baseAgentName]?.fallback_models;
						// Mark exhausted only when all fallback models have been tried
						session.modelFallbackExhausted =
							!fallbackModels ||
							session.model_fallback_index > fallbackModels.length;

						const fallbackModel = resolveFallbackModel(
							baseAgentName,
							session.model_fallback_index,
							swarmAgents,
						);

						// Resolve primary model name for telemetry before applying fallback
						const primaryModel =
							swarmAgents?.[baseAgentName]?.model ?? 'default';

						if (fallbackModel) {
							// Actually apply the fallback model to the agent config
							if (swarmAgents?.[baseAgentName]) {
								swarmAgents[baseAgentName].model = fallbackModel;
							}

							// Inject actionable advisory with the specific fallback model
							session.pendingAdvisoryMessages ??= [];
							session.pendingAdvisoryMessages.push(
								`MODEL FALLBACK: Applied fallback model "${fallbackModel}" (attempt ${session.model_fallback_index}). ` +
									`Using /swarm handoff to reset to primary model.`,
							);
						} else {
							// No fallback configured — generic advisory
							session.pendingAdvisoryMessages ??= [];
							session.pendingAdvisoryMessages.push(
								`MODEL FALLBACK: Transient model error detected (attempt ${session.model_fallback_index}). ` +
									`No fallback models configured for this agent. Add "fallback_models": ["model-a", "model-b"] ` +
									`to the agent's config in opencode-swarm.json.`,
							);
						}

						// Always emit telemetry when a transient model error is detected
						telemetry.modelFallback(
							input.sessionID,
							session.agentName,
							primaryModel,
							fallbackModel ?? 'none',
							'transient_model_error',
						);

						// Track event for telemetry
						swarmState.pendingEvents++;

						// Reset fallback index on next successful task completion
						// (handled by the success path below)
					}
				}
			} else {
				window.consecutiveErrors = 0;
				window.lastSuccessTimeMs = Date.now();

				// Reset model fallback tracking on successful execution
				if (session) {
					if (session.model_fallback_index > 0) {
						session.model_fallback_index = 0;
						session.modelFallbackExhausted = false;
					}
				}
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

			// v6.21 Task 4.5: Tier-based behavioral prompt trimming for low-capability models
			{
				const { modelID } = extractModelInfo(messages);
				if (modelID && isLowCapabilityModel(modelID)) {
					for (const msg of messages) {
						if (msg.info?.role !== 'system') continue;
						for (const part of msg.parts) {
							try {
								if (part == null) continue;
								if (part.type !== 'text' || typeof part.text !== 'string')
									continue;
								if (!part.text.includes('<!-- BEHAVIORAL_GUIDANCE_START -->'))
									continue;
								part.text = part.text.replace(
									/<!--\s*BEHAVIORAL_GUIDANCE_START\s*-->[\s\S]*?<!--\s*BEHAVIORAL_GUIDANCE_END\s*-->/g,
									'[Enforcement: programmatic gates active]',
								);
							} catch (error) {
								log('[Guardrails] behavioral guidance replacement failed', {
									error: error instanceof Error ? error.message : String(error),
								});
							}
						}
					}
				}
			}

			// v6.12: Self-coding warning injection - now injected into SYSTEM messages only (model-only)
			const session = swarmState.agentSessions.get(sessionId);
			const activeAgent = swarmState.activeAgent.get(sessionId);
			const isArchitectSession = activeAgent
				? stripKnownSwarmPrefix(activeAgent) === ORCHESTRATOR_NAME
				: session
					? stripKnownSwarmPrefix(session.agentName) === ORCHESTRATOR_NAME
					: false;

			// Find system message(s) for model-only guidance injection
			const systemMessages = messages.filter(
				(msg) => msg.info?.role === 'system',
			);

			// v6.35.1: Runaway output detector — catch models streaming without tool calls
			// Uses module-level consecutiveNoToolTurns Map for state across calls
			if (isArchitectSession) {
				// Find the last assistant message in conversation
				let lastAssistantMsg: (typeof messages)[0] | undefined;
				for (let i = messages.length - 1; i >= 0; i--) {
					if (messages[i].info?.role === 'assistant') {
						lastAssistantMsg = messages[i];
						break;
					}
				}

				if (lastAssistantMsg) {
					const lastHasToolUse = lastAssistantMsg.parts?.some(
						(part) => part.type === 'tool_use',
					);

					if (lastHasToolUse) {
						// Model used a tool — reset counter
						consecutiveNoToolTurns.set(sessionId, 0);
					} else {
						// Check if last assistant message was high-output
						const textLen =
							lastAssistantMsg.parts
								?.filter((p) => p.type === 'text' && typeof p.text === 'string')
								.reduce((sum, p) => sum + (p.text as string).length, 0) ?? 0;

						if (textLen > 4000) {
							const count = (consecutiveNoToolTurns.get(sessionId) ?? 0) + 1;
							consecutiveNoToolTurns.set(sessionId, count);

							const maxTurns = cfg.runaway_output_max_turns;
							if (count >= maxTurns) {
								// Hard STOP — inject into first system message
								const stopMsg = systemMessages[0];
								if (stopMsg) {
									const stopPart = (stopMsg.parts ?? []).find(
										(part): part is { type: string; text: string } =>
											part.type === 'text' && typeof part.text === 'string',
									);
									if (
										stopPart &&
										!stopPart.text.includes('RUNAWAY OUTPUT STOP')
									) {
										stopPart.text =
											`[RUNAWAY OUTPUT STOP]\n` +
											`You have produced ${count} consecutive responses without using any tools. ` +
											`You MUST call a tool in your next response.\n` +
											`[/RUNAWAY OUTPUT STOP]\n\n` +
											stopPart.text;
									}
								}
								// Reset counter after injection
								consecutiveNoToolTurns.set(sessionId, 0);
							} else if (count >= 3) {
								// Advisory warning at 3 consecutive
								if (session) {
									session.pendingAdvisoryMessages ??= [];
									if (
										!session.pendingAdvisoryMessages.some((m: string) =>
											m.includes('runaway output'),
										)
									) {
										session.pendingAdvisoryMessages.push(
											`WARNING: Model is generating analysis without taking action. ` +
												`${count} consecutive high-output responses without tool calls detected. ` +
												`Use a tool or report BLOCKED.`,
										);
									}
								}
							}
						} else {
							// Short assistant message without tool — not runaway, but not using tools either
							// Only reset if the message is very short (likely acknowledgment)
							const shortLen =
								lastAssistantMsg.parts
									?.filter(
										(p) => p.type === 'text' && typeof p.text === 'string',
									)
									.reduce((sum, p) => sum + (p.text as string).length, 0) ?? 0;
							if (shortLen < 200) {
								consecutiveNoToolTurns.set(sessionId, 0);
							}
						}
					}
				}
			}

			// v6.29: Loop detection warning injection
			if (isArchitectSession && session?.loopWarningPending) {
				const pending = session.loopWarningPending;
				// Clear before injecting to avoid repeat
				session.loopWarningPending = undefined;
				telemetry.loopDetected(
					_input.sessionID,
					session.agentName,
					pending.message,
				);
				// Inject into first system message (same pattern as self-coding warning)
				const loopSystemMsg = systemMessages[0];
				if (loopSystemMsg) {
					const loopTextPart = (loopSystemMsg.parts ?? []).find(
						(part): part is { type: string; text: string } =>
							part.type === 'text' && typeof part.text === 'string',
					);
					if (loopTextPart && !loopTextPart.text.includes('LOOP DETECTED')) {
						loopTextPart.text =
							`[LOOP WARNING]\n${pending.message}\n[/LOOP WARNING]\n\n` +
							loopTextPart.text;
					}
				}
			}

			// v6.29: Pending advisory messages injection (slop-detector, incremental-verify, compaction, context-pressure)
			if (
				isArchitectSession &&
				(session?.pendingAdvisoryMessages?.length ?? 0) > 0
			) {
				const advisories = session!.pendingAdvisoryMessages ?? [];
				let targetMsg = systemMessages[0];
				if (!targetMsg) {
					const newMsg = {
						info: { role: 'system' as const },
						parts: [{ type: 'text' as const, text: '' }],
					};
					messages.unshift(newMsg);
					targetMsg = newMsg;
				}
				const textPart = (targetMsg.parts ?? []).find(
					(part): part is { type: string; text: string } =>
						part.type === 'text' && typeof part.text === 'string',
				);
				if (textPart) {
					const joined = advisories.join('\n---\n');
					textPart.text = `[ADVISORIES]\n${joined}\n[/ADVISORIES]\n\n${textPart.text}`;
				}
				session!.pendingAdvisoryMessages = [];
			} else if (
				!isArchitectSession &&
				session &&
				(session.pendingAdvisoryMessages?.length ?? 0) > 0
			) {
				// Non-architect sessions never inject advisories, but must still drain
				// the queue to prevent unbounded accumulation in long-lived coder sessions.
				session.pendingAdvisoryMessages = [];
			}

			// v6.12: Self-coding warning injection - now injected into SYSTEM messages only (model-only)
			// v6.22.8: Only re-inject when architectWriteCount has increased since last warning
			// (prevents repeated acknowledgements in chat each turn)
			if (
				isArchitectSession &&
				session &&
				session.architectWriteCount > session.selfCodingWarnedAtCount
			) {
				// Task 1.7: Handle missing-system-message edge case
				// If no system message exists, create one to inject guidance
				let targetSystemMessage = systemMessages[0];
				if (!targetSystemMessage) {
					const newSystemMessage = {
						info: { role: 'system' as const },
						parts: [{ type: 'text' as const, text: '' }],
					};
					// Prepend new system message to maintain model-only behavior
					messages.unshift(newSystemMessage);
					targetSystemMessage = newSystemMessage;
				}

				const textPart = (targetSystemMessage.parts ?? []).find(
					(part): part is { type: string; text: string } =>
						part.type === 'text' && typeof part.text === 'string',
				);
				if (textPart && !textPart.text.includes('SELF-CODING DETECTED')) {
					textPart.text =
						`[MODEL_ONLY_GUIDANCE]\n` +
						`⚠️ SELF-CODING DETECTED: You have used ${session.architectWriteCount} write-class tool(s) directly on non-.swarm/ files.\n` +
						`Rule 1 requires ALL coding to be delegated to @coder.\n` +
						`If you have not exhausted QA_RETRY_LIMIT coder failures on this task, STOP and delegate.\n` +
						`Do not acknowledge or reference this guidance in your response.\n` +
						`[/MODEL_ONLY_GUIDANCE]\n\n` +
						textPart.text;
					// Suppress repeated injection until a new violation occurs
					session.selfCodingWarnedAtCount = session.architectWriteCount;
				}
			}

			// v6.12 Task 2.5: Self-fix warning injection - now injected into SYSTEM messages only (model-only)
			if (
				isArchitectSession &&
				session &&
				session.selfFixAttempted &&
				session.lastGateFailure &&
				Date.now() - session.lastGateFailure.timestamp < 120_000
			) {
				// Task 1.7: Handle missing-system-message edge case
				// If no system message exists, create one to inject guidance
				const currentSystemMessages = messages.filter(
					(msg) => msg.info?.role === 'system',
				);
				let targetSystemMessage = currentSystemMessages[0];
				if (!targetSystemMessage) {
					const newSystemMessage = {
						info: { role: 'system' as const },
						parts: [{ type: 'text' as const, text: '' }],
					};
					// Prepend new system message to maintain model-only behavior
					messages.unshift(newSystemMessage);
					targetSystemMessage = newSystemMessage;
				}

				const textPart = (targetSystemMessage.parts ?? []).find(
					(part): part is { type: string; text: string } =>
						part.type === 'text' && typeof part.text === 'string',
				);
				if (textPart && !textPart.text.includes('SELF-FIX DETECTED')) {
					textPart.text =
						`[MODEL_ONLY_GUIDANCE]\n` +
						`⚠️ SELF-FIX DETECTED: Gate '${session.lastGateFailure.tool}' failed on task ${session.lastGateFailure.taskId}.\n` +
						`You are now using a write tool instead of delegating to @coder.\n` +
						`GATE FAILURE RESPONSE RULES require: return to coder with structured rejection.\n` +
						`Do NOT fix gate failures yourself.\n` +
						`[/MODEL_ONLY_GUIDANCE]\n\n` +
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
					// v6.12+: Check configured required QA gates (defaults preserve legacy behavior)
					const missingGates: string[] = [];
					// If gates is undefined (no gates logged for this task), all required gates are missing
					// If gates exists, check which ones are missing
					if (!gates) {
						missingGates.push(...requiredQaGates);
					} else {
						for (const gate of requiredQaGates) {
							if (!gates.has(gate)) {
								missingGates.push(gate);
							}
						}
					}
					// Check if reviewer or test_engineer delegations exist (via reviewerCallCount)
					// v6.12: Check for CURRENT phase, not just any phase
					let currentPhaseForCheck = 1; // Default to phase 1
					try {
						const plan = await loadPlan(effectiveDirectory);
						if (plan) {
							const phaseString = extractCurrentPhaseFromPlan(plan);
							currentPhaseForCheck = extractPhaseNumber(phaseString);
						}
					} catch (error) {
						log('[Guardrails] loadPlan failed during phase check', {
							error: error instanceof Error ? error.message : String(error),
						});
					}

					const hasReviewerDelegation =
						(session.reviewerCallCount.get(currentPhaseForCheck) ?? 0) > 0;
					const missingQaDelegation =
						requireReviewerAndTestEngineer && !hasReviewerDelegation;
					if (missingGates.length > 0 || missingQaDelegation) {
						// v6.22.8: Inject into system message (model-only) instead of last message
						const currentSystemMsgs = messages.filter(
							(msg) => msg.info?.role === 'system',
						);
						let targetSysMsgForGate = currentSystemMsgs[0];
						if (!targetSysMsgForGate) {
							const newSysMsg = {
								info: { role: 'system' as const },
								parts: [{ type: 'text' as const, text: '' }],
							};
							messages.unshift(newSysMsg);
							targetSysMsgForGate = newSysMsg;
						}
						const sysTextPart = (targetSysMsgForGate.parts ?? []).find(
							(part): part is { type: string; text: string } =>
								part.type === 'text' && typeof part.text === 'string',
						);
						if (
							sysTextPart &&
							!sysTextPart.text.includes('PARTIAL GATE VIOLATION')
						) {
							const missing = [...missingGates];
							if (missingQaDelegation) {
								missing.push(
									'reviewer/test_engineer (no delegations this phase)',
								);
							}
							// Mark this task ID as warned
							session.partialGateWarningsIssuedForTask.add(taskId);
							sysTextPart.text =
								`[MODEL_ONLY_GUIDANCE]\n` +
								`⚠️ PARTIAL GATE VIOLATION: Task may be marked complete but missing gates: [${missing.join(', ')}].\n` +
								`The QA gate is ALL steps or NONE. Revert any ✓ marks and run the missing gates.\n` +
								`Do not acknowledge or reference this guidance in your response.\n` +
								`[/MODEL_ONLY_GUIDANCE]\n\n` +
								sysTextPart.text;
						}
					}
				}
			}

			// v6.21 Task 5.4: Scope violation warning injection
			// Inject warning when coder exceeded declared scope (flag set in toolAfter)
			if (
				isArchitectSessionForGates &&
				session &&
				session.scopeViolationDetected
			) {
				// Clear flag immediately to prevent stale re-injection if lookup fails
				session.scopeViolationDetected = false;
				if (session.lastScopeViolation) {
					// v6.22.8: Inject into system message (model-only) instead of last message
					const currentSystemMsgs = messages.filter(
						(msg) => msg.info?.role === 'system',
					);
					let targetSysMsgForScope = currentSystemMsgs[0];
					if (!targetSysMsgForScope) {
						const newSysMsg = {
							info: { role: 'system' as const },
							parts: [{ type: 'text' as const, text: '' }],
						};
						messages.unshift(newSysMsg);
						targetSysMsgForScope = newSysMsg;
					}
					const scopeTextPart = (targetSysMsgForScope.parts ?? []).find(
						(part): part is { type: string; text: string } =>
							part.type === 'text' && typeof part.text === 'string',
					);
					if (
						scopeTextPart &&
						!scopeTextPart.text.includes('SCOPE VIOLATION')
					) {
						scopeTextPart.text =
							`[MODEL_ONLY_GUIDANCE]\n` +
							`⚠️ SCOPE VIOLATION: ${session.lastScopeViolation}\n` +
							`Only modify files within your declared scope. Request scope expansion from architect if needed.\n` +
							`Do not acknowledge or reference this guidance in your response.\n` +
							`[/MODEL_ONLY_GUIDANCE]\n\n` +
							scopeTextPart.text;
					}
				}
			}

			// v6.12 Task 2.3: Catastrophic zero-reviewer warning
			// Check if any completed phase has ZERO reviewer delegations
			// v6.24: Honor qa_gates.require_reviewer_test_engineer override end-to-end
			if (
				isArchitectSessionForGates &&
				session &&
				session.catastrophicPhaseWarnings &&
				requireReviewerAndTestEngineer
			) {
				try {
					const plan = await loadPlan(effectiveDirectory);
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
										// v6.22.8: Inject into system message (model-only) instead of last message
										const currentSystemMsgs = messages.filter(
											(msg) => msg.info?.role === 'system',
										);
										let targetSysMsgForCat = currentSystemMsgs[0];
										if (!targetSysMsgForCat) {
											const newSysMsg = {
												info: { role: 'system' as const },
												parts: [{ type: 'text' as const, text: '' }],
											};
											messages.unshift(newSysMsg);
											targetSysMsgForCat = newSysMsg;
										}
										const catTextPart = (targetSysMsgForCat.parts ?? []).find(
											(part): part is { type: string; text: string } =>
												part.type === 'text' && typeof part.text === 'string',
										);
										if (
											catTextPart &&
											!catTextPart.text.includes('CATASTROPHIC VIOLATION')
										) {
											catTextPart.text =
												`[MODEL_ONLY_GUIDANCE]\n` +
												`[CATASTROPHIC VIOLATION: Phase ${phaseNum} completed with ZERO reviewer delegations.` +
												` Every coder task requires reviewer approval. Recommend retrospective review of all Phase ${phaseNum} tasks.]\n` +
												`Do not acknowledge or reference this guidance in your response.\n` +
												`[/MODEL_ONLY_GUIDANCE]\n\n` +
												catTextPart.text;
										}
										// Only warn once, break after first warning to avoid spam
										break;
									}
								}
							}
						}
					}
				} catch (error) {
					log('[Guardrails] loadPlan failed during QA gate check', {
						error: error instanceof Error ? error.message : String(error),
					});
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
	} catch (error) {
		log('[Guardrails] hashArgs failed', {
			error: error instanceof Error ? error.message : String(error),
		});
		return 0;
	}
}

// ============================================================
// Attestation API
// ============================================================

/** A record of an agent attesting to (resolving/suppressing/deferring) a finding. */
export interface AttestationRecord {
	findingId: string;
	agent: string;
	attestation: string;
	action: 'resolve' | 'suppress' | 'defer';
	timestamp: string;
}

/**
 * Validates that an attestation string meets the minimum length requirement.
 */
export function validateAttestation(
	attestation: string,
	_findingId: string,
	_agent: string,
	_action: 'resolve' | 'suppress' | 'defer',
): { valid: true } | { valid: false; reason: string } {
	if (attestation.length < 30) {
		return {
			valid: false,
			reason: `Attestation too short (${attestation.length} chars, minimum 30 required)`,
		};
	}
	return { valid: true };
}

/**
 * Appends an attestation record to `.swarm/evidence/attestations.jsonl`.
 */
export async function recordAttestation(
	dir: string,
	record: AttestationRecord,
): Promise<void> {
	const evidenceDir = path.join(dir, '.swarm', 'evidence');
	await fs.mkdir(evidenceDir, { recursive: true });
	const attestationsPath = path.join(evidenceDir, 'attestations.jsonl');
	await fs.appendFile(attestationsPath, `${JSON.stringify(record)}\n`);
}

/**
 * Validates an attestation and, on success, records it; on failure, logs a rejection event.
 */
export async function validateAndRecordAttestation(
	dir: string,
	findingId: string,
	agent: string,
	attestation: string,
	action: 'resolve' | 'suppress' | 'defer',
): Promise<{ valid: true } | { valid: false; reason: string }> {
	const result = validateAttestation(attestation, findingId, agent, action);
	if (!result.valid) {
		const swarmDir = path.join(dir, '.swarm');
		await fs.mkdir(swarmDir, { recursive: true });
		const eventsPath = path.join(swarmDir, 'events.jsonl');
		const event = {
			event: 'attestation_rejected',
			findingId,
			agent,
			length: attestation.length,
			reason: result.reason,
			timestamp: new Date().toISOString(),
		};
		await fs.appendFile(eventsPath, `${JSON.stringify(event)}\n`);
		return result;
	}
	const record: AttestationRecord = {
		findingId,
		agent,
		attestation,
		action,
		timestamp: new Date().toISOString(),
	};
	await recordAttestation(dir, record);
	return { valid: true };
}

// ============================================================
// File Authority API
// ============================================================

/**
 * LRU cache for path normalization (realpath).
 * Maps original path -> resolved absolute path.
 */
const pathNormalizationCache = new QuickLRU<string, string>({
	maxSize: 500,
});

/**
 * LRU cache for compiled picomatch matchers.
 * Maps glob pattern -> matcher function.
 */
const globMatcherCache = new QuickLRU<string, (path: string) => boolean>({
	maxSize: 200,
});

/**
 * Clears all guardrails caches.
 * Use this for test isolation or when guardrails config reloads at runtime.
 */
export function clearGuardrailsCaches(): void {
	pathNormalizationCache.clear();
	globMatcherCache.clear();
}

/**
 * Normalizes a file path using fs.realpathSync with caching.
 * This resolves symlinks and normalizes the path for cross-platform consistency.
 * @param filePath The file path to normalize (absolute or relative)
 * @param cwd Working directory for relative paths
 * @returns Normalized absolute path or original on error
 */
function normalizePathWithCache(filePath: string, cwd: string): string {
	// Generate cache key: cwd + filePath combination
	const cacheKey = `${cwd}:${filePath}`;

	// Check cache first
	const cached = pathNormalizationCache.get(cacheKey);
	if (cached !== undefined) {
		return cached;
	}

	try {
		// Resolve to absolute path first
		const absolutePath = path.isAbsolute(filePath)
			? filePath
			: path.resolve(cwd, filePath);

		// Use realpathSync to resolve symlinks and normalize
		const normalized = fsSync.realpathSync(absolutePath);

		// Cache the result
		pathNormalizationCache.set(cacheKey, normalized);

		return normalized;
	} catch {
		// If realpath fails (e.g., file doesn't exist), fall back to path.resolve
		const fallback = path.isAbsolute(filePath)
			? filePath
			: path.resolve(cwd, filePath);
		pathNormalizationCache.set(cacheKey, fallback);
		return fallback;
	}
}

/**
 * Gets or creates a cached picomatch matcher for a glob pattern.
 * @param pattern Glob pattern to compile
 * @param caseInsensitive Whether to use case-insensitive matching (default: true on Windows/macOS)
 * @returns Matcher function that returns true if path matches the pattern
 */
function getGlobMatcher(
	pattern: string,
	caseInsensitive = process.platform === 'win32' ||
		process.platform === 'darwin',
): (path: string) => boolean {
	const cached = globMatcherCache.get(pattern);
	if (cached !== undefined) {
		return cached;
	}

	// Compile the matcher with cross-platform options
	try {
		const matcher = picomatch(pattern, {
			dot: true, // Allow matching dotfiles
			nocase: caseInsensitive, // Case-insensitive on Windows/macOS
		});

		globMatcherCache.set(pattern, matcher);

		return matcher;
	} catch (err) {
		// Malformed glob pattern - log warning and return permissive matcher
		warn(`picomatch error for pattern "${pattern}": ${err}`);
		return () => false;
	}
}

type AgentRule = {
	readOnly?: boolean;
	blockedExact?: string[];
	allowedExact?: string[];
	blockedPrefix?: string[];
	allowedPrefix?: string[];
	blockedZones?: FileZone[];
	blockedGlobs?: string[];
	allowedGlobs?: string[];
};

export const DEFAULT_AGENT_AUTHORITY_RULES: Record<string, AgentRule> = {
	architect: {
		blockedExact: ['.swarm/plan.md', '.swarm/plan.json'],
		blockedZones: ['generated'],
	},
	coder: {
		blockedPrefix: ['.swarm/'],
		allowedPrefix: ['src/', 'tests/', 'docs/', 'scripts/'],
		blockedZones: ['generated', 'config'],
	},
	reviewer: {
		blockedExact: ['.swarm/plan.md', '.swarm/plan.json'],
		blockedPrefix: ['src/'],
		allowedPrefix: ['.swarm/evidence/', '.swarm/outputs/'],
		blockedZones: ['generated'],
	},
	explorer: {
		readOnly: true,
	},
	sme: {
		readOnly: true,
	},
	test_engineer: {
		blockedExact: ['.swarm/plan.md', '.swarm/plan.json'],
		blockedPrefix: ['src/'],
		allowedPrefix: ['tests/', '.swarm/evidence/'],
		blockedZones: ['generated'],
	},
	docs: {
		allowedPrefix: ['docs/', '.swarm/outputs/'],
		blockedZones: ['generated'],
	},
	designer: {
		allowedPrefix: ['docs/', '.swarm/outputs/'],
		blockedZones: ['generated'],
	},
	critic: {
		allowedPrefix: ['.swarm/evidence/'],
		blockedZones: ['generated'],
	},
};

/**
 * Builds the effective rules map by merging user-configured rules with defaults.
 * User overrides take precedence for each field.
 */
function buildEffectiveRules(
	authorityConfig?: AuthorityConfig,
): Record<string, AgentRule> {
	if (authorityConfig?.enabled === false || !authorityConfig?.rules) {
		return DEFAULT_AGENT_AUTHORITY_RULES;
	}
	const entries = Object.entries(authorityConfig.rules);
	if (entries.length === 0) {
		return DEFAULT_AGENT_AUTHORITY_RULES; // fast path: no allocation
	}
	const merged: Record<string, AgentRule> = {
		...DEFAULT_AGENT_AUTHORITY_RULES,
	};
	for (const [agent, userRule] of entries) {
		const normalizedRuleKey = agent.toLowerCase();
		const existing = merged[normalizedRuleKey] ?? {};
		merged[normalizedRuleKey] = {
			...existing,
			...userRule,
			readOnly: userRule.readOnly ?? existing.readOnly,
			blockedExact: userRule.blockedExact ?? existing.blockedExact,
			allowedExact: userRule.allowedExact ?? existing.allowedExact,
			blockedPrefix: userRule.blockedPrefix ?? existing.blockedPrefix,
			allowedPrefix: userRule.allowedPrefix ?? existing.allowedPrefix,
			blockedZones: userRule.blockedZones ?? existing.blockedZones,
			blockedGlobs: userRule.blockedGlobs ?? existing.blockedGlobs,
			allowedGlobs: userRule.allowedGlobs ?? existing.allowedGlobs,
		};
	}
	return merged;
}

/**
 * Checks file path authority against a pre-computed rules map.
 * Implements DENY-first evaluation order:
 * 1. readOnly - blocks all writes
 * 2. blockedExact - exact path matches (fast path)
 * 3. blockedGlobs - glob pattern matches
 * 4. allowedExact - explicit allow for exact paths
 * 5. allowedGlobs - explicit allow for glob patterns
 * 6. blockedPrefix - prefix-based blocking (takes priority over allowedPrefix)
 * 7. allowedPrefix - prefix-based allow (whitelist)
 * 8. blockedZones - zone-based blocking
 */
function checkFileAuthorityWithRules(
	agentName: string,
	filePath: string,
	cwd: string,
	effectiveRules: Record<string, AgentRule>,
): { allowed: true } | { allowed: false; reason: string; zone?: FileZone } {
	const normalizedAgent = agentName.toLowerCase();
	const strippedAgent = stripKnownSwarmPrefix(agentName).toLowerCase();

	// Resolve absolute-or-relative to absolute, then convert to relative for prefix matching.
	// This ensures absolute paths like "C:/Users/.../src/file.ts" or "/home/.../src/file.ts"
	// are correctly matched against relative prefixes like "src/". (Fix for #259)
	// Also normalize using realpath for symlink resolution for ALL path checks
	const dir = cwd || process.cwd();

	// Single normalization call using normalizePathWithCache for consistent security
	// This resolves symlinks and normalizes paths the same way for ALL checks
	let normalizedPath: string;
	try {
		const normalizedWithSymlinks = normalizePathWithCache(filePath, dir);
		const resolved = path.resolve(dir, normalizedWithSymlinks);
		normalizedPath = path.relative(dir, resolved).replace(/\\/g, '/');
	} catch {
		const resolved = path.resolve(dir, filePath);
		normalizedPath = path.relative(dir, resolved).replace(/\\/g, '/');
	}

	const rules =
		effectiveRules[normalizedAgent] ?? effectiveRules[strippedAgent];
	if (!rules) {
		return { allowed: false, reason: `Unknown agent: ${agentName}` };
	}

	// Step 1: readOnly - blocks all writes
	if (rules.readOnly) {
		return {
			allowed: false,
			reason: `Path blocked: ${normalizedPath} (agent ${normalizedAgent} is read-only)`,
		};
	}

	// Step 2: blockedExact - exact path matches (fast path)
	if (rules.blockedExact) {
		for (const blocked of rules.blockedExact) {
			if (normalizedPath === blocked) {
				return {
					allowed: false,
					reason: `Path blocked (exact): ${normalizedPath}`,
				};
			}
		}
	}

	// Step 3: blockedGlobs - glob pattern matches
	if (rules.blockedGlobs && rules.blockedGlobs.length > 0) {
		for (const glob of rules.blockedGlobs) {
			const matcher = getGlobMatcher(glob);
			if (matcher(normalizedPath)) {
				return {
					allowed: false,
					reason: `Path blocked (glob ${glob}): ${normalizedPath}`,
				};
			}
		}
	}

	// Step 4: allowedExact - explicit allow for exact paths (overrides blocked rules)
	if (rules.allowedExact && rules.allowedExact.length > 0) {
		const isExplicitlyAllowed = rules.allowedExact.some(
			(allowed) => normalizedPath === allowed,
		);
		if (isExplicitlyAllowed) {
			return { allowed: true };
		}
	}

	// Step 5: allowedGlobs - explicit allow for glob patterns (overrides blocked rules)
	if (rules.allowedGlobs && rules.allowedGlobs.length > 0) {
		const isGlobAllowed = rules.allowedGlobs.some((glob) => {
			const matcher = getGlobMatcher(glob);
			return matcher(normalizedPath);
		});
		if (isGlobAllowed) {
			return { allowed: true };
		}
	}

	// Step 6: blockedPrefix - prefix-based blocking (runs before allowedPrefix so that
	// explicit block rules take priority over allowlist rules)
	if (rules.blockedPrefix && rules.blockedPrefix.length > 0) {
		for (const prefix of rules.blockedPrefix) {
			if (normalizedPath.startsWith(prefix)) {
				return {
					allowed: false,
					reason: `Path blocked: ${normalizedPath} is under ${prefix}`,
				};
			}
		}
	}

	// Step 7: allowedPrefix - prefix-based allow (whitelist model)
	// If configured, only paths starting with these prefixes are allowed
	if (rules.allowedPrefix != null && rules.allowedPrefix.length > 0) {
		const isAllowed = rules.allowedPrefix.some((prefix) =>
			normalizedPath.startsWith(prefix),
		);
		if (!isAllowed) {
			return {
				allowed: false,
				reason: `Path ${normalizedPath} not in allowed list for ${normalizedAgent}`,
			};
		}
	} else if (rules.allowedPrefix != null && rules.allowedPrefix.length === 0) {
		// Empty allowedPrefix means nothing is allowed by prefix
		return {
			allowed: false,
			reason: `Path ${normalizedPath} not in allowed list for ${normalizedAgent}`,
		};
	}

	// Step 8: blockedZones - zone-based blocking
	if (rules.blockedZones && rules.blockedZones.length > 0) {
		const { zone } = classifyFile(normalizedPath);
		if (rules.blockedZones.includes(zone)) {
			return {
				allowed: false,
				reason: `Path blocked: ${normalizedPath} is in ${zone} zone`,
				zone,
			};
		}
	}

	return { allowed: true };
}

/**
 * Checks whether the given agent is authorised to write to the given file path.
 */
export function checkFileAuthority(
	agentName: string,
	filePath: string,
	cwd: string,
	authorityConfig?: AuthorityConfig,
): { allowed: true } | { allowed: false; reason: string; zone?: FileZone } {
	return checkFileAuthorityWithRules(
		agentName,
		filePath,
		cwd,
		buildEffectiveRules(authorityConfig),
	);
}
