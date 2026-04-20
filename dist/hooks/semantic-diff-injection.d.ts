/**
 * Semantic diff injection for the system-enhancer hook.
 *
 * Computes a semantic AST diff summary for changed files and produces
 * a markdown block for injection into the reviewer agent's context.
 *
 * Failure mode: silent. If git is unavailable or AST diff fails,
 * returns null — the reviewer simply doesn't get the extra context.
 */
/**
 * Build a semantic diff summary block for the given changed files.
 *
 * For each file:
 * 1. Gets old content from git HEAD (cat-file -e check first)
 * 2. Gets new content from working tree
 * 3. Runs computeASTDiff
 * 4. Collects all AST diffs
 * 5. Builds fileConsumers map from repo graph (getImporters().length per file)
 * 6. Runs classifyChanges with fileConsumers
 * 7. Runs generateSummary + generateSummaryMarkdown
 *
 * Returns null if no changes are detected or on failure.
 */
export declare function buildSemanticDiffBlock(directory: string, changedFiles: string[], maxFiles?: number): Promise<string | null>;
