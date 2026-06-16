# Knowledge counter baseline and rollup correctness (PR #1335 feedback)

## What changed

- **`appendKnowledgeEvent` O(N) trim eliminated.** Per-append locked list traversal has been replaced with a lock-free atomic append and a lazy size-based locked trim, bounding append latency regardless of event log size.

- **`effectiveRetrievalOutcomes` double-counting fixed.** Rollup is now authoritative for v2 counter entries; in-memory v2 counters are derived from the rollup rather than accumulated independently, eliminating double-counting when both the legacy application log and the event log contribute.

- **`rollupCache` is now directory-keyed with baseline stat in the cache key.** The cache is a bounded LRU map keyed by directory + baseline file mtime/ino, so stale cache entries from a replaced baseline file are automatically evicted.

- **Counter baseline file gains a schema-version envelope with one-step migration.** Unversioned baseline files are migrated to the versioned schema on first read; the envelope is validated on every load and rejected with a clear error if corrupted.

- **Proper-lockfile locking added to `appendAudit` FIFO trim.** The audit log trim in `knowledge-application.ts` now uses the lockfile protocol, preventing concurrent trim races that could corrupt the FIFO ordering.

- **`learning-metrics.ts` now accounts for the counter baseline.** The metrics computation reads the persisted counter baseline so that session-level retrieval outcomes are anchored to durable state rather than in-memory accumulation.

- **`knowledge-durability.test.ts` memoization verification hardened.** Tests now use the `_internals` seam to directly inspect memoized state, proving that rollup is actually cached and not recomputed on every call.

- **`searchKnowledge` forceReadHive fix.** Manual recall with `forceReadHive: true` now correctly surfaces hive entries even when `config.hive_enabled` is false, matching the documented behavior.
