/**
 * Append-only Plan Ledger
 *
 * Provides durable, immutable audit trail of plan evolution events.
 * Each event is written as a JSON line to .swarm/plan-ledger.jsonl
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Plan, Task } from '../config/plan-schema';

/**
 * Ledger schema version
 */
export const LEDGER_SCHEMA_VERSION = '1.0.0';

/**
 * Snapshot interval - take a snapshot every N events
 */
export const SNAPSHOT_INTERVAL = 50;

/**
 * Directory name for snapshot storage
 */
export const SNAPSHOT_DIR = 'ledger-snapshots';

/**
 * File name for latest snapshot pointer
 */
export const LATEST_SNAPSHOT_FILE = 'latest-snapshot.json';

/**
 * A point-in-time snapshot of the plan state.
 */
export interface LedgerSnapshot {
	/** Last seq included in this snapshot */
	snapshot_seq: number;
	/** Hash of plan state at snapshot time */
	snapshot_hash: string;
	/** ISO timestamp when snapshot was created */
	created_at: string;
	/** The plan state at snapshot time */
	plan_state: Plan;
}

/**
 * Metadata about a snapshot (without the full plan state).
 * Used for quick lookups without loading the full snapshot.
 */
export interface LedgerSnapshotMetadata {
	snapshot_seq: number;
	snapshot_hash: string;
	created_at: string;
}

/**
 * Valid ledger event types
 */
export const LEDGER_EVENT_TYPES = [
	'plan_created',
	'task_added',
	'task_updated',
	'task_status_changed',
	'task_reordered',
	'phase_completed',
	'plan_rebuilt',
	'plan_exported',
	'plan_reset',
] as const;

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
}

/**
 * Input type for appendLedgerEvent (excludes auto-generated fields)
 */
export type LedgerEventInput = Omit<
	LedgerEvent,
	| 'seq'
	| 'timestamp'
	| 'plan_hash_before'
	| 'plan_hash_after'
	| 'schema_version'
>;

/**
 * Ledger file name
 */
const LEDGER_FILENAME = 'plan-ledger.jsonl';

/**
 * Plan JSON file name
 */
const PLAN_JSON_FILENAME = 'plan.json';

/**
 * Error thrown when a writer attempts to append to the ledger with stale state.
 * Indicates another writer has modified the ledger since the caller last read it.
 */
export class LedgerStaleWriterError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'LedgerStaleWriterError';
	}
}

/**
 * Get the path to the ledger file
 */
function getLedgerPath(directory: string): string {
	return path.join(directory, '.swarm', LEDGER_FILENAME);
}

/**
 * Get the path to plan.json
 */
function getPlanJsonPath(directory: string): string {
	return path.join(directory, '.swarm', PLAN_JSON_FILENAME);
}

/**
 * Get the path to the snapshot directory
 */
function getSnapshotDir(directory: string): string {
	return path.join(directory, '.swarm', SNAPSHOT_DIR);
}

/**
 * Get the path to a specific snapshot file
 */
function getSnapshotPath(directory: string, snapshotSeq: number): string {
	return path.join(getSnapshotDir(directory), `snapshot-${snapshotSeq}.json`);
}

/**
 * Get the path to the latest snapshot pointer file
 */
function getLatestSnapshotPath(directory: string): string {
	return path.join(getSnapshotDir(directory), LATEST_SNAPSHOT_FILE);
}

/**
 * Compute a SHA-256 hash of the plan state.
 * Uses deterministic JSON serialization for consistent hashing.
 *
 * @param plan - The plan to hash
 * @returns Hex-encoded SHA-256 hash
 */
