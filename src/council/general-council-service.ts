/**
 * General Council Mode — pure synthesis service.
 *
 * No I/O, no HTTP. Takes completed member responses for all rounds and
 * produces the final `GeneralCouncilResult`. Mirrors the design of
 * `./council-service.ts` (synthesizeCouncilVerdicts).
 *
 * Quadratic Voting (NSED arXiv:2601.16863): consensus claims are weighted by
 * member confidence rather than counted by headcount. A claim is a consensus
 * point only when its weighted agreement exceeds 0.6 across members.
 *
 * MAINTAIN/CONCEDE/NUANCE protocol (ConfMAD): a Round 2 response with the
 * CONCEDE keyword on a topic resolves the corresponding Round 1 disagreement;
 * MAINTAIN leaves it persisting; NUANCE marks it persisting-with-boundary.
 */

import { detectDisagreements } from './disagreement-detector.js';
import type {
	GeneralCouncilDeliberationResponse,
	GeneralCouncilDisagreement,
	GeneralCouncilMemberResponse,
	GeneralCouncilResult,
	WebSearchResult,
} from './general-council-types.js';

/** Confidence-weighted consensus threshold (NSED Quadratic Voting). */
const CONSENSUS_WEIGHT_THRESHOLD = 0.6;

/** Tokenize for claim-similarity grouping. */
function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, ' ')
		.split(/\s+/)
		.filter((t) => t.length >= 4);
}

/** Token overlap (Jaccard). */
function similarity(a: string, b: string): number {
	const tokensA = new Set(tokenize(a));
	const tokensB = new Set(tokenize(b));
	if (tokensA.size === 0 || tokensB.size === 0) return 0;
	let intersection = 0;
	for (const t of tokensA) if (tokensB.has(t)) intersection++;
	const union = tokensA.size + tokensB.size - intersection;
	return union === 0 ? 0 : intersection / union;
}

/** Extract candidate claim sentences (length >= 30 chars, contains a period). */
function extractClaims(response: string): string[] {
	return response
		.split(/(?<=[.!?])\s+/)
		.map((s) => s.trim())
		.filter((s) => s.length >= 30 && s.length <= 400);
}

interface ClaimCluster {
	representative: string;
	weightedAgreement: number;
	memberIds: Set<string>;
}

/**
 * Cluster claims across members, weighting each contribution by the member's
 * confidence. Returns clusters whose weighted agreement crosses the threshold,
 * with the representative claim as the longest variant in the cluster.
 *
 * "Weighted agreement" = sum(confidence) / total members — bounded to [0, 1].
 */
function buildConsensusClusters(
	responses: GeneralCouncilMemberResponse[],
): string[] {
	if (responses.length < 2) return [];
	const totalMembers = responses.length;

	const clusters: ClaimCluster[] = [];
	for (const member of responses) {
		const confidence = clamp01(member.confidence ?? 0.5);
		const claims = extractClaims(member.response ?? '');
		for (const claim of claims) {
			let assigned = false;
			for (const cluster of clusters) {
				if (similarity(cluster.representative, claim) >= 0.5) {
					if (!cluster.memberIds.has(member.memberId)) {
						cluster.weightedAgreement += confidence;
						cluster.memberIds.add(member.memberId);
					}
					if (claim.length > cluster.representative.length) {
						cluster.representative = claim;
					}
					assigned = true;
					break;
				}
			}
			if (!assigned) {
				clusters.push({
					representative: claim,
					weightedAgreement: confidence,
					memberIds: new Set([member.memberId]),
				});
			}
		}
	}

	return clusters
		.filter(
			(c) =>
				c.memberIds.size >= 2 &&
				c.weightedAgreement / totalMembers >= CONSENSUS_WEIGHT_THRESHOLD,
		)
		.sort(
			(a, b) =>
				b.weightedAgreement - a.weightedAgreement ||
				b.memberIds.size - a.memberIds.size,
		)
		.map((c) => c.representative);
}

function clamp01(n: number): number {
	if (typeof n !== 'number' || Number.isNaN(n)) return 0;
	if (n < 0) return 0;
	if (n > 1) return 1;
	return n;
}

/**
 * Compute persisting disagreements: those whose Round 2 responses do NOT
 * contain a CONCEDE keyword on the relevant disagreement topic.
 */
