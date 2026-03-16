/**
 * Write retro logic for persisting retrospective evidence bundles.
 * Accepts flat retro fields from the Architect and wraps them correctly
 * in a RetrospectiveEvidence entry before calling saveEvidence().
 */

import type { RetrospectiveEvidence } from '../config/evidence-schema';
import { saveEvidence } from '../evidence/manager';

/**
 * Arguments for the write_retro tool
 * User-supplied fields (the Architect provides these)
 */
export interface WriteRetroArgs {
	/** The phase number being completed (maps to phase_number in schema) */
	phase: number;
	/** Human-readable phase summary (maps to summary in BaseEvidenceSchema) */
	summary: string;
	/** Count of tasks completed */
	task_count: number;
	/** Task complexity level */
	task_complexity: 'trivial' | 'simple' | 'moderate' | 'complex';
	/** Total number of tool calls in the phase */
	total_tool_calls: number;
	/** Number of coder revisions made */
	coder_revisions: number;
	/** Number of reviewer rejections received */
	reviewer_rejections: number;
	/** Number of test failures encountered */
	test_failures: number;
	/** Number of security findings */
	security_findings: number;
	/** Number of integration issues */
	integration_issues: number;
	/** Optional lessons learned (max 5) */
	lessons_learned?: string[];
	/** Optional top rejection reasons */
	top_rejection_reasons?: string[];
	/** Optional task ID (defaults to retro-{phase}) */
	task_id?: string;
	/** Optional metadata */
	metadata?: Record<string, unknown>;
}

/**
 * Execute the write_retro tool.
 * Validates input, builds a RetrospectiveEvidence entry, and saves to disk.
 * @param args - The write retro arguments
 * @param directory - Working directory
 * @returns JSON string with success status and details
 */
export async function executeWriteRetro(
	args: WriteRetroArgs,
	directory: string,
): Promise<string> {
	// Validate phase is a positive integer
	const phase = args.phase;
	if (!Number.isInteger(phase) || phase < 1) {
		return JSON.stringify(
			{
				success: false,
				phase: phase,
				message: 'Invalid phase: must be a positive integer',
			},
			null,
			2,
		);
	}

	// Validate task_complexity is one of the allowed values
	const validComplexities = [
		'trivial',
		'simple',
		'moderate',
		'complex',
	] as const;
	if (!validComplexities.includes(args.task_complexity)) {
		return JSON.stringify(
			{
				success: false,
				phase: phase,
				message: `Invalid task_complexity: must be one of 'trivial'|'simple'|'moderate'|'complex'`,
			},
			null,
			2,
		);
	}

	// Validate task_count >= 1
	if (!Number.isInteger(args.task_count) || args.task_count < 1) {
		return JSON.stringify(
			{
				success: false,
				phase: phase,
				message: 'Invalid task_count: must be a positive integer >= 1',
			},
			null,
			2,
		);
	}

	// Validate summary is non-empty string
	const summary = args.summary;
	if (typeof summary !== 'string' || summary.trim().length === 0) {
		return JSON.stringify(
			{
				success: false,
				phase: phase,
				message: 'Invalid summary: must be a non-empty string',
			},
			null,
			2,
		);
	}

	// Build the taskId
	const taskId = args.task_id ?? `retro-${phase}`;

	// Build the RetrospectiveEvidence entry with auto-generated fields
	const retroEntry: RetrospectiveEvidence = {
		task_id: taskId,
		type: 'retrospective',
		timestamp: new Date().toISOString(),
		agent: 'architect',
		verdict: 'pass',
		summary: summary,
		metadata: args.metadata,
		phase_number: phase,
		total_tool_calls: args.total_tool_calls,
		coder_revisions: args.coder_revisions,
		reviewer_rejections: args.reviewer_rejections,
		test_failures: args.test_failures,
		security_findings: args.security_findings,
		integration_issues: args.integration_issues,
		task_count: args.task_count,
		task_complexity: args.task_complexity,
		top_rejection_reasons: args.top_rejection_reasons ?? [],
		lessons_learned: (args.lessons_learned ?? []).slice(0, 5),
		// Required by RetrospectiveEvidence schema; not collected via tool args to avoid complex nested object parsing
		user_directives: [],
		// Required by RetrospectiveEvidence schema; not collected via tool args to avoid complex nested object parsing
		approaches_tried: [],
	};

	// Call saveEvidence to handle wrapping in EvidenceBundle + atomic write
	try {
		await saveEvidence(directory, taskId, retroEntry);
		return JSON.stringify(
			{
				success: true,
				task_id: taskId,
				phase: phase,
				message: `Retrospective evidence written to .swarm/evidence/${taskId}/evidence.json`,
			},
			null,
			2,
		);
	} catch (error) {
		return JSON.stringify(
			{
				success: false,
				phase: phase,
				message: error instanceof Error ? error.message : String(error),
			},
			null,
			2,
		);
	}
}
