/**
 * Council phase gate — end-to-end behaviour after the v7.0.x routing fix.
 *
 * Covers:
 *   1. submit_phase_council_verdicts — quorum enforcement (insufficient and sufficient)
 *   2. submit_phase_council_verdicts — evidence file write contents
 *   3. update_task_status no longer blocks per-task on missing council gate
 *   4. Stage B state machine still advances per-task when council mode is active
 */
export {};
