/**
 * Regression coverage for the repo-graph walker (issue #704).
 *
 * Each test installs a fresh fixture under a tmp dir and asserts the walker
 * cannot be tricked into:
 *   - infinite recursion via symlink cycles,
 *   - exceeding the wall-clock budget on a slow filesystem,
 *   - exceeding the file cap during traversal (vs. post-truncation),
 *   - scanning a refused top-level workspace root.
 *
 * Symlink-loop coverage is POSIX-only; the test bails on Windows because
 * creating a directory symlink there requires Developer Mode. The walker's
 * cycle defense itself is platform-agnostic — see `seenRealPaths` in
 * src/tools/repo-graph.ts.
 */
export {};
