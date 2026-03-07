# Comprehensive Codebase Review & Remediation Plan

## Prelude — Architect Instructions

This prompt initiates a full codebase audit and remediation plan. You are not building features. You are finding and fixing problems in existing shipped code.

**Before delegating any work:** Read the existing `.swarm/context.md` and `.swarm/knowledge.jsonl` (if they exist) for prior findings, lessons, and known issues. Do not duplicate work already captured. Build on it.

---

## Step 0: Full Codebase Ingest (EXPLORER)

Delegate the Explorer to read every file in the project directory. Not a sample. Not a summary. Every source file, configuration file, test file, build file, CI/CD file, documentation file, and dotfile. The Explorer must build a complete inventory before any analysis begins.

The Explorer writes `.swarm/codebase-inventory.md` with:

```markdown
# Codebase Inventory

## Tech Stack
- Language(s) and version(s)
- Framework(s) and version(s)
- Build system / bundler
- Test framework(s)
- Package manager and lockfile format
- Runtime environment(s) (Node, Bun, Deno, browser, etc.)

## File Inventory
- Total source files (by language)
- Total test files
- Total config/build files
- Total documentation files

## Architecture Overview
- Entry point(s)
- Module/directory structure (what each top-level directory owns)
- Dependency graph (which modules import which)
- Plugin/hook/extension points (if any)
- State management approach
- External service integrations

## Patterns Observed
- Coding conventions (naming, file organization, export style)
- Error handling patterns
- Logging/observability patterns
- Configuration loading patterns
- Test patterns (unit, integration, e2e)
```

**Gate:** Do not proceed to Step 1 until the inventory is complete and the Architect has read it.

---

## Step 1: Deep Analysis (EXPLORER + SME)

Using the inventory as a map, the Architect delegates targeted deep reads for each category below. For large codebases, parallelize by delegating multiple Explorers to different directory subtrees.

Every finding must reference a **specific file path and line number**. Do not report vague observations. If you cannot point to a line, it is not a finding.

### Category 1: Broken, Missing, or Incomplete Code

Code that does not work as intended or is not finished.

**Look for:**
- Functions that throw `NotImplementedError`, return hardcoded stubs, or have empty bodies
- `TODO`, `FIXME`, `HACK`, `XXX`, `PLACEHOLDER`, `STUB`, `SCAFFOLD`, `PLUMBING` comments — for each one, determine if the work was completed and the comment is stale, or if the work is genuinely incomplete
- Commented-out code blocks longer than 5 lines (suggests abandoned or deferred work)
- Interfaces, types, or classes declared but never instantiated or imported anywhere
- Feature flags or conditional branches that always resolve to one side
- Error handling that swallows exceptions silently (empty `catch`, catch-and-log-only where recovery is needed)
- Switch/match statements missing cases that the type system expects
- API routes or CLI commands declared but not wired to handlers
- Test files that exist but contain zero assertions, skip all tests, or test nothing meaningful
- Functions that accept parameters the caller never provides (indicates broken contract — e.g., `fn(args, context?)` where no caller passes `context`)

### Category 2: Security & Data Handling

Vulnerabilities, unsafe patterns, and data handling issues.

**Look for:**
- Hardcoded secrets, API keys, tokens, or credentials (including in comments, config files, `.env.example`)
- Missing input validation at system boundaries (CLI args, API inputs, file reads, environment variables)
- Path traversal vulnerabilities — user-controlled input used in file paths without sanitization
- Command injection — user input passed to shell commands or `child_process` without escaping
- Unsafe deserialization of untrusted input (JSON.parse without schema validation, `eval`, `new Function`)
- Missing authentication or authorization checks on sensitive operations
- Logging or error output that leaks sensitive data (stack traces with credentials, user PII in logs)
- Dependency vulnerabilities — outdated packages with known CVEs (check lockfile versions)
- Insufficient randomness (Math.random for security-sensitive operations)
- Missing CSRF, XSS, or injection protections in web-facing code
- File permissions or `.gitignore` gaps that could expose sensitive files

### Category 3: Cross-Platform & Environment Issues

Code that works on one platform but breaks on others, or that makes assumptions about the runtime environment.

**Look for:**
- Hardcoded path separators (`/` or `\\`) instead of `path.join()` / `path.resolve()`
- Shell commands using platform-specific syntax (`grep`, `wc -l`, `cp -r`, `&&` chains, `rm -rf`)
- `process.cwd()` used where a project root / working directory should be explicitly passed
- Case-sensitive file lookups that fail on case-insensitive filesystems (macOS, Windows)
- Line ending assumptions (`\n` vs `\r\n`) in file parsing or string comparison
- Environment variable assumptions (`HOME` vs `USERPROFILE`, `PATH` vs `Path`)
- File watching (`fs.watch`) without polling fallback for unreliable platforms (WSL, network drives)
- Hard dependency on Unix tools not available on Windows without WSL
- Assumed directory structures (`/tmp`, `/dev/null`, etc.)

