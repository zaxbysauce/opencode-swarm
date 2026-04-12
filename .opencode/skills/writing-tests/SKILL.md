---
name: writing-tests
description: >
  Guidelines for writing, organizing, and maintaining tests in the opencode-swarm repository.
  Covers framework rules (bun:test), mock isolation, CI pipeline structure, file placement,
  and anti-patterns that break cross-platform CI. Load this skill before writing or modifying
  any test file.
---

# Writing Tests for opencode-swarm

## Framework: bun:test Only

All test files MUST import from `bun:test`:

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
```

Bun provides a vitest compatibility layer (`vi.mock`, `vi.fn`, `vi.spyOn`) that works on Linux and macOS. However, `vi.mock()` has critical isolation bugs in Bun when multiple test directories run in the same process. Prefer `bun:test` native APIs:

| vitest API | bun:test equivalent | Notes |
|-----------|-------------------|-------|
| `vi.fn()` | `mock(() => ...)` | Import `mock` from `bun:test` |
| `vi.spyOn(obj, method)` | `spyOn(obj, method)` | Import `spyOn` from `bun:test` |
| `vi.mock('module', factory)` | `mock.module('module', factory)` | Import `mock` from `bun:test` |
| `vi.restoreAllMocks()` | `mock.restore()` | Call in `afterEach` |

## Mock Isolation Rules

**CRITICAL: Module-level mocks leak across test files within the same Bun process.**

Bun's `--smol` mode shares the module cache between test files in the same worker process. A `mock.module()` call in file A replaces the module globally — file B gets the mock instead of the real module. This caused ~959 failures before per-file isolation was added (#330).

### Rules

1. **Spread the real module when mocking.** Only override the specific export you need:
```typescript
import * as realChildProcess from 'node:child_process';
const mockExecFileSync = mock(() => '');
mock.module('node:child_process', () => ({
  ...realChildProcess,          // preserve all other exports
  execFileSync: mockExecFileSync, // override only what you test
}));
```
This prevents tests from accidentally nullifying exports that other code depends on.

2. **Use lazy binding in source code.** Import the namespace, call methods at invocation time:
```typescript
// GOOD — mockable via mock.module
import * as child_process from 'node:child_process';
function run() { return child_process.execFileSync('git', ['status']); }

