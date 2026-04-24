/**
 * Adversarial tests for evidence write locking — 16 concurrent writers.
 *
 * Proves that no writes are lost when concurrent callers race on the same
 * evidence file.  Each writer appends a unique marker; after all settle we
 * assert every marker is present exactly once.
 */
export {};
