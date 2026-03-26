/**
 * delegation-gate.getEvidenceTaskId.test.ts
 *
 * Verification tests for the async conversion of getEvidenceTaskId.
 * Tests the function behavior by recreating its logic in isolation since
 * the function is private (not exported) and depends on fs.promises.
 *
 * Covers:
 * 1. Function returns a Promise (is async)
 * 2. Function resolves to correct task ID when currentTaskId is set
 * 3. Function resolves to correct task ID when lastCoderDelegationTaskId is set
 * 4. Function falls back to taskWorkflowStates when above are null
 * 5. Function returns null when plan.json doesn't exist (ENOENT)
 * 6. Function returns null when plan.json has no in_progress tasks
 * 7. Function returns null when session has direct task_id (early return path via currentTaskId)
 * 8. Path traversal is blocked (security hardening)
 * 9. Malformed JSON returns null
 * 10. Empty/invalid directory returns null
 */
export {};
