/**
 * Repo-Map Injector Hook for opencode-swarm.
 *
 * Auto-injects localization context into architect messages when the architect
 * is about to delegate to a coder via a Task tool call. Follows the same
 * safeHook / budget-aware / idempotent pattern as knowledge-injector.
 *
 * Trigger conditions (all must be true):
 *   1. Agent is the architect
 *   2. Messages contain a pending Task delegation (tool_use part with "Task")
 *   3. The task references specific files
 *   4. Repo map exists at .swarm/repo-map.json and is reasonably fresh
 *
 * Injection: compact one-line summary per referenced file, placed before the
 * last user message. Fixed budget of ~500 tokens (~1 500 chars at 0.33 tok/char).
 * Silently skips on any error or missing data — this is an enhancement, not
 * critical-path logic.
 */

import { stripKnownSwarmPrefix } from '../config/schema.js';
import type { MessageWithParts } from './knowledge-types.js';
import { readSwarmFileAsync, safeHook } from './utils.js';

// ============================================================================
// Constants
// ============================================================================

/** Fixed character budget for repo-map injection (~500 tokens). */
const INJECT_CHAR_BUDGET = 1_500;

/** Minimum headroom chars required before injection activates. */
const MIN_HEADROOM_CHARS = 500;

/** Seconds after which the cached repo map is considered stale. */
const MAP_STALENESS_SECONDS = 300; // 5 minutes

/** Token-to-char ratio (matches estimateTokens in utils.ts). */
const CHARS_PER_TOKEN = 1 / 0.33;

/** Approximate model context limit in chars. */
const MODEL_LIMIT_CHARS = Math.floor(128_000 * CHARS_PER_TOKEN);

/** Headroom fraction below which injection is skipped. */
const CONTEXT_FULL_THRESHOLD = 0.8;

/** Injection marker used for idempotency checks. */
const INJECTION_MARKER = '[REPO-MAP CONTEXT]';

/** Regex to extract file paths from message text. */
const FILE_PATH_PATTERN =
	/(?:^|[\s"'`(]|FILE[Ss]?[:\s])([\w./-]+\.[a-zA-Z]{1,4})/g;

// ============================================================================
// Internal Helpers (NOT exported)
// ============================================================================

/** Returns true if this agent is the architect. */
function isArchitectAgent(agentName: string): boolean {
	const stripped = stripKnownSwarmPrefix(agentName);
	return stripped.toLowerCase() === 'architect';
}

/**
 * Parses a RepoMap JSON object from raw text.
 * Returns null on any parse failure.
 */
interface RepoMapEntry {
	filePath: string;
	exports: Array<{ name: string; exported: boolean }>;
	imports: Array<{ source: string }>;
	importanceScore: number;
}

interface RepoMap {
	generatedAt: string;
	files: Record<string, RepoMapEntry>;
}

function parseRepoMap(raw: string): RepoMap | null {
	try {
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return null;
		if (!parsed.files || typeof parsed.files !== 'object') return null;
		if (!parsed.generatedAt || typeof parsed.generatedAt !== 'string')
			return null;
		return parsed as RepoMap;
	} catch {
		return null;
	}
}

/**
 * Returns true if the repo map was generated recently enough to use.
 */
function isFresh(generatedAt: string): boolean {
	try {
		const generated = new Date(generatedAt).getTime();
		if (Number.isNaN(generated)) return false;
		const ageSeconds = (Date.now() - generated) / 1000;
		return ageSeconds < MAP_STALENESS_SECONDS;
	} catch {
		return false;
	}
}

/**
 * Extract file paths mentioned in message text content.
 * Looks for typical file path patterns: src/foo.ts, ./bar/baz.py, etc.
 * Returns a deduplicated set of normalised forward-slash paths.
 */
function extractReferencedFiles(messages: MessageWithParts[]): Set<string> {
	const files = new Set<string>();

	for (const msg of messages) {
		if (!msg.parts) continue;
		for (const part of msg.parts) {
			if (part.type !== 'text' || !part.text) continue;

			// Use matchAll to avoid assignment-in-expression lint issue
			const allMatches = [...part.text.matchAll(FILE_PATH_PATTERN)];
			for (const m of allMatches) {
				const candidate = m[1];
				// Skip if it looks like a URL
				if (candidate.startsWith('http')) {
					continue;
				}
				// Skip if no directory separator (bare filename)
				if (!candidate.includes('/') && !candidate.includes('\\')) {
					continue;
				}
				// Normalise to forward slashes
				const normalised = candidate.replace(/\\/g, '/');
				// Skip very short or obviously wrong matches
				if (normalised.length < 5) {
					continue;
				}
				files.add(normalised);
			}
		}
	}

	return files;
}

/**
 * Check whether messages contain a pending Task tool delegation.
 * Looks for assistant messages with tool_use parts whose name is "Task".
 */
function hasPendingTaskDelegation(messages: MessageWithParts[]): boolean {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.info?.role !== 'assistant') continue;
		if (!msg.parts) continue;
		for (const part of msg.parts) {
			if (part.type === 'tool_use') {
				const toolName = (part as { name?: string }).name;
				if (toolName === 'Task' || toolName === 'task') {
					return true;
				}
			}
		}
	}
	return false;
}