function computePersistingDisagreements(
	disagreements: GeneralCouncilDisagreement[],
	round2: GeneralCouncilDeliberationResponse[],
): GeneralCouncilDisagreement[] {
	if (disagreements.length === 0) return [];
	if (round2.length === 0) return disagreements;

	return disagreements.filter((d) => {
		// A disagreement is resolved if at least one disputing member CONCEDEs on it.
		const disputants = new Set(d.positions.map((p) => p.memberId));
		const conceded = round2.some((r) => {
			if (!disputants.has(r.memberId)) return false;
			if (!r.disagreementTopics?.includes(d.topic)) return false;
			return /\bconcede\b/i.test(r.response ?? '');
		});
		return !conceded;
	});
}

/** De-duplicate sources by URL (keep first occurrence). */
function dedupeSources(
	round1: GeneralCouncilMemberResponse[],
	round2: GeneralCouncilDeliberationResponse[],
): WebSearchResult[] {
	const seen = new Set<string>();
	const out: WebSearchResult[] = [];
	const allSources = [...round1, ...round2].flatMap((r) => r.sources ?? []);
	for (const src of allSources) {
		if (!src?.url) continue;
		if (seen.has(src.url)) continue;
		seen.add(src.url);
		out.push(src);
	}
	return out;
}

/**
 * Render the structural synthesis markdown. The moderator pass (when configured)
 * consumes this as input and produces the user-facing answer.
 */
function renderSynthesisMarkdown(
	question: string,
	mode: 'general' | 'spec_review',
	roundsCompleted: 1 | 2,
	members: GeneralCouncilMemberResponse[],
	consensusPoints: string[],
	persistingDisagreements: GeneralCouncilDisagreement[],
	allSources: WebSearchResult[],
): string {
	const memberLines = members
		.map((m) => `- ${m.memberId} (${m.model}, ${m.role})`)
		.join('\n');

	const consensusBlock =
		consensusPoints.length > 0
			? consensusPoints.map((c) => `- ${c}`).join('\n')
			: '_No consensus claims reached the weighted-agreement threshold._';

	const disagreementsBlock =
		persistingDisagreements.length > 0
			? persistingDisagreements
					.map(
						(d) =>
							`- **${d.topic}**\n` +
							d.positions
								.map((p) => `  - ${p.memberId}: ${p.claim}`)
								.join('\n'),
					)
					.join('\n')
			: '_No persisting disagreements after deliberation._';

	const sourcesBlock =
		allSources.length > 0
			? allSources.map((s) => `- [${s.title || s.url}](${s.url})`).join('\n')
			: '_No sources cited._';

	return [
		'## General Council Synthesis',
		'',
		`**Question:** ${question}`,
		`**Mode:** ${mode}`,
		`**Members:**\n${memberLines}`,
		`**Rounds:** ${roundsCompleted}`,
		'',
		'### Consensus',
		consensusBlock,
		'',
		'### Persistent Disagreements',
		disagreementsBlock,
		'',
		'### Sources',
		sourcesBlock,
	].join('\n');
}

/**
 * Pure synthesis. Given completed member responses, produces the final
 * `GeneralCouncilResult` (without `moderatorOutput` — moderator is invoked
 * by the architect after this returns and populated separately).
 */
export function synthesizeGeneralCouncil(
	question: string,
	mode: 'general' | 'spec_review',
	round1Responses: GeneralCouncilMemberResponse[],
	round2Responses: GeneralCouncilDeliberationResponse[],
): GeneralCouncilResult {
	const safeRound1 = Array.isArray(round1Responses) ? round1Responses : [];
	const safeRound2 = Array.isArray(round2Responses) ? round2Responses : [];

	const disagreements = detectDisagreements(safeRound1);
	const consensusPoints = buildConsensusClusters(safeRound1);
	const persistingDisagreements = computePersistingDisagreements(
		disagreements,
		safeRound2,
	);
	const allSources = dedupeSources(safeRound1, safeRound2);
	const roundsCompleted: 1 | 2 = safeRound2.length > 0 ? 2 : 1;

	const synthesis = renderSynthesisMarkdown(
		question,
		mode,
		roundsCompleted,
		safeRound1,
		consensusPoints,
		persistingDisagreements,
		allSources,
	);

	return {
		question,
		mode,
		round1Responses: safeRound1,
		disagreements,
		round2Responses: safeRound2,
		synthesis,
		consensusPoints,
		persistingDisagreements: persistingDisagreements.map((d) => d.topic),
		allSources,
		timestamp: new Date().toISOString(),
	};
}