export function computePlanHash(plan: Plan): string {
	// Create deterministic representation by sorting keys
	const normalized = {
		schema_version: plan.schema_version,
		title: plan.title,
		swarm: plan.swarm,
		current_phase: plan.current_phase,
		migration_status: plan.migration_status,
		phases: plan.phases.map((phase) => ({
			id: phase.id,
			name: phase.name,
			status: phase.status,
			required_agents: phase.required_agents
				? [...phase.required_agents].sort()
				: undefined,
			tasks: phase.tasks.map((task) => ({
				id: task.id,
				phase: task.phase,
				status: task.status,
				size: task.size,
				description: task.description,
				depends: [...task.depends].sort(),
				acceptance: task.acceptance,
				files_touched: [...task.files_touched].sort(),
				evidence_path: task.evidence_path,
				blocked_reason: task.blocked_reason,
			})),
		})),
	};

	const jsonString = JSON.stringify(normalized);
	return crypto.createHash('sha256').update(jsonString, 'utf8').digest('hex');
}

/**
 * Read the current plan.json and compute its hash.
 *
 * @param directory - The working directory
 * @returns Hash of current plan.json, or empty string if not found
 */
export function computeCurrentPlanHash(directory: string): string {
	const planPath = getPlanJsonPath(directory);
	try {
		const content = fs.readFileSync(planPath, 'utf8');
		const plan: Plan = JSON.parse(content);
		return computePlanHash(plan);
	} catch {
		// If plan.json doesn't exist or is invalid, return empty hash
		return '';
	}
}

/**
 * Check if the ledger file exists.
 *
 * @param directory - The working directory
 * @returns true if ledger file exists
 */
export async function ledgerExists(directory: string): Promise<boolean> {
	const ledgerPath = getLedgerPath(directory);
	return fs.existsSync(ledgerPath);
}

/**
 * Get the latest sequence number in the ledger.
 *
 * @param directory - The working directory
 * @returns Highest seq value, or 0 if ledger is empty/doesn't exist
 */
export async function getLatestLedgerSeq(directory: string): Promise<number> {
	const ledgerPath = getLedgerPath(directory);

	if (!fs.existsSync(ledgerPath)) {
		return 0;
	}

	try {
		const content = fs.readFileSync(ledgerPath, 'utf8');
		const lines = content
			.trim()
			.split('\n')
			.filter((line) => line.trim() !== '');

		if (lines.length === 0) {
			return 0;
		}

		let maxSeq = 0;
		for (const line of lines) {
			try {
				const event = JSON.parse(line) as { seq: number };
				if (event.seq > maxSeq) {
					maxSeq = event.seq;
				}
			} catch {
				// Skip malformed lines
			}
		}

		return maxSeq;
	} catch {
		return 0;
	}
}

/**
 * Read all events from the ledger.
 *
 * @param directory - The working directory
 * @returns Array of LedgerEvent sorted by seq
 */
export async function readLedgerEvents(
	directory: string,
): Promise<LedgerEvent[]> {
	const ledgerPath = getLedgerPath(directory);

	if (!fs.existsSync(ledgerPath)) {
		return [];
	}

	try {
		const content = fs.readFileSync(ledgerPath, 'utf8');
		const lines = content
			.trim()
			.split('\n')
			.filter((line) => line.trim() !== '');

		const events: LedgerEvent[] = [];
		for (const line of lines) {
			try {
				const event = JSON.parse(line) as LedgerEvent;
				events.push(event);
			} catch {
				// Skip malformed lines
			}
		}

		// Sort by seq ascending
		events.sort((a, b) => a.seq - b.seq);
		return events;
	} catch {
		return [];
	}
}

/**
 * Initialize a new ledger with a plan_created event.
 * Only call this if the ledger doesn't exist.
 *
 * @param directory - The working directory
 * @param planId - Unique identifier for the plan
 */
