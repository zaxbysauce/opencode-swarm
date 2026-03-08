/**
 * Delegation Gate Hook
 *
 * Warns the architect when coder delegations are too large or batched.
 * Uses experimental.chat.messages.transform to provide non-blocking guidance.
 */

import type { PluginConfig } from '../config';
import { stripKnownSwarmPrefix } from '../config/schema';
import {
	advanceTaskState,
	ensureAgentSession,
	getTaskState,
	swarmState,
} from '../state';
import type {
	DelegationEnvelope,
	EnvelopeValidationResult,
} from '../types/delegation.js';

/**
 * Checks if an object has the required fields to be a DelegationEnvelope.
 */
function isEnvelope(obj: unknown): boolean {
	if (typeof obj !== 'object' || obj === null) return false;
	const e = obj as Record<string, unknown>;
	return (
		typeof e.taskId === 'string' &&
		typeof e.targetAgent === 'string' &&
		typeof e.action === 'string'
	);
}

/**
 * Parses a string to extract a DelegationEnvelope.
 * Returns null if no valid envelope is found.
 * Never throws - all errors are caught and result in null.
 */
export function parseDelegationEnvelope(
	content: string,
): DelegationEnvelope | null {
	try {
		// Try direct JSON parse first
		const parsed = JSON.parse(content);
		if (isEnvelope(parsed)) return parsed as DelegationEnvelope;
	} catch {
		// Try to extract JSON block from content
		const match = content.match(/\{[\s\S]*\}/);
		if (match) {
			try {
				const parsed = JSON.parse(match[0]);
				if (isEnvelope(parsed)) return parsed as DelegationEnvelope;
			} catch {
				// not an envelope
			}
		}
	}

	// Try KEY:VALUE text format
	const lines = content.split('\n');
	const keyValueMap: Record<string, string> = {};

	for (const line of lines) {
		const match = line.match(/^([^:]+):\s*(.+)$/);
		if (match) {
			const key = match[1].trim().toLowerCase();
			const value = match[2].trim();
			keyValueMap[key] = value;
		}
	}

	// Normalize key names to camelCase
	const keyNormalization: Record<string, string> = {
		taskid: 'taskId',
		task_id: 'taskId',
		targetagent: 'targetAgent',
		target_agent: 'targetAgent',
		commandtype: 'commandType',
		command_type: 'commandType',
		acceptancecriteria: 'acceptanceCriteria',
		acceptance_criteria: 'acceptanceCriteria',
		technicalcontext: 'technicalContext',
		technical_context: 'technicalContext',
		errorstrategy: 'errorStrategy',
		error_strategy: 'errorStrategy',
		platformnotes: 'platformNotes',
		platform_notes: 'platformNotes',
		action: 'action',
		files: 'files',
	};

	const normalizedMap: Record<string, string> = {};
	for (const [key, value] of Object.entries(keyValueMap)) {
		const normalized = keyNormalization[key] || key;
		normalizedMap[normalized] = value;
	}

	// If fewer than 3 envelope fields found → return null
	if (Object.keys(normalizedMap).length < 3) {
		return null;
	}

	// Required fields check
	const requiredFields = [
		'taskId',
		'targetAgent',
		'action',
		'commandType',
		'files',
		'acceptanceCriteria',
	];
	for (const field of requiredFields) {
		if (!normalizedMap[field]) {
			return null;
		}
	}

	// Parse array fields (files and acceptanceCriteria)
	const parseArrayField = (value: string): string[] => {
		let parts = value.split(',');
		if (parts.length === 1) {
			parts = value.split(';');
		}
		return parts.map((s) => s.trim()).filter((s) => s.length > 0);
	};

	// Build the envelope
	const envelope: DelegationEnvelope = {
		taskId: normalizedMap.taskId,
		targetAgent: normalizedMap.targetAgent,
		action: normalizedMap.action,
		commandType: normalizedMap.commandType as 'task' | 'slash_command',
		files: parseArrayField(normalizedMap.files),
		acceptanceCriteria: parseArrayField(normalizedMap.acceptanceCriteria),
		technicalContext: normalizedMap.technicalContext || '',
	};

	// Add optional fields if present
	if (normalizedMap.technicalContext) {
		envelope.technicalContext = normalizedMap.technicalContext;
	}
	if (normalizedMap.errorStrategy) {
		envelope.errorStrategy = normalizedMap.errorStrategy as
			| 'FAIL_FAST'
			| 'BEST_EFFORT';
	}
	if (normalizedMap.platformNotes) {
		envelope.platformNotes = normalizedMap.platformNotes;
	}

	return envelope;
}

