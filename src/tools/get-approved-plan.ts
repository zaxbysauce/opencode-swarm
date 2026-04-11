/**
 * Tool to retrieve the last critic-approved immutable plan snapshot.
 *
 * Wraps `loadLastApprovedPlan` from `src/plan/ledger.ts` as a tool callable
 * by the critic `phase_drift_verifier` agent. Enables active baseline drift
 * comparison: the drift verifier can compare the immutable approved snapshot
 * against the current `plan.json` to detect silent plan mutations introduced
 * after approval.
 *
 * The tool internally derives `plan_id` from the current plan for
 * cross-identity safety — the caller does not need to know the format.
 *
 * Read-only: no file writes.
 *
 * @see https://github.com/zaxbysauce/opencode-swarm/issues/449
 */

import { tool } from '@opencode-ai/plugin';
import {
	type ApprovedSnapshotInfo,
	computePlanHash,
	loadLastApprovedPlan,
} from '../plan/ledger';
import { loadPlanJsonOnly } from '../plan/manager';
import { createSwarmTool } from './create-tool';

// ============ Types ============

interface GetApprovedPlanResult {
	success: boolean;
	reason?: string;
	approved_plan?: ApprovedPlanPayload;
	current_plan?: CurrentPlanPayload | null;
	drift_detected?: boolean | 'unknown';
	current_plan_error?: string;
}

interface ApprovedPlanPayload {
	plan: unknown;
	approval_metadata: Record<string, unknown> | undefined;
	snapshot_seq: number;
	snapshot_timestamp: string;
	payload_hash: string;
}

interface CurrentPlanPayload {
	plan: unknown;
	current_hash: string;
}

interface PlanSummary {
	title: string;
	swarm: string;
	current_phase: number;
	phase_count: number;
	phases: Array<{
		id: number;
		name: string;
		status: string;
		task_count: number;
	}>;
}

// ============ Core Logic ============

/**
 * Summarize a plan into structural metadata only (no full task descriptions).
 */
function summarizePlan(plan: {
	title: string;
	swarm: string;
	current_phase?: number;
	phases: Array<{
		id: number;
		name: string;
		status: string;
		tasks: unknown[];
	}>;
}): PlanSummary {
	return {
		title: plan.title,
		swarm: plan.swarm,
		current_phase: plan.current_phase ?? 0,
		phase_count: plan.phases.length,
		phases: plan.phases.map((p) => ({
			id: p.id,
			name: p.name,
			status: p.status,
			task_count: p.tasks.length,
		})),
	};
}

/**
 * Derive plan identity string matching the ledger format.
 * Must stay in sync with takeSnapshotEvent in ledger.ts.
 */
function derivePlanId(plan: { swarm: string; title: string }): string {
	return `${plan.swarm}-${plan.title}`.replace(/[^a-zA-Z0-9-_]/g, '_');
}

/**
 * Core execution logic — exported for direct testing.
 */
export async function executeGetApprovedPlan(
	args: { summary_only?: boolean },
	directory: string,
): Promise<GetApprovedPlanResult> {
	// Step 1: Load current plan to derive plan_id for cross-identity safety
	const currentPlan = await loadPlanJsonOnly(directory);
	const expectedPlanId = currentPlan ? derivePlanId(currentPlan) : undefined;

	// Step 2: Load the most recent critic-approved snapshot
	const approved: ApprovedSnapshotInfo | null = await loadLastApprovedPlan(
		directory,
		expectedPlanId,
	);

	if (!approved) {
		return {
			success: false,
			reason: 'no_approved_snapshot',
		};
	}

	const summaryOnly = args.summary_only === true;

	// Step 3: Build approved plan payload
	const approvedPayload: ApprovedPlanPayload = {
		plan: summaryOnly ? summarizePlan(approved.plan) : approved.plan,
		approval_metadata: approved.approval,
		snapshot_seq: approved.seq,
		snapshot_timestamp: approved.timestamp,
		payload_hash: approved.payloadHash,
	};

	// Step 4: Compare against current plan if available
	if (!currentPlan) {
		return {
			success: true,
			approved_plan: approvedPayload,
			current_plan: null,
			drift_detected: 'unknown',
			current_plan_error: 'plan.json not found or invalid',
		};
	}

	const currentHash = computePlanHash(currentPlan);
	const driftDetected = currentHash !== approved.payloadHash;

	const currentPayload: CurrentPlanPayload = {
		plan: summaryOnly ? summarizePlan(currentPlan) : currentPlan,
		current_hash: currentHash,
	};

	return {
		success: true,
		approved_plan: approvedPayload,
		current_plan: currentPayload,
		drift_detected: driftDetected,
	};
}

// ============ Tool Definition ============

export const get_approved_plan: ReturnType<typeof tool> = createSwarmTool({
	description:
		'Retrieve the last critic-approved immutable plan snapshot for baseline drift comparison. ' +
		'Returns the approved plan, its approval metadata, and optionally compares against ' +
		'the current plan.json to detect silent mutations. Read-only.',
	args: {
		summary_only: tool.schema
			.boolean()
			.optional()
			.describe(
				'When true, returns only structural metadata (title, phases, task counts) ' +
					'instead of full plan objects. Reduces output size for large plans.',
			),
	},
	execute: async (args: unknown, directory: string) => {
		const typedArgs = args as { summary_only?: boolean };
		return JSON.stringify(
			await executeGetApprovedPlan(typedArgs, directory),
			null,
			2,
		);
	},
});
