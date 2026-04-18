import * as fs from 'node:fs';
import { createWriteStream } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// ============================================================================
// Types
// ============================================================================

export type TelemetryEvent =
	| 'session_started'
	| 'session_ended'
	| 'agent_activated'
	| 'delegation_begin'
	| 'delegation_end'
	| 'task_state_changed'
	| 'gate_passed'
	| 'gate_failed'
	| 'phase_changed'
	| 'budget_updated'
	| 'model_fallback'
	| 'hard_limit_hit'
	| 'revision_limit_hit'
	| 'loop_detected'
	| 'scope_violation'
	| 'qa_skip_violation'
	| 'heartbeat'
	| 'turbo_mode_changed'
	| 'auto_oversight_escalation'
	| 'environment_detected'
	// PR 1 parallelization foundation events (dark — emitted but no live parallel paths)
	| 'evidence_lock_acquired'
	| 'evidence_lock_contended'
	| 'evidence_lock_stale_recovered'
	| 'plan_ledger_cas_retry';

export type TelemetryListener = (
	event: TelemetryEvent,
	data: Record<string, unknown>,
) => void;

// ============================================================================
// Internal State
// ============================================================================

let _writeStream: ReturnType<typeof createWriteStream> | null = null;
let _projectDirectory: string | null = null;
const _listeners: TelemetryListener[] = [];
let _disabled: boolean = false;