interface ValidationContext {
	planTasks: string[];
	validAgents: string[];
}

/**
 * Validates a DelegationEnvelope against the current plan and agent list.
 * Returns { valid: true } on success, or { valid: false; reason: string } on failure.
 */
export function validateDelegationEnvelope(
	envelope: unknown,
	context: ValidationContext,
): EnvelopeValidationResult {
	// Must be a non-null object
	if (typeof envelope !== 'object' || envelope === null) {
		return { valid: false, reason: 'envelope_not_object' };
	}

	const e = envelope as Record<string, unknown>;

	// Required fields
	const requiredFields = [
		'taskId',
		'targetAgent',
		'action',
		'commandType',
		'files',
		'acceptanceCriteria',
	] as const;

	for (const field of requiredFields) {
		if (!(field in e) || e[field] === undefined || e[field] === null) {
			return { valid: false, reason: `missing_field_${field}` };
		}
	}

	// slash_command delegation is blocked
	if (e.commandType === 'slash_command') {
		return { valid: false, reason: 'slash_command_delegation_blocked' };
	}

	// taskId must be in planTasks (if planTasks is non-empty)
	const taskId = e.taskId as string;
	if (context.planTasks.length > 0 && !context.planTasks.includes(taskId)) {
		return { valid: false, reason: 'taskId_not_in_plan' };
	}

	// targetAgent must be valid after stripping swarm prefix
	const rawAgent = e.targetAgent as string;
	const normalizedAgent = stripKnownSwarmPrefix(rawAgent);
	if (!context.validAgents.includes(normalizedAgent)) {
		return { valid: false, reason: 'invalid_target_agent' };
	}

	// files must be non-empty for implement or review actions
	const action = e.action as string;
	const files = e.files as unknown[];
	if (
		(action === 'implement' || action === 'review') &&
		(!Array.isArray(files) || files.length === 0)
	) {
		return { valid: false, reason: 'files_required_for_action' };
	}

	// acceptanceCriteria must be non-empty
	const acceptanceCriteria = e.acceptanceCriteria as unknown[];
	if (!Array.isArray(acceptanceCriteria) || acceptanceCriteria.length === 0) {
		return { valid: false, reason: 'acceptanceCriteria_required' };
	}

	return { valid: true };
}

interface MessageInfo {
	role: string;
	agent?: string;
	sessionID?: string;
}

interface MessagePart {
	type: string;
	text?: string;
	[key: string]: unknown;
}

interface MessageWithParts {
	info: MessageInfo;
	parts: MessagePart[];
}

/**
 * Extracts the TASK line content from the delegation text.
 * Returns the content after "TASK:" or null if not found.
 */
function extractTaskLine(text: string): string | null {
	const match = text.match(/TASK:\s*(.+?)(?:\n|$)/i);
	return match ? match[1].trim() : null;
}

/**
 * Creates the experimental.chat.messages.transform hook for delegation gating.
 * Inspects coder delegations and warns when tasks are oversized or batched.
 */
