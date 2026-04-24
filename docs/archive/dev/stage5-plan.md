# Stage 5 Implementation Plan: build_check Gate

**Status**: APPROVED BY CRITIC - Implementation Ready  
**Depends on**: Stage 4 (COMPLETE)  
**Swarm**: mega

## Overview

Stage 5 implements the `build_check` gate to run repo-native build and typecheck commands. This gate ensures code compiles/passes type checking before review, with graceful handling for missing toolchains.

## Stage 5 Tasks

### Task 5.1: Build Command Discovery
**Complexity**: MEDIUM  
**Owner**: architect → coder

**Requirements**:
- Create `src/build/discovery.ts` to detect build commands per ecosystem
- Detection order (stop at first match):
  1. Repo-defined scripts (package.json scripts: `build`, `typecheck`, `check`)
  2. Standard build files (Cargo.toml, go.mod, *.sln/*.csproj, pom.xml, build.gradle, Package.swift, pubspec.yaml, etc.)
  3. Only run if toolchain exists on PATH (best-effort mode)

- Ecosystem detection mapping:

| Ecosystem | Build Files | Commands to Try | Toolchain Check |
|-----------|-------------|-----------------|-----------------|
| Node.js | package.json | `npm run build`, `npm run typecheck`, `npm run check` | `npm` or `yarn` or `pnpm` |
| Rust | Cargo.toml | `cargo build`, `cargo check` | `cargo` |
| Go | go.mod | `go build ./...` | `go` |
| Python | pyproject.toml, setup.py | `python -m py_compile`, `mypy` (if available) | `python` or `python3` |
| Java | pom.xml | `mvn compile` | `mvn` |
| Java | build.gradle | `./gradlew build` or `gradle build` | `gradle` or `gradlew` |
| .NET | *.csproj, *.sln | `dotnet build` | `dotnet` |
| Swift | Package.swift | `swift build` | `swift` |
| Dart | pubspec.yaml | `dart analyze`, `flutter build` | `dart` or `flutter` |
| C/C++ | Makefile, CMakeLists.txt | `make`, `cmake --build` | `make` or `cmake` |

- Discovery result:
```typescript
interface BuildCommand {
  ecosystem: string;
  command: string;
  cwd: string;
  priority: number;  // Lower = higher priority
}

interface BuildDiscoveryResult {
  commands: BuildCommand[];
  skipped: { ecosystem: string; reason: string }[];
}
```

**Acceptance Criteria**:
- [x] Detects build commands for 10+ ecosystems
- [x] Only suggests commands when toolchain is on PATH
- [x] Returns clear skip reasons for missing toolchains
- [x] 38+ unit tests

**Status**: ✅ **COMPLETE** - QA Gate passed (38 tests, lint clean)

**Files**:
- `src/build/discovery.ts` - Build command discovery
- `tests/unit/build/discovery.test.ts` - Discovery tests

---

### Task 5.2: Implement build_check Tool
**Complexity**: MEDIUM  
**Owner**: coder

**Requirements**:
- Implement `buildCheck()` tool in `src/tools/build-check.ts`
- Tool Contract:
  - **Input**: `{ scope: "changed" | "all", changed_files?: string[], mode?: "build" | "typecheck" | "both" }`
  - **Output**: `{ verdict: "pass" | "fail" | "skip", runs: [{ kind, command, cwd, exit_code, duration_ms, stdout_tail, stderr_tail }], summary }`

- Behavior:
  - Discover applicable build commands
  - Execute commands with timeout (5 minutes default)
  - Capture stdout/stderr (truncated to last 100 lines)
  - Track duration
  - verdict: 'pass' if all commands succeed, 'fail' if any fail, 'skip' if no toolchains found

- Truncation:
  - `stdout_tail`: Last 100 lines or 10KB (whichever is smaller)
  - `stderr_tail`: Last 100 lines or 10KB (whichever is smaller)

**Acceptance Criteria**:
- [x] Runs discovered build commands
- [x] Captures exit codes and output
- [x] Truncates output correctly (100 lines / 10KB)
- [x] Handles timeouts gracefully (5 min)
- [x] Returns structured results
- [x] 45+ unit tests
- [x] Reviewer approved

**Status**: ✅ **COMPLETE** - QA Gate passed (45 tests, lint clean)

**Files**:
- `src/tools/build-check.ts` - Main implementation
- `tests/unit/tools/build-check.test.ts` - Comprehensive tests
- `src/tools/index.ts` - Export buildCheck

---

### Task 5.3: Wire build_check into Phase 5 Gate Sequence
**Complexity**: SMALL  
**Owner**: architect → coder

**Requirements**:
- Update `src/agents/architect.ts` Phase 5 sequence:
  - Insert `build_check` after `sast_scan` and before `reviewer`
  - Add branching language: "BUILD FAILURES → return to coder. SKIPPED (no toolchain) → proceed. PASSED → proceed to reviewer"
- Add anti-bypass tests

**Acceptance Criteria**:
- [x] Prompt tests confirm build_check is mandatory (when toolchain exists)
- [x] Prompt tests confirm ordering: sast_scan → build_check → reviewer
- [x] Build failures block progression
- [x] Skipped (no toolchain) allows progression
- [x] Anti-bypass tests verify non-skippability
- [x] 53+ gate integration tests

**Status**: ✅ **COMPLETE** - QA Gate passed (53 tests, lint clean, reviewer approved)

**Files**:
- `src/agents/architect.ts` - Update Rule 7 / Phase 5
- `tests/unit/agents/architect-gates.test.ts` - Add build_check gate tests

---

### Task 5.4: Replace BuildEvidenceSchema Stub with Typed Schema
**Complexity**: SMALL  
**Owner**: coder

**Requirements**:
- Replace stub `BuildEvidenceSchema` (with `details` field) with typed schema:
```typescript
export const BuildEvidenceSchema = BaseEvidenceSchema.extend({
  type: z.literal('build'),
  runs: z.array(
    z.object({
      kind: z.enum(['build', 'typecheck', 'test']),
      command: z.string(),
      cwd: z.string(),
      exit_code: z.number().int(),
      duration_ms: z.number().int(),
      stdout_tail: z.string(),
      stderr_tail: z.string(),
    })
  ).default([]),
  files_scanned: z.number().int(),
  runs_count: z.number().int(),
  failed_count: z.number().int(),
  skipped_reason: z.string().optional(),
});
```

**Acceptance Criteria**:
- [x] Typed schema matches tool output contract
- [x] Schema validates correctly
- [x] No breaking changes to existing evidence types

**Status**: ✅ **COMPLETE** - QA Gate passed (typecheck clean)

**Files**:
- `src/config/evidence-schema.ts` - Update BuildEvidenceSchema

---

## Evidence Schema Target (v6.9)

Per Evidence Matrix in roadmap:

| Type | Core fields | Status |
|------|-------------|--------|
| `build` | `verdict`, `runs[] { command, exit_code, stdout_tail, stderr_tail }`, `skipped_reason?` | Stage 5 |

## Dependencies

```
Task 5.1 (discovery)     Task 5.4 (schema)
       ↓                      ↓
       └───────────┬───────────┘
                   ↓
            Task 5.2 (tool)
                   ↓
            Task 5.3 (gate)
```

## QA Gate Process

Each task follows the mandatory QA gate:
1. coder implements
2. diff analysis
3. imports audit
4. lint fix → lint check
5. secretscan
6. reviewer (general)
7. test_engineer (verification tests)
8. coverage check

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Long-running builds | Medium | Medium | 5-minute timeout per command |
| Large output capture | Medium | Medium | Truncate to last 100 lines/10KB |
| Missing toolchains | High | Low | Graceful skip with reason |
| Build environment differences | Medium | Medium | Use repo-native commands only |

## Definition of Done

- [x] All 4 tasks complete with QA approval
- [x] 136+ tests passing (38 discovery + 45 tool + 53 gate = 136)
- [x] Gate integration tests verify non-bypassability (53 tests)
- [x] Evidence schema properly typed
- [x] All lint checks pass

**STATUS**: ✅ **STAGE 5 COMPLETE**
