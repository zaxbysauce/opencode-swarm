/**
 * Compaction service — monitors context budget and triggers graduated compaction
 * when usage crosses configured thresholds.
 *
 * Three tiers (all thresholds as percentages 0-100):
 *  - Observation (default 40%): summarise older turns, preserve key decisions
 *  - Reflection  (default 60%): re-summarise into tighter format
 *  - Emergency   (default 80%): hard truncation to system + current task + last N turns
 *
 * Consumes `swarmState.lastBudgetPct` (set by system-enhancer.ts after each budget calc).
 * Never throws. Advisory system message injection via callback.
 */
import type { CompactionConfig } from '../config/schema';
export type { CompactionConfig };
export interface CompactionServiceHook {
    toolAfter: (input: {
        tool: string;
        sessionID: string;
    }, output: {
        output?: unknown;
    }) => Promise<void>;
}
export declare function createCompactionService(config: CompactionConfig, directory: string, injectMessage: (sessionId: string, message: string) => void): CompactionServiceHook;
export declare function getCompactionMetrics(): {
    compactionCount: number;
    lastSnapshotAt: string | null;
};
export declare function resetCompactionState(): void;