/**
 * Build a compact localisation summary for a single file from the repo map.
 * Format: File: src/foo.ts | Imported by: 3 | Key exports: scan(), validate() | Blast radius: 5
 */
function buildFileSummary(
	fileKey: string,
	entry: RepoMapEntry,
	map: RepoMap,
): string {
	// Count importers (files that import from this file)
	let importCount = 0;
	for (const [, other] of Object.entries(map.files)) {
		if (other === entry) continue;
		if (other.imports?.some((imp) => imp.source === fileKey)) {
			importCount++;
		}
	}

	// Key exports (exported symbols, limited to 3 for compactness)
	const exportedNames = (entry.exports ?? [])
		.filter((e) => e.exported)
		.map((e) => e.name)
		.slice(0, 3);
	const exportsStr = exportedNames.length > 0 ? exportedNames.join(', ') : '-';

	// Rough blast radius: direct importers + their importers
	const directImporters: string[] = [];
	for (const [otherKey, other] of Object.entries(map.files)) {
		if (other === entry) continue;
		if (other.imports?.some((imp) => imp.source === fileKey)) {
			directImporters.push(otherKey);
		}
	}

	let blastRadius = directImporters.length;
	for (const importer of directImporters) {
		const importerEntry = map.files[importer];
		if (!importerEntry) continue;
		for (const [thirdKey, third] of Object.entries(map.files)) {
			if (third === importerEntry || third === entry) continue;
			if (
				third.imports?.some((imp) => imp.source === importer) &&
				!directImporters.includes(thirdKey)
			) {
				blastRadius++;
			}
		}
	}

	return `File: ${fileKey} | Imported by: ${importCount} | Key exports: ${exportsStr} | Blast radius: ${blastRadius}`;
}

/**
 * Build the full injection block from the repo map and referenced files.
 * Respects the character budget by trimming files from the end.
 */
