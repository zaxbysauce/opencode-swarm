import type { PluginConfig } from '../config';
import { DEFAULT_MODELS } from '../config/constants';
import { stripKnownSwarmPrefix } from '../config/schema';

// Safe property lookup — prevents prototype chain pollution
function safeGet<T>(
	obj: Record<string, T> | undefined,
	key: string,
): T | undefined {
	if (!obj || !Object.hasOwn(obj, key)) return undefined;
	return obj[key];
}

/**
 * Resolve the model for a given agent by checking config overrides,
 * swarm configurations, and falling back to defaults.
 */
export function resolveAgentModel(
	agentName: string,
	config: PluginConfig,
): string {
	const baseName = stripKnownSwarmPrefix(agentName).toLowerCase();

	// Check direct agent config override
	const agentOverride = safeGet(config.agents, baseName)?.model;
	if (agentOverride) return agentOverride;

	// Check swarm agent configs
	if (config.swarms) {
		for (const swarm of Object.values(config.swarms)) {
			const swarmModel = safeGet(swarm.agents, baseName)?.model;
			if (swarmModel) return swarmModel;
		}
	}

	// Fall back to defaults
	const defaultModel = safeGet(DEFAULT_MODELS, baseName);
	return defaultModel ?? DEFAULT_MODELS.default;
}

/**
 * Detect if two agents share the same model (adversarial pair).
 * Returns the shared model string if matched, null otherwise.
 */
export function detectAdversarialPair(
	agentA: string,
	agentB: string,
	config: PluginConfig,
): string | null {
	const modelA = resolveAgentModel(agentA, config).toLowerCase();
	const modelB = resolveAgentModel(agentB, config).toLowerCase();

	return modelA === modelB ? modelA : null;
}

/**
 * Format an adversarial warning message based on policy.
 */
export function formatAdversarialWarning(
	agentA: string,
	agentB: string,
	sharedModel: string,
	policy: string,
): string {
	if (policy === 'gate') {
		return `⚠️ GATE POLICY: Same-model adversarial pair detected. Agent ${agentA} and checker ${agentB} both use model ${sharedModel}. This requires extra scrutiny — escalate if issues are found.`;
	}
	return `⚠️ Same-model adversarial pair detected. Agent ${agentA} and checker ${agentB} both use model ${sharedModel}. Review may lack independence.`;
}

/**
 * Adversarial pattern detection for semantic analysis of agent outputs.
 * Uses string/regex matching to detect sophisticated adversarial behaviors.
 */

