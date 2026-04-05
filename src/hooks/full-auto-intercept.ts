/**
 * Full-Auto Intercept Hook
 *
 * Intercepts architect messages in full-auto mode and triggers autonomous oversight
 * when the architect outputs escalation patterns (questions, phase completion prompts).
 *
 * This hook runs as a chat.message transform — it inspects the architect's output
 * and injects the critic's autonomous oversight response when escalation is detected.
 */

import * as fs from 'node:fs';

import { createCriticAutonomousOversightAgent } from '../agents/critic';
import type { PluginConfig } from '../config';
import { tryAcquireLock } from '../parallel/file-locks.js';
import { hasActiveFullAuto } from '../state';
import { telemetry } from '../telemetry';
import { validateSwarmPath } from './utils';

// Pattern for detecting end-of-sentence question marks (not mid-sentence like "v1?")
// Matches "?" at end of text or followed by whitespace/newline
const END_OF_SENTENCE_QUESTION_PATTERN = /\?\s*$/;

// Patterns that indicate architect is waiting for user input / escalation
const ESCALATION_PATTERNS = [
	/Ready for Phase (?:\d+|\[?N\+1\]?)\?/i,
	/escalat/i,
	/What would you like/i,
	/Should I proceed/i,
	/Do you want/i,
];

// Patterns that indicate mid-sentence question marks (code, version numbers, etc.)
// These should NOT trigger escalation
const MID_SENTENCE_QUESTION_PATTERNS = [
	/\b(v\d+\?)/i, // version numbers like "v1?"
	/\b(v\d+\.\d+\?)/i, // version numbers like "v1.2?"
	/\bAPI\?/i, // short acronyms
	/\bOK\?/i, // short confirmations
	/\b\d+\?\d+/, // numbers with question marks between them
];

interface MessageWithParts {
	info: {
		role: string;
		agent?: string;
		sessionID?: string;
		[key: string]: unknown;
	};
	parts: Array<{ type: string; text?: string; [key: string]: unknown }>;
}

/**
 * Computes a simple hash of a string for deadlock detection.
 * Uses a basic DJB2-style hash for determinism across sessions.
 */
function hashString(str: string): string {
	let hash = 5381;
	for (let i = 0; i < str.length; i++) {
		hash = (hash << 5) + hash + str.charCodeAt(i);
		hash = hash & hash; // Convert to 32bit integer
	}
	return Math.abs(hash).toString(36);
}

/**
 * Checks if a question mark is mid-sentence (code, version number, etc.)
 * Returns true if the question mark should NOT trigger escalation.
 */
