/**
 * DELEGATION LEDGER (v6.31 Task 3.2)
 *
 * tool.execute.after hook that maintains a per-session in-memory ledger of tool calls
 * made during a delegation. When the architect session receives a message (resume),
 * injects a compact DELEGATION SUMMARY via pendingAdvisoryMessages.
 *
 * No file I/O — fully in-memory.
 */

import { swarmState } from '../state';
import { normalizeToolNameLowerCase } from './normalize-tool-name';

export interface LedgerEntry {
	agent: string;
	tool: string;
	file?: string; // extracted from args.path/filePath if present
	duration_ms: number;
	success: boolean;
	timestamp: number;
}

export interface DelegationLedgerConfig {
	enabled: boolean; // default true
}

/**
 * In-memory ledger stored per-session.
 * Key: sessionId, Value: list of tool call entries
 */
const ledgerBySession = new Map<string, LedgerEntry[]>();

// Track call start times: key = sessionId:callID
const callStartTimes = new Map<string, number>();

/**
 * Creates the delegation ledger hook pair (toolAfter + summary injection).
 */
export function createDelegationLedgerHook(
	config: Partial<DelegationLedgerConfig>,
	_directory: string, // reserved for future use
	injectAdvisory: (sessionId: string, message: string) => void,
): {
	toolAfter: (
		input: {
			tool: string;
			sessionID: string;
			callID: string;
			args?: Record<string, unknown>;
		},
		output: { title: string; output: string; metadata: unknown },
	) => Promise<void>;
	onArchitectResume: (sessionId: string) => void; // call when architect session gets a new message
} {
	const enabled = config.enabled ?? true;

	return {
		toolAfter: async (input, output) => {
			if (!enabled) return;

			const sessionId = input.sessionID;

			// Record start time if toolBefore logged it, else estimate
			const startKey = `${sessionId}:${input.callID}`;
			const startTime = callStartTimes.get(startKey) ?? Date.now();
			callStartTimes.delete(startKey);
			const duration_ms = Date.now() - startTime;

			// Determine file touched (if any)
			const args = input.args ?? {};
			const file =
				typeof args.path === 'string'
					? args.path
					: typeof args.filePath === 'string'
						? args.filePath
						: typeof args.file === 'string'
							? args.file
							: undefined;

			// Determine agent name
			const session = swarmState.agentSessions.get(sessionId); // ← needs swarmState import
			const agentName =
				swarmState.activeAgent?.get(sessionId) ??
				session?.agentName ??
				'unknown';

			// Determine success from output — conservative check
			const outputStr = String(output.output ?? '');
			const success =
				!outputStr.startsWith('Error:') && !outputStr.startsWith('error: ');

			const entry: LedgerEntry = {
				agent: agentName,
				tool: input.tool,
				file,
				duration_ms,
				success,
				timestamp: Date.now(),
			};

			const existing = ledgerBySession.get(sessionId) ?? [];
			existing.push(entry);
			ledgerBySession.set(sessionId, existing);
		},

		onArchitectResume: (architectSessionId: string) => {
			if (!enabled) return;

			// Collect entries from all non-architect sessions
			// (we gather the most recent delegation's entries)
			const allEntries: LedgerEntry[] = [];
			for (const [sessionId, entries] of ledgerBySession) {
				if (sessionId === architectSessionId) continue; // skip architect's own calls
				allEntries.push(...entries);
			}

			if (allEntries.length === 0) return;

			// Clear ledger after generating summary
			for (const sessionId of ledgerBySession.keys()) {
				if (sessionId !== architectSessionId) {
					ledgerBySession.delete(sessionId);
				}
			}

			// Build the DELEGATION SUMMARY
			const toolCallCount = allEntries.length;
			const filesModified = [
				...new Set(
					allEntries
						.filter((e) => isWriteTool(e.tool) && e.file)
						.map((e) => e.file!),
				),
			];
			const filesRead = [
				...new Set(
					allEntries
						.filter((e) => isReadTool(e.tool) && e.file)
						.map((e) => e.file!),
				),
			];
			const failedCalls = allEntries.filter((e) => !e.success).length;
			const scopeViolations = allEntries.filter((e) =>
				e.tool.includes('scope'),
			).length;

			const summary = [
				`DELEGATION SUMMARY:`,
				`  Tool calls: ${toolCallCount}${failedCalls > 0 ? ` (${failedCalls} failed)` : ''}`,
				filesModified.length > 0
					? `  Files modified: ${filesModified.slice(0, 5).join(', ')}${filesModified.length > 5 ? ` (+${filesModified.length - 5} more)` : ''}`
					: null,
				filesRead.length > 0
					? `  Files read: ${filesRead.slice(0, 5).join(', ')}${filesRead.length > 5 ? ` (+${filesRead.length - 5} more)` : ''}`
					: null,
				scopeViolations > 0
					? `  ⚠️  ${scopeViolations} scope violation(s) detected`
					: null,
			]
				.filter(Boolean)
				.join('\n');

			try {
				injectAdvisory(architectSessionId, summary);
			} catch {
				/* non-blocking */
			}
		},
	};
}

// Helpers
const WRITE_TOOL_PATTERNS = [
	'write',
	'edit',
	'patch',
	'create',
	'insert',
	'replace',
	'append',
	'prepend',
];
function isWriteTool(toolName: string): boolean {
	const normalized = normalizeToolNameLowerCase(toolName);
	return WRITE_TOOL_PATTERNS.some((p) => normalized.includes(p));
}

const READ_TOOL_PATTERNS = ['read', 'cat', 'view', 'fetch', 'get'];
function isReadTool(toolName: string): boolean {
	const normalized = normalizeToolNameLowerCase(toolName);
	return READ_TOOL_PATTERNS.some((p) => normalized.includes(p));
}