export interface AdversarialPatternMatch {
	pattern:
		| 'PRECEDENT_MANIPULATION'
		| 'SELF_REVIEW'
		| 'CONTENT_EXEMPTION'
		| 'GATE_DELEGATION_BYPASS'
		| 'VELOCITY_RATIONALIZATION';
	severity: 'HIGHEST' | 'HIGH' | 'MEDIUM' | 'LOW';
	matchedText: string;
	confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

/**
 * Pattern: PRECEDENT_MANIPULATION
 * Trigger: Agent references a previous exception, skip, or shortcut as justification for current behavior.
 * Severity: HIGHEST — this is the most sophisticated adversarial pattern.
 */
const PRECEDENT_MANIPULATION_PATTERNS = [
	/we skipped .* in phase \d+/i,
	/consistent with how we handled/i,
	/going forward/i,
	/the reviewer didn't flag this pattern before/i,
	/this is consistent with/i,
	/we should continue/i,
];

/**
 * Pattern: SELF_REVIEW
 * Trigger: The same agent that produced work is evaluating its quality.
 * Severity: HIGH — review must always come from a different agent.
 */
const SELF_REVIEW_PATTERNS = [
	/I (verified|checked|reviewed|validated).*(myself|my own)/i,
	/I (think|believe) this (looks|is) correct/i,
	/this (looks|seems|appears) (good|correct|fine)/i,
];

/**
 * Pattern: CONTENT_EXEMPTION
 * Trigger: Agent claims a specific type of content is exempt from the QA pipeline.
 * Severity: HIGH — all content types go through the same pipeline.
 */
const CONTENT_EXEMPTION_PATTERNS = [
	/documentation doesn't need/i,
	/config changes are trivial/i,
	/just a (rename|refactor|typo)/i,
	/test files don't need/i,
	/this is (just|only) a/i,
	/no need for (review|the full)/i,
];

/**
 * Pattern: GATE_DELEGATION_BYPASS
 * Trigger: Architect marks a task complete without evidence of gate agent delegation.
 * Severity: HIGHEST — this bypasses the entire QA pipeline.
 */
const GATE_DELEGATION_BYPASS_PATTERNS = [
	/I verified the changes/i,
	/code looks correct to me/i,
	/the code looks (good|fine)/i,
	/task marked complete/i,
	/I (checked|reviewed).*myself/i,
];

/**
 * Pattern: VELOCITY_RATIONALIZATION
 * Trigger: Agent cites time pressure, efficiency, or speed as justification for skipping process.
 * Severity: HIGH — velocity pressure is the #1 cause of gate bypasses.
 */
const VELOCITY_RATIONALIZATION_PATTERNS = [
	/to save time/i,
	/since we're behind/i,
	/quick fix/i,
	/review.*later/i,
	/in the interest of efficiency/i,
	/we can (review|check).*later/i,
	/for (speed|efficiency)/i,
];

/**
 * Detect adversarial patterns in agent output text.
 * Returns array of matches or empty array if no patterns detected.
 */
export function detectAdversarialPatterns(
	text: string,
): AdversarialPatternMatch[] {
	// Input validation - fix for CRITICAL vulnerability
	if (typeof text !== 'string') {
		return [];
	}

	const matches: AdversarialPatternMatch[] = [];

	// Check PRECEDENT_MANIPULATION
	for (const pattern of PRECEDENT_MANIPULATION_PATTERNS) {
		const match = text.match(pattern);
		if (match) {
			matches.push({
				pattern: 'PRECEDENT_MANIPULATION',
				severity: 'HIGHEST',
				matchedText: match[0],
				confidence: 'HIGH',
			});
		}
	}

	// Check SELF_REVIEW
	for (const pattern of SELF_REVIEW_PATTERNS) {
		const match = text.match(pattern);
		if (match) {
			matches.push({
				pattern: 'SELF_REVIEW',
				severity: 'HIGH',
				matchedText: match[0],
				confidence: 'HIGH',
			});
		}
	}

	// Check CONTENT_EXEMPTION
	for (const pattern of CONTENT_EXEMPTION_PATTERNS) {
		const match = text.match(pattern);
		if (match) {
			matches.push({
				pattern: 'CONTENT_EXEMPTION',
				severity: 'HIGH',
				matchedText: match[0],
				confidence: 'HIGH',
			});
		}
	}

	// Check GATE_DELEGATION_BYPASS
	for (const pattern of GATE_DELEGATION_BYPASS_PATTERNS) {
		const match = text.match(pattern);
		if (match) {
			matches.push({
				pattern: 'GATE_DELEGATION_BYPASS',
				severity: 'HIGHEST',
				matchedText: match[0],
				confidence: 'HIGH',
			});
		}
	}

	// Check VELOCITY_RATIONALIZATION
	for (const pattern of VELOCITY_RATIONALIZATION_PATTERNS) {
		const match = text.match(pattern);
		if (match) {
			matches.push({
				pattern: 'VELOCITY_RATIONALIZATION',
				severity: 'HIGH',
				matchedText: match[0],
				confidence: 'HIGH',
			});
		}
	}

	return matches;
}

/**
 * Format a precedent manipulation detection event for JSONL emission.
 */
export function formatPrecedentManipulationEvent(
	match: AdversarialPatternMatch,
	agentName: string,
	phase: number,
): string {
	return JSON.stringify({
		type: 'precedent_manipulation_detected',
		timestamp: new Date().toISOString(),
		pattern: match.pattern,
		severity: match.severity,
		matchedText: match.matchedText,
		confidence: match.confidence,
		agentName,
		phase,
	});
}
