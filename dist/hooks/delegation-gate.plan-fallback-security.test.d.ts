/**
 * Adversarial security tests for getEvidenceTaskId plan.json fallback.
 *
 * Tests security-hardened fallback mechanism that reads .swarm/plan.json only after
 * exhausting live task state. Focuses on attack vectors:
 * - Path traversal via plan.json path
 * - Malformed durable state (JSON bombs, circular refs)
 * - Invalid directory inputs
 * - Oversized/hostile inputs
 * - Boundary violations
 * - Symlink attacks
 */
export {};
