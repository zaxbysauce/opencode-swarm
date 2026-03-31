/** Phase-Start Knowledge Injection Hook for opencode-swarm v6.17.
 *
 * Injects relevant knowledge (from both swarm + hive tiers) into the architect's
 * context at phase start. Caches the injection text for re-injection after
 * compaction. Skips for non-architect agents. Appends rejected-pattern warnings
 * to prevent re-learning loops.
 */

import { stripKnownSwarmPrefix } from '../config/schema.js';
import { loadPlan } from '../plan/manager.js';
import { getRunMemorySummary } from '../services/run-memory.js';
import {
	buildDriftInjectionText,
	readPriorDriftReports,
} from './curator-drift.js';
import { extractCurrentPhaseFromPlan } from './extractors.js';
import type { ProjectContext, RankedEntry } from './knowledge-reader.js';
import { readMergedKnowledge } from './knowledge-reader.js';
import { readRejectedLessons } from './knowledge-store.js';
import type { KnowledgeConfig, MessageWithParts } from './knowledge-types.js';
import { readSwarmFileAsync, safeHook } from './utils.js';

// ============================================================================
// Internal Helpers (NOT exported)
// ============================================================================

/** Format confidence as star rating. */
function formatStars(confidence: number): string {
	if (confidence >= 0.9) return '★★★';
	if (confidence >= 0.6) return '★★☆';
	return '★☆☆';
}