export async function initLedger(
	directory: string,
	planId: string,
): Promise<void> {
	const ledgerPath = getLedgerPath(directory);
	const planJsonPath = getPlanJsonPath(directory);

	// Guard against double initialization
	if (fs.existsSync(ledgerPath)) {
		throw new Error(
			'Ledger already initialized. Use appendLedgerEvent to add events.',
		);
	}

	// Read current plan to get initial hash
	let planHashAfter = '';
	try {
		if (fs.existsSync(planJsonPath)) {
			const content = fs.readFileSync(planJsonPath, 'utf8');
			const plan: Plan = JSON.parse(content);
			planHashAfter = computePlanHash(plan);
		}
	} catch {
		// If we can't read plan.json, use empty hash
	}

	const event: LedgerEvent = {
		seq: 1,
		timestamp: new Date().toISOString(),
		plan_id: planId,
		event_type: 'plan_created',
		source: 'initLedger',
		plan_hash_before: '',
		plan_hash_after: planHashAfter,
		schema_version: LEDGER_SCHEMA_VERSION,
	};

	// Ensure .swarm/ directory exists
	fs.mkdirSync(path.join(directory, '.swarm'), { recursive: true });

	// Write to temp file then rename for atomicity
	const tempPath = `${ledgerPath}.tmp`;
	const line = `${JSON.stringify(event)}\n`;

	fs.writeFileSync(tempPath, line, 'utf8');
	fs.renameSync(tempPath, ledgerPath);
}

/**
 * Append a new event to the ledger.
 * Uses atomic write: write to temp file then rename.
 *
 * @param directory - The working directory
 * @param eventInput - Event data to append (without seq, timestamp, hashes)
 * @param options - Optional concurrency control options
 * @returns The full LedgerEvent that was written
 */
export async function appendLedgerEvent(
	directory: string,
	eventInput: LedgerEventInput,
	options?: { expectedSeq?: number; expectedHash?: string },
): Promise<LedgerEvent> {
	const ledgerPath = getLedgerPath(directory);

	// Get current state
	const latestSeq = await getLatestLedgerSeq(directory);
	const nextSeq = latestSeq + 1;

	// Compute plan_hash_before from current plan.json
	const planHashBefore = computeCurrentPlanHash(directory);

	// Validate concurrency constraints if provided
	if (options?.expectedSeq !== undefined && options.expectedSeq !== latestSeq) {
		throw new LedgerStaleWriterError(
			`Stale writer: expected seq ${options.expectedSeq} but found ${latestSeq}`,
		);
	}

	if (
		options?.expectedHash !== undefined &&
		options.expectedHash !== planHashBefore
	) {
		throw new LedgerStaleWriterError(
			`Stale writer: expected hash ${options.expectedHash} but found ${planHashBefore}`,
		);
	}

	// Read plan after (in case event modified it, though this is called before)
	// For now, hash_before and hash_after are the same since plan.json
	// hasn't been modified yet - the caller is responsible for updating plan.json
	const planHashAfter = planHashBefore;

	const event: LedgerEvent = {
		...eventInput,
		seq: nextSeq,
		timestamp: new Date().toISOString(),
		plan_hash_before: planHashBefore,
		plan_hash_after: planHashAfter,
		schema_version: LEDGER_SCHEMA_VERSION,
	};

	// Ensure .swarm/ directory exists
	fs.mkdirSync(path.join(directory, '.swarm'), { recursive: true });

	// Write to temp file then rename for atomicity
	const tempPath = `${ledgerPath}.tmp`;
	const line = `${JSON.stringify(event)}\n`;

	// If ledger exists, append to it via temp file
	if (fs.existsSync(ledgerPath)) {
		const existingContent = fs.readFileSync(ledgerPath, 'utf8');
		fs.writeFileSync(tempPath, existingContent + line, 'utf8');
	} else {
		// Ledger not initialized - cannot append without plan_created event
		throw new Error('Ledger not initialized. Call initLedger() first.');
	}

	fs.renameSync(tempPath, ledgerPath);

	return event;
}

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
export async function replayFromLedger(
	directory: string,
	options?: ReplayOptions,
): Promise<Plan | null> {
	// If useSnapshot is enabled, try to load from snapshot + delta
	if (options?.useSnapshot) {
		const latestSnapshot = await getLatestSnapshotMetadata(directory);
		if (latestSnapshot) {
			const snapshot = await loadSnapshot(
				directory,
				latestSnapshot.snapshot_seq,
			);
			if (snapshot) {
				// Load events after the snapshot
				const events = await getEventsAfterSeq(
					directory,
					latestSnapshot.snapshot_seq,
				);

				// Start from snapshot plan state and apply only new events
				let plan: Plan | null = snapshot.plan_state;

				for (const event of events) {
					plan = applyEventToPlan(plan, event);
					if (plan === null) {
						// plan_reset event
						return null;
					}
				}

				return plan;
			}
		}
	}

	// Full replay from plan.json
	const events = await readLedgerEvents(directory);

	// If no events, nothing to replay
	if (events.length === 0) {
		return null;
	}

	// Load plan.json as base state
	// NOTE: plan.json must exist — the ledger does not store the full plan payload,
	// only incremental events. This is a known limitation.
	const planJsonPath = getPlanJsonPath(directory);
	if (!fs.existsSync(planJsonPath)) {
		return null;
	}

	let plan: Plan | null;
	try {
		const content = fs.readFileSync(planJsonPath, 'utf8');
		plan = JSON.parse(content);
	} catch {
		return null;
	}

	// Apply events in sequence
	for (const event of events) {
		if (plan === null) {
			// plan_reset event
			return null;
		}
		plan = applyEventToPlan(plan, event);
	}

	return plan;
}

