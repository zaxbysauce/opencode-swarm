/**
 * Repo graph context injection for the system-enhancer hook.
 *
 * Produces compact text blocks that surface structural information
 * (importers, dependents, blast radius) for the file the agent is about
 * to edit. Designed to fit within the system-enhancer's per-block budget
 * (~300-500 chars).
 *
 * Failure mode: silent. If no graph exists (`.swarm/repo-graph.json`
 * absent or invalid), this module returns `null` for every helper —
 * the agent simply doesn't get the extra context. The graph is built
 * on-demand by the agent calling `repo_map` with action="build".
 *
 * Caching: the loaded graph is cached per-directory in module scope to
 * avoid re-reading the JSON on every system prompt construction. The
 * cache is bypassed if the file's mtime advances.
 */
import { type RepoGraph } from '../graph';
/**
 * Load the repo graph for `directory`, using a per-directory cache that
 * invalidates on file mtime change. Returns null if no graph exists.
 *
 * Exported only for tests; production callers use the buildXxxBlock helpers below.
 */
export declare function getCachedGraph(directory: string): RepoGraph | null;
/** Test-only: clear the per-directory cache. */
export declare function resetGraphInjectionCache(): void;
/**
 * Build a localization block for a target file. Used by the coder agent
 * to surface importers/dependencies/blast-radius before editing.
 *
 * Returns null when:
 *   - No graph exists.
 *   - The target isn't tracked in the graph (file too new, language unsupported).
 */
export declare function buildCoderLocalizationBlock(directory: string, targetFile: string): string | null;
/**
 * Build a blast-radius block for a list of changed files. Used by the
 * reviewer agent to spot-check whether unseen consumers might break.
 *
 * Returns null when no graph exists or when none of the files are in the
 * graph. The result is bounded to the top 8 dependents to stay within
 * the per-block context budget.
 */
export declare function buildReviewerBlastRadiusBlock(directory: string, changedFiles: string[]): string | null;
