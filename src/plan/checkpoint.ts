/**
 * Checkpoint artifact writer.
 * Writes SWARM_PLAN.md and SWARM_PLAN.json at the project root (not inside .swarm/).
 * Export-only — not a live runtime source of truth.
 * Called on: save_plan, phase completion, /swarm close.
 * NOT called on every task update.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { type Plan, PlanSchema } from '../config/plan-schema';
import { appendLedgerEvent } from '../plan/ledger';
import { derivePlanMarkdown, loadPlan, savePlan } from './manager';

/**
 * Write SWARM_PLAN.json and SWARM_PLAN.md to the project root directory.
 * Non-blocking: logs a warning on failure but never throws.
 * @param directory - The working directory (project root)
 */
export async function writeCheckpoint(directory: string): Promise<void> {
	try {
		const plan = await loadPlan(directory);
		if (!plan) return;

		const jsonPath = path.join(directory, 'SWARM_PLAN.json');
		const mdPath = path.join(directory, 'SWARM_PLAN.md');

		// Write JSON checkpoint
		fs.writeFileSync(jsonPath, JSON.stringify(plan, null, 2), 'utf8');

		// Write Markdown checkpoint
		const md = derivePlanMarkdown(plan);
		fs.writeFileSync(mdPath, md, 'utf8');
	} catch (error) {
		// Non-blocking: checkpoint failure must never break the calling operation
		console.warn(
			`[checkpoint] Failed to write SWARM_PLAN checkpoint: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Result of an importCheckpoint operation.
 */
export interface ImportCheckpointResult {
	success: boolean;
	plan?: Plan;
	error?: string;
}

/**
 * Import a checkpoint from SWARM_PLAN.json at the project root.
 * Validates the checkpoint against PlanSchema, persists it as the live plan
 * via savePlan, and appends a 'plan_rebuilt' ledger event.
 *
 * @param directory - The working directory (project root)
 * @param source - Optional source identifier for the ledger event (defaults to 'external_reseed')
 * @returns ImportCheckpointResult indicating success or failure with error message
 */
export async function importCheckpoint(
	directory: string,
	source?: string,
): Promise<ImportCheckpointResult> {
	try {
		const checkpointPath = path.join(directory, 'SWARM_PLAN.json');
		const rawContent = fs.readFileSync(checkpointPath, 'utf8');
		const parsed = JSON.parse(rawContent);
		const plan = PlanSchema.parse(parsed) as Plan;

		await savePlan(directory, plan);

		await appendLedgerEvent(directory, {
			event_type: 'plan_rebuilt',
			source: source ?? 'external_reseed',
			plan_id: `${plan.swarm}-${plan.title}`.replace(/[^a-zA-Z0-9-_]/g, '_'),
		});

		return { success: true, plan };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}
