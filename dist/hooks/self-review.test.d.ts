/**
 * self-review.test.ts
 *
 * Tests for self-review hook (Task 4.1):
 * 1. Advisory injected when architect calls update_task_status with status=in_progress
 * 2. NOT injected when status=completed (not in_progress)
 * 3. NOT injected when calling session is not architect
 * 4. Turbo-skip: NOT injected when session.turboMode=true and skip_in_turbo=true
 * 5. Disabled: NOT injected when enabled=false
 * 6. Advisory text contains self-review focus items
 * 7. injectAdvisory errors are caught (non-blocking)
 * 8. No advisory for other tools (not update_task_status)
 */
export {};
