# repo graph: fail-open extraction diagnostics and graph_health

Adds a fail-open graph build fallback when tree-sitter symbol extraction cannot
produce symbol facts for a file. The async repo graph builder now preserves the
existing file-level node, exports, imports, and import edges instead of replacing
the file with an empty-context node.

Adds `repo_map action="graph_health"` for bounded graph diagnostics:

- graph schema version and freshness;
- stale files detected since the graph was built;
- symbol-extraction failures;
- unresolved relative imports;
- oversized, unsupported, binary, and unreadable files;
- low-confidence edge count.

Old `.swarm/repo-graph.json` files remain readable. Graphs without diagnostics
return an explicit rebuild note rather than silently reporting clean extraction.