/** @internal - For testing only */
export function resetTelemetryForTesting(): void {
	_disabled = false;
	_projectDirectory = null;
	_listeners.length = 0;
	if (_writeStream !== null) {
		_writeStream.end();
		_writeStream = null;
	}
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Initialize telemetry with the project directory.
 * Creates `.swarm/` if it doesn't exist and opens `telemetry.jsonl` for appending.
 * Idempotent — calling multiple times has no effect after the first successful call.
 * @param projectDirectory - Absolute path to the project root
 */
export function initTelemetry(projectDirectory: string): void {
	if (_writeStream !== null || _disabled) {
		return;
	}

	try {
		_projectDirectory = projectDirectory;
		const swarmDir = path.join(projectDirectory, '.swarm');

		if (!fs.existsSync(swarmDir)) {
			fs.mkdirSync(swarmDir, { recursive: true });
		}

		const telemetryPath = path.join(swarmDir, 'telemetry.jsonl');
		_writeStream = createWriteStream(telemetryPath, { flags: 'a' });

		_writeStream.on('error', () => {
			_disabled = true;
			_writeStream = null;
		});
	} catch {
		_disabled = true;
		_writeStream = null;
	}
}

/**
 * Emit a telemetry event.
 * Writes a JSONL line to `.swarm/telemetry.jsonl` and notifies all registered listeners.
 * Fire-and-forget — errors are silently swallowed and never propagate to the caller.
 * @param event - The event type
 * @param data - Arbitrary event payload (sessionId always required by convention)
 */
export function emit(
	event: TelemetryEvent,
	data: Record<string, unknown>,
): void {
	try {
		if (_disabled || _writeStream === null) {
			return;
		}

		const line =
			JSON.stringify({
				timestamp: new Date().toISOString(),
				event,
				...data,
			}) + os.EOL;

		_writeStream.write(line, (err) => {
			if (err) {
				_disabled = true;
				_writeStream = null;
			}
		});

		for (const listener of _listeners) {
			try {
				listener(event, data);
			} catch {
				// Listener errors must NOT propagate
			}
		}
	} catch {
		// emit() must never throw to the caller
	}
}

/**
 * Register a listener for telemetry events.
 * Listeners receive every event that is emitted (if telemetry is not disabled).
 * Listener errors are silently swallowed — they never break execution.
 * @param callback - Function called with (event, data) on each emit
 */
export function addTelemetryListener(callback: TelemetryListener): void {
	_listeners.push(callback);
}

/**
 * Rotate telemetry file if it exceeds maxBytes.
 * Renames `telemetry.jsonl` → `telemetry.jsonl.1` and reopens a fresh stream.
 * Errors are silently swallowed.
 * @param maxBytes - Size threshold in bytes (default: 10MB)
 */
export function rotateTelemetryIfNeeded(
	maxBytes: number = 10 * 1024 * 1024,
): void {
	try {
		if (_projectDirectory === null) {
			return;
		}

		const telemetryPath = path.join(
			_projectDirectory,
			'.swarm',
			'telemetry.jsonl',
		);

		if (!fs.existsSync(telemetryPath)) {
			return;
		}

		const stats = fs.statSync(telemetryPath);
		if (stats.size < maxBytes) {
			return;
		}

		const rotatedPath = path.join(
			_projectDirectory,
			'.swarm',
			'telemetry.jsonl.1',
		);
		fs.renameSync(telemetryPath, rotatedPath);

		if (_writeStream !== null) {
			_writeStream.end();
			_writeStream = createWriteStream(telemetryPath, { flags: 'a' });
			_writeStream.on('error', () => {
				_disabled = true;
				_writeStream = null;
			});
		}
	} catch {
		// Rotation errors must be silent
	}
}

// ============================================================================
// Telemetry Convenience Object
// ============================================================================

export const telemetry = {
	sessionStarted(sessionId: string, agentName: string): void {
		emit('session_started', { sessionId, agentName });
	},

	sessionEnded(sessionId: string, reason: string): void {
		emit('session_ended', { sessionId, reason });
	},

	agentActivated(sessionId: string, agentName: string, oldName?: string): void {
		emit('agent_activated', { sessionId, agentName, oldName });
	},

	delegationBegin(sessionId: string, agentName: string, taskId: string): void {
		emit('delegation_begin', { sessionId, agentName, taskId });
	},

	delegationEnd(
		sessionId: string,
		agentName: string,
		taskId: string,
		result: string,
	): void {
		emit('delegation_end', { sessionId, agentName, taskId, result });
	},

	taskStateChanged(
		sessionId: string,
		taskId: string,
		newState: string,
		oldState?: string,
	): void {
		emit('task_state_changed', { sessionId, taskId, newState, oldState });
	},

	gatePassed(sessionId: string, gate: string, taskId: string): void {
		emit('gate_passed', { sessionId, gate, taskId });
	},

	gateFailed(
		sessionId: string,
		gate: string,
		taskId: string,
		reason: string,
	): void {
		emit('gate_failed', { sessionId, gate, taskId, reason });
	},

	phaseChanged(sessionId: string, oldPhase: number, newPhase: number): void {
		emit('phase_changed', { sessionId, oldPhase, newPhase });
	},

	budgetUpdated(sessionId: string, budgetPct: number, agentName: string): void {
		emit('budget_updated', { sessionId, budgetPct, agentName });
	},

	modelFallback(
		sessionId: string,
		agentName: string,
		fromModel: string,
		toModel: string,
		reason: string,
	): void {
		emit('model_fallback', {
			sessionId,
			agentName,
			fromModel,
			toModel,
			reason,
		});
	},

	hardLimitHit(
		sessionId: string,
		agentName: string,
		limitType: string,
		value: number,
	): void {
		emit('hard_limit_hit', { sessionId, agentName, limitType, value });
	},

	revisionLimitHit(sessionId: string, agentName: string): void {
		emit('revision_limit_hit', { sessionId, agentName });
	},

	loopDetected(sessionId: string, agentName: string, loopType: string): void {
		emit('loop_detected', { sessionId, agentName, loopType });
	},

	scopeViolation(
		sessionId: string,
		agentName: string,
		file: string,
		reason: string,
	): void {
		emit('scope_violation', { sessionId, agentName, file, reason });
	},

	qaSkipViolation(
		sessionId: string,
		agentName: string,
		skipCount: number,
	): void {
		emit('qa_skip_violation', { sessionId, agentName, skipCount });
	},

	heartbeat(sessionId: string): void {
		emit('heartbeat', { sessionId });
	},

	turboModeChanged(
		sessionId: string,
		enabled: boolean,
		agentName: string,
	): void {
		emit('turbo_mode_changed', { sessionId, enabled, agentName });
	},

	autoOversightEscalation(
		sessionId: string,
		reason: string,
		interactionCount: number,
		deadlockCount: number,
		phase?: number,
	): void {
		emit('auto_oversight_escalation', {
			sessionId,
			reason,
			interactionCount,
			deadlockCount,
			phase,
		});
	},

	environmentDetected(
		sessionId: string,
		hostOS: string,
		shellFamily: string,
		executionMode: string,
	): void {
		emit('environment_detected', {
			sessionId,
			hostOS,
			shellFamily,
			executionMode,
		});
	},
};
