# Stage 1 Plan — `syntax_check`

Stage 0 delivered the baseline (gate architecture, grammar decision, registry scaffolding, evidence stubs, SME schedule). Stage 1 executes the first new gate: `syntax_check`. The plan below spells out the incremental work so we can implement, test, and enforce this gate before proceeding to the remaining stages.

## Stage 0 Decisions

- **Runtime**: `web-tree-sitter` was selected for Bun compatibility and offline WASM bundling
- **WASM Source**: Use `@vscode/tree-sitter-wasm` package (ships prebuilt WASM files for all required languages)
- **Parser scaffolding**: `src/lang/registry.ts` currently exposes the language map/extension lookup and a placeholder loader stub (`src/lang/runtime.ts`); Stage 1 will fill in the actual parser loading logic and cache
- **Benchmark harness**: `scripts/tree-sitter-benchmark.ts` uses the `examples/syntax-check/` samples (JS/TS, Python, Go, Rust) to capture parse time/heap usage

## Objectives

1. Wire up the selected Tree-sitter runtime + grammar bundle for the Stage 0-approved language set (JS/TS, Python, Go, Rust) with deterministic, Bun-friendly loading
2. Extend `src/lang/` with the parser registry/loader that Stage 0 defined so `syntax_check` can claim a consistent grammar per language (with comment node metadata for later placeholder_scan work)
3. Implement the `syntax_check` tool in `src/tools/syntax-check.ts` that parses changed files, records `verdict`, `files`, `errors`, and `summary`, and writes `syntax` evidence entries
4. Update the Architect gate (prompt + tests) to insert `syntax_check` right after `diff` and before `imports`, ensuring failures return control to the coder and success emits the new gate evidence

## Tasks

### 1.1: Tree-sitter runtime + grammar bundle (depends: none)

**Deliverables**:
- Add `web-tree-sitter` and `@vscode/tree-sitter-wasm` to `package.json` (pinned to tested versions)
- Create `scripts/copy-grammars.ts` that copies WASM files from `node_modules/@vscode/tree-sitter-wasm/dist/` to `src/lang/grammars/`
- Wire `copy-grammars.ts` to `postinstall` hook in `package.json`
- Update build script to copy `src/lang/grammars/` to `dist/lang/grammars/`
- Update `package.json` `files` array to include `dist/lang/grammars/`

**Implementation**:
- `src/lang/runtime.ts`: Initialize web-tree-sitter Parser, implement async `loadGrammar(languageId)` that:
  - Loads WASM via `Parser.Language.load()` from `dist/lang/grammars/{language}.wasm`
  - Caches loaded languages in `parserCache: Map<string, Parser>`
  - Returns configured Parser instance
- Update `Parser` type alias from `unknown` to imported type from `web-tree-sitter`

**Acceptance**:
- [ ] `bun install` triggers grammar copy successfully
- [ ] All 5 WASM files exist in `dist/lang/grammars/` after build
- [ ] Each sample file from `examples/syntax-check/` parses without throwing
- [ ] `loadGrammar('javascript')` returns cached Parser on second call

---

### 1.2: Parser registry & loader (depends: 1.1)

**Deliverables**:
- Extend `src/lang/registry.ts` with `getParserForFile(filePath: string): Promise<Parser | null>`
- Create `tests/unit/lang/` directory and `registry.test.ts`

**Implementation**:
- `getParserForFile`:
  1. Extract extension from `filePath`
  2. Lookup language via `getLanguageForExtension`
  3. If found, call `loadGrammar(language.id)` from runtime
  4. Return Parser instance or null if unsupported
- Export `ParserCache` interface for tool injection

**Acceptance**:
- [ ] Unit tests cover all supported extensions (`.js`, `.jsx`, `.ts`, `.tsx`, `.py`, `.go`, `.rs`)
- [ ] `.tsx` files resolve to TypeScript grammar
- [ ] Unsupported extensions return null (not throw)
- [ ] Parser instances are cached across calls

---

### 1.3: `syntax_check` tool implementation (depends: 1.2)

**Deliverables**:
- Create `src/tools/syntax-check.ts` with exported `syntaxCheck` function
- Create `tests/unit/tools/syntax-check.test.ts`
- Update `src/config/evidence-schema.ts` with typed `SyntaxEvidenceSchema`
- Export from `src/tools/index.ts`

