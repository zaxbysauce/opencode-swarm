/**
 * Delegation Gate Hook
 *
 * Warns the architect when coder delegations are too large or batched.
 * Uses experimental.chat.messages.transform to provide non-blocking guidance.
 */

import type { PluginConfig } from '../config';
import { stripKnownSwarmPrefix } from '../config/schema';
import { ensureAgentSession, swarmState } from '../state';

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
export function createDelegationGateHook(
	config: PluginConfig,
): (
	input: Record<string, never>,
	output: { messages?: MessageWithParts[] },
) => Promise<void> {
	const enabled =
		(config.hooks as Record<string, unknown> | undefined)?.delegation_gate !==
		false;
	const delegationMaxChars =
		((config.hooks as Record<string, unknown> | undefined)
			?.delegation_max_chars as number | undefined) ?? 4000;

	if (!enabled) {
		return async (
			_input: Record<string, never>,
			_output: { messages?: MessageWithParts[] },
		): Promise<void> => {
			// No-op when delegation gate is disabled
		};
	}

	return async (
		_input: Record<string, never>,
		output: { messages?: MessageWithParts[] },
	): Promise<void> => {
		const messages = output?.messages;
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
			(p) => p?.type === 'text' && p.text !== undefined,
		);

		if (textPartIndex === -1) return;

		const textPart = lastUserMessage.parts[textPartIndex];
		const text = textPart.text ?? '';

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

		// Step 3: If this is a coder delegation with a task ID, track it
		if (sessionID && isCoderDelegation && currentTaskId) {
			const session = ensureAgentSession(sessionID);
			session.lastCoderDelegationTaskId = currentTaskId;
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
					if (stripKnownSwarmPrefix(delegationChain[i].to).includes('coder')) {
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

					if (!hasReviewer || !hasTestEngineer) {
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
	};
}
