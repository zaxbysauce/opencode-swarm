/**
 * Tests for retryCasWithBackoff — Phase 4 (CAS retry with exponential backoff).
 *
 * Verifies:
 *   - Backoff schedule: 5ms start, doubles each attempt, cap 250ms, ±25% jitter
 *   - plan_ledger_cas_retry telemetry is emitted on each retry (hash prefixes only)
 *   - PlanConcurrentModificationError is thrown when retries are exhausted
 *   - verifyValid returning false causes early exit without error
 */
export {};
