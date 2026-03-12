/**
 * Handle /swarm sync-plan command.
 * Maps to: plan service (loadPlan which triggers auto-heal/sync)
 *
 * This command ensures plan.json and plan.md are in sync.
 * The loadPlan function automatically regenerates plan.md from plan.json if needed.
 */
export declare function handleSyncPlanCommand(directory: string, _args: string[]): Promise<string>;
