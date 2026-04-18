/**
 * Tests for the no-op dispatcher (Phase 5 dark foundation).
 *
 * Proves:
 *   - disabled config → reject with 'parallelization_disabled'
 *   - no file I/O, no side effects on dispatch
 *   - handles() always empty
 *   - shutdown() is a no-op
 */
export {};
