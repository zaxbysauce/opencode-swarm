/**
 * SCOPE GUARD (v6.31 Task 3.1)
 *
 * CONFIRMED THROW MECHANISM: throwing in tool.execute.before propagates as tool rejection,
 * NOT as session crash. Verified from guardrails.ts multiple existing throw sites.
 * Safe blocking pattern: throw new Error(`SCOPE VIOLATION: ...`)
 *
 * Fires BEFORE write/edit tools execute. When a non-architect agent attempts to
 * modify a file outside the declared task scope, blocks the call and injects an advisory.
 */

import * as path from 'node:path';
import { ORCHESTRATOR_NAME, WRITE_TOOL_NAMES } from '../config/constants';
import { stripKnownSwarmPrefix } from '../config/schema';
import { swarmState } from '../state';
import { pendingCoderScopeByTaskId } from './delegation-gate.js';
import { normalizeToolName } from './normalize-tool-name';

// NOTE: bash/shell tools are intentionally excluded from WRITE_TOOLS.
// A coder agent using bash with shell redirections (echo > file, cp, sed -i) can
// bypass this scope check. This is a known architectural limitation — bash commands
// are opaque to static scope analysis. Post-hoc detection via guardrails.ts
// diff-scope validation provides secondary coverage.

// Tools that write files — scope guard watches these
// Derived from shared WRITE_TOOL_NAMES constant — do not edit here
const WRITE_TOOLS = new Set<string>(WRITE_TOOL_NAMES);

/**
 * Configuration for scope guard behavior.
 */
export interface ScopeGuardConfig {
	/** Whether scope guard is enabled (default: true) */
	enabled: boolean;
	/** Whether to skip in turbo mode (default: false — NOT skippable by design) */
	skip_in_turbo: boolean;
}

/**
 * Creates the scope-guard hook that blocks out-of-scope writes.
 * @param config - ScopeGuardConfig (enabled, skip_in_turbo)
 * @param _directory - The workspace directory (reserved for future use)
 * @param injectAdvisory - Optional callback to push advisory to architect session
 */
export function createScopeGuardHook(
	config: Partial<ScopeGuardConfig>,
	directory: string,
	injectAdvisory?: (sessionId: string, message: string) => void,
): {
	toolBefore: (
		input: { tool: string; sessionID: string; callID: string },
		output: { args: unknown },
	) => Promise<void>;
} {
	const enabled = config.enabled ?? true;
	const _skipInTurbo = config.skip_in_turbo ?? false; // NOT skippable by default (reserved for future turbo detection)

	return {
		toolBefore: async (input, output) => {
			if (!enabled) return;

			// Only fire for write/edit tools
			const toolName = normalizeToolName(input.tool); // strip namespace prefix
			if (!WRITE_TOOLS.has(toolName)) return;

			// Only fire for non-architect sessions
			const sessionId = input.sessionID;
			const activeAgent = swarmState.activeAgent.get(sessionId);
			const session = swarmState.agentSessions.get(sessionId);

			const agentName = activeAgent ?? session?.agentName ?? 'unknown';

			const isArchitect =
				stripKnownSwarmPrefix(agentName) === ORCHESTRATOR_NAME;
			if (isArchitect) return; // Architect writes are always allowed

			// Get declared scope for this session
			// v6.33.1 CRIT-1: Check session first, then fallback map by taskId
			const declaredScope =
				session?.declaredCoderScope ??
				(session?.currentTaskId
					? pendingCoderScopeByTaskId.get(session.currentTaskId)
					: null);
			if (!declaredScope || declaredScope.length === 0) return; // No scope declared — allow

			// Get the file path from args
			const argsObj = output.args as Record<string, unknown> | undefined;
			const rawFilePath = argsObj?.path ?? argsObj?.filePath ?? argsObj?.file;
			if (typeof rawFilePath !== 'string' || !rawFilePath) return; // Can't determine path — allow
			// Sanitize path to prevent log injection — strip control chars + ANSI escape sequences.
			// ESC (0x1B) is handled via split/join to avoid biome noControlCharactersInRegex rule.
			const filePath = rawFilePath
				.replace(/[\r\n\t]/g, '_')
				.split(String.fromCharCode(27))
				.join('_') // strip ESC (ANSI escape prefix)
				.replace(/\[[\d;]*m/g, ''); // strip remaining ANSI CSI sequences

			// Check if file is in scope
			if (!isFileInScope(filePath, declaredScope, directory)) {
				const taskId = session?.currentTaskId ?? 'unknown';
				const violationMessage = `SCOPE VIOLATION: ${agentName} attempted to modify '${filePath}' which is not in declared scope for task ${taskId}. Declared scope: [${declaredScope.slice(0, 3).join(', ')}${declaredScope.length > 3 ? '...' : ''}]`;

				// Log violation to session
				if (session) {
					session.lastScopeViolation = violationMessage;
					session.scopeViolationDetected = true;
				}

				// Inject advisory to architect session (if callback provided)
				if (injectAdvisory) {
					// Find the architect session to notify
					for (const [archSessionId, archSession] of swarmState.agentSessions) {
						const archAgent =
							swarmState.activeAgent.get(archSessionId) ??
							archSession.agentName;
						if (stripKnownSwarmPrefix(archAgent) === ORCHESTRATOR_NAME) {
							try {
								injectAdvisory(
									archSessionId,
									`[SCOPE GUARD] ${violationMessage}`,
								);
							} catch {
								/* non-blocking */
							}
							break;
						}
					}
				}

				// BLOCK the tool call by throwing
				throw new Error(violationMessage);
			}
		},
	};
}

/**
 * Check if a file path is within declared scope entries.
 * Handles exact match and directory containment.
 *
 * @param filePath - The file path to check
 * @param scopeEntries - Array of declared scope entries (files or directories)
 * @returns true if the file is within scope, false otherwise
 */
export function isFileInScope(
	filePath: string,
	scopeEntries: string[],
	directory?: string,
): boolean {
	const dir = directory ?? process.cwd();
	const resolvedFile = path.resolve(dir, filePath);
	return scopeEntries.some((scope) => {
		const resolvedScope = path.resolve(dir, scope);
		if (resolvedFile === resolvedScope) return true;
		const rel = path.relative(resolvedScope, resolvedFile);
		return rel.length > 0 && !rel.startsWith('..') && !path.isAbsolute(rel);
	});
}
