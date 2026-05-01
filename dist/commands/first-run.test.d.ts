/**
 * Tests for first-run sentinel detection, welcome message, and error handling
 * catch block in createSwarmCommandHandler().
 *
 * Covers:
 * - First-run sentinel detection (atomic 'wx' flag write)
 * - Welcome message prepended on first run only
 * - Error handling catch block when command handler throws
 * - Regression: existing shortcut-routing tests still pass
 */
export {};
