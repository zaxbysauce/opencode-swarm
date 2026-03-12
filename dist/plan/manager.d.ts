import { type Plan, type TaskStatus } from '../config/plan-schema';
/**
 * Load plan.json ONLY without auto-migration from plan.md.
 * Returns null if plan.json doesn't exist or is invalid.
 * Use this when you want to check for structured plans without triggering migration.
 */
export declare function loadPlanJsonOnly(directory: string): Promise<Plan | null>;
/**
 * Load and validate plan from .swarm/plan.json with auto-heal sync.
 *
 * 4-step precedence with auto-heal:
 * 1. .swarm/plan.json exists AND validates ->
 *    a) If plan.md missing or stale -> regenerate plan.md from plan.json
 *    b) Return parsed Plan
 * 2. .swarm/plan.json exists but FAILS validation ->
 *    a) If plan.md exists -> migrate from plan.md, save valid plan.json, then derive plan.md
 *    b) Return migrated Plan
 * 3. .swarm/plan.md exists only -> migrate from plan.md, save both files, return Plan
 * 4. Neither exists -> return null
 */
export declare function loadPlan(directory: string): Promise<Plan | null>;
/**
 * Validate against PlanSchema (throw on invalid), write to .swarm/plan.json via atomic temp+rename pattern,
 * then derive and write .swarm/plan.md
 */
export declare function savePlan(directory: string, plan: Plan): Promise<void>;
/**
 * Load plan → find task by ID → update status → save → return updated plan.
 * Throw if plan not found or task not found.
 */
export declare function updateTaskStatus(directory: string, taskId: string, status: TaskStatus): Promise<Plan>;
/**
 * Generate deterministic markdown view from plan object.
 * Ensures stable ordering: phases by ID (ascending), tasks by ID (natural numeric).
 */
export declare function derivePlanMarkdown(plan: Plan): string;
/**
 * Convert existing plan.md to plan.json. PURE function — no I/O.
 */
export declare function migrateLegacyPlan(planContent: string, swarmId?: string): Plan;