// BAD — binds at module load, mock.module can't intercept
import { execFileSync } from 'node:child_process';
```

3. **Never create circular mock imports.** This pattern deadlocks Bun:
```typescript
// BROKEN — imports from the module it's about to mock
import { realFn } from '../../src/module.js';
vi.mock('../../src/module.js', () => ({
  realFn: (...args) => realFn(...args),  // circular!
  otherFn: vi.fn(),
}));
```
Instead, inline the function logic or extract the real functions into a separate utility module.

4. **Prefer constructor/parameter injection over module mocking.** The swarm's hook factories (`createScopeGuardHook`, `createDelegationLedgerHook`, etc.) accept injected dependencies — test them by passing mock callbacks, not by replacing modules.

5. **Mock `validateDirectory` when testing with Windows temp paths.** The `path-security.ts` validator rejects Windows absolute paths (`C:\...`). If your test uses `os.tmpdir()` and passes that path to a function that calls `validateDirectory`, mock it:
```typescript
mock.module('../../../src/utils/path-security', () => ({
  validateDirectory: () => {},
  validateSwarmPath: (p: string) => p,
}));
```

## CI Pipeline Structure

The CI runs on three platforms (ubuntu, macos, windows). Tests are split into sequential steps within each platform's job.

```
Step 1: hooks (Linux/macOS only, skipped on Windows) — batch per-group
Step 2: cli — batch
Step 3: commands + config — batch
Step 4: tools — per-file isolation loop
Step 5: services + build + quality + sast + sbom + scripts — per-file isolation loop
Step 6: state + agents + knowledge + evidence + plan + misc — per-file isolation loop
```

**Steps 4-6 use per-file isolation:** each `.test.ts` file runs in its own `bun --smol` process to prevent `mock.module()` cache poisoning (#330). Steps 1-3 run files in batch (one process per step) because they have fewer mock conflicts.

When writing a test, know which step your file will run in. In batch steps, do not assume isolation from other files in the same step.

**Job timeout: 15 minutes.** A single hanging test will kill the entire platform's test run.

## File Placement

### Convention

| Test type | Location | When to use |
|-----------|----------|-------------|
| Unit tests for `src/hooks/*.ts` | `tests/unit/hooks/` | Testing hook factories and hook behavior |
| Unit tests for `src/tools/*.ts` | `tests/unit/tools/` | Testing tool execute functions |
| Unit tests for `src/commands/*.ts` | `tests/unit/commands/` | Testing CLI command handlers |
| Unit tests for `src/config/*.ts` | `tests/unit/config/` | Testing schema validation, config loading |
| Unit tests for `src/agents/*.ts` | `tests/unit/agents/` | Testing agent prompt generation, factory logic |
| Colocated tests | `src/**/*.test.ts` | Integration-style tests tightly coupled to the source module |
| Integration tests | `tests/integration/` | Cross-module workflows, plugin initialization |
| Security tests | `tests/security/` | Adversarial input handling, injection resistance |
| Smoke tests | `tests/smoke/` | Built package validation |

### Naming

- Base test: `<module>.test.ts`
- Adversarial variant: `<module>.adversarial.test.ts`

Only create an adversarial variant if it tests **distinct attack vectors** not covered by the base test. Do not duplicate base test assertions with different inputs — that's redundancy, not security coverage.

### Regression tests (review-surfaced bugs)

When fixing a bug surfaced by code review, swarm review, or post-merge audit, **always add a regression test** with the following shape so the test's purpose survives future cleanup:

```typescript
describe('<feature> — regression: <one-line description> (F#)', () => {
  it('<exact behavior the bug violated>', () => {
    // Previous code did <bad thing>: e.g. the regex `/^\.\/+/` only stripped
    // a single leading `./`, so `././util.ts` survived as `./util.ts`.
    expect(normalizeGraphPath('././util.ts')).toBe('util.ts');
  });
});
```

Rules:
- The describe label includes the original finding ID (e.g. `F8`, `F9`, `F1.1`) so future readers can map back to the review.
- The leading comment in the body explains the **prior buggy behavior** in concrete terms — what the code did before, not what it does now.
- One regression test per finding. Do not pile unrelated assertions into a single regression block.

Examples in-tree: `tests/unit/graph/graph-query.test.ts`, `tests/unit/graph/import-extractor.test.ts`, `tests/unit/graph/graph-store.test.ts`.

## Cross-Entry Invariants (config maps)

When you modify any entry of a "map of agents/tools/roles" in `src/config/constants.ts` (`AGENT_TOOL_MAP`, `DEFAULT_MODELS`, `QA_AGENTS`, `PIPELINE_AGENTS`, etc.), there are tests that assert **parity across sibling entries**, not just shape of one entry.

Known parity assertions:

| Test | Invariant |
|---|---|
| `tests/unit/config/critic-registration.test.ts:67` | `AGENT_TOOL_MAP.critic_sounding_board.length === AGENT_TOOL_MAP.critic.length` |
| `tests/unit/config/agent-tool-map.test.ts:26` | `AGENT_TOOL_MAP.architect.length` is strictly greater than every other agent's |
| `tests/unit/config/agent-tool-map.test.ts:34` | every subagent's tool list `<= 20` entries |
| `tests/unit/config/constants.test.ts:48` | `ALL_SUBAGENT_NAMES.length === 13` |
| `tests/unit/config/constants.test.ts:137` | `Object.keys(DEFAULT_MODELS).length === 14` |

Workflow when adding a tool to a single agent:
1. Add the entry.
2. Run `bun --smol test tests/unit/config --timeout 60000` **before pushing**.
3. If a parity test fails, decide: mirror the change to sibling agents, or update the invariant test if the design intent has actually changed.
4. To inspect runtime shape quickly: `bun -e "import { AGENT_TOOL_MAP } from './src/config/constants.ts'; for (const [k,v] of Object.entries(AGENT_TOOL_MAP)) console.log(k, v.length);"`

## Debugging CI failures

When CI reports a `unit (ubuntu|macos|windows)` failure:

1. **Identify the actual failing test from the job log first.** Do not assume it's a pre-existing failure based on a local repro of a different test. Open the failing job's URL and find the `<file>:<line>` in the Bun output. WebFetch can scrape this if the `gh` CLI isn't available.
2. **Reproduce that exact file locally:** `bun --smol test tests/unit/<dir>/<file>.test.ts --timeout 30000`.
3. **Then check if the same failure reproduces on `main`.** If yes, document as pre-existing in the PR description and continue with your branch's work; do not silently inherit the failure.
4. **For dist-check failures:** any change under `src/` that the bundler picks up requires `bun run build` + commit of `dist/` in the same PR. The job compares committed `dist/` against a fresh build.

## Test Quality Standards

### DO

- Test real behavior: call the actual function with real inputs, assert on real outputs.
- Test error paths: what happens with `null`, `undefined`, empty string, oversized input?
- Use temp directories (`fs.mkdtemp`) for file I/O tests. Clean up in `afterEach`.
- Assert on specific values, not just truthiness: `expect(result.status).toBe('pending')` not `expect(result).toBeTruthy()`.

### DO NOT

- **Do not test type definitions.** `expect(event.type === 'foo').toBe(true)` tests TypeScript, not your code.
- **Do not test framework behavior.** "Zod schema parses valid input" tests Zod, not your schema.
- **Do not test test utilities.** If it only exists to support other tests, it doesn't need its own test.
- **Do not mock everything.** If every dependency is mocked, you're testing the mock setup. Prefer real dependencies for pure functions and only mock I/O boundaries (filesystem, network, timers).
- **Do not hardcode version numbers.** Version bumps are automated — a test asserting `version === '6.31.3'` breaks on every release.
- **Do not use `sleep` or `setTimeout` for synchronization.** Use explicit signals, resolved promises, or `Bun.sleep()` with tight bounds.
- **Do not spawn `cat /dev/zero`, `yes`, or other infinite-output commands.** Use `sleep 30` for "blocking command" tests.

## Cross-Platform Requirements

All tests must pass on Linux, macOS, and Windows unless explicitly gated with:
```typescript
const isWindows = process.platform === 'win32';
if (isWindows) test.skip('reason', () => {});
```

### Path handling
- Use `path.join()` or `path.resolve()`, never string concatenation with `/`.
- Temp directories: use `os.tmpdir()`, not hardcoded `/tmp`.
- File comparisons: normalize paths before comparing (`path.resolve(a) === path.resolve(b)`).

### Process spawning
- Use `.cmd` extension on Windows for npm/bun binaries: `process.platform === 'win32' ? 'bun.cmd' : 'bun'`.
- Use array-form `spawn`/`spawnSync`, never shell string commands.

## Running Tests

```bash
# Single file
bun test tests/unit/hooks/scope-guard.test.ts