function buildInjectionBlock(
	map: RepoMap,
	referencedFiles: Set<string>,
): string | null {
	if (referencedFiles.size === 0) return null;

	const lines: string[] = [];

	for (const filePath of referencedFiles) {
		// Try exact match first, then try stripping leading ./ or matching by end
		let entry = map.files[filePath];
		if (!entry) {
			const stripped = filePath.replace(/^\.\//, '');
			entry = map.files[stripped];
		}
		if (!entry) {
			// Try matching by file path suffix (e.g. map has "src/foo.ts" and reference is "foo.ts")
			for (const [key, val] of Object.entries(map.files)) {
				if (key.endsWith(filePath) || filePath.endsWith(key)) {
					entry = val;
					break;
				}
			}
		}
		if (entry) {
			// Find the key used in the map for this entry for correct importer lookup
			let mapKey = filePath;
			for (const [key, val] of Object.entries(map.files)) {
				if (val === entry) {
					mapKey = key;
					break;
				}
			}
			lines.push(buildFileSummary(mapKey, entry, map));
		}
	}

	if (lines.length === 0) return null;

	// Build the block and trim to budget
	let block =
		`${INJECTION_MARKER}\n` +
		'Structural localization for files in this task:\n' +
		lines.join('\n');

	while (block.length > INJECT_CHAR_BUDGET && lines.length > 0) {
		lines.pop();
		block =
			`${INJECTION_MARKER}\n` +
			'Structural localization for files in this task:\n' +
			lines.join('\n');
	}

	return lines.length > 0 ? block : null;
}

/**
 * Inserts the repo-map block just before the last user message.
 * Skips if already injected (idempotency guard).
 */
function injectRepoMapMessage(
	output: { messages?: MessageWithParts[] },
	text: string,
): void {
	if (!output.messages) return;

	// Idempotency: skip if already injected
	const alreadyInjected = output.messages.some((m) =>
		m.parts?.some((p) => p.text?.includes(INJECTION_MARKER)),
	);
	if (alreadyInjected) return;

	// Insert before last user message (same position as knowledge-injector)
	let insertIdx = output.messages.length - 1;
	for (let i = output.messages.length - 1; i >= 0; i--) {
		if (output.messages[i].info?.role === 'user') {
			insertIdx = i;
			break;
		}
	}

	const repoMapMessage: MessageWithParts = {
		info: { role: 'system' },
		parts: [{ type: 'text', text }],
	};

	output.messages.splice(insertIdx, 0, repoMapMessage);
}

// ============================================================================
// Exported Factory Function
// ============================================================================

/**
 * Creates a repo-map injector hook that auto-injects structural localization
 * context into architect messages when delegating to a coder.
 *
 * @param directory - The project directory containing .swarm/
 * @returns A hook function that injects repo-map context into messages
 */
export function createRepoMapInjectorHook(
	directory: string,
): (
	input: Record<string, never>,
	output: { messages?: MessageWithParts[] },
) => Promise<void> {
	// Module-level cache for the raw repo-map JSON to avoid re-reading disk
	// on every transform call. Invalidate when stale.
	let cachedRaw: string | null = null;
	let cachedMapTime = 0;

	return safeHook(
		async (
			_input: Record<string, never>,
			output: { messages?: MessageWithParts[] },
		) => {
			if (!output.messages || output.messages.length === 0) return;

			// 1. Agent check — only architect
			const systemMsg = output.messages.find((m) => m.info?.role === 'system');
			const agentName = systemMsg?.info?.agent;
			if (!agentName || !isArchitectAgent(agentName)) return;

			// 2. Check for pending Task delegation
			if (!hasPendingTaskDelegation(output.messages)) return;

			// 3. Budget check — skip if context is >80% full
			const existingChars = output.messages.reduce((sum, msg) => {
				return (
					sum + (msg.parts?.reduce((s, p) => s + (p.text?.length ?? 0), 0) ?? 0)
				);
			}, 0);
			const usageRatio = existingChars / MODEL_LIMIT_CHARS;
			if (usageRatio > CONTEXT_FULL_THRESHOLD) {
				return;
			}
			const headroomChars = MODEL_LIMIT_CHARS - existingChars;
			if (headroomChars < MIN_HEADROOM_CHARS) {
				return;
			}

			// 4. Read repo map from cache file
			const now = Date.now();
			if (
				cachedRaw === null ||
				now - cachedMapTime > MAP_STALENESS_SECONDS * 1000
			) {
				const raw = await readSwarmFileAsync(directory, 'repo-map.json');
				if (!raw) return; // No repo map — silently skip
				cachedRaw = raw;
				cachedMapTime = now;
			}

			const map = parseRepoMap(cachedRaw);
			if (!map) {
				cachedRaw = null; // Invalidate bad cache
				return;
			}

			// 5. Freshness check
			if (!isFresh(map.generatedAt)) return;

			// 6. Extract referenced files from messages
			const referencedFiles = extractReferencedFiles(output.messages);
			if (referencedFiles.size === 0) return;

			// 7. Build and inject
			const block = buildInjectionBlock(map, referencedFiles);
			if (!block) return;

			injectRepoMapMessage(output, block);
		},
	);
}