/**
 * Apply a single ledger event to the plan state.
 * Returns null if the event indicates a full reset (plan_reset).
 *
 * @param plan - Current plan state
 * @param event - Event to apply
 * @returns Updated plan state, or null if plan should be reset
 */
function applyEventToPlan(plan: Plan, event: LedgerEvent): Plan | null {
	switch (event.event_type) {
		case 'plan_created':
			// plan_created event contains metadata but not full plan data
			// The plan was already loaded from plan.json above
			return plan;

		case 'task_status_changed':
			if (event.task_id && event.to_status) {
				for (const phase of plan.phases) {
					const task = phase.tasks.find((t) => t.id === event.task_id);
					if (task) {
						task.status = event.to_status as Task['status'];
						break;
					}
				}
			}
			return plan;

		case 'phase_completed':
			if (event.phase_id) {
				const phase = plan.phases.find((p) => p.id === event.phase_id);
				if (phase) {
					phase.status = 'complete';
				}
			}
			return plan;

		case 'plan_exported':
			// Audit-only marker — no plan state to update
			return plan;

		case 'task_added':
			// Audit-only: task was added but is already in plan.json
			return plan;

		case 'task_updated':
			// Audit-only: task was updated but the update is already reflected in plan.json
			return plan;

		case 'plan_rebuilt':
			// Audit-only: plan was rebuilt from ledger, structure already reflected in plan.json
			return plan;

		case 'task_reordered':
			// Audit-only: task order was changed, structure already reflected in plan.json
			return plan;

		case 'plan_reset':
			// Reset means start fresh — nothing to replay after a reset
			return null;

		default:
			// Unknown or unhandled event type — fail replay rather than silently produce wrong state
			throw new Error(
				`applyEventToPlan: unhandled event type "${event.event_type}" at seq ${event.seq}`,
			);
	}
}

/**
 * Take a snapshot of the current plan state.
 * Stores the snapshot with metadata and updates latest-snapshot pointer.
 *
 * @param directory - The working directory
 * @param plan - The current plan state to snapshot
 * @returns The created LedgerSnapshot
 */
