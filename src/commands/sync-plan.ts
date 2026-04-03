import {
	derivePlanMarkdown,
	loadPlanJsonOnly,
	regeneratePlanMarkdown,
} from '../plan/manager';

/**
 * Handle /swarm sync-plan command.
 * Maps to: plan service (read-only load + targeted regenerate)
 *
 * This command ensures plan.json and plan.md are in sync.
 * Uses loadPlanJsonOnly + regeneratePlanMarkdown instead of loadPlan() to avoid
 * triggering the ledger hash-mismatch guard, which can destructively overwrite
 * plan.json with stale ledger-replayed state after a session migration.
 */
export async function handleSyncPlanCommand(
	directory: string,
	_args: string[],
): Promise<string> {
	const plan = await loadPlanJsonOnly(directory);

	if (!plan) {
		return '## Plan Sync Report\n\nNo active swarm plan found. Nothing to sync.';
	}

	await regeneratePlanMarkdown(directory, plan);

	// Derive fresh markdown to confirm sync
	const currentMarkdown = derivePlanMarkdown(plan);

	const lines = [
		'## Plan Sync Report',
		'',
		'**Status**: ✅ Synced',
		'',
		'The plan.json and plan.md are now synchronized.',
		'',
		'### Current Plan',
		'',
		currentMarkdown,
	];

	return lines.join('\n');
}
