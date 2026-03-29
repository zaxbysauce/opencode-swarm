# Testing Guide

> **For LLM agents:** Load the `writing-tests` skill (`.opencode/skills/writing-tests/SKILL.md`) before writing or modifying any test file. It contains the full mock isolation rules, CI pipeline structure, and anti-patterns.

## Quick Reference

### Framework

All tests use `bun:test`. No Jest, Vitest, or other frameworks.

```typescript
import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
```

### Running Tests

```bash
# Single file (always safe)
bun --smol test tests/unit/tools/diff.test.ts --timeout 30000

# Per-file loop (required for tools, services, agents — prevents mock poisoning)
for f in tests/unit/tools/*.test.ts; do bun --smol test "$f" --timeout 30000; done

# Batch run (safe only for directories without mock conflicts)
bun --smol test tests/unit/hooks --timeout 120000
bun --smol test tests/unit/cli --timeout 120000
```

**Do not run `bun --smol test tests/unit/tools` as a single batch.** Mock modules leak across files in Bun's `--smol` mode, causing false failures. The CI uses per-file isolation loops for steps 4-6 (tools, services, state/agents).

### Mock Isolation

Bun's `--smol` mode shares module cache between test files. A `mock.module()` call replaces the module globally for all files in the same process.

**Always spread the real module when mocking:**

```typescript
import * as realChildProcess from 'node:child_process';
const mockExecFileSync = mock(() => '');
mock.module('node:child_process', () => ({
  ...realChildProcess,           // preserve all exports
  execFileSync: mockExecFileSync, // override only what you need
}));
```

**Use lazy binding in source code** so mocks can intercept:

```typescript
// Good — mockable
import * as child_process from 'node:child_process';
function run() { return child_process.execFileSync('git', ['status']); }

// Bad — binds at load time, mock can't intercept
import { execFileSync } from 'node:child_process';
```

### CI Pipeline Steps

| Step | Directories | Isolation |
|------|-------------|-----------|
| 1 | hooks (Linux/macOS only) | Batch per-group |
| 2 | cli | Batch |
| 3 | commands, config | Batch |
| 4 | tools | Per-file loop |
| 5 | services, build, quality, sast, sbom, scripts | Per-file loop |
| 6 | adversarial, agents, background, context, diff, evidence, git, helpers, knowledge, lang, output, parallel, plan, session, skills, types, utils | Per-file loop |

### Cross-Platform

- Use `path.join()`, never string concatenation with `/`
- Use `os.tmpdir()`, never hardcoded `/tmp`
- Mock `validateDirectory` from `path-security.ts` when tests use Windows temp paths

### Full Details

See `.opencode/skills/writing-tests/SKILL.md` for the complete guide including:
- All mock isolation rules and patterns
- File placement conventions
- Test quality standards (DO and DO NOT)
- Cross-platform process spawning rules
- Pre-submission checklist
