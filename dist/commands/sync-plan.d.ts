/**
 * Handle /swarm sync-plan command.
 * Maps to: plan service (loadPlan which triggers auto-heal/sync)
 *
 * This command ensures plan.json and plan.md are in sync.
 * loadPlan() is safe here: the migration-aware ledger guard in loadPlan()
 * now prevents false reverts caused by swarm identity changes, so the
 * full auto-heal path (including legacy plan.md migration) is correct.
 */
export declare function handleSyncPlanCommand(directory: string, _args: string[]): Promise<string>;