export function createDelegationGateHook(config: PluginConfig): {
	messagesTransform: (
		input: Record<string, never>,
		output: { messages?: MessageWithParts[] },
	) => Promise<void>;
	toolAfter: (
		input: { tool: string; sessionID: string; callID: string },
		output: unknown,
	) => Promise<void>;
} {
	const enabled =
		(config.hooks as Record<string, unknown> | undefined)?.delegation_gate !==
		false;
	const delegationMaxChars =
		((config.hooks as Record<string, unknown> | undefined)
			?.delegation_max_chars as number | undefined) ?? 4000;

	if (!enabled) {
		return {
			messagesTransform: async (
				_input: Record<string, never>,
				_output: { messages?: MessageWithParts[] },
			): Promise<void> => {
				// No-op when delegation gate is disabled
			},
			toolAfter: async (): Promise<void> => {
				// No-op when delegation gate is disabled
			},
		};
	}

	// toolAfter: resets qaSkip fields only when BOTH reviewer AND test_engineer delegation have been seen since the last coder
	const toolAfter = async (
		input: { tool: string; sessionID: string; callID: string },
		_output: unknown,
	): Promise<void> => {
		if (!input.sessionID) return;
		const session = swarmState.agentSessions.get(input.sessionID);
		if (!session) return;

		// Detect reviewer or test_engineer delegation completions
		const normalized = input.tool.replace(/^[^:]+[:.]/, '');
		if (normalized === 'Task' || normalized === 'task') {
			// We can't check args in toolAfter without storing them (they're not in toolAfter output)
			// Instead, rely on delegationChains which guardrails.ts updates
			const delegationChain = swarmState.delegationChains.get(input.sessionID);
			if (delegationChain && delegationChain.length > 0) {
				// Find the index of the last 'coder' entry in the chain
				let lastCoderIndex = -1;
				for (let i = delegationChain.length - 1; i >= 0; i--) {
					const target = stripKnownSwarmPrefix(delegationChain[i].to);
					if (target.includes('coder')) {
						lastCoderIndex = i;
						break;
					}
				}

				// If no coder in chain, do not reset
				if (lastCoderIndex === -1) return;

				// Walk forward from coder index and check if BOTH reviewer and test_engineer have appeared
				const afterCoder = delegationChain.slice(lastCoderIndex);
				let hasReviewer = false;
				let hasTestEngineer = false;

				for (const delegation of afterCoder) {
					const target = stripKnownSwarmPrefix(delegation.to);
					if (target === 'reviewer') hasReviewer = true;
					if (target === 'test_engineer') hasTestEngineer = true;
				}

				// Only reset when BOTH have been seen since last coder
				if (hasReviewer && hasTestEngineer) {
					session.qaSkipCount = 0;
					session.qaSkipTaskIds = [];
				}

				// Two-pass iteration over all tracked task states (fixes single-pointer dead-lock on default config)
				// Pass 1: advance all tasks at coder_delegated or pre_check_passed → reviewer_run when reviewer has been seen
				if (hasReviewer && session.taskWorkflowStates) {
					for (const [taskId, state] of session.taskWorkflowStates) {
						if (state === 'coder_delegated' || state === 'pre_check_passed') {
							try {
								advanceTaskState(session, taskId, 'reviewer_run');
							} catch {
								// Non-fatal: state may already be at or past reviewer_run
							}
						}
					}
				}

				// Pass 2: advance all tasks at reviewer_run → tests_run when both reviewer AND test_engineer have been seen
				if (hasReviewer && hasTestEngineer && session.taskWorkflowStates) {
					for (const [taskId, state] of session.taskWorkflowStates) {
						if (state === 'reviewer_run') {
							try {
								advanceTaskState(session, taskId, 'tests_run');
							} catch {
								// Non-fatal: state may already be at or past tests_run
							}
						}
					}
				}
			}
		}
	};

	return {
		messagesTransform: async (
			_input: Record<string, never>,
			output: { messages?: MessageWithParts[] },
		): Promise<void> => {
			// biome-ignore lint/suspicious/noExplicitAny: output type from LLM API is not fully typed
			const messages = (output as any).messages;
			if (!messages || messages.length === 0) return;

			// Find the last user message
			let lastUserMessageIndex = -1;
			for (let i = messages.length - 1; i >= 0; i--) {
				if (messages[i]?.info?.role === 'user') {
					lastUserMessageIndex = i;
					break;
				}
			}

			if (lastUserMessageIndex === -1) return;

			const lastUserMessage = messages[lastUserMessageIndex];
			if (!lastUserMessage?.parts) return;

			// Only operate when architect is the active agent
			// Check if agent is undefined (main session = architect) or is 'architect' (after stripping prefix)
			const agent = lastUserMessage.info?.agent;
			const strippedAgent = agent ? stripKnownSwarmPrefix(agent) : undefined;
			if (strippedAgent && strippedAgent !== 'architect') return;

			// Find the first text part
			const textPartIndex = lastUserMessage.parts.findIndex(
				(p: MessagePart) => p?.type === 'text' && p.text !== undefined,
			);

			if (textPartIndex === -1) return;

			const textPart = lastUserMessage.parts[textPartIndex];
			const text = textPart.text ?? '';

			// Progressive task disclosure: trim task list to a window around the current task
			// Scans the text for task list blocks containing '- [ ]' or '- [x]' with task IDs.
			// If more than 5 tasks are visible, trims to: currentTask ± window.
			const taskDisclosureSessionID = lastUserMessage.info?.sessionID;
			if (taskDisclosureSessionID) {
				const taskSession = ensureAgentSession(taskDisclosureSessionID);
				const currentTaskIdForWindow = taskSession.currentTaskId;
				if (currentTaskIdForWindow) {
					// Match task list lines: '- [ ] N.M: ...' or '- [x] N.M: ...' or '- N.M: ...'
					const taskLineRegex =
						/^[ \t]*-[ \t]*(?:\[[ x]\][ \t]+)?(\d+\.\d+(?:\.\d+)*)[:. ].*/gm;
					const taskLines: Array<{
						line: string;
						taskId: string;
						index: number;
					}> = [];
					taskLineRegex.lastIndex = 0;
					let regexMatch = taskLineRegex.exec(text);
					while (regexMatch !== null) {
						taskLines.push({
							line: regexMatch[0],
							taskId: regexMatch[1],
							index: regexMatch.index,
						});
						regexMatch = taskLineRegex.exec(text);
					}

					if (taskLines.length > 5) {
						// Find the index of the current task in the task list
						const currentIdx = taskLines.findIndex(
							(t) => t.taskId === currentTaskIdForWindow,
						);
						const windowStart = Math.max(0, currentIdx - 2);
						const windowEnd = Math.min(taskLines.length - 1, currentIdx + 3);
						const visibleTasks = taskLines.slice(windowStart, windowEnd + 1);
						const hiddenBefore = windowStart;
						const hiddenAfter = taskLines.length - 1 - windowEnd;
						const totalTasks = taskLines.length;
						const visibleCount = visibleTasks.length;

						// Build the trimmed text:
						// Replace the task list region with the windowed version
						const firstTaskIndex = taskLines[0].index;
						const lastTask = taskLines[taskLines.length - 1];
						const lastTaskEnd = lastTask.index + lastTask.line.length;

						const before = text.slice(0, firstTaskIndex);
						const after = text.slice(lastTaskEnd);

						const visibleLines = visibleTasks.map((t) => t.line).join('\n');
						const trimComment = `[Task window: showing ${visibleCount} of ${totalTasks} tasks]`;
						const trimmedMiddle =
							(hiddenBefore > 0
								? `[...${hiddenBefore} tasks hidden...]\n`
								: '') +
							visibleLines +
							(hiddenAfter > 0 ? `\n[...${hiddenAfter} tasks hidden...]` : '');

						textPart.text = `${before}${trimmedMiddle}\n${trimComment}${after}`;
					}
				}
			}

			// Check for zero-coder-delegation violation (v6.12 Anti-Process-Violation)
			// Detect when architect writes to non-.swarm/ files without ever delegating to coder
			// This check runs for ALL architect messages (not just coder delegations)
			const sessionID = lastUserMessage.info?.sessionID;

			// Step 1: Extract task ID from TASK line (if present)
			const taskIdMatch = text.match(/TASK:\s*(.+?)(?:\n|$)/i);
			const currentTaskId = taskIdMatch ? taskIdMatch[1].trim() : null;

			// Step 2: Detect if this is a coder delegation BEFORE running violation check
			const coderDelegationPattern = /(?:^|\n)\s*(?:\w+_)?coder\s*\n\s*TASK:/i;
			const isCoderDelegation = coderDelegationPattern.test(text);

			// Capture the prior coder task ID BEFORE Step 3 updates lastCoderDelegationTaskId
			const priorCoderTaskId = sessionID
				? (ensureAgentSession(sessionID).lastCoderDelegationTaskId ?? null)
				: null;

			// Step 3: If this is a coder delegation with a task ID, track it
			if (sessionID && isCoderDelegation && currentTaskId) {
				const session = ensureAgentSession(sessionID);
				session.lastCoderDelegationTaskId = currentTaskId;

				// v6.21 Task 5.3: Extract FILE: directive values → declaredCoderScope
				const fileDirPattern = /^FILE:\s*(.+)$/gm;
				const declaredFiles: string[] = [];
				for (const match of text.matchAll(fileDirPattern)) {
					const filePath = match[1].trim();
					if (filePath.length > 0 && !declaredFiles.includes(filePath)) {
						declaredFiles.push(filePath);
					}
				}
				session.declaredCoderScope =
					declaredFiles.length > 0 ? declaredFiles : null;

				// OBSERVE-ONLY (Phase 2): Record coder delegation in task state machine for telemetry.
				// Error swallowing is intentional — Phase 3 enforcement gates will check state directly
				// at enforcement time. A transition failure here means state is already recorded or a
				// re-delegation occurred; the gate continues correctly regardless.
				try {
					advanceTaskState(session, currentTaskId, 'coder_delegated');
				} catch (err) {
					// INVALID_TASK_STATE_TRANSITION is non-fatal in Phase 2 (observe-only)
					console.warn(
						`[delegation-gate] state machine warn: ${err instanceof Error ? err.message : String(err)}`,
					);
				}
			}

			// Step 4: Run zero-coder-delegation warning only if:
			// - Not a coder delegation message
			// - Has a task ID (not null)
			// - Architect has written files
			// - Task ID differs from last coder delegation
			if (sessionID && !isCoderDelegation && currentTaskId) {
				const session = ensureAgentSession(sessionID);
				if (
					session.architectWriteCount > 0 &&
					session.lastCoderDelegationTaskId !== currentTaskId
				) {
					// Inject warning directly into message
					const warningText = `⚠️ DELEGATION VIOLATION: Code modifications detected for task ${currentTaskId} with zero coder delegations.\nRule 1: DELEGATE all coding to coder. You do NOT write code.`;
					textPart.text = `${warningText}\n\n${text}`;
				}
			}

			// Deliberation preamble: inject last-gate context + deliberation prompt
			// This runs for ALL architect messages (before coder-delegation early return)
			{
				const deliberationSessionID = lastUserMessage.info?.sessionID;
				if (deliberationSessionID) {
					// Fix 1: Validate sessionID format before calling ensureAgentSession()
					if (!/^[a-zA-Z0-9_-]{1,128}$/.test(deliberationSessionID)) {
						// Invalid format - skip preamble injection
					} else {
						const deliberationSession = ensureAgentSession(
							deliberationSessionID,
						);
						const lastGate = deliberationSession.lastGateOutcome;
						let preamble: string;
						if (lastGate) {
							const gateResult = lastGate.passed ? 'PASSED' : 'FAILED';
							// Fix 2 & 3: Sanitize and truncate interpolated values
							const sanitizedGate = lastGate.gate
								.replace(/\[/g, '(')
								.replace(/\]/g, ')')
								.replace(/[\r\n]/g, ' ')
								.slice(0, 64);
							const sanitizedTaskId = lastGate.taskId
								.replace(/\[/g, '(')
								.replace(/\]/g, ')')
								.replace(/[\r\n]/g, ' ')
								.slice(0, 32);
							preamble = `[Last gate: ${sanitizedGate} ${gateResult} for task ${sanitizedTaskId}]\n[DELIBERATE: Before proceeding — what is the SINGLE next task? What gates must it pass?]`;
						} else {
							preamble = `[DELIBERATE: Identify the first task from the plan. What gates must it pass before marking complete?]`;
						}
						const currentText = textPart.text ?? '';
						textPart.text = `${preamble}\n\n${currentText}`;
					}
				}
			}

			// Early return if not a coder delegation (skip rest of checks)
			if (!isCoderDelegation) return;

			// Run heuristic checks and collect warnings
			const warnings: string[] = [];

			// Check for oversized delegation
			if (text.length > delegationMaxChars) {
				warnings.push(
					`Delegation exceeds recommended size (${text.length} chars, limit ${delegationMaxChars}). Consider splitting into smaller tasks.`,
				);
			}

			// Check for multiple FILE: directives
			const fileMatches = text.match(/^FILE:/gm);
			if (fileMatches && fileMatches.length > 1) {
				warnings.push(
					`Multiple FILE: directives detected (${fileMatches.length}). Each coder task should target ONE file.`,
				);
			}

			// Check for multiple TASK: sections
			const taskMatches = text.match(/^TASK:/gm);
			if (taskMatches && taskMatches.length > 1) {
				warnings.push(
					`Multiple TASK: sections detected (${taskMatches.length}). Send ONE task per coder call.`,
				);
			}

			// Check for batching language (punctuation-tolerant)
			const batchingPattern =
				/\b(?:and also|then also|additionally|as well as|along with|while you'?re at it)[.,]?\b/gi;
			const batchingMatches = text.match(batchingPattern);
			if (batchingMatches && batchingMatches.length > 0) {
				warnings.push(
					`Batching language detected (${batchingMatches.join(', ')}). Break compound objectives into separate coder calls.`,
				);
			}

			// Check for " and " connecting separate actions in the TASK line
			// Use simpler heuristic: look for "and" between capitalized words or common patterns
			const taskLine = extractTaskLine(text);
			if (taskLine) {
				// Simple heuristic: " and " followed by a verb-like word
				// Pattern: "word(s) and verb" where verb is action-like
				const andPattern =
					/\s+and\s+(update|add|remove|modify|refactor|implement|create|delete|fix|change|build|deploy|write|test|move|rename|extend|extract|convert|migrate|upgrade|replace)\b/i;
				if (andPattern.test(taskLine)) {
					warnings.push('TASK line contains "and" connecting separate actions');
				}
			}

			// Check for protocol violation: coder → coder without reviewer/test_engineer
			if (sessionID) {
				const delegationChain = swarmState.delegationChains.get(sessionID);
				if (delegationChain && delegationChain.length >= 2) {
					// Find the two most recent coder delegations
					const coderIndices: number[] = [];
					for (let i = delegationChain.length - 1; i >= 0; i--) {
						if (
							stripKnownSwarmPrefix(delegationChain[i].to).includes('coder')
						) {
							coderIndices.unshift(i);
							if (coderIndices.length === 2) break;
						}
					}

					// Only check if there are at least 2 coder delegations (previous + current)
					if (coderIndices.length === 2) {
						const prevCoderIndex = coderIndices[0];
						// Check between previous coder and end of chain for reviewer and test_engineer
						const betweenCoders = delegationChain.slice(prevCoderIndex + 1);
						const hasReviewer = betweenCoders.some(
							(d) => stripKnownSwarmPrefix(d.to) === 'reviewer',
						);
						const hasTestEngineer = betweenCoders.some(
							(d) => stripKnownSwarmPrefix(d.to) === 'test_engineer',
						);

						// State machine secondary signal: if the prior task is still in
						// 'coder_delegated' state, reviewer and tests never ran for it.
						const session = ensureAgentSession(sessionID);
						const priorTaskStuckAtCoder =
							priorCoderTaskId !== null &&
							getTaskState(session, priorCoderTaskId) === 'coder_delegated';

						if (!hasReviewer || !hasTestEngineer || priorTaskStuckAtCoder) {
							// Escalating enforcement: warn on first skip, hard block on second
							if (session.qaSkipCount >= 1) {
								const skippedTasks = session.qaSkipTaskIds.join(', ');
								throw new Error(
									`🛑 QA GATE ENFORCEMENT: ${session.qaSkipCount + 1} consecutive coder delegations without reviewer/test_engineer. ` +
										`Skipped tasks: [${skippedTasks}]. ` +
										`DELEGATE to reviewer and test_engineer NOW before any further coder work.`,
								);
							}
							// First skip: warn but don't block
							session.qaSkipCount++;
							session.qaSkipTaskIds.push(currentTaskId ?? 'unknown');
							warnings.push(
								`⚠️ PROTOCOL VIOLATION: Previous coder task completed, but QA gate was skipped. ` +
									`You MUST delegate to reviewer (code review) and test_engineer (test execution) ` +
									`before starting a new coder task. Review RULES 7-8 in your system prompt.`,
							);
						}
					}
				}
			}

			// If no warnings, return
			if (warnings.length === 0) return;

			// Build warning text in v6.12 format
			const warningLines = warnings.map((w) => `Detected signal: ${w}`);
			const warningText = `⚠️ BATCH DETECTED: Your coder delegation appears to contain multiple tasks.
Rule 3: ONE task per coder call. Split this into separate delegations.
${warningLines.join('\n')}`;

			// Prepend warning to the text part
			const originalText = textPart.text ?? '';
			textPart.text = `${warningText}\n\n${originalText}`;
		},
		toolAfter,
	};
}