export async function takeSnapshot(
	directory: string,
	plan: Plan,
): Promise<LedgerSnapshot> {
	const latestSeq = await getLatestLedgerSeq(directory);

	// Compute actual current state by replaying all events up to latestSeq
	let currentPlan = plan;
	let lastAppliedSeq = 0;
	if (latestSeq > 0) {
		// Replay all events to get the true current state
		const events = await readLedgerEvents(directory);
		for (const event of events) {
			lastAppliedSeq = event.seq;
			const result = applyEventToPlan(currentPlan, event);
			if (result === null) {
				// plan_reset — stop replay, remaining events are invalid
				break;
			}
			currentPlan = result;
		}
	}

	const snapshotHash = computePlanHash(currentPlan);

	const snapshot: LedgerSnapshot = {
		snapshot_seq: lastAppliedSeq,
		snapshot_hash: snapshotHash,
		created_at: new Date().toISOString(),
		plan_state: currentPlan,
	};

	// Ensure snapshot directory exists
	const snapshotDir = getSnapshotDir(directory);
	fs.mkdirSync(snapshotDir, { recursive: true });

	// Write snapshot to file
	const snapshotPath = getSnapshotPath(directory, snapshot.snapshot_seq);
	fs.writeFileSync(snapshotPath, JSON.stringify(snapshot), 'utf8');

	// Update latest-snapshot pointer
	const latestSnapshotPath = getLatestSnapshotPath(directory);
	const metadata: LedgerSnapshotMetadata = {
		snapshot_seq: snapshot.snapshot_seq,
		snapshot_hash: snapshot.snapshot_hash,
		created_at: snapshot.created_at,
	};
	fs.writeFileSync(latestSnapshotPath, JSON.stringify(metadata), 'utf8');

	return snapshot;
}

/**
 * Get the latest snapshot metadata.
 *
 * @param directory - The working directory
 * @returns The latest snapshot metadata, or null if no snapshot exists
 */
export async function getLatestSnapshotMetadata(
	directory: string,
): Promise<LedgerSnapshotMetadata | null> {
	const latestSnapshotPath = getLatestSnapshotPath(directory);

	if (!fs.existsSync(latestSnapshotPath)) {
		return null;
	}

	try {
		const content = fs.readFileSync(latestSnapshotPath, 'utf8');
		const metadata = JSON.parse(content) as LedgerSnapshotMetadata;
		return metadata;
	} catch {
		return null;
	}
}

/**
 * Load a snapshot by seq number.
 *
 * @param directory - The working directory
 * @param snapshotSeq - The seq number of the snapshot to load
 * @returns The LedgerSnapshot, or null if not found
 */
export async function loadSnapshot(
	directory: string,
	snapshotSeq: number,
): Promise<LedgerSnapshot | null> {
	const snapshotPath = getSnapshotPath(directory, snapshotSeq);

	if (!fs.existsSync(snapshotPath)) {
		return null;
	}

	try {
		const content = fs.readFileSync(snapshotPath, 'utf8');
		const snapshot = JSON.parse(content) as LedgerSnapshot;
		if (!snapshot || !snapshot.plan_state) {
			return null;
		}
		return snapshot;
	} catch {
		return null;
	}
}

/**
 * Get events newer than a given snapshot seq.
 * Used to replay from snapshot + delta.
 *
 * @param directory - The working directory
 * @param afterSeq - Load events after this seq number
 * @returns Array of LedgerEvent sorted by seq
 */
export async function getEventsAfterSeq(
	directory: string,
	afterSeq: number,
): Promise<LedgerEvent[]> {
	const events = await readLedgerEvents(directory);

	// Filter to only events after the given seq
	const newerEvents = events.filter((event) => event.seq > afterSeq);

	// Sort by seq ascending (should already be sorted, but ensure it)
	newerEvents.sort((a, b) => a.seq - b.seq);

	return newerEvents;
}

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
export async function readLedgerEventsWithIntegrity(
	directory: string,
): Promise<LedgerIntegrityResult> {
	const ledgerPath = getLedgerPath(directory);

	if (!fs.existsSync(ledgerPath)) {
		return { events: [], truncated: false, badSuffix: null };
	}

	try {
		const content = fs.readFileSync(ledgerPath, 'utf8');
		const lines = content.split('\n');

		const events: LedgerEvent[] = [];
		let truncated = false;
		let badSuffix: string | null = null;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];

			// Skip empty lines
			if (line.trim() === '') {
				continue;
			}

			try {
				const event = JSON.parse(line) as LedgerEvent;
				events.push(event);
			} catch {
				// First malformed line found — stop here
				truncated = true;
				// Collect remaining content from this line to end of file
				badSuffix = lines.slice(i).join('\n');
				break;
			}
		}

		// Sort by seq ascending
		events.sort((a, b) => a.seq - b.seq);

		return { events, truncated, badSuffix };
	} catch {
		return { events: [], truncated: false, badSuffix: null };
	}
}