function isMidSentenceQuestion(text: string): boolean {
	return MID_SENTENCE_QUESTION_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Checks if the architect's message contains an escalation pattern.
 * Returns the detected pattern type or null if no escalation detected.
 */
function detectEscalation(
	text: string,
): 'phase_completion' | 'question' | null {
	// Check for phase completion pattern first
	for (const pattern of ESCALATION_PATTERNS) {
		if (pattern.test(text)) {
			return 'phase_completion';
		}
	}

	// Check for end-of-sentence question
	if (END_OF_SENTENCE_QUESTION_PATTERN.test(text)) {
		// Make sure it's not a mid-sentence question
		if (!isMidSentenceQuestion(text)) {
			return 'question';
		}
	}

	return null;
}

/**
 * Extracts the full text content from a message's parts.
 */
function extractMessageText(message: MessageWithParts): string {
	if (!message?.parts) return '';
	const textParts = message.parts.filter((p) => p?.type === 'text' && p.text);
	return textParts.map((p) => p.text ?? '').join('\n');
}

/**
 * Event type for auto_oversight entries in events.jsonl.
 */
interface AutoOversightEvent {
	type: 'auto_oversight';
	timestamp: string;
	interaction_mode:
		| 'question_resolution'
		| 'plan_review'
		| 'task_completion'
		| 'phase_completion';
	architect_output: string;
	critic_verdict: string;
	critic_reasoning: string;
	evidence_checked: string[];
	interaction_count: number;
	deadlock_count: number;
}

/**
 * Maps escalation type to interaction mode.
 */
function escalationTypeToInteractionMode(
	escalationType: 'phase_completion' | 'question',
): AutoOversightEvent['interaction_mode'] {
	return escalationType === 'phase_completion'
		? 'phase_completion'
		: 'question_resolution';
}

/**
 * Writes an auto_oversight event to .swarm/events.jsonl.
 * Follows the same pattern as phase-complete.ts: lock acquisition + validateSwarmPath + appendFileSync.
 */
async function writeAutoOversightEvent(
	directory: string,
	architectOutput: string,
	criticVerdict: string,
	criticReasoning: string,
	evidenceChecked: string[],
	interactionCount: number,
	deadlockCount: number,
	escalationType: 'phase_completion' | 'question',
): Promise<void> {
	const event: AutoOversightEvent = {
		type: 'auto_oversight',
		timestamp: new Date().toISOString(),
		interaction_mode: escalationTypeToInteractionMode(escalationType),
		architect_output: architectOutput,
		critic_verdict: criticVerdict,
		critic_reasoning: criticReasoning,
		evidence_checked: evidenceChecked,
		interaction_count: interactionCount,
		deadlock_count: deadlockCount,
	};

	const lockTaskId = `auto-oversight-${Date.now()}`;
	const eventsFilePath = 'events.jsonl';
	const dir = directory;

	let lockResult: Awaited<ReturnType<typeof tryAcquireLock>> | undefined;
	try {
		lockResult = await tryAcquireLock(
			dir,
			eventsFilePath,
			'auto-oversight',
			lockTaskId,
		);
	} catch (error) {
		console.warn(
			`[full-auto-intercept] Warning: failed to acquire lock for auto_oversight event: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	if (!lockResult?.acquired) {
		console.warn(
			`[full-auto-intercept] Warning: could not acquire lock for events.jsonl write — proceeding without lock`,
		);
	}
	try {
		const eventsPath = validateSwarmPath(dir, 'events.jsonl');
		fs.appendFileSync(eventsPath, `${JSON.stringify(event)}\n`, 'utf-8');
	} catch (writeError) {
		console.error(
			`[full-auto-intercept] Warning: failed to write auto_oversight event: ${writeError instanceof Error ? writeError.message : String(writeError)}`,
		);
	} finally {
		if (lockResult?.acquired && lockResult.lock._release) {
			try {
				await lockResult.lock._release();
			} catch (releaseError) {
				console.error(
					`[full-auto-intercept] Lock release failed:`,
					releaseError,
				);
			}
		}
	}
}

/**
 * Handles critic dispatch and writes the auto_oversight event after the critic responds.
 *
 * This function encapsulates the critic invocation and event writing flow.
 * The critic response is awaited before writing the event to events.jsonl.
 *
 * NOTE: The actual LLM invocation of the critic is stubbed here — the function
 * logs the critic creation and immediately writes a placeholder event. When full
 * critic invocation is integrated, replace the placeholder response with the
 * actual critic output.
 */
async function dispatchCriticAndWriteEvent(
	directory: string,
	architectOutput: string,
	criticContext: string,
	criticModel: string,
	escalationType: 'phase_completion' | 'question',
	interactionCount: number,
	deadlockCount: number,
): Promise<void> {
	// Create the oversight agent (for logging/traceability)
	const oversightAgent = createCriticAutonomousOversightAgent(
		criticModel,
		criticContext,
	);
	console.log(
		`[full-auto-intercept] Dispatching critic: ${oversightAgent.name} using model ${criticModel}`,
	);

	// TODO(Task-X): Replace this placeholder with actual critic LLM invocation.
	// When the critic is actually invoked, capture its response (verdict, reasoning, evidence)
	// and pass those to writeAutoOversightEvent instead of the placeholder values below.
	const criticVerdict = 'PENDING';
	const criticReasoning =
		'Critic invocation not yet implemented — placeholder event';
	const evidenceChecked: string[] = [];

	// Write the auto_oversight event AFTER the critic responds
	await writeAutoOversightEvent(
		directory,
		architectOutput,
		criticVerdict,
		criticReasoning,
		evidenceChecked,
		interactionCount,
		deadlockCount,
		escalationType,
	);
}

/**
 * Creates the full-auto intercept hook factory.
 *
 * This hook intercepts architect messages in full-auto mode and triggers
 * autonomous oversight when escalation patterns are detected.
 *
 * @param config - Plugin configuration containing full_auto settings
 * @param directory - Working directory from plugin init context
 * @returns Hook object with messagesTransform function
 */
export function createFullAutoInterceptHook(
	config: PluginConfig,
	directory: string,
): {
	messagesTransform: (
		input: Record<string, never>,
		output: { messages?: MessageWithParts[] },
	) => Promise<void>;
} {
	// Get full-auto config (with defaults)
	const fullAutoConfig = config.full_auto ?? {
		enabled: false,
		max_interactions_per_phase: 50,
		deadlock_threshold: 3,
		escalation_mode: 'pause',
	};

	// If full-auto is disabled, return no-op handler
	if (fullAutoConfig.enabled !== true) {
		return {
			messagesTransform: async (): Promise<void> => {
				// No-op when full-auto is disabled
			},
		};
	}

	const deadlockThreshold = fullAutoConfig.deadlock_threshold ?? 3;
	const maxInteractions = fullAutoConfig.max_interactions_per_phase ?? 50;
	const escalationMode = fullAutoConfig.escalation_mode ?? 'pause';

	/**
	 * Main messages transform hook.
	 * Inspects architect output and triggers autonomous oversight when escalation detected.
	 */
	const messagesTransform = async (
		_input: Record<string, never>,
		output: { messages?: MessageWithParts[] },
	): Promise<void> => {
		const messages = output.messages;
		if (!messages || messages.length === 0) return;

		// Find the last architect message (user role = architect is the active agent)
		// In the chat.message transform, architect outputs appear as user role messages
		let lastArchitectMessageIndex = -1;
		for (let i = messages.length - 1; i >= 0; i--) {
			const msg = messages[i];
			if (msg?.info?.role === 'user') {
				// Check if this is the architect (agent could be undefined for main session)
				const agent = msg.info?.agent;
				const strippedAgent = agent ? stripKnownSwarmPrefix(agent) : undefined;
				// Only process if this is the architect (explicit 'architect' or undefined/main session)
				if (!agent || strippedAgent === 'architect') {
					lastArchitectMessageIndex = i;
					break;
				}
			}
		}

		if (lastArchitectMessageIndex === -1) return;

		const architectMessage = messages[lastArchitectMessageIndex];
		const architectText = extractMessageText(architectMessage);

		if (!architectText) return;

		// Get session ID for state tracking
		const sessionID = architectMessage.info?.sessionID;

		// Check if full-auto is active for this session
		if (!hasActiveFullAuto(sessionID)) return;

		// Get or create session state for tracking
		let session: ReturnType<
			typeof import('../state').ensureAgentSession
		> | null = null;
		if (sessionID) {
			// Only import and use ensureAgentSession if we have a sessionID
			const { ensureAgentSession } = await import('../state');
			session = ensureAgentSession(sessionID);
		}

		// Check interaction limit — escalate if threshold reached
		if (session) {
			const interactionCount = session.fullAutoInteractionCount ?? 0;
			if (interactionCount >= maxInteractions) {
				const escalated = await handleEscalation(
					directory,
					'interaction_limit',
					sessionID,
					architectText,
					interactionCount,
					session.fullAutoDeadlockCount ?? 0,
					escalationMode,
				);
				if (escalated) return;
			}
		}

		// Detect escalation
		const escalationType = detectEscalation(architectText);
		if (!escalationType) return;

		// Track interaction
		if (session) {
			session.fullAutoInteractionCount =
				(session.fullAutoInteractionCount ?? 0) + 1;
		}

		// Deadlock detection: hash the question and compare
		if (escalationType === 'question') {
			const questionHash = hashString(architectText.trim());

			if (session) {
				const lastQuestionHash = session.fullAutoLastQuestionHash;
				if (lastQuestionHash === questionHash) {
					// Same question detected — increment deadlock count
					session.fullAutoDeadlockCount =
						(session.fullAutoDeadlockCount ?? 0) + 1;
					console.warn(
						`[full-auto-intercept] Potential deadlock detected (count: ${session.fullAutoDeadlockCount}/${deadlockThreshold}) — identical question repeated`,
					);

					if (session.fullAutoDeadlockCount >= deadlockThreshold) {
						const escalated = await handleEscalation(
							directory,
							'deadlock',
							sessionID,
							architectText,
							session.fullAutoInteractionCount ?? 0,
							session.fullAutoDeadlockCount,
							escalationMode,
						);
						if (escalated) return;
					}
				} else {
					// Different question — reset deadlock count
					session.fullAutoDeadlockCount = 0;
				}
				session.fullAutoLastQuestionHash = questionHash;
			}
		}

		// Trigger autonomous oversight
		console.log(
			`[full-auto-intercept] Escalation detected (${escalationType}) — triggering autonomous oversight`,
		);

		// Build the critic agent context
		const criticContext = buildCriticContext(architectText, escalationType);

		// Get the critic model (from config or default)
		const criticModel =
			fullAutoConfig.critic_model ?? 'claude-sonnet-4-20250514';

		// Create the oversight agent
		const oversightAgent = createCriticAutonomousOversightAgent(
			criticModel,
			criticContext,
		);

		// Log the oversight agent that was created (for debugging)
		console.log(
			`[full-auto-intercept] Created autonomous oversight agent: ${oversightAgent.name} using model ${criticModel}`,
		);

		// Dispatch the critic and write event after response
		// NOTE: The actual invocation of the critic agent and injection of its response
		// into the message stream would require coordination with the agent execution system.
		// This hook currently logs the detection and creates the agent definition.
		// Full integration with the agent execution loop is a separate implementation.
		//
		// The oversightAgent.name == 'critic' can be used by the execution layer
		// to route to the appropriate agent handler.
		await dispatchCriticAndWriteEvent(
			directory,
			architectText,
			criticContext,
			criticModel,
			escalationType,
			session?.fullAutoInteractionCount ?? 0,
			session?.fullAutoDeadlockCount ?? 0,
		);
	};

	return {
		messagesTransform,
	};
}

/**
 * Builds additional context to append to the autonomous oversight prompt.
 * This provides the architect's question/output for the critic to evaluate.
 */
function buildCriticContext(
	architectOutput: string,
	escalationType: 'phase_completion' | 'question',
): string {
	const contextHeader =
		escalationType === 'phase_completion'
			? '## ARCHITECT PHASE COMPLETION REQUEST\n\nThe architect has signaled phase completion and is awaiting oversight approval to proceed.'
			: '## ARCHITECT QUESTION\n\nThe architect has asked a question and is awaiting an autonomous answer or escalation.';

	const truncatedOutput =
		architectOutput.length > 2000
			? architectOutput.slice(0, 2000) + '\n... [truncated]'
			: architectOutput;

	return `${contextHeader}

### ARCHITECT OUTPUT:
${truncatedOutput}

### YOUR TASK:
Evaluate the architect's output and provide a response. If this is a question, answer it directly if you have sufficient information. If this is a phase completion, verify all tasks are complete and provide APPROVED or NEEDS_REVISION.

Remember: You are the sole quality gate. Default posture is REJECT unless you have positive evidence of correctness.`;
}

/**
 * Escalation reasons for telemetry and reporting.
 */
type EscalationReason = 'interaction_limit' | 'deadlock' | 'ESCALATE_TO_HUMAN';

/**
 * Writes the escalation report to .swarm/escalation-report.md.
 * Only writes under the validated workspace directory.
 */
async function writeEscalationReport(
	directory: string,
	reason: EscalationReason,
	architectOutput: string,
	interactionCount: number,
	deadlockCount: number,
	phase?: number,
): Promise<void> {
	try {
		const reportPath = validateSwarmPath(directory, 'escalation-report.md');

		// Load current phase from plan.json if not provided
		let currentPhase = phase;
		if (currentPhase === undefined) {
			try {
				const planPath = validateSwarmPath(directory, 'plan.json');
				const planContent = fs.readFileSync(planPath, 'utf-8');
				const plan = JSON.parse(planContent);
				// Find the highest-numbered phase that is not complete
				const incompletePhases = plan.phases
					.filter((p: { status?: string }) => p.status !== 'complete')
					.sort((a: { id: number }, b: { id: number }) => b.id - a.id);
				currentPhase = incompletePhases[0]?.id;
			} catch {
				// plan.json not available - leave phase undefined
			}
		}

		const timestamp = new Date().toISOString();
		const reasonLabels: Record<EscalationReason, string> = {
			interaction_limit: 'Interaction Limit Exceeded',
			deadlock: 'Deadlock Threshold Exceeded',
			ESCALATE_TO_HUMAN: 'Critic Response: ESCALATE_TO_HUMAN',
		};

		const reportContent = `# Full-Auto Escalation Report

## Timestamp
${timestamp}

## Reason for Escalation
${reasonLabels[reason]}

## Architect Output That Triggered Escalation
\`\`\`
${architectOutput.slice(0, 4000)}
${architectOutput.length > 4000 ? '\n... [output truncated]' : ''}
\`\`\`

## FullAuto State at Time of Escalation
- **Interaction Count**: ${interactionCount}
- **Deadlock Count**: ${deadlockCount}

## Current Phase and Plan Context
- **Current Phase**: ${currentPhase !== undefined ? `Phase ${currentPhase}` : 'Unknown'}
${currentPhase !== undefined ? `- **Phase Status**: Pending completion` : ''}

## Resolution
This escalation requires human intervention. The swarm has been paused.
Please review the architect's output above and provide guidance.
`;

		fs.writeFileSync(reportPath, reportContent, 'utf-8');
		console.log(
			`[full-auto-intercept] Escalation report written to: ${reportPath}`,
		);
	} catch (error) {
		console.error(
			`[full-auto-intercept] Failed to write escalation report:`,
			error instanceof Error ? error.message : String(error),
		);
	}
}

/**
 * Handles escalation based on the configured escalation mode.
 * Returns true if escalation was triggered (and execution should stop).
 */
async function handleEscalation(
	directory: string,
	reason: EscalationReason,
	sessionID: string | undefined,
	architectOutput: string,
	interactionCount: number,
	deadlockCount: number,
	escalationMode: 'pause' | 'terminate',
	phase?: number,
): Promise<boolean> {
	// Emit telemetry event
	telemetry.autoOversightEscalation(
		sessionID ?? 'unknown',
		reason,
		interactionCount,
		deadlockCount,
		phase,
	);

	// Write escalation report
	await writeEscalationReport(
		directory,
		reason,
		architectOutput,
		interactionCount,
		deadlockCount,
		phase,
	);

	if (escalationMode === 'terminate') {
		console.error(
			`[full-auto-intercept] ESCALATION (terminate mode) — reason: ${reason}, session: ${sessionID}`,
		);
		process.exit(1);
	}

	// In pause mode, return true to signal that escalation was triggered
	// The message will still go through to the user, but critic dispatch should be skipped
	console.warn(
		`[full-auto-intercept] ESCALATION (pause mode) — reason: ${reason}, session: ${sessionID}`,
	);
	return true;
}

/**
 * Strips known swarm prefixes from agent names.
 */
function stripKnownSwarmPrefix(agent: string): string {
	// Strip common swarm prefixes if present
	const prefixes = ['local_', 'mega_', 'paid_', 'modelrelay_', 'lowtier_'];
	for (const prefix of prefixes) {
		if (agent.startsWith(prefix)) {
			return agent.slice(prefix.length);
		}
	}
	return agent;
}