# Batch directory (safe for dirs without mock conflicts)
bun --smol test tests/unit/hooks --timeout 30000

# Per-file loop (required for tools/services/agents — prevents mock poisoning)
for f in tests/unit/tools/*.test.ts; do bun --smol test "$f" --timeout 30000; done

# CI-equivalent run for batch steps
bun --smol test tests/unit/cli --timeout 120000
bun --smol test tests/unit/commands tests/unit/config --timeout 120000
```

**Warning:** Running `bun --smol test tests/unit/tools` as a single batch will cause mock poisoning failures. Always use the per-file loop for directories in CI steps 4-6 (tools, services, agents, etc.).

The `--smol` flag reduces Bun's memory footprint. Use it when running large directories (50+ files).

The `--timeout 120000` flag sets per-test timeout to 120 seconds. Individual tests should complete in under 5 seconds. If a test needs more than 10 seconds, it's doing too much — split it or mock the slow dependency.

## Before Submitting

1. Run the tests for your changed files: `bun test path/to/your.test.ts`
2. Run the full CI group your tests belong to (see pipeline structure above)
3. Verify no `process.cwd()` usage — use the `directory` parameter from `createSwarmTool` or hook constructor
4. Verify no hardcoded paths (`/tmp/...`, `C:\...`) — use `os.tmpdir()` + `path.join()`
5. Verify mocks are restored in `afterEach` if using `spyOn` or `mock.module`