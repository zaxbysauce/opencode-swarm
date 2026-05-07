/**
 * Write final council evidence tool for persisting final holistic council verdicts.
 * Accepts phase, verdict, and summary from the Architect and writes
 * a structured evidence file to the flat evidence root (not per-phase).
 */

import fs from 'node:fs';
import path from 'node:path';
import type { ToolDefinition } from '@opencode-ai/plugin/tool';
import { z } from 'zod';
import { validateSwarmPath } from '../hooks/utils';
import { loadPlan } from '../plan/manager.js';
import { derivePlanId } from '../plan/utils.js';
import { createSwarmTool } from './create-tool';

/**
 * Arguments for the write_final_council_evidence tool
 */
export interface WriteFinalCouncilEvidenceArgs {
	/** The phase number for the final council verdict */
	phase: number;
	/** Verdict of the final council: 'APPROVED' or 'NEEDS_REVISION' */
	verdict: 'APPROVED' | 'NEEDS_REVISION';
	/** Human-readable summary of the final council verdict */
	summary: string;
}

/**
 * Normalize verdict string to lowercase format
 * @param verdict - Raw verdict from caller
 * @returns Normalized verdict: 'approved' | 'rejected'
 */
function normalizeVerdict(verdict: string): 'approved' | 'rejected' {
	switch (verdict) {
		case 'APPROVED':
			return 'approved';
		case 'NEEDS_REVISION':
			return 'rejected';
		default:
			throw new Error(
				`Invalid verdict: must be 'APPROVED' or 'NEEDS_REVISION', got '${verdict}'`,
			);
	}
}

/**
 * Execute the write_final_council_evidence tool.
 * Validates input, builds an evidence entry, and writes to disk.
 * @param args - The write final council evidence arguments
 * @param directory - Working directory
 * @returns JSON string with success status and details
 */
export async function executeWriteFinalCouncilEvidence(
	args: WriteFinalCouncilEvidenceArgs,
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

	// Validate verdict is one of the allowed values
	const validVerdicts = ['APPROVED', 'NEEDS_REVISION'] as const;
	if (!validVerdicts.includes(args.verdict)) {
		return JSON.stringify(
			{
				success: false,
				phase: phase,
				message: "Invalid verdict: must be 'APPROVED' or 'NEEDS_REVISION'",
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

	// Normalize verdict
	const normalizedVerdict = normalizeVerdict(args.verdict);

	// Compute plan_id for evidence binding
	const plan = await loadPlan(directory);
	const planId = plan ? derivePlanId(plan) : 'unknown';

	// Build the evidence entry
	const evidenceEntry = {
		type: 'final-council',
		phase,
		plan_id: planId,
		verdict: normalizedVerdict,
		summary: summary.trim(),
		timestamp: new Date().toISOString(),
	};

	// Build the gate-contract format
	const evidenceContent = {
		entries: [evidenceEntry],
	};

	// Validate and construct the file path using validateSwarmPath
	// Final council evidence goes to flat evidence root, not per-phase directory
	const filename = 'final-council.json';
	const relativePath = path.join('evidence', filename);
	let validatedPath: string;
	try {
		validatedPath = validateSwarmPath(directory, relativePath);
	} catch (error) {
		return JSON.stringify(
			{
				success: false,
				phase: phase,
				message:
					error instanceof Error ? error.message : 'Failed to validate path',
			},
			null,
			2,
		);
	}

	const evidenceDir = path.dirname(validatedPath);

	// Write the evidence file
	try {
		// Ensure the directory exists
		await fs.promises.mkdir(evidenceDir, { recursive: true });

		// Write the file atomically by writing to a temp file then renaming
		const tempPath = path.join(evidenceDir, `.${filename}.tmp`);
		await fs.promises.writeFile(
			tempPath,
			JSON.stringify(evidenceContent, null, 2),
			'utf-8',
		);
		await fs.promises.rename(tempPath, validatedPath);

		return JSON.stringify(
			{
				success: true,
				phase: phase,
				verdict: normalizedVerdict,
				message: `Final council evidence written to .swarm/evidence/final-council.json`,
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
 * Tool definition for write_final_council_evidence
 */
export const write_final_council_evidence: ToolDefinition = createSwarmTool({
	description:
		'Write final council evidence for a completed project. Accepts phase, verdict (APPROVED/NEEDS_REVISION), summary, and writes structured evidence to .swarm/evidence/final-council.json. Normalizes verdict to lowercase. Use this after convening a final holistic council to persist the verdict.',
	args: {
		phase: z
			.number()
			.int()
			.min(1)
			.describe(
				'The phase number for the final council verdict (e.g., 1, 2, 3)',
			),
		verdict: z
			.enum(['APPROVED', 'NEEDS_REVISION'])
			.describe("Verdict of the final council: 'APPROVED' or 'NEEDS_REVISION'"),
		summary: z
			.string()
			.describe('Human-readable summary of the final council verdict'),
	},
	execute: async (args, directory) => {
		const rawPhase = args.phase !== undefined ? Number(args.phase) : 0;
		try {
			const writeFinalCouncilEvidenceArgs: WriteFinalCouncilEvidenceArgs = {
				phase: Number(args.phase),
				verdict: String(args.verdict) as 'APPROVED' | 'NEEDS_REVISION',
				summary: String(args.summary ?? ''),
			};
			return await executeWriteFinalCouncilEvidence(
				writeFinalCouncilEvidenceArgs,
				directory,
			);
		} catch (error) {
			return JSON.stringify(
				{
					success: false,
					phase: rawPhase,
					message: error instanceof Error ? error.message : 'Unknown error',
				},
				null,
				2,
			);
		}
	},
});