/** Sanitizes lesson text to prevent prompt injection into LLM context. */
function sanitizeLessonForContext(text: string): string {
	return text
		.split('')
		.filter((char) => {
			const code = char.charCodeAt(0);
			return (
				code === 9 || code === 10 || code === 13 || (code > 31 && code !== 127)
			);
		})
		.join('')
		.replace(/[\u200B-\u200D\uFEFF]/g, '') // Zero-width chars
		.replace(/[\u202A-\u202E\u2066-\u2069]/g, '') // BiDi override chars
		.replace(/```/g, '` ` `') // Break code block escapes
		.replace(/^system\s*:/gim, '[BLOCKED]:'); // Block system: prefix
}

/** Returns true if this agent is the architect (the sole intended recipient of knowledge injection). */
function isOrchestratorAgent(agentName: string): boolean {
	const stripped = stripKnownSwarmPrefix(agentName);
	// Only the architect receives knowledge injection.
	// Using an explicit allowlist prevents unintentional injection into future agents.
	return stripped.toLowerCase() === 'architect';
}

/** Inserts the knowledge block just after the system message (or at position 0 if none). */
function injectKnowledgeMessage(
	output: { messages?: MessageWithParts[] },
	text: string,
): void {
	if (!output.messages) return;

	// Idempotency guard: skip if already injected in this transform
	// All injection types include a unique marker: 📚 Knowledge, <drift_report>, <curator_briefing>
	const alreadyInjected = output.messages.some((m) =>
		m.parts?.some(
			(p) =>
				p.text?.includes('📚 Knowledge') ||
				p.text?.includes('<drift_report>') ||
				p.text?.includes('<curator_briefing>'),
		),
	);
	if (alreadyInjected) return;

	const systemIdx = output.messages.findIndex((m) => m.info?.role === 'system');
	const insertIdx = systemIdx >= 0 ? systemIdx + 1 : 0;

	const knowledgeMessage: MessageWithParts = {
		info: { role: 'system' },
		parts: [{ type: 'text', text }],
	};

	output.messages.splice(insertIdx, 0, knowledgeMessage);
}

// ============================================================================
// Exported Factory Function
// ============================================================================

/**
 * Creates a knowledge injection hook that injects relevant knowledge into the
 * architect's message context at phase start. Supports caching for re-injection
 * after compaction.
 *
 * @param directory - The project directory containing .swarm/
 * @param config - Knowledge system configuration
 * @returns A hook function that injects knowledge into messages
 */
export function createKnowledgeInjectorHook(
	directory: string,
	config: KnowledgeConfig,
): (
	input: Record<string, never>,
	output: { messages?: MessageWithParts[] },
) => Promise<void> {
	let lastSeenPhase: number | null = null;
	let cachedInjectionText: string | null = null;

	return safeHook(
		async (
			_input: Record<string, never>,
			output: { messages?: MessageWithParts[] },
		) => {
			if (!output.messages || output.messages.length === 0) return;

			// Load plan — proceed with default context if no plan exists
			const plan = await loadPlan(directory);
			const currentPhase = plan?.current_phase ?? 1;

			// Context budget check — skip injection when context is stressed
			const totalChars = output.messages.reduce((sum, msg) => {
				return (
					sum + (msg.parts?.reduce((s, p) => s + (p.text?.length ?? 0), 0) ?? 0)
				);
			}, 0);
			if (totalChars > 75_000) return;

			// Agent check — only inject for architect/orchestrator agents
			const systemMsg = output.messages.find((m) => m.info?.role === 'system');
			const agentName = systemMsg?.info?.agent;
			if (!agentName || !isOrchestratorAgent(agentName)) return;

			// Phase transition detection
			if (currentPhase === lastSeenPhase && cachedInjectionText !== null) {
				// Same phase, cached text available — re-inject (handles compaction)
				injectKnowledgeMessage(output, cachedInjectionText);
				return;
			} else if (currentPhase !== lastSeenPhase) {
				// Phase changed — invalidate cache
				lastSeenPhase = currentPhase;
				cachedInjectionText = null;
			}

			// Build context for merged knowledge read
			const phaseDescription = plan
				? (extractCurrentPhaseFromPlan(plan) ?? `Phase ${currentPhase}`)
				: 'Phase 0';
			const context: ProjectContext = {
				projectName: plan?.title ?? 'unknown',
				currentPhase: phaseDescription,
			};

			// Retrieve merged knowledge (both tiers, deduped and ranked)
			const entries = await readMergedKnowledge(directory, config, context);

			// Build drift/briefing preamble into a LOCAL variable so cachedInjectionText
			// is never mutated before we know whether entries exist. This prevents the
			// phase-detection early-return (cachedInjectionText !== null) from firing
			// on subsequent calls with only a partial drift-only cache.
			let freshPreamble: string | null = null;

			// Drift injection: prepend latest drift report summary
			try {
				const driftReports = await readPriorDriftReports(directory);
				if (driftReports.length > 0) {
					const latestReport = driftReports[driftReports.length - 1];
					const driftText = buildDriftInjectionText(latestReport, 500);
					if (driftText) {
						freshPreamble = driftText;
					}
				}
			} catch {
				// drift injection failures must never propagate
			}

			// Curator briefing injection: include session-start briefing from curator init
			try {
				const briefingContent = await readSwarmFileAsync(
					directory,
					'curator-briefing.md',
				);
				if (briefingContent) {
					// Truncate to stay within token budget (same 500 char limit as drift)
					const truncatedBriefing = briefingContent.slice(0, 500);
					freshPreamble = freshPreamble
						? `<curator_briefing>${truncatedBriefing}</curator_briefing>\n\n${freshPreamble}`
						: `<curator_briefing>${truncatedBriefing}</curator_briefing>`;
				}
			} catch {
				// curator briefing injection failures must never propagate
			}

			// If no knowledge entries AND no drift/briefing, nothing to inject
			if (entries.length === 0) {
				if (freshPreamble === null) return;
				// Drift or briefing exists — cache and inject it directly
				cachedInjectionText = freshPreamble;
				injectKnowledgeMessage(output, cachedInjectionText);
				return;
			}

			// Get run memory summary to prepend with highest priority
			const runMemory = await getRunMemorySummary(directory);

			// Format injection block with tier labels and star ratings
			const lines = entries.map((entry: RankedEntry) => {
				const stars = formatStars(entry.confidence);
				const tierLabel = `[${entry.tier}:${entry.status}]`;
				const confirmedBy = entry.confirmed_by?.length ?? 0;
				const confirmText =
					confirmedBy > 0
						? `, confirmed by ${confirmedBy} ${
								entry.tier === 'hive' ? 'project' : 'phase'
							}${confirmedBy > 1 ? 's' : ''}`
						: '';
				// source_project only exists on hive entries
				const rawSource =
					entry.tier === 'hive' && 'source_project' in entry
						? ((entry as { source_project?: string }).source_project ??
							'unknown')
						: null;
				const source =
					rawSource !== null
						? ` — Source: ${sanitizeLessonForContext(rawSource)}`
						: '';
				return `${stars} ${tierLabel} ${sanitizeLessonForContext(entry.lesson)}${source}${confirmText}`;
			});

			const knowledgeSection = [
				`📚 Knowledge (${entries.length} relevant lesson${
					entries.length > 1 ? 's' : ''
				}):`,
				'',
				...lines,
				'',
				'These are lessons learned from this project and past projects. Consider them as context but use your judgment — they may not all apply.',
			].join('\n');

			// Build complete injection text in one assignment: preamble (if any) + knowledge
			let injectionText = freshPreamble
				? `${freshPreamble}\n\n${knowledgeSection}`
				: knowledgeSection;

			// Prepend run memory summary if available (highest priority)
			if (runMemory) {
				injectionText = `${runMemory}\n\n${injectionText}`;
			}

			cachedInjectionText = injectionText;

			// Append rejected-pattern warnings (last 3 most recent) to prevent re-learning loops
			const rejected = await readRejectedLessons(directory);
			if (rejected.length > 0) {
				const recentRejected = rejected.slice(-3);
				const rejectedLines = recentRejected.map(
					(r) =>
						`  ⚠️ REJECTED PATTERN: "${sanitizeLessonForContext(r.lesson).slice(0, 80)}" — ${sanitizeLessonForContext(r.rejection_reason)}`,
				);
				cachedInjectionText +=
					'\n\n⚠️ Previously rejected patterns (do not re-learn):\n' +
					rejectedLines.join('\n');
			}

			injectKnowledgeMessage(output, cachedInjectionText);
		},
	);
}