### Category 4: Stale Comments & Documentation Drift

Comments, docstrings, and documentation that no longer match the code.

**Look for:**
- Comments that say "TODO" or "scaffold" or "stub" or "not yet implemented" on code that IS implemented — these misrepresent the state of the project to every developer and AI agent that reads them
- Docstrings that describe different behavior than the function actually performs
- README sections that reference features, APIs, or config options that have changed or been removed
- Changelog entries that claim functionality not actually present (or omit functionality that is)
- Configuration documentation that lists wrong defaults, wrong types, or wrong key names
- Architecture diagrams or module descriptions that no longer match the actual file structure
- Comments referencing ticket/issue numbers for work that was completed — the comment has no ongoing value
- Outdated examples in documentation that would fail if a user copied them verbatim

### Category 5: AI-Generated Code Smells

Patterns that indicate LLM-generated code was merged without adequate review. These are not inherently wrong but they bloat the codebase, obscure intent, and make maintenance harder.

**Look for:**
- Wrapper functions that add no logic — a function whose entire body is calling one other function with the same arguments
- Comments that restate the code (`// increment counter` above `counter++`)
- Docstrings on every function including trivial getters, setters, and one-liners where the name is self-documenting
- Excessive defensive coding that the type system already prevents (null checks on non-nullable types, try-catch around code that cannot throw in the given context)
- Copied patterns that don't fit the context (async where sync suffices, error handling where errors can't occur, generic type parameters that are always the same concrete type)
- Boilerplate that could be replaced by a single shared utility (the same 10-line pattern repeated across 8 files)
- Over-abstracted code: multiple layers of indirection (factory → builder → provider → adapter) for something that only has one implementation
- Generated code that contradicts established patterns elsewhere in the same codebase

### Category 6: Technical Debt & Architecture

Structural and architectural issues that increase the cost of future changes.

**Look for:**
- Circular dependencies between modules
- God objects or functions over 100 lines with multiple responsibilities
- Duplicated logic across files that should be extracted into a shared utility
- Inconsistent patterns — two modules solving the same problem differently
- Hardcoded values (URLs, thresholds, timeouts, credentials) that should be configuration
- Missing or broken tests — especially for critical paths (auth, data mutation, payment)
- Coupling between modules that should communicate through interfaces (direct file imports of internal implementation details)
- Missing error boundaries or retry logic in I/O operations (network, filesystem, database)
- Memory leaks: event listeners, intervals, Maps/Sets, or caches that grow without bounds and are never cleaned up
- State management where the lifecycle (init → use → cleanup) is not enforced — missing teardown, missing disposal, orphaned resources

### Category 7: Performance & Enhancement Opportunities

Improvements that make the codebase better without changing external behavior.

**Look for:**
- N+1 queries or repeated I/O in loops (database, filesystem, API calls)
- Synchronous I/O in hot paths or async contexts
- Missing caching where the same expensive computation runs repeatedly with the same inputs
- Type safety gaps (`any` types, missing generics, overly loose interfaces, unvalidated casts)
- Missing observability: no logging, no metrics, no tracing in critical paths (especially error paths)
- Input validation gaps at system boundaries (beyond security — also correctness: wrong types, out-of-range values)
- Language/framework features the code could leverage but doesn't (e.g., using manual loops where built-in methods exist, not using concurrent primitives where parallelism is safe)
- Bundle size or startup time optimizations (lazy imports, tree-shaking blockers, unnecessary dependencies)

---

## Step 2: Consult SMEs

Based on the tech stack identified in Step 0 and the findings from Step 1, delegate the SME agent to research domain-specific best practices. At minimum, consult:

1. **Primary language/framework** — idiomatic patterns, known pitfalls, ecosystem conventions
2. **Security** — for any code handling auth, network requests, file I/O, user input, or sensitive data
3. **Testing** — for the test framework in use, coverage expectations, and test architecture patterns
4. **Any domain specific to the project** — e.g., if it's a plugin system, research plugin API contracts; if it's a CLI tool, research CLI UX conventions

For each SME consultation, capture:
- What was asked
- What guidance was returned
- How it applies to specific findings from Step 1

Write all SME guidance to `.swarm/context.md`. This informs the plan and must be readable by future sessions.

