/**
 * Write retro tool for persisting retrospective evidence bundles.
 * Accepts flat retro fields from the Architect and wraps them correctly
 * in a RetrospectiveEvidence entry before calling saveEvidence().
 * This fixes the bug where Architect was writing flat JSON that failed EvidenceBundleSchema.parse().
 */

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { type ToolDefinition, tool } from '@opencode-ai/plugin/tool';
import type { RetrospectiveEvidence } from '../config/evidence-schema';
import { saveEvidence } from '../evidence/manager';
import { createSwarmTool } from './create-tool';

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
	loop_detections?: number;
	circuit_breaker_trips?: number;
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

	// Validate non-negative integer guards for required numeric fields
	if (!Number.isInteger(args.total_tool_calls) || args.total_tool_calls < 0) {
		return JSON.stringify(
			{
				success: false,
				phase: phase,
				message: 'Invalid total_tool_calls: must be a non-negative integer',
			},
			null,
			2,
		);
	}

	if (!Number.isInteger(args.coder_revisions) || args.coder_revisions < 0) {
		return JSON.stringify(
			{
				success: false,
				phase: phase,
				message: 'Invalid coder_revisions: must be a non-negative integer',
			},
			null,
			2,
		);
	}

	if (
		!Number.isInteger(args.reviewer_rejections) ||
		args.reviewer_rejections < 0
	) {
		return JSON.stringify(
			{
				success: false,
				phase: phase,
				message: 'Invalid reviewer_rejections: must be a non-negative integer',
			},
			null,
			2,
		);
	}

	if (!Number.isInteger(args.test_failures) || args.test_failures < 0) {
		return JSON.stringify(
			{
				success: false,
				phase: phase,
				message: 'Invalid test_failures: must be a non-negative integer',
			},
			null,
			2,
		);
	}

	if (!Number.isInteger(args.security_findings) || args.security_findings < 0) {
		return JSON.stringify(
			{
				success: false,
				phase: phase,
				message: 'Invalid security_findings: must be a non-negative integer',
			},
			null,
			2,
		);
	}

	if (
		!Number.isInteger(args.integration_issues) ||
		args.integration_issues < 0
	) {
		return JSON.stringify(
			{
				success: false,
				phase: phase,
				message: 'Invalid integration_issues: must be a non-negative integer',
			},
			null,
			2,
		);
	}

	// Validate non-negative integer guards for optional numeric fields when provided
	if (
		args.loop_detections !== undefined &&
		(!Number.isInteger(args.loop_detections) || args.loop_detections < 0)
	) {
		return JSON.stringify(
			{
				success: false,
				phase: phase,
				message: 'Invalid loop_detections: must be a non-negative integer',
			},
			null,
			2,
		);
	}

	if (
		args.circuit_breaker_trips !== undefined &&
		(!Number.isInteger(args.circuit_breaker_trips) ||
			args.circuit_breaker_trips < 0)
	) {
		return JSON.stringify(
			{
				success: false,
				phase: phase,
				message:
					'Invalid circuit_breaker_trips: must be a non-negative integer',
			},
			null,
			2,
		);
	}

	// Validate max bounds for all numeric fields (reject over-limit values before saveEvidence)
	if (args.phase > 99) {
		return JSON.stringify(
			{
				success: false,
				phase: phase,
				message: 'Invalid phase: must be <= 99',
			},
			null,
			2,
		);
	}

	if (args.task_count > 9999) {
		return JSON.stringify(
			{
				success: false,
				phase: phase,
				message: 'Invalid task_count: must be <= 9999',
			},
			null,
			2,
		);
	}

	if (args.total_tool_calls > 9999) {
		return JSON.stringify(
			{
				success: false,
				phase: phase,
				message: 'Invalid total_tool_calls: must be <= 9999',
			},
			null,
			2,
		);
	}

	if (args.coder_revisions > 999) {
		return JSON.stringify(
			{
				success: false,
				phase: phase,
				message: 'Invalid coder_revisions: must be <= 999',
			},
			null,
			2,
		);
	}

	if (args.reviewer_rejections > 999) {
		return JSON.stringify(
			{
				success: false,
				phase: phase,
				message: 'Invalid reviewer_rejections: must be <= 999',
			},
			null,
			2,
		);
	}

	if (args.loop_detections !== undefined && args.loop_detections > 9999) {
		return JSON.stringify(
			{
				success: false,
				phase: phase,
				message: 'Invalid loop_detections: must be <= 9999',
			},
			null,
			2,
		);
	}

	if (
		args.circuit_breaker_trips !== undefined &&
		args.circuit_breaker_trips > 9999
	) {
		return JSON.stringify(
			{
				success: false,
				phase: phase,
				message: 'Invalid circuit_breaker_trips: must be <= 9999',
			},
			null,
			2,
		);
	}

	if (args.test_failures > 9999) {
		return JSON.stringify(
			{
				success: false,
				phase: phase,
				message: 'Invalid test_failures: must be <= 9999',
			},
			null,
			2,
		);
	}

	if (args.security_findings > 999) {
		return JSON.stringify(
			{
				success: false,
				phase: phase,
				message: 'Invalid security_findings: must be <= 999',
			},
			null,
			2,
		);
	}

	if (args.integration_issues > 999) {
		return JSON.stringify(
			{
				success: false,
				phase: phase,
				message: 'Invalid integration_issues: must be <= 999',
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

	// Validate task_id: reject path traversal, control chars, and oversized IDs
	if (taskId.length > 200) {
		return JSON.stringify(
			{
				success: false,
				phase,
				message: 'Invalid task ID: exceeds 200 character limit',
			},
			null,
			2,
		);
	}
	if (/[\\/]/.test(taskId) || taskId.includes('..')) {
		return JSON.stringify(
			{
				success: false,
				phase,
				message: 'Invalid task ID: path traversal detected',
			},
			null,
			2,
		);
	}
	// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional control char validation
	if (/[\x00-\x1f\x7f]/.test(taskId)) {
		return JSON.stringify(
			{
				success: false,
				phase,
				message: 'Invalid task ID: control characters not allowed',
			},
			null,
			2,
		);
	}

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
		loop_detections: args.loop_detections,
		circuit_breaker_trips: args.circuit_breaker_trips,
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
		// Compute error taxonomy from gate result shapes
		error_taxonomy: (() => {
			const seen = new Set<string>();
			const taxonomy: Array<
				| 'planning_error'
				| 'interface_mismatch'
				| 'logic_error'
				| 'scope_creep'
				| 'gate_evasion'
			> = [];
			// reviewer rejections → interface_mismatch (if mentions signature/type/contract) or logic_error
			if (args.reviewer_rejections > 0) {
				const reasons = args.top_rejection_reasons ?? [];
				const hasInterface = reasons.some((r) =>
					/signature|type.*mismatch|contract.*change|export.*change|interface/i.test(
						r,
					),
				);
				const cat = hasInterface ? 'interface_mismatch' : 'logic_error';
				if (!seen.has(cat)) {
					seen.add(cat);
					taxonomy.push(cat);
				}
			}
			// test failures → logic_error
			if (args.test_failures > 0) {
				if (!seen.has('logic_error')) {
					seen.add('logic_error');
					taxonomy.push('logic_error');
				}
			}
			// loop detections → gate_evasion
			if ((args.loop_detections ?? 0) > 0) {
				if (!seen.has('gate_evasion')) {
					seen.add('gate_evasion');
					taxonomy.push('gate_evasion');
				}
			}
			// circuit breaker trips → gate_evasion
			if ((args.circuit_breaker_trips ?? 0) > 0) {
				if (!seen.has('gate_evasion')) {
					seen.add('gate_evasion');
					taxonomy.push('gate_evasion');
				}
			}
			return taxonomy;
		})(),
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

/**
 * Read and parse a JSON file safely.
 */
async function readJsonFile<T>(filePath: string): Promise<T | null> {
	try {
		const content = await readFile(filePath, 'utf-8');
		return JSON.parse(content) as T;
	} catch {
		return null;
	}
}

/**
 * Check if a retro directory exists for a given phase.
 */
async function retroExistsForPhase(
	evidenceDir: string,
	phase: number,
): Promise<boolean> {
	const retroDir = path.join(evidenceDir, `retro-${phase}`);
	try {
		const retroDirStat = await stat(retroDir);
		if (!retroDirStat.isDirectory()) {
			return false;
		}
		const evidenceFilePath = path.join(retroDir, 'evidence.json');
		await stat(evidenceFilePath);
		return true;
	} catch {
		return false;
	}
}

/**
 * Infer task complexity from task count.
 */
function inferTaskComplexity(
	taskCount: number,
): 'trivial' | 'simple' | 'moderate' | 'complex' {
	if (taskCount === 1) {
		return 'trivial';
	}
	if (taskCount === 2) {
		return 'simple';
	}
	if (taskCount <= 5) {
		return 'moderate';
	}
	return 'complex';
}

export interface AutoGenerateResult {
	success: boolean;
	phases_processed: number;
	retros_generated: number;
	skipped: number;
	details: string[];
}

/**
 * Auto-generate missing retrospectives for phases that have completed tasks
 * but no retro in .swarm/evidence/retro-{N}/.
 *
 * @param directory - Working directory containing .swarm/plan.json and .swarm/evidence/
 * @returns JSON string with operation results
 */
export async function autoGenerateMissingRetros(
	directory: string,
): Promise<string> {
	const planPath = path.join(directory, '.swarm', 'plan.json');
	const evidenceDir = path.join(directory, '.swarm', 'evidence');

	// Read plan.json
	const plan = await readJsonFile<{
		schema_version: string;
		title: string;
		swarm: string;
		current_phase: number;
		phases: Array<{
			id: number;
			name: string;
			status: string;
			tasks: Array<{
				id: string;
				phase: number;
				status: string;
				size: string;
				description: string;
				depends: string[];
				files_touched: string[];
			}>;
		}>;
	}>(planPath);

	if (!plan) {
		return JSON.stringify(
			{
				success: false,
				phases_processed: 0,
				retros_generated: 0,
				skipped: 0,
				details: ['Failed to read .swarm/plan.json'],
			},
			null,
			2,
		);
	}

	if (!Array.isArray(plan.phases)) {
		return JSON.stringify(
			{
				success: false,
				phases_processed: 0,
				retros_generated: 0,
				skipped: 0,
				details: ['plan.json is missing or has invalid phases array'],
			},
			null,
			2,
		);
	}

	const result: AutoGenerateResult = {
		success: true,
		phases_processed: 0,
		retros_generated: 0,
		skipped: 0,
		details: [],
	};

	let failures = 0;

	for (const phase of plan.phases) {
		result.phases_processed++;

		// Get completed tasks for this phase
		const completedTasks = phase.tasks.filter((t) => t.status === 'completed');

		// Skip phases with zero completed tasks
		if (completedTasks.length === 0) {
			result.skipped++;
			result.details.push(
				`Phase ${phase.id} (${phase.name}): skipped - no completed tasks`,
			);
			continue;
		}

		// Check if retro already exists
		const hasRetro = await retroExistsForPhase(evidenceDir, phase.id);
		if (hasRetro) {
			result.skipped++;
			result.details.push(
				`Phase ${phase.id} (${phase.name}): skipped - retro already exists`,
			);
			continue;
		}

		// Build the write retro args
		// NOTE: All metrics default to 0 for auto-generated retros - these are
		// estimated placeholders since the evidence file structure does not provide
		// reliable tool counts or revision metrics.
		const writeRetroArgs: WriteRetroArgs = {
			phase: phase.id,
			summary: `Auto-generated retrospective for Phase ${phase.id}: ${phase.name}`,
			task_count: completedTasks.length,
			task_complexity: inferTaskComplexity(completedTasks.length),
			total_tool_calls: 0,
			coder_revisions: 0,
			reviewer_rejections: 0,
			test_failures: 0,
			security_findings: 0,
			integration_issues: 0,
			loop_detections: 0,
			circuit_breaker_trips: 0,
			task_id: `retro-${phase.id}`,
		};

		// Execute the write retro
		const writeResult = await executeWriteRetro(writeRetroArgs, directory);
		const parsedResult = JSON.parse(writeResult);

		if (parsedResult.success) {
			result.retros_generated++;
			result.details.push(
				`Phase ${phase.id} (${phase.name}): retro generated with ${completedTasks.length} tasks`,
			);
		} else {
			failures++;
			result.details.push(
				`Phase ${phase.id} (${phase.name}): failed - ${parsedResult.message}`,
			);
		}
	}

	// Set success to false if any retros failed to generate
	result.success = failures === 0;

	return JSON.stringify(result, null, 2);
}

/**
 * Tool definition for write_retro
 */
export const write_retro: ToolDefinition = createSwarmTool({
	description:
		'Write a retrospective evidence bundle for a completed phase. ' +
		'Accepts flat retro fields and writes a correctly-wrapped EvidenceBundle to ' +
		'.swarm/evidence/retro-{phase}/evidence.json. ' +
		'Use this instead of manually writing retro JSON to avoid schema validation failures in phase_complete.',
	args: {
		phase: tool.schema
			.number()
			.int()
			.positive()
			.max(99)
			.describe('The phase number being completed (e.g., 1, 2, 3)'),
		summary: tool.schema
			.string()
			.describe('Human-readable summary of the phase'),
		task_count: tool.schema
			.number()
			.int()
			.min(1)
			.max(9999)
			.describe('Count of tasks completed in this phase'),
		task_complexity: tool.schema
			.enum(['trivial', 'simple', 'moderate', 'complex'])
			.describe('Complexity level of the completed tasks'),
		total_tool_calls: tool.schema
			.number()
			.int()
			.min(0)
			.max(9999)
			.describe('Total number of tool calls in this phase'),
		coder_revisions: tool.schema
			.number()
			.int()
			.min(0)
			.max(999)
			.describe('Number of coder revisions made'),
		reviewer_rejections: tool.schema
			.number()
			.int()
			.min(0)
			.max(999)
			.describe('Number of reviewer rejections received'),
		loop_detections: tool.schema
			.number()
			.int()
			.min(0)
			.max(9999)
			.optional()
			.describe('Number of loop detection events in this phase'),
		circuit_breaker_trips: tool.schema
			.number()
			.int()
			.min(0)
			.max(9999)
			.optional()
			.describe('Number of circuit breaker trips in this phase'),
		test_failures: tool.schema
			.number()
			.int()
			.min(0)
			.max(9999)
			.describe('Number of test failures encountered'),
		security_findings: tool.schema
			.number()
			.int()
			.min(0)
			.max(999)
			.describe('Number of security findings'),
		integration_issues: tool.schema
			.number()
			.int()
			.min(0)
			.max(999)
			.describe('Number of integration issues'),
		lessons_learned: tool.schema
			.array(tool.schema.string())
			.max(5)
			.optional()
			.describe('Key lessons learned from this phase (max 5)'),
		top_rejection_reasons: tool.schema
			.array(tool.schema.string())
			.optional()
			.describe('Top reasons for reviewer rejections'),
		task_id: tool.schema
			.string()
			.optional()
			.describe('Optional custom task ID (defaults to retro-{phase})'),
		metadata: tool.schema
			.record(tool.schema.string(), tool.schema.unknown())
			.optional()
			.describe('Optional additional metadata'),
	},
	execute: async (args, directory) => {
		const rawPhase = args.phase !== undefined ? Number(args.phase) : 0;
		try {
			const writeRetroArgs: WriteRetroArgs = {
				phase: Number(args.phase),
				summary: String(args.summary ?? ''),
				task_count: Number(args.task_count),
				task_complexity: args.task_complexity as unknown as
					| 'trivial'
					| 'simple'
					| 'moderate'
					| 'complex',
				total_tool_calls: Number(args.total_tool_calls),
				coder_revisions: Number(args.coder_revisions),
				reviewer_rejections: Number(args.reviewer_rejections),
				loop_detections:
					args.loop_detections != null
						? Number(args.loop_detections)
						: undefined,
				circuit_breaker_trips:
					args.circuit_breaker_trips != null
						? Number(args.circuit_breaker_trips)
						: undefined,
				test_failures: Number(args.test_failures),
				security_findings: Number(args.security_findings),
				integration_issues: Number(args.integration_issues),
				lessons_learned: Array.isArray(args.lessons_learned)
					? args.lessons_learned.map(String)
					: undefined,
				top_rejection_reasons: Array.isArray(args.top_rejection_reasons)
					? args.top_rejection_reasons.map(String)
					: undefined,
				task_id: args.task_id !== undefined ? String(args.task_id) : undefined,
				metadata: args.metadata as unknown as
					| Record<string, unknown>
					| undefined,
			};
			return await executeWriteRetro(writeRetroArgs, directory);
		} catch {
			return JSON.stringify(
				{ success: false, phase: rawPhase, message: 'Invalid arguments' },
				null,
				2,
			);
		}
	},
});
