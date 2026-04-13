import type { ExportedSymbol } from './types';
/**
 * Extract exported symbols from a single file.
 *
 * Reuses the proven regex-based extractors from `src/tools/symbols.ts`
 * (`extractTSSymbols` / `extractPythonSymbols`) and maps their internal
 * SymbolInfo shape to our `ExportedSymbol` type.
 *
 * For Go and Rust, exported-symbol extraction is best-effort (out of scope
 * for Phase 1) — empty arrays are returned. The graph still tracks file-level
 * import edges for these languages.
 */
/**
 * @param relativeFilePath - file path relative to workspace root (forward-slash)
 * @param workspaceRoot - absolute workspace root
 */
export declare function extractExportedSymbols(relativeFilePath: string, workspaceRoot: string): ExportedSymbol[];