**Interface**:
```typescript
interface SyntaxCheckInput {
  changed_files: Array<{ path: string; additions: number }>;
  mode: 'changed' | 'all';
}

interface SyntaxCheckResult {
  verdict: 'pass' | 'fail' | 'skipped';
  files: Array<{
    path: string;
    language: string;
    ok: boolean;
    errors?: Array<{ line: number; column: number; message: string }>;
    skipped_reason?: string;
  }>;
  summary: string;
}
```

**Implementation**:
1. **Early exit**: If `config.gates.syntax_check.enabled === false`, return `{ verdict: 'skipped', files: [], summary: 'Gate disabled by configuration' }`
2. **Filtering**: 
   - Filter `changed_files` to `additions > 0`
   - Filter to supported extensions via `getLanguageForExtension`
3. **Processing** (respecting `mode`):
   - For each file: check size < 5MB, check first 8KB for null bytes (>10% nulls = binary)
   - Parse with `getParserForFile`
   - Collect syntax errors from parse tree
4. **Evidence**: Write via `saveEvidence()` with typed schema

**Evidence Schema** (`src/config/evidence-schema.ts`):
```typescript
export const SyntaxEvidenceSchema = BaseEvidenceSchema.extend({
  type: z.literal('syntax'),
  files_checked: z.number().int(),
  files_failed: z.number().int(),
  skipped_count: z.number().int().default(0),
  files: z.array(
    z.object({
      path: z.string(),
      language: z.string(),
      ok: z.boolean(),
      errors: z.array(
        z.object({
          line: z.number().int(),
          column: z.number().int(),
          message: z.string(),
        })
      ).default([]),
      skipped_reason: z.string().optional(),
    })
  ).default([]),
});
```

**Error Handling**:
- Grammar load failure: Mark file `ok: false`, `skipped_reason: 'grammar_load_error'`, continue
- Parse error: Capture line/column/message, mark `ok: false`
- Binary file: `skipped_reason: 'binary_file'`
- Oversized file: `skipped_reason: 'file_too_large'`

**Acceptance**:
- [ ] Unit tests cover valid JS/Python parsing
- [ ] Unit tests cover syntax error detection
- [ ] Unit tests cover binary detection (null bytes)
- [ ] Unit tests cover 5MB size limit
- [ ] Unit tests cover unknown extension skipping
- [ ] Unit tests cover feature flag disabled path
- [ ] Performance: 500-line file < 50ms, 2000-line file < 200ms, heap < 20MB

---

### 1.4: Gate integration & prompt tests (depends: 1.3)

**Deliverables**:
- Update `src/agents/architect.ts` Rule 7 and Phase 5 sequence
- Create `tests/unit/agents/architect-gates.test.ts`

**Architect Prompt Changes**:

1. **Rule 7 (MANDATORY QA GATE)** - Update sequence:
   ```
   coder → diff → syntax_check → imports → lint fix → lint check → secretscan → reviewer → security reviewer → test_engineer/test_runner
   ```

2. **Phase 5 Execute** - Insert new step:
   - **5c.5**: Run `syntax_check` on changed files. 
     - `SYNTACTIC ERRORS` → return to coder with error details
     - `NO ERRORS` → proceed to imports check

3. **Add to SECURITY_KEYWORDS**: `syntax_check` (for security review trigger)

**Test Implementation**:
- Test that syntax errors trigger coder retry
- Test that clean syntax proceeds to next gate
- Test that disabled flag skips the gate

**Acceptance**:
- [ ] Prompt tests assert `syntax_check` runs after `diff`
- [ ] Prompt tests assert errors return to coder
- [ ] Prompt tests assert success proceeds to `imports`

---

## Dependencies

- Stage 0 parser/grammar decision and `src/lang` scaffolding ✅
- Stage 0 flag configuration under `config.gates.syntax_check.enabled` ✅
- Evidence schema stub for `syntax` entries (`src/config/evidence-schema.ts`) ✅
- **Rollback path**: Set `config.gates.syntax_check.enabled: false` in `.opencode/swarm.json`

## Validation

- Run `bun test tests/unit/lang/` for registry tests
- Run `bun test tests/unit/tools/syntax-check.test.ts` for tool tests  
- Run `bun test tests/unit/agents/architect-gates.test.ts` for gate tests
- Run `bun run scripts/tree-sitter-benchmark.ts` and verify performance budgets

## Follow-ups

- **Stage 2** (`placeholder_scan`) will reuse:
  - `src/lang/registry.ts` for language detection
  - `src/lang/runtime.ts` for parser loading
  - Comment node metadata from registry for TODO/FIXME detection
