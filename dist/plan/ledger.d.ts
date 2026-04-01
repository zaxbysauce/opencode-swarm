/**
 * Append-only Plan Ledger
 *
 * Provides durable, immutable audit trail of plan evolution events.
 * Each event is written as a JSON line to .swarm/plan-ledger.jsonl
 */
import type { Plan } from '../config/plan-schema';
/**
 * Ledger schema version
 */
export declare const LEDGER_SCHEMA_VERSION = "1.0.0";
/**
 * Valid ledger event types
 */
export declare const LEDGER_EVENT_TYPES: readonly ["plan_created", "task_added", "task_updated", "task_status_changed", "task_reordered", "phase_completed", "plan_rebuilt", "plan_exported", "plan_reset", "snapshot"];
export type LedgerEventType = (typeof LEDGER_EVENT_TYPES)[number];
/**
 * A ledger event representing a plan mutation.
 * All fields are required unless marked optional.
 */
export interface LedgerEvent {
    /** Monotonically increasing sequence number (starts at 1) */
    seq: number;
    /** ISO 8601 timestamp when event was recorded */
    timestamp: string;
    /** Unique identifier for the plan */
    plan_id: string;
    /** Type of event that occurred */
    event_type: LedgerEventType;
    /** Task ID when event relates to a specific task */
    task_id?: string;
    /** Phase ID when event relates to a specific phase */
    phase_id?: number;
    /** Previous status (for status change events) */
    from_status?: string;
    /** New status (for status change events) */
    to_status?: string;
    /** What triggered this event */
    source: string;
    /** SHA-256 hash of plan state before this event */
    plan_hash_before: string;
    /** SHA-256 hash of plan state after this event */
    plan_hash_after: string;
    /** Schema version for this ledger entry */
    schema_version: string;
    /** Optional payload for events that carry additional data */
    payload?: Record<string, unknown>;
}
/**
 * Input type for appendLedgerEvent (excludes auto-generated fields)
 */
export type LedgerEventInput = Omit<LedgerEvent, 'seq' | 'timestamp' | 'plan_hash_before' | 'plan_hash_after' | 'schema_version'>;
/**
 * Payload for snapshot ledger events.
 * Embeds the full Plan payload for ledger-only rebuild.
 */
export interface SnapshotEventPayload {
    plan: Plan;
    payload_hash: string;
}
/**
 * Error thrown when a writer attempts to append to the ledger with stale state.
 * Indicates another writer has modified the ledger since the caller last read it.
 */
export declare class LedgerStaleWriterError extends Error {
    constructor(message: string);
}
/**
 * Compute a SHA-256 hash of the plan state.
 * Uses deterministic JSON serialization for consistent hashing.
 *
 * @param plan - The plan to hash
 * @returns Hex-encoded SHA-256 hash
 */
export declare function computePlanHash(plan: Plan): string;
/**
 * Read the current plan.json and compute its hash.
 *
 * @param directory - The working directory
 * @returns Hash of current plan.json, or empty string if not found
 */
export declare function computeCurrentPlanHash(directory: string): string;
/**
 * Check if the ledger file exists.
 *
 * @param directory - The working directory
 * @returns true if ledger file exists
 */
export declare function ledgerExists(directory: string): Promise<boolean>;
/**
 * Get the latest sequence number in the ledger.
 *
 * @param directory - The working directory
 * @returns Highest seq value, or 0 if ledger is empty/doesn't exist
 */
export declare function getLatestLedgerSeq(directory: string): Promise<number>;
/**
 * Read all events from the ledger.
 *
 * @param directory - The working directory
 * @returns Array of LedgerEvent sorted by seq
 */
export declare function readLedgerEvents(directory: string): Promise<LedgerEvent[]>;
/**
 * Initialize a new ledger with a plan_created event.
 * Only call this if the ledger doesn't exist.
 *
 * @param directory - The working directory
 * @param planId - Unique identifier for the plan
 */
export declare function initLedger(directory: string, planId: string): Promise<void>;
/**
 * Append a new event to the ledger.
 * Uses atomic write: write to temp file then rename.
 *
 * @param directory - The working directory
 * @param eventInput - Event data to append (without seq, timestamp, hashes)
 * @param options - Optional concurrency control options
 * @returns The full LedgerEvent that was written
 */
export declare function appendLedgerEvent(directory: string, eventInput: LedgerEventInput, options?: {
    expectedSeq?: number;
    expectedHash?: string;
    planHashAfter?: string;
}): Promise<LedgerEvent>;
/**
 * Take a snapshot event and append it to the ledger.
 * The snapshot embeds the full Plan payload for ledger-only rebuild.
 *
 * @param directory - The working directory
 * @param plan - The current plan state to snapshot
 * @param options - Optional configuration
 * @returns The LedgerEvent that was written
 */
export declare function takeSnapshotEvent(directory: string, plan: Plan, options?: {
    planHashAfter?: string;
}): Promise<LedgerEvent>;
/**
 * Options for replayFromLedger
 */
interface ReplayOptions {
    /** If true, use the latest snapshot to speed up replay */
    useSnapshot?: boolean;
}
/**
 * Replay ledger events to reconstruct plan state.
 * Loads plan.json as the base state and applies ledger events in sequence.
 *
 * NOTE: This function requires plan.json to exist as the base state.
 * The ledger only stores task_status_changed events, not the full plan payload.
 * If plan.json is missing, replay cannot proceed — this is a known limitation.
 * The fix would be to store the initial plan payload in the ledger, but that
 * is a larger architectural change beyond the current scope.
 *
 * @param directory - The working directory
 * @param options - Optional replay options
 * @returns Reconstructed Plan from ledger events, or null if plan.json doesn't exist or ledger is empty
 */
export declare function replayFromLedger(directory: string, options?: ReplayOptions): Promise<Plan | null>;
/**
 * Result type for readLedgerEventsWithIntegrity
 */
export interface LedgerIntegrityResult {
    /** Valid events up to (but not including) the first malformed line */
    events: LedgerEvent[];
    /** True if a bad line was found and replay was stopped early */
    truncated: boolean;
    /** Raw content from the first bad line to end of file, for quarantine */
    badSuffix: string | null;
}
/**
 * Read ledger events with integrity checking.
 * Stops at the first malformed/unparseable line and returns the remainder for quarantine.
 *
 * @param directory - The working directory
 * @returns LedgerIntegrityResult with events, truncated flag, and bad suffix
 */
export declare function readLedgerEventsWithIntegrity(directory: string): Promise<LedgerIntegrityResult>;
/**
 * Quarantine a corrupted ledger suffix to a separate file.
 * Does NOT modify the ledger file itself.
 *
 * @param directory - The working directory
 * @param badSuffix - The corrupted content to quarantine
 */
export declare function quarantineLedgerSuffix(directory: string, badSuffix: string): Promise<void>;
/**
 * Replay ledger events with integrity checking.
 * If corruption is detected, quarantines the bad suffix and falls back to snapshot+prefix replay.
 * Never throws — all errors return null.
 *
 * @param directory - The working directory
 * @returns Reconstructed Plan from ledger events, or null if replay fails
 */
export declare function replayWithIntegrity(directory: string): Promise<Plan | null>;
export {};
