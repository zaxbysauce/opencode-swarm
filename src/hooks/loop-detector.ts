/**
 * Loop detector for Task tool delegations.
 * Tracks the last 10 delegation patterns per session using a sliding window.
 * Detects loops when the same (toolName + targetAgent + firstArgKey) hash
 * appears 3 or more consecutive times.
 */

import { swarmState } from '../state';

export interface LoopDetectResult {
	looping: boolean;
	count: number;
	pattern: string;
}

/**
 * Hash a delegation call into a short string key.
 * Combines toolName, targetAgent (subagent_type), and first arg key.
 */
function hashDelegation(
	toolName: string,
	args: Record<string, unknown> | undefined,
): string {
	const targetAgent =
		typeof args?.subagent_type === 'string' ? args.subagent_type : 'unknown';
	const firstArgKey =
		args != null ? (Object.keys(args)[0] ?? 'noargs') : 'noargs';
	return `${toolName}:${targetAgent}:${firstArgKey}`;
}

/**
 * Detect delegation loops for a session.
 * Only tracks Task tool calls (agent delegations).
 * Returns the current loop state after recording this call.
 */
export function detectLoop(
	sessionId: string,
	toolName: string,
	args: unknown,
): LoopDetectResult {
	// Only track Task tool calls
	if (toolName !== 'Task') {
		return { looping: false, count: 0, pattern: '' };
	}

	const session = swarmState.agentSessions.get(sessionId);
	if (!session) {
		return { looping: false, count: 0, pattern: '' };
	}

	// Ensure the window exists
	if (!session.loopDetectionWindow) {
		session.loopDetectionWindow = [];
	}

	const argsRecord =
		args != null && typeof args === 'object' && !Array.isArray(args)
			? (args as Record<string, unknown>)
			: undefined;

	const hash = hashDelegation(toolName, argsRecord);
	const now = Date.now();

	// Append to sliding window, cap at 10 entries
	session.loopDetectionWindow.push({ hash, timestamp: now });
	if (session.loopDetectionWindow.length > 10) {
		session.loopDetectionWindow.shift();
	}

	// Count consecutive identical hashes at the tail
	const window = session.loopDetectionWindow;
	let consecutiveCount = 0;
	for (let i = window.length - 1; i >= 0; i--) {
		if (window[i].hash === hash) {
			consecutiveCount++;
		} else {
			break;
		}
	}

	return {
		looping: consecutiveCount >= 3,
		count: consecutiveCount,
		pattern: hash,
	};
}
