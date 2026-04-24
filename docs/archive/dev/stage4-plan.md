# Stage 4 Implementation Plan: sbom_generate Evidence

**Status**: APPROVED BY CRITIC - Implementation Ready  
**Depends on**: Stage 3 (COMPLETE)  
**Swarm**: mega

## Overview

Stage 4 implements the `sbom_generate` tool to create CycloneDX Software Bill of Materials (SBOM) from dependency manifests and lock files. This is evidence-generation only (not a blocking gate), used for baseline snapshots and post-implementation comparisons.

## Stage 4 Tasks

### Task 4.1: Manifest/Lock File Detectors
**Complexity**: MEDIUM  
**Owner**: coder

**Requirements**:
- Create `src/sbom/detectors/` directory structure
- Implement detectors for the following formats:

| Ecosystem | Manifest/Lock Files | Parser Strategy |
|-----------|---------------------|-----------------|
| Node.js | package.json, package-lock.json, pnpm-lock.yaml, yarn.lock | JSON/YAML parsing |
| Python | requirements.txt, poetry.lock, pipfile.lock | Text parsing, TOML |
| Rust | Cargo.toml, Cargo.lock | TOML parsing |
| Go | go.mod, go.sum | Text parsing |
| Java | pom.xml, gradle.lockfile | XML parsing (best-effort) |
| .NET | packages.lock.json, paket.lock | JSON parsing |
| Swift | Package.resolved | JSON parsing |
| Dart/Flutter | pubspec.yaml, pubspec.lock | YAML parsing |

- Each detector returns standardized component format:
```typescript
interface SbomComponent {
  name: string;
  version: string;
  type: 'library' | 'framework' | 'application';
  purl?: string;  // Package URL (optional)
  license?: string;  // Best effort
}
```

**Acceptance Criteria**:
- [x] Detectors for all 8 ecosystems
- [x] Each extracts name + version deterministically
- [x] Graceful handling of malformed/unsupported files
- [x] 57+ unit tests for detectors

**Status**: ✅ **COMPLETE** - QA Gate passed (57 tests, lint clean)

**Files**:
- `src/sbom/detectors/index.ts` - Detector registry
- `src/sbom/detectors/nodejs.ts` - Node.js detector
- `src/sbom/detectors/python.ts` - Python detector
- `src/sbom/detectors/rust.ts` - Rust detector
- `src/sbom/detectors/go.ts` - Go detector
- `src/sbom/detectors/java.ts` - Java detector
- `src/sbom/detectors/dotnet.ts` - .NET detector
- `src/sbom/detectors/swift.ts` - Swift detector
- `src/sbom/detectors/dart.ts` - Dart detector
- `tests/unit/sbom/detectors.test.ts` - Detector tests

---

### Task 4.2: CycloneDX JSON Emitter
**Complexity**: SMALL  
**Owner**: coder

**Requirements**:
- Implement `src/sbom/cyclonedx.ts` to emit CycloneDX BOM format
- Minimal compliant structure:
```json
{
  "bomFormat": "CycloneDX",
  "specVersion": "1.5",
  "version": 1,
  "metadata": {
    "timestamp": "2026-02-25T12:00:00Z",
    "tools": [{"vendor": "opencode-swarm", "name": "sbom_generate", "version": "6.9.0"}]
  },
  "components": [
    {"type": "library", "name": "lodash", "version": "4.17.21", "purl": "pkg:npm/lodash@4.17.21"}
  ]
}
```
- Generate valid Package URLs (PURL) where possible:
  - npm: `pkg:npm/<name>@<version>`
  - pypi: `pkg:pypi/<name>@<version>`
  - cargo: `pkg:cargo/<name>@<version>`
  - golang: `pkg:golang/<module>@<version>`
  - maven: `pkg:maven/<group>/<artifact>@<version>`
  - nuget: `pkg:nuget/<name>@<version>`
  - swift: `pkg:swift/<org>/<name>@<version>`
  - pub: `pkg:pub/<name>@<version>`

**Acceptance Criteria**:
- [x] Valid CycloneDX JSON output
- [x] PURL generation for supported ecosystems
- [x] Output validates against CycloneDX 1.5 schema (minimal)
- [x] 26 unit tests

**Status**: ✅ **COMPLETE** - QA Gate passed (26 tests, lint clean)

**Files**:
- `src/sbom/cyclonedx.ts` - CycloneDX emitter
- `tests/unit/sbom/cyclonedx.test.ts` - Emitter tests

---

### Task 4.3: Implement sbom_generate Tool
**Complexity**: MEDIUM  
**Owner**: coder

