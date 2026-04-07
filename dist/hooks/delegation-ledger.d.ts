/**
 * DELEGATION LEDGER (v6.31 Task 3.2)
 *
 * tool.execute.after hook that maintains a per-session in-memory ledger of tool calls
 * made during a delegation. When the architect session receives a message (resume),
 * injects a compact DELEGATION SUMMARY via pendingAdvisoryMessages.
 *
 * No file I/O — fully in-memory.
 */
export interface LedgerEntry {
    agent: string;
    tool: string;
    file?: string;
    duration_ms: number;
    success: boolean;
    timestamp: number;
}
export interface DelegationLedgerConfig {
    enabled: boolean;
}
/**
 * Creates the delegation ledger hook pair (toolAfter + summary injection).
 */
export declare function createDelegationLedgerHook(config: Partial<DelegationLedgerConfig>, _directory: string, // reserved for future use
injectAdvisory: (sessionId: string, message: string) => void): {
    toolAfter: (input: {
        tool: string;
        sessionID: string;
        callID: string;
        args?: Record<string, unknown>;
    }, output: {
        title: string;
        output: string;
        metadata: unknown;
    }) => Promise<void>;
    onArchitectResume: (sessionId: string) => void;
};
