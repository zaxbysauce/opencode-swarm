/**
 * Session reflection service — two-phase end-of-session architect review.
 *
 * Phase 1 (deterministic): Aggregate session signals — tool failures, gate
 * rejections, error taxonomy, agent dispatches, retro lessons. No LLM, no
 * quota, fast. Produces a structured snapshot the architect can reason over.
 *
 * Phase 2 (LLM): Feed the snapshot to the skill_improver agent (which acts
 * as the architect's reflection delegate) to produce an actionable report:
 * what skills to create/change, what problems were encountered, what tools
 * didn't work, and what the swarm should learn for next time. The report is
 * surfaced directly in the finalize output — not buried in an artifact.
 *
 * When no LLM client is available, phase 2 falls back to a deterministic
 * summary so finalize never blocks on missing infrastructure.
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
	createSkillImproverLLMDelegate,
	type SkillImproverLLMDelegate,
} from '../hooks/skill-improver-llm-factory';
import { validateSwarmPath } from '../hooks/utils';
import type { ToolAggregate } from '../state';

// ─── Types ───────────────────────────────────────────────────────────

export interface ToolProblem {
	tool: string;
	failureCount: number;
	totalCalls: number;
	failureRate: number;
	avgDurationMs: number;
}

export interface AgentDispatchSummary {
	agent: string;
	delegationCount: number;
	lastDelegationReason?: string;
}

export interface GateFailureSummary {
	gate: string;
	taskId: string;
	count: number;
}

export interface SessionReflectionData {
	timestamp: string;
	totalToolCalls: number;
	totalToolFailures: number;
	toolProblems: ToolProblem[];
	agentDispatches: AgentDispatchSummary[];
	gateFailures: GateFailureSummary[];
	lessonsFromRetros: string[];
	errorTaxonomy: Record<string, number>;
}

export interface SessionReflectionResult {
	data: SessionReflectionData;
	architectReport: string;
	source: 'llm' | 'deterministic';
}

// ─── Phase 1: Deterministic gathering ────────────────────────────────

function gatherToolProblems(toolAggregates: Map<string, ToolAggregate>): {
	problems: ToolProblem[];
	totalCalls: number;
	totalFailures: number;
} {
	let totalCalls = 0;
	let totalFailures = 0;
	const problems: ToolProblem[] = [];

	for (const [, agg] of toolAggregates) {
		totalCalls += agg.count;
		totalFailures += agg.failureCount;

		if (agg.failureCount > 0 && agg.count > 0) {
			const failureRate = agg.failureCount / agg.count;
			if (failureRate > 0.2 || agg.failureCount > 2) {
				problems.push({
					tool: agg.tool,
					failureCount: agg.failureCount,
					totalCalls: agg.count,
					failureRate: Math.round(failureRate * 100) / 100,
					avgDurationMs: Math.round(agg.totalDuration / agg.count),
				});
			}
		}
	}

	problems.sort((a, b) => b.failureCount - a.failureCount);
	return { problems, totalCalls, totalFailures };
}

interface AgentSessionLike {
	agentName: string;
	lastDelegationReason?: string;
}

function gatherAgentDispatches(
	agentSessions: Map<string, AgentSessionLike>,
): AgentDispatchSummary[] {
	const agentCounts = new Map<string, { count: number; lastReason?: string }>();

	for (const [, session] of agentSessions) {
		const name = session.agentName;
		const existing = agentCounts.get(name) ?? { count: 0 };
		existing.count++;
		if (session.lastDelegationReason) {
			existing.lastReason = session.lastDelegationReason;
		}
		agentCounts.set(name, existing);
	}

	return [...agentCounts.entries()]
		.map(([agent, data]) => ({
			agent,
			delegationCount: data.count,
			lastDelegationReason: data.lastReason,
		}))
		.sort((a, b) => b.delegationCount - a.delegationCount);
}

async function gatherRetroLessonsAndTaxonomy(
	directory: string,
): Promise<{ lessons: string[]; taxonomy: Record<string, number> }> {
	const lessons: string[] = [];
	const taxonomy: Record<string, number> = {};

	try {
		const evidenceDir = path.join(directory, '.swarm', 'evidence');
		const entries = await fs.readdir(evidenceDir);
		const retroDirs = entries
			.filter((e) => e.startsWith('retro-'))
			.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

		for (const retroDir of retroDirs) {
			const evidencePath = path.join(evidenceDir, retroDir, 'evidence.json');
			try {
				const content = await fs.readFile(evidencePath, 'utf-8');
				const parsed = JSON.parse(content);
				const bundleEntries = parsed.entries ?? [parsed];

				for (const entry of bundleEntries) {
					if (Array.isArray(entry.lessons_learned)) {
						for (const lesson of entry.lessons_learned) {
							if (typeof lesson === 'string' && lesson.trim().length > 0) {
								lessons.push(lesson.trim());
							}
						}
					}
					if (
						entry.error_taxonomy &&
						typeof entry.error_taxonomy === 'object'
					) {
						for (const [key, val] of Object.entries(entry.error_taxonomy)) {
							if (typeof val === 'number') {
								taxonomy[key] = (taxonomy[key] ?? 0) + val;
							}
						}
					}
				}
			} catch {
				// Per-file failure is non-blocking
			}
		}
	} catch {
		// evidence dir may not exist
	}

	return { lessons: [...new Set(lessons)], taxonomy };
}

async function gatherGateFailures(
	directory: string,
): Promise<GateFailureSummary[]> {
	const failures = new Map<string, GateFailureSummary>();

	try {
		const evidenceDir = path.join(directory, '.swarm', 'evidence');
		const entries = await fs.readdir(evidenceDir);

		for (const entry of entries) {
			if (entry.startsWith('retro-')) continue;
			const evidencePath = path.join(evidenceDir, entry, 'evidence.json');
			try {
				const content = await fs.readFile(evidencePath, 'utf-8');
				const parsed = JSON.parse(content);
				const bundleEntries = parsed.entries ?? [parsed];

				for (const e of bundleEntries) {
					if (e.verdict === 'fail' || e.verdict === 'REJECT') {
						const gate = e.agent ?? e.type ?? 'unknown';
						const taskId = entry;
						const key = `${gate}:${taskId}`;
						const existing = failures.get(key) ?? {
							gate,
							taskId,
							count: 0,
						};
						existing.count++;
						failures.set(key, existing);
					}
				}
			} catch {
				// Per-file failure is non-blocking
			}
		}
	} catch {
		// evidence dir may not exist
	}

	return [...failures.values()].sort((a, b) => b.count - a.count);
}

// ─── Phase 2: Architect review ───────────────────────────────────────

function buildReflectionDataSummary(data: SessionReflectionData): string {
	const lines: string[] = [];

	lines.push('SESSION DATA SNAPSHOT');
	lines.push(`Total tool calls: ${data.totalToolCalls}`);
	lines.push(`Total tool failures: ${data.totalToolFailures}`);
	if (data.totalToolCalls > 0) {
		lines.push(
			`Overall failure rate: ${Math.round((data.totalToolFailures / data.totalToolCalls) * 100)}%`,
		);
	}
	lines.push('');

	if (data.toolProblems.length > 0) {
		lines.push('TOOL PROBLEMS (tools with >20% failure rate or >2 failures):');
		for (const p of data.toolProblems) {
			lines.push(
				`  - ${p.tool}: ${p.failureCount}/${p.totalCalls} failures (${Math.round(p.failureRate * 100)}%), avg ${p.avgDurationMs}ms`,
			);
		}
		lines.push('');
	}

	if (data.agentDispatches.length > 0) {
		lines.push('AGENT DISPATCHES:');
		for (const a of data.agentDispatches) {
			const reason = a.lastDelegationReason
				? ` (last reason: ${a.lastDelegationReason})`
				: '';
			lines.push(`  - ${a.agent}: ${a.delegationCount} delegation(s)${reason}`);
		}
		lines.push('');
	}

	if (data.gateFailures.length > 0) {
		lines.push('GATE FAILURES:');
		for (const gf of data.gateFailures) {
			lines.push(`  - ${gf.gate} on task ${gf.taskId}: ${gf.count} failure(s)`);
		}
		lines.push('');
	}

	const taxonomyEntries = Object.entries(data.errorTaxonomy).sort(
		(a, b) => b[1] - a[1],
	);
	if (taxonomyEntries.length > 0) {
		lines.push('ERROR TAXONOMY (from phase retrospectives):');
		for (const [category, count] of taxonomyEntries) {
			lines.push(`  - ${category}: ${count}`);
		}
		lines.push('');
	}

	if (data.lessonsFromRetros.length > 0) {
		lines.push('LESSONS FROM RETROSPECTIVES:');
		for (const lesson of data.lessonsFromRetros) {
			lines.push(`  - ${lesson}`);
		}
		lines.push('');
	}

	return lines.join('\n');
}

const REFLECTION_SYSTEM_PROMPT = `You are the architect reviewing a completed swarm session. Your job is to analyze what happened and produce a concise, actionable report for the human operator.

You have been given the full session telemetry: tool call statistics, agent dispatches, gate failures, error taxonomy, and lessons from phase retrospectives.

Your report MUST include these sections (omit a section only if there is genuinely nothing to say):

## Problems Encountered
What went wrong during this session? Tool failures, repeated gate rejections, error patterns. Be specific — name the tools, the error categories, the tasks affected. If nothing went wrong, say so clearly.

## Tools That Didn't Work
Which tools had high failure rates or were slow? What was the likely cause? What should the operator or the swarm do differently next time?

## Skill Recommendations
Based on everything that happened in this session, should any existing skills be updated or new skills be created? Be specific: name the skill, describe the change, and explain why. Consider:
- Patterns that repeated across multiple tasks or phases
- Workarounds the agents had to use
- Knowledge gaps the agents exposed
- Conventions the session revealed that aren't captured in any skill

## Process Improvements
What should the swarm do differently next time? Dispatch patterns, gate configurations, agent routing, phase structure — anything the architect should learn from this session.

Keep the report under 3000 characters. Be direct. No filler. Every sentence should be actionable or provide specific evidence. If the session was clean with no issues, say so in 2-3 sentences and skip the detailed sections.`;

function buildDeterministicReport(data: SessionReflectionData): string {
	const lines: string[] = [];
	lines.push('## Problems Encountered');
	lines.push('');

	if (data.totalToolFailures === 0 && data.gateFailures.length === 0) {
		lines.push('No tool failures or gate rejections recorded this session.');
		lines.push('');
	} else {
		if (data.totalToolFailures > 0) {
			const rate =
				data.totalToolCalls > 0
					? Math.round((data.totalToolFailures / data.totalToolCalls) * 100)
					: 0;
			lines.push(
				`${data.totalToolFailures} tool failure(s) across ${data.totalToolCalls} calls (${rate}% failure rate).`,
			);
		}
		if (data.gateFailures.length > 0) {
			lines.push(`${data.gateFailures.length} gate failure(s) recorded:`);
			for (const gf of data.gateFailures.slice(0, 5)) {
				lines.push(`- ${gf.gate} on task ${gf.taskId} (${gf.count}x)`);
			}
		}
		const taxonomyEntries = Object.entries(data.errorTaxonomy).sort(
			(a, b) => b[1] - a[1],
		);
		if (taxonomyEntries.length > 0) {
			lines.push('');
			lines.push('Error patterns:');
			for (const [cat, count] of taxonomyEntries) {
				lines.push(`- ${cat}: ${count} occurrence(s)`);
			}
		}
		lines.push('');
	}

	if (data.toolProblems.length > 0) {
		lines.push("## Tools That Didn't Work");
		lines.push('');
		for (const p of data.toolProblems) {
			lines.push(
				`- **${p.tool}**: ${p.failureCount}/${p.totalCalls} failures (${Math.round(p.failureRate * 100)}%), avg ${p.avgDurationMs}ms per call`,
			);
		}
		lines.push('');
	}

	if (data.lessonsFromRetros.length > 0) {
		lines.push('## Skill Recommendations');
		lines.push('');
		lines.push(
			'The following lessons were captured during the session. Review them for skill creation/update opportunities:',
		);
		for (const lesson of data.lessonsFromRetros) {
			lines.push(`- ${lesson}`);
		}
		lines.push('');
	}

	lines.push('## Process Improvements');
	lines.push('');
	if (
		data.totalToolFailures === 0 &&
		data.gateFailures.length === 0 &&
		data.lessonsFromRetros.length === 0
	) {
		lines.push('Session completed without notable issues.');
	} else {
		lines.push(
			'_Deterministic fallback: no LLM client available for deep analysis. Review the data above manually._',
		);
	}
	lines.push('');

	return lines.join('\n');
}

// ─── Public API ──────────────────────────────────────────────────────

export interface SessionReflectionInput {
	directory: string;
	toolAggregates: Map<string, ToolAggregate>;
	agentSessions: Map<string, AgentSessionLike>;
	sessionId?: string;
	signal?: AbortSignal;
	delegate?: SkillImproverLLMDelegate;
}

export async function runSessionReflection(
	input: SessionReflectionInput,
): Promise<SessionReflectionResult> {
	const { problems, totalCalls, totalFailures } = gatherToolProblems(
		input.toolAggregates,
	);
	const agentDispatches = gatherAgentDispatches(input.agentSessions);
	const { lessons, taxonomy } = await gatherRetroLessonsAndTaxonomy(
		input.directory,
	);
	const gateFailures = await gatherGateFailures(input.directory);

	const data: SessionReflectionData = {
		timestamp: new Date().toISOString(),
		totalToolCalls: totalCalls,
		totalToolFailures: totalFailures,
		toolProblems: problems,
		agentDispatches,
		gateFailures,
		lessonsFromRetros: lessons,
		errorTaxonomy: taxonomy,
	};

	const delegate =
		input.delegate ??
		createSkillImproverLLMDelegate(input.directory, input.sessionId);

	if (delegate && !input.signal?.aborted) {
		try {
			const dataSummary = buildReflectionDataSummary(data);
			const report = await delegate(
				REFLECTION_SYSTEM_PROMPT,
				dataSummary,
				input.signal,
			);
			if (report && report.trim().length > 0) {
				return { data, architectReport: report.trim(), source: 'llm' };
			}
		} catch {
			// LLM failed — fall through to deterministic
		}
	}

	return {
		data,
		architectReport: buildDeterministicReport(data),
		source: 'deterministic',
	};
}

export async function writeSessionReflection(
	directory: string,
	result: SessionReflectionResult,
): Promise<string> {
	const reflectionPath = validateSwarmPath(directory, 'session-reflection.md');
	const lines: string[] = [];
	lines.push('# Session Reflection');
	lines.push('');
	lines.push(`Generated: ${result.data.timestamp}`);
	lines.push(`Source: ${result.source}`);
	lines.push('');
	lines.push(result.architectReport);
	const content = lines.join('\n');
	await fs.writeFile(reflectionPath, content, 'utf-8');
	return reflectionPath;
}

export const _internals = {
	gatherToolProblems,
	gatherAgentDispatches,
	gatherRetroLessonsAndTaxonomy,
	gatherGateFailures,
	buildReflectionDataSummary,
	buildDeterministicReport,
};
