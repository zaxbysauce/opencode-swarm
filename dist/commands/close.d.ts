/**
 * Handles /swarm close command - performs full terminal session finalization:
 * 1. Finalize: write retrospectives, produce terminal summary
 * 2. Archive: create timestamped bundle of swarm artifacts
 * 3. Clean: clear active-state files that confuse future swarms
 * 4. Align: safe git alignment to main
 *
 * Must be idempotent - safe to run multiple times.
 */
export declare function handleCloseCommand(directory: string, args: string[]): Promise<string>;
