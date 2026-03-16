/**
 * EventWriter — session-scoped, error-safe telemetry event writer.
 *
 * Writes structured events to .swarm/events-{sessionId}.jsonl.
 * - Atomic appendFileSync line writes (one JSON object per line)
 * - Auto-emits session_metadata on construction
 * - Error-safe: never throws, never crashes the swarm
 * - Singleton factory: getEventWriter(swarmDir, sessionId) returns the same
 *   instance for a given (swarmDir, sessionId) pair
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import { TELEMETRY_SCHEMA_VERSION, type SwarmEvent } from '@opencode-swarm/telemetry';

/** In-process singleton registry: key = `${swarmDir}::${sessionId}` */
const registry = new Map<string, EventWriter>();

export class EventWriter {
	private readonly filePath: string;
	private readonly sessionId: string;

	/** Use getEventWriter() factory — do not call directly in production */
	constructor(swarmDir: string, sessionId: string) {
		this.sessionId = sessionId;
		// Ensure .swarm/ directory exists
		try {
			mkdirSync(swarmDir, { recursive: true });
		} catch {
			/* non-fatal */
		}
		this.filePath = path.join(swarmDir, `events-${sessionId}.jsonl`);
		// Auto-emit session_metadata on construction
		this.emit({
			type: 'session_metadata',
			timestamp: new Date().toISOString(),
			sessionId,
			version: TELEMETRY_SCHEMA_VERSION,
			swarmDir,
			pid: process.pid,
			platform: process.platform,
			nodeVersion: process.version,
		});
	}

	/**
	 * Emit a single event. Error-safe — never throws.
	 * The event is serialized as a single JSON line appended to the file.
	 */
	emit(event: SwarmEvent | Record<string, unknown>): void {
		try {
			appendFileSync(this.filePath, `${JSON.stringify(event)}\n`, 'utf-8');
		} catch {
			/* non-fatal — telemetry must never crash the swarm */
		}
	}

	/** The absolute path to this session's events file. */
	get path(): string {
		return this.filePath;
	}

	/** The session ID this writer is scoped to. */
	get session(): string {
		return this.sessionId;
	}
}

/**
 * Singleton factory. Returns the same EventWriter instance for a given
 * (swarmDir, sessionId) pair. Creates a new instance on first call.
 *
 * @param swarmDir - Absolute path to the .swarm/ directory
 * @param sessionId - Session identifier (used in filename)
 */
export function getEventWriter(swarmDir: string, sessionId: string): EventWriter {
	const key = `${swarmDir}::${sessionId}`;
	let writer = registry.get(key);
	if (!writer) {
		writer = new EventWriter(swarmDir, sessionId);
		registry.set(key, writer);
	}
	return writer;
}

/**
 * Clear the singleton registry. Used in tests to reset state between runs.
 * NOT for production use.
 */
export function _clearEventWriterRegistry(): void {
	registry.clear();
}