/**
 * Quarantine a corrupted ledger suffix to a separate file.
 * Does NOT modify the ledger file itself.
 *
 * @param directory - The working directory
 * @param badSuffix - The corrupted content to quarantine
 */
export async function quarantineLedgerSuffix(
	directory: string,
	badSuffix: string,
): Promise<void> {
	try {
		const quarantinePath = path.join(
			directory,
			'.swarm',
			'plan-ledger.quarantine',
		);
		fs.writeFileSync(quarantinePath, badSuffix, 'utf8');
		console.warn(
			`[ledger] Corrupted suffix quarantined to ${path.relative(directory, quarantinePath)}`,
		);
	} catch {
		// Silently fail if we can't write the quarantine file
		// The bad suffix has already been captured in memory for handling
	}
}

/**
 * Replay ledger events with integrity checking.
 * If corruption is detected, quarantines the bad suffix and falls back to snapshot+prefix replay.
 * Never throws — all errors return null.
 *
 * @param directory - The working directory
 * @returns Reconstructed Plan from ledger events, or null if replay fails
 */
export async function replayWithIntegrity(
	directory: string,
): Promise<Plan | null> {
	try {
		const { events, truncated, badSuffix } =
			await readLedgerEventsWithIntegrity(directory);

		// If ledger is empty, nothing to replay
		if (events.length === 0) {
			return null;
		}

		// Handle corruption: quarantine bad suffix and fall back to snapshot+prefix replay
		if (truncated && badSuffix !== null) {
			await quarantineLedgerSuffix(directory, badSuffix);

			// Try snapshot+prefix replay
			const latestSnapshot = await getLatestSnapshotMetadata(directory);
			if (latestSnapshot) {
				const snapshot = await loadSnapshot(
					directory,
					latestSnapshot.snapshot_seq,
				);
				if (snapshot) {
					// Get only events after the snapshot
					const eventsAfterSnapshot = events.filter(
						(event) => event.seq > latestSnapshot.snapshot_seq,
					);

					// Start from snapshot plan state and apply only valid events
					let plan: Plan | null = snapshot.plan_state;

					for (const event of eventsAfterSnapshot) {
						plan = applyEventToPlan(plan, event);
						if (plan === null) {
							// plan_reset event
							return null;
						}
					}

					return plan;
				}
			}

			// No snapshot available — fall back to plan.json base with only valid events
			const planJsonPath = getPlanJsonPath(directory);
			if (!fs.existsSync(planJsonPath)) {
				return null;
			}

			let plan: Plan | null;
			try {
				const content = fs.readFileSync(planJsonPath, 'utf8');
				plan = JSON.parse(content);
			} catch {
				return null;
			}

			// Apply only valid events in sequence
			for (const event of events) {
				if (plan === null) {
					// plan_reset event
					return null;
				}
				plan = applyEventToPlan(plan, event);
			}

			return plan;
		}

		// No corruption — behave identically to replayFromLedger (no snapshot)
		const planJsonPath = getPlanJsonPath(directory);
		if (!fs.existsSync(planJsonPath)) {
			return null;
		}

		let plan: Plan | null;
		try {
			const content = fs.readFileSync(planJsonPath, 'utf8');
			plan = JSON.parse(content);
		} catch {
			return null;
		}

		for (const event of events) {
			if (plan === null) {
				// plan_reset event
				return null;
			}
			plan = applyEventToPlan(plan, event);
		}

		return plan;
	} catch {
		return null;
	}
}
