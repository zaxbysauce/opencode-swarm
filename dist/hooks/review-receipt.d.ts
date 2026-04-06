/**
 * Review receipt persistence for opencode-swarm.
 *
 * Persists reviewer and curator review receipts to disk so that future
 * re-reviews and drift verification have durable evidence of prior judgments.
 *
 * Two receipt types:
 *   RejectedReviewReceipt  — full-detail artifact with blocking findings,
 *                             exact evidence refs, scope fingerprint/hash,
 *                             and re-review pass conditions.
 *   ApprovedReviewReceipt  — compact artifact with what was checked, claims
 *                             validated, scope fingerprint, and caveats.
 *
 * Storage: .swarm/review-receipts/<YYYY-MM-DD>-<id>.json (one file per receipt)
 *          .swarm/review-receipts/index.json              (manifest for fast lookup)
 *
 * Staleness: receipts are invalidated when the scope fingerprint changes
 *            materially (any character-level change to the canonical diff/hash).
 *            Consumers MUST check isScopeStale() before trusting an approved receipt.
 *
 * Critic drift verification can consume prior receipts as supporting context
 * but MUST NOT blindly trust them — staleness check is mandatory.
 */
export type ReceiptVerdict = 'rejected' | 'approved';
/** Identity of the reviewer/curator that produced the receipt. */
export interface ReviewerIdentity {
    /** Agent name (e.g. 'reviewer', 'critic', 'curator') */
    agent: string;
    /** Optional session ID for traceability */
    session_id?: string;
}
/** A canonical fingerprint/hash of the reviewed scope or diff. */
export interface ScopeFingerprint {
    /** SHA-256 hex digest of the canonical scope content */
    hash: string;
    /** Short description of what was hashed (e.g. 'git-diff', 'file-content', 'spec-md') */
    scope_description: string;
    /** Length of the original content in characters */
    content_length: number;
}
/** A blocking finding recorded in a rejected review. */
export interface BlockingFinding {
    /** File path (relative) or identifier */
    location: string;
    /** One-line summary of the finding */
    summary: string;
    /** Line number if applicable */
    line?: number;
    /** Severity: 'critical' | 'high' | 'medium' */
    severity: 'critical' | 'high' | 'medium';
}
/**
 * Rejected review receipt.
 * Full-detail artifact. Persisted for re-review reference.
 */
export interface RejectedReviewReceipt {
    schema_version: 1;
    id: string;
    receipt_type: 'rejected';
    verdict: 'rejected';
    /** Reviewer/curator that produced this receipt */
    reviewer: ReviewerIdentity;
    /** ISO 8601 timestamp */
    reviewed_at: string;
    /** Fingerprint of the reviewed scope */
    scope_fingerprint: ScopeFingerprint;
    /** Blocking findings that caused rejection */
    blocking_findings: BlockingFinding[];
    /** Exact evidence references (file paths, line numbers, etc.) */
    evidence_references: string[];
    /** Conditions that must be met for a re-review to pass */
    pass_conditions: string[];
    /** Optional free-text summary */
    summary?: string;
}
/**
 * Approved review receipt.
 * Compact artifact. Supporting evidence, not durable proof.
 */
export interface ApprovedReviewReceipt {
    schema_version: 1;
    id: string;
    receipt_type: 'approved';
    verdict: 'approved';
    /** Reviewer/curator that produced this receipt */
    reviewer: ReviewerIdentity;
    /** ISO 8601 timestamp */
    reviewed_at: string;
    /** Fingerprint of the reviewed scope */
    scope_fingerprint: ScopeFingerprint;
    /** What aspects were checked (e.g. ['security', 'correctness', 'test coverage']) */
    checked_aspects: string[];
    /** Claims that were validated during review */
    validated_claims: string[];
    /** Residual risk or caveats */
    caveats?: string[];
}
export type ReviewReceipt = RejectedReviewReceipt | ApprovedReviewReceipt;
/** Index entry for fast lookup without reading every receipt file. */
export interface ReceiptIndexEntry {
    id: string;
    verdict: ReceiptVerdict;
    reviewed_at: string;
    scope_hash: string;
    agent: string;
    filename: string;
}
/** Receipt index manifest stored in .swarm/review-receipts/index.json */
export interface ReceiptIndex {
    schema_version: 1;
    entries: ReceiptIndexEntry[];
}
/** Returns the .swarm/review-receipts/ directory path. */
export declare function resolveReceiptsDir(directory: string): string;
/** Returns the index file path. */
export declare function resolveReceiptIndexPath(directory: string): string;
/**
 * Compute a SHA-256 scope fingerprint for a given content string.
 * The hash is deterministic: same content → same hash.
 */
export declare function computeScopeFingerprint(content: string, scopeDescription: string): ScopeFingerprint;
/**
 * Returns true if the current scope content is materially different from
 * the fingerprint recorded in the receipt. Any character-level change to the
 * canonical content (same scopeDescription) invalidates the receipt.
 *
 * If `currentContent` is undefined (scope no longer available), the receipt
 * is treated as stale (conservative: assume the scope has changed).
 */
export declare function isScopeStale(receipt: ReviewReceipt, currentContent: string | undefined): boolean;
/**
 * Persist a review receipt (rejected or approved) to disk.
 * Creates .swarm/review-receipts/<date>-<id>.json and updates the index.
 * Returns the absolute path of the written receipt file.
 */
export declare function persistReviewReceipt(directory: string, receipt: ReviewReceipt): Promise<string>;
/**
 * Read a single receipt by ID. Returns null if not found or unreadable.
 */
export declare function readReceiptById(directory: string, receiptId: string): Promise<ReviewReceipt | null>;
/**
 * Read all receipts for a given scope hash (latest first).
 * Useful for drift verification to find prior reviews of the same scope.
 */
export declare function readReceiptsByScopeHash(directory: string, scopeHash: string): Promise<ReviewReceipt[]>;
/**
 * Read all receipts from the index (all verdicts, latest first).
 * Useful for drift verification context.
 */
export declare function readAllReceipts(directory: string): Promise<ReviewReceipt[]>;
/**
 * Build a RejectedReviewReceipt.
 * `scopeContent` is hashed to produce the fingerprint.
 */
export declare function buildRejectedReceipt(opts: {
    agent: string;
    sessionId?: string;
    scopeContent: string;
    scopeDescription: string;
    blockingFindings: BlockingFinding[];
    evidenceReferences: string[];
    passConditions: string[];
    summary?: string;
}): RejectedReviewReceipt;
/**
 * Build an ApprovedReviewReceipt.
 * `scopeContent` is hashed to produce the fingerprint.
 */
export declare function buildApprovedReceipt(opts: {
    agent: string;
    sessionId?: string;
    scopeContent: string;
    scopeDescription: string;
    checkedAspects: string[];
    validatedClaims: string[];
    caveats?: string[];
}): ApprovedReviewReceipt;
/**
 * Build a structured context summary of prior receipts for critic drift
 * verification. Returns a compact string that can be injected into context.
 *
 * Approved receipts that are scope-stale are flagged explicitly so the critic
 * knows they are supporting evidence only, not proof of current state.
 *
 * @param receipts - Array of prior receipts (from readAllReceipts or readReceiptsByScopeHash)
 * @param currentScopeContent - Optional current scope content for staleness check
 * @param maxChars - Maximum output length (default 1000)
 */
export declare function buildReceiptContextForDrift(receipts: ReviewReceipt[], currentScopeContent?: string, maxChars?: number): string;
