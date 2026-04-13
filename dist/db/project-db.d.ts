/**
 * Per-project SQLite database for opencode-swarm.
 *
 * Owns `.swarm/swarm.db` in each project directory. Stores per-project
 * constraints and QA gate profiles. One cached instance per normalized
 * directory path.
 */
import { Database } from 'bun:sqlite';
/**
 * Run all pending migrations on the provided database.
 * Idempotent: existing migrations are not re-applied.
 */
export declare function runProjectMigrations(db: Database): void;
/**
 * Return the cached project database for the given directory, opening it
 * if needed. Creates `.swarm/` if absent and enables WAL + foreign keys.
 */
export declare function getProjectDb(directory: string): Database;
/**
 * Close and remove the cached project database for the given directory.
 * Test-only.
 */
export declare function closeProjectDb(directory: string): void;
/**
 * Close and remove all cached project databases.
 * Test-only.
 */
export declare function closeAllProjectDbs(): void;
