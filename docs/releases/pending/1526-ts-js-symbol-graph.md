# repo-graph: harden TypeScript and JavaScript symbol extraction

- Added `.mjs` and `.cjs` to the language registry so Node ESM/CJS files route through JavaScript parser support.
- Extended tree-sitter-backed TS/JS symbol extraction to report side-effect imports and re-export statements, including named/default re-export aliases.
- Improved async repo-graph output so named/default barrel re-exports produce graph edges, exported alias ranges, and symbol edges for `callers`, `dead_exports`, and `context_pack`.
