## memory (Phase 1): Correctness & Hygiene — FTS schema, lifecycle init, secret patterns, scoring pins

Addresses 11 findings (DD-01 through DD-24) from the deep-dive audit of the memory system.

### What changed
- **FTS migration**: Schema moved into `MIGRATIONS` array at version 3; MIGRATIONS exported; removed manual `markMigration(3, ...)` call
- **Initialize mutex**: Concurrent init races fixed with once-promise; failed init allows retry
- **Typed errors**: `requireDb()` throws `MemoryValidationError` instead of generic `Error`
- **SQL split parser**: Replaced naive `sql.split(';')` with quote/comment-aware stateful parser
- **Dispose leak**: `recallForAgent` wrapped in try/finally to ensure `gateway.dispose?.()` runs
- **Agent role fixes**: `curator_postmortem` added to `isCuratorAgent` and `normalizeMemoryAgentRole`
- **Path traversal defense**: `--fixtures` path resolves under `directory` or `PACKAGE_ROOT/tests/fixtures/memory-recall` with trailing-separator-safe `startsWith`
- **7 new secret patterns**: GitLab (glpat-), Slack (xox[bpras]-), JWT (eyJ...), AWS secret key, Stripe (sk_live/test_), Google API key (AIza...), OpenSSH private key blocks
- **URL false positive fix**: `env_secret` regex tightened to require letter-starting segment prefix. **Note**: env vars starting with a digit (e.g. `0_PASSWORD=secret`, `123_TOKEN=value`) no longer match. This is intentional to reduce URL `?key=` false positives — most real env vars start with a letter. Pinned by 2 new tests.
- **Scoring docs/source**: docs/memory.md updated to actual 9-factor scoring model (sum 1.13); `SCORING_WEIGHTS` exported + pinned in 9 tests
- **Migration invariants**: 3 tests pin unique/monotonic/schema_migrations-monotonic

### Migration
No migration required. All changes are additive or internal — existing memory data survives intact.
