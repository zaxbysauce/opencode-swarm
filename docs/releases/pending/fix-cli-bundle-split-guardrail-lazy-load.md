## CLI bundle code splitting and lazy-loaded guardrail handlers

`bun build` for the CLI bundle (`dist/cli/index.js`) now uses `--splitting`, and the two new guardrail CLI commands (`guardrail explain`, `guardrail-log`) are lazy-loaded via dynamic `import()` in `src/commands/registry.ts`. As a result, the entry chunk drops from ~2.57 MB to ~15 KB; the heavy handler bodies ship as separate chunks in `dist/cli/` and are loaded only when their commands are invoked.

This restores compliance with the existing smoke test (`dist/cli/index.js is reasonable (< 2.4MB)`) after the v7.84.0 guardrail transparency suite (PR #1455) added ~1,070 lines of guardrail service code that was being pulled into every CLI invocation. Without code splitting, dynamic imports alone do not reduce the entry file size; the combination is required to keep the entry under the cap without bumping the threshold.

User-visible impact:
- Faster cold start for `install`, `update`, `uninstall`, and `help` — these paths no longer load the guardrail services.
- `guardrail explain` and `guardrail-log` are loaded on first invocation; subsequent calls use the in-memory chunk cache. No behavior change.
- `npm pack` produces multiple files in `dist/cli/` (entry + chunks) instead of one. All files are included via `package.json#files: ["dist"]`.

**Migration:** No migration required. Both guardrail commands work identically; the change is transparent to every existing CLI invocation. The main plugin bundle (`dist/index.js`) is unaffected and remains a single Node-ESM-loadable file (invariant 2).
