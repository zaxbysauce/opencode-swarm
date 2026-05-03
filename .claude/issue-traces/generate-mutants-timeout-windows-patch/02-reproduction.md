# Reproduction

## Bug 1 — generate_mutants hangs when called in parallel

### Mechanism
`generateMutants()` in `src/mutation/generator.ts` lines 82–123 performs two awaited network calls with no timeout:

```typescript
// line 82 — no timeout
const createResult = await client.session.create({ query: { directory } });
// line 115 — no timeout
const promptResult = await client.session.prompt({ path: { id }, body: { ... } });
```

The OpenCode plugin host applies a global wall-clock limit to tool calls. When `generate_mutants` runs in parallel with two other long-running tools, the host exhausts that limit and aborts the call ("Tool execution aborted"). The function never returns, which is why the `catch` block never fires.

### Confirmation
Code inspection of `src/mutation/generator.ts` confirms zero use of `withTimeout` or any AbortController/deadline. The `src/utils/timeout.ts` utility already exists for exactly this purpose and is used in `src/index.ts` for other bounded operations.

### Test run (baseline — no timeout test exists)
```
bun test src/mutation/__tests__/generator.test.ts
31 pass, 0 fail
```
No test exercises the timeout path — confirming the regression test gap.

---

## Bug 2 — mutation_test patch application fails on Windows (CRLF mismatch)

### Mechanism
`executeMutation()` in `src/mutation/engine.ts` line 104:

```typescript
const applyResult = spawnSync('git', ['apply', '--', patchFile], {
    cwd: workingDir,
    timeout: GIT_APPLY_TIMEOUT_MS,
    stdio: 'pipe',
});
```

LLM-generated patches carry LF (`\n`) line endings in context lines (the prompt instructs the LLM to produce unified diff format). On Windows with the default `core.autocrlf=true`, checked-out source files have CRLF (`\r\n`). Git's `apply` command matches context lines byte-for-byte: a context line `"-old\n"` in the patch will not match the CRLF line `"-old\r\n"` in the working tree. Result: `git apply` exits non-zero, every mutation returns `outcome: 'error'`, and kill rate = 0.

The same issue can occur on macOS/Linux if a repository has `core.eol=crlf` or mixed line endings committed.

### Confirmation
`grep` on `engine.ts` shows no `--ignore-whitespace` flag anywhere on either `git apply` invocation (apply at line 104, revert at line 172).

### Test run (baseline)
```
bun test src/mutation/__tests__/engine.test.ts
Pass: all computeReport tests pass
```
`executeMutation` is not exercised in unit tests (requires live git); no Windows-CRLF path is tested.