**Requirements**:
- Implement `sbomGenerate()` tool in `src/tools/sbom-generate.ts`
- Tool Contract:
  - **Input**: `{ scope: "changed" | "all", output_dir?: string }`
  - **Output**: `{ verdict: "pass" | "skip", files: string[], components_count: number, output_path: string }`
- Discovery strategy:
  1. Scan for manifest/lock files in project
  2. Use detectors to extract components
  3. Generate CycloneDX BOM
  4. Save to `.swarm/evidence/sbom/` (default) or `output_dir`
- Scope modes:
  - `"changed"`: Only scan directories with changed files (from diff)
  - `"all"`: Scan entire project

**Acceptance Criteria**:
- [x] Detects manifests in project
- [x] Generates valid CycloneDX output
- [x] Saves to correct evidence directory
- [x] Handles missing manifests gracefully (verdict='skip')
- [x] 25+ unit tests
- [x] Reviewer approved

**Status**: ✅ **COMPLETE** - QA Gate passed (25 tests, lint clean)

**Files**:
- `src/tools/sbom-generate.ts` - Main implementation
- `tests/unit/tools/sbom-generate.test.ts` - Comprehensive tests
- `src/tools/index.ts` - Export sbomGenerate

---

### Task 4.4: Wire sbom_generate into Phase Workflow
**Complexity**: SMALL  
**Owner**: architect → coder

**Requirements**:
- Add `sbom_generate` call in:
  - Phase 0 (baseline) - full project scan
  - Phase 6 (post-implementation) - changed files scan
- Update `src/agents/architect.ts` to run sbom_generate at these points
- NOT a blocking gate - always proceeds (evidence only)
- Add tool to Available Tools list

**Acceptance Criteria**:
- [x] sbom_generate runs during Phase 0 baseline
- [x] sbom_generate runs during Phase 6 post-implementation
- [x] Evidence saved to `.swarm/evidence/sbom/`
- [x] Non-blocking (always proceeds)
- [x] Tool added to Available Tools

**Status**: ✅ **COMPLETE** - QA Gate passed (lint clean)

**Files**:
- `src/agents/architect.ts` - Add sbom_generate calls

---

### Task 4.5: Replace SbomEvidenceSchema Stub with Typed Schema
**Complexity**: SMALL  
**Owner**: coder

**Requirements**:
- Replace stub `SbomEvidenceSchema` (with `details` field) with typed schema:
```typescript
export const SbomEvidenceSchema = BaseEvidenceSchema.extend({
  type: z.literal('sbom'),
  components: z.array(
    z.object({
      name: z.string(),
      version: z.string(),
      type: z.enum(['library', 'framework', 'application']),
      purl: z.string().optional(),
      license: z.string().optional(),
    })
  ).default([]),
  metadata: z.object({
    timestamp: z.string().datetime(),
    tool: z.string(),
    tool_version: z.string(),
  }),
  files: z.array(z.string()),  // Manifest files used
  components_count: z.number().int(),
  output_path: z.string(),  // Path to generated SBOM
});
```

**Acceptance Criteria**:
- [x] Typed schema matches tool output contract
- [x] Schema validates correctly
- [x] No breaking changes to existing evidence types

**Status**: ✅ **COMPLETE** - QA Gate passed (typecheck clean)

**Files**:
- `src/config/evidence-schema.ts` - Update SbomEvidenceSchema

---

## Evidence Schema Target (v6.9)

Per Evidence Matrix in roadmap:

| Type | Core fields | Status |
|------|-------------|--------|
| `sbom` | `verdict`, `components[] { name, version, type }`, `metadata` | Stage 4 |

## Dependencies

```
Task 4.1 (detectors)     Task 4.5 (schema)
       ↓                       ↓
       └───────────┬───────────┘
                   ↓
            Task 4.2 (cyclonedx)
                   ↓
            Task 4.3 (tool)
                   ↓
            Task 4.4 (workflow)
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
| Malformed manifest parsing | Medium | Low | Graceful error handling, best-effort parsing |
| CycloneDX version drift | Low | Low | Use stable 1.5 spec, minimal fields only |
| Missing lock files | High | Low | Fall back to manifests, document limitations |
| Large SBOM generation | Low | Medium | Stream large files, respect size limits |

## Definition of Done

- [x] All 5 tasks complete with QA approval
- [x] 108+ tests passing (57 detector + 26 cyclonedx + 25 tool = 108)
- [x] Valid CycloneDX output verified
- [x] Evidence schema properly typed
- [x] Workflow integration complete
- [x] All lint checks pass

**STATUS**: ✅ **STAGE 4 COMPLETE**
