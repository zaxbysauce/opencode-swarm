/**
 * Regression Tests for Full-Auto Mode Integration.
 *
 * Covers the integration surfaces unique to full-auto mode:
 * 1. /swarm full-auto command toggle, on, off
 * 2. hasActiveFullAuto() - session-scoped and global-fallback behavior
 * 3. System-enhancer hook injects FULL-AUTO MODE ACTIVE banner (Path A and global)
 * 4. Counter reset side-effects are visible after disable
 */
export {};
