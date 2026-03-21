/**
 * scope-guard.test.ts
 *
 * Tests for scope-guard hook (Task 3.1):
 * 1. Returns early (no throw) when guard is disabled (config.enabled = false)
 * 2. Returns early when tool is not in WRITE_TOOLS set (e.g., 'read')
 * 3. Returns early when session is the architect (agentName = 'Architect')
 * 4. Returns early when declaredCoderScope is null (no scope declared)
 * 5. Throws 'SCOPE VIOLATION' when non-architect writes file outside declared scope
 * 6. Does NOT throw when non-architect writes file INSIDE declared scope
 * 7. Sanitizes path with \r\n to prevent log injection (SEC-1 fix)
 * 8. isFileInScope correctly handles exact match and directory containment
 */
export {};
