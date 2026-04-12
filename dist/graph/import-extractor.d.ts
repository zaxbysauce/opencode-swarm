import type { ImportEdge } from './types';
/**
 * Extract import edges from a source file.
 *
 * Uses regex-based parsing (the same proven approach as `src/tools/imports.ts`
 * and `src/tools/co-change-analyzer.ts`). Tree-sitter is intentionally not used
 * here because:
 *   1. The existing regex patterns are battle-tested across the codebase.
 *   2. Import statements have stable, simple syntax that regex handles reliably.
 *   3. Avoiding the per-file Tree-sitter parse keeps full-graph builds fast
 *      enough to be interactive (target: <5s for 50k LOC).
 *
 * Supported languages:
 *   - TypeScript / JavaScript (.ts/.tsx/.js/.jsx/.mjs/.cjs) — ES modules + CJS require
 *   - Python (.py) — `import x` and `from x import y`
 *   - Go (.go) — `import "path"` and `import (...)` blocks
 *   - Rust (.rs) — `use path::module`
 *
 * Only RELATIVE imports are tracked as graph edges. External package imports
 * (e.g. 'react', 'fmt', 'std::fs') are skipped — they are not part of the
 * intra-repo dependency graph.
 */
export interface ExtractImportsOptions {
    /** Absolute path to the source file (used for relative resolution). */
    absoluteFilePath: string;
    /** Absolute workspace root (used for relative path computation). */
    workspaceRoot: string;
    /** Optional pre-read content; if omitted the file is read from disk. */
    content?: string;
}
/** Source file extensions we know how to scan. */
export declare const SOURCE_EXTENSIONS: readonly [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs"];
export declare function getLanguageFromExtension(ext: string): string | null;
/**
 * Extract import edges for a single file. Returns an empty array when the
 * language is unsupported or the file cannot be parsed.
 *
 * Resolution strategy for edge.target:
 *   - TS/JS: probe extensions (.ts, .tsx, .js, .jsx, .mjs, .cjs, /index.*).
 *   - Python: probe .py and /__init__.py for relative imports only.
 *   - Go/Rust: target left empty (intra-repo resolution requires module/crate
 *     metadata that is out of scope for Phase 1). The raw module is preserved.
 */
export declare function extractImports(opts: ExtractImportsOptions): ImportEdge[];