---

## Step 3: Compile & Classify Findings

Organize every finding from Step 1 into a findings report. Each finding must include:

| Field | Description |
|---|---|
| **ID** | Sequential within category (e.g., `C1-01`, `C2-03`) |
| **Category** | 1–7 (from above) |
| **Severity** | `CRITICAL` — blocks production use or is a security vulnerability / `MAJOR` — causes bugs, data loss, or scaling issues / `MINOR` — quality improvement, tech debt reduction |
| **File:Line** | Exact file path and line number |
| **Problem** | What is wrong (factual, specific) |
| **Fix** | What to do about it (actionable, specific) |
| **Size** | `S` — 1 file touched / `M` — 2-5 files / `L` — 6+ files (should be split into subtasks) |

Write the full findings report to `.swarm/context.md` (append to existing content from Step 2).

**Counts summary** (include at the top of the findings section):
```
Category 1 (Broken/Incomplete):   X critical, Y major, Z minor
Category 2 (Security):            X critical, Y major, Z minor
Category 3 (Cross-Platform):      X critical, Y major, Z minor
Category 4 (Stale Comments):      X critical, Y major, Z minor
Category 5 (AI Slop):             X critical, Y major, Z minor
Category 6 (Tech Debt):           X critical, Y major, Z minor
Category 7 (Performance):         X critical, Y major, Z minor
```

---

## Step 4: Draft the Plan

Convert findings into an implementation plan. Write to `.swarm/plan.md`.

### Phasing rules:

- **Phase 1:** All CRITICAL findings. Security vulnerabilities. Anything that blocks correct operation.
- **Phase 2:** MAJOR findings that unblock other work or have cascading effects (e.g., fixing a shared utility that 10 other files depend on).
- **Phase 3:** Remaining MAJOR findings, refactoring targets, and cross-cutting concerns.
- **Phase 4:** MINOR findings, enhancement opportunities, and documentation cleanup.

### Task format:

Each task in the plan must include:
- Task ID and title
- Finding IDs it addresses (e.g., `Addresses: C1-01, C1-04, C6-12`)
- Agent assignment (CODER for implementation, REVIEWER for validation)
- Files involved (explicit list)
- What to change (specific enough that a coder agent can execute without ambiguity)
- Acceptance criteria (how to verify the fix is correct — testable, not subjective)
- Dependencies (which tasks must complete before this one can start)

### Grouping rules:

- Group related findings into a single task when they touch the same files or the same logical concern
- Do not create tasks larger than 6 files — split them with explicit subtask boundaries
- Every CODER task must be followed by a QA review task (code_auditor + test_engineer at minimum, add security_auditor for Category 2 findings)
- Mark tasks that can execute in parallel as `[PARALLELIZABLE]`

### Architect recommendations:

After the findings-based tasks, the Architect may append a **Recommendations** section with proposed enhancements, refactoring suggestions, or architectural improvements that go beyond the findings. These must:
- Be clearly labeled as recommendations (not required fixes)
- Include rationale (why this would improve the project)
- Include rough scope estimate
- Not be mixed into the findings-based phases — they go in Phase 5 or later

---

## Step 5: Critic Gate

Pass the complete plan to the Critic for review. The Critic evaluates:

1. **Accuracy** — Are findings real? Do the file paths and line numbers check out?
2. **Categorization** — Is each finding in the right category with the right severity?
3. **Completeness** — Did the review miss anything obvious? Are there patterns found in one file that likely exist in similar files?
4. **Phasing** — Are dependencies respected? Does Phase 1 truly contain only critical items?
5. **Actionability** — Can a coder agent execute each task from the description alone, or is it too vague?
6. **Size** — Are any tasks too large (>6 files) or too small (trivial one-line fixes grouped alone)?
7. **Coverage** — Do the acceptance criteria actually verify the fix? Could a broken fix pass them?

If the Critic returns `NEEDS_REVISION`, revise and resubmit. Maximum 2 revision cycles. If still not approved after 2 revisions, note the unresolved Critic concerns and proceed.

---

## Step 6: Present to User

Once the Critic approves (or after max revisions), present to the user:

1. **Summary table** — finding counts by category and severity (the counts from Step 3)
2. **Critical findings list** — every CRITICAL finding with its one-line description (not the full detail)
3. **Phased plan overview** — phase titles, task counts, and estimated scope per phase
4. **Architect recommendations** — if any were added in Step 4
5. **Questions or decisions** — anything that requires user input before implementation begins (ambiguous requirements, trade-off decisions, scope questions)

**Do not begin implementation. Wait for user approval.**
