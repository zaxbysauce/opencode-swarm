/**
 * Delegation Gate Hook
 *
 * Warns the architect when coder delegations are too large or batched.
 * Uses experimental.chat.messages.transform to provide non-blocking guidance.
 */

import type { PluginConfig } from '../config';
import { stripKnownSwarmPrefix } from '../config/schema';

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

		// Detect if this is a coder delegation
		// Matches lines like "coder\nTASK:" or "mega_coder\nTASK:" etc.
		const coderDelegationPattern = /(?:^|\n)\s*(?:\w+_)?coder\s*\n\s*TASK:/i;
		if (!coderDelegationPattern.test(text)) return;

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

		// Check for batching language
		const batchingPattern =
			/\b(?:and also|then also|additionally|as well as|along with)\b/gi;
		const batchingMatches = text.match(batchingPattern);
		if (batchingMatches && batchingMatches.length > 0) {
			warnings.push(
				'Batching language detected. Break compound objectives into separate coder calls.',
			);
		}

		// If no warnings, return
		if (warnings.length === 0) return;

		// Build warning text
		const warningText = `[⚠️ DELEGATION GATE: Your coder delegation may be too complex. Issues:\n${warnings.join('\n')}\nSplit into smaller, atomic tasks for better results.]`;

		// Prepend warning to the text part
		const originalText = textPart.text ?? '';
		textPart.text = `${warningText}\n\n${originalText}`;
	};
}
