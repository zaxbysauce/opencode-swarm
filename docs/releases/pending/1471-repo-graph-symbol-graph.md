# repo-graph: schema 1.2.0 — tree-sitter symbol-level extraction & context_pack

## What

- Repo-graph schema bumped to **1.2.0**.
- Tree-sitter symbol-level extraction for all 12 first-class languages: TypeScript, JavaScript, Python, Rust, Go, Java, Kotlin, C#, C/C++, Swift, Dart, Ruby, PHP.
- New **symbol→symbol call graph** (`symbolEdges`): edges keyed by enclosing declaration, not just file-to-file.
- Per-symbol source ranges (`exportRanges`: 1-based inclusive line spans per exported symbol).
- New `repo_map` action **`context_pack`**: returns a token-budgeted, deduped source-context slice for a target symbol (definition + transitive callers/callees, periphery as signatures).

## Why

Agents currently receive file-level results only (which files reference which). The symbol-level slice (definition + callers/callees) massively reduces context burden for refactoring shared modules — agents no longer need to open whole files to act on a symbol.

The prior regex extractors could not reliably produce declaration boundaries or reference attribution across grammars; tree-sitter is both the accuracy upgrade and the path to 12-language coverage without hand-writing 12 parsers.

## Migration

Schema 1.2.0 is **additive** — graphs built at 1.0.0 and 1.1.0 load unchanged.

- Run `repo_map action="build"` to populate symbol data (`exportRanges` + `symbolEdges`); this is the **async** builder path.
- The sync builder (`buildWorkspaceGraph`) keeps file-level data only; it does not populate symbol-level fields.
- `context_pack` requires a 1.2.0 graph; on older graphs it returns `schemaSupported: false` with a note to rebuild (same self-gating pattern as `dead_exports` for schema < 1.1.0).

## Caveats

1. **Data-drift (symbols/batch_symbols vs repo_map)**: The `symbols` and `batch_symbols` tools retain the original regex extractors for backward compatibility. For TS/JS/Python files they may report different symbol names or ranges than `repo_map` produces via tree-sitter. Use `repo_map` for authoritative symbol data.

2. **Conservative symbolEdges**:
   - Namespace imports (`import * as ns`) produce `toSymbol: '*'` — no `ns.foo` decomposition.
   - Local-variable shadowing can over-attribute references to the wrong declaration.
   - Rare re-export forms (`export * from 'module'`) are not captured.

3. **Grammar coverage**: Best-effort (~80% accuracy) on the hardest grammars (C++, C#, Kotlin, Swift, PHP). Queries degrade to fail-open (return `null` / empty arrays) — they never crash the build.

4. **Symbol data is async-exclusive**: The sync builder produces file-level nodes and edges only. Symbol-level fields (`exportRanges`, `symbolEdges`) are populated only by the async builder path.

5. **Advisory analysis**: Dynamic dispatch, reflection, runtime-computed access, and string-keyed member access are invisible. `dead_exports`, `context_pack`, and symbol edges are aids, never delete/edit directives.
