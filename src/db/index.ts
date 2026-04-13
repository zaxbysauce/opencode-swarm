/**
 * Barrel re-exports for the opencode-swarm SQLite database layer.
 *
 * - `global-db`: process-wide singleton for cross-project rules and
 *   agent prompt sections (`global-rules.db` in the platform config dir).
 * - `project-db`: per-project database cache (`.swarm/swarm.db`), keyed by
 *   normalized directory path.
 * - `qa-gate-profile`: service layer for per-plan QA gate profiles stored
 *   in the project DB.
 */

export {
	closeGlobalDb,
	getGlobalDb,
	runGlobalMigrations,
} from './global-db.js';
export {
	closeAllProjectDbs,
	closeProjectDb,
	getProjectDb,
	projectDbExists,
	projectDbPath,
	runProjectMigrations,
} from './project-db.js';
export {
	computeProfileHash,
	DEFAULT_QA_GATES,
	getEffectiveGates,
	getOrCreateProfile,
	getProfile,
	lockProfile,
	type QaGateProfile,
	type QaGates,
	setGates,
} from './qa-gate-profile.js';
