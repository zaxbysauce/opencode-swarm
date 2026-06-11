/**
 * Derive plan identity string from plan object.
 * Canonical implementation — all consumers must import from here.
 *
 * Uses :: as a collision-resistant separator to prevent plans with
 * different titles but similar characters (e.g., b-c vs b_c) from
 * colliding after character sanitization.
 */
export function derivePlanId(plan: { swarm: string; title: string }): string {
	return `${plan.swarm}::${plan.title}`.replace(/[^a-zA-Z0-9:_-]/g, '_');
}
