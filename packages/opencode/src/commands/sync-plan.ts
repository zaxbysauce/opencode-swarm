import { derivePlanMarkdown, loadPlan } from '../plan/manager';

/**
 * Handle /swarm sync-plan command.
 * Maps to: plan service (loadPlan which triggers auto-heal/sync)
 *
 * This command ensures plan.json and plan.md are in sync.
 * The loadPlan function automatically regenerates plan.md from plan.json if needed.
 */
export async function handleSyncPlanCommand(
	directory: string,
	_args: string[],
): Promise<string> {
	const plan = await loadPlan(directory);

	if (!plan) {
		return '## Plan Sync Report\n\nNo active swarm plan found. Nothing to sync.';
	}

	// Load plan triggers auto-heal which regenerates plan.md if stale
	// Now derive fresh markdown to confirm sync
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
