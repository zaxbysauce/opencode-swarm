/**
 * Phase-Boundary Preflight Trigger
 *
 * Detects phase-boundary conditions and triggers preflight requests.
 * Manages phase transitions and queues preflight checks via the automation event bus.
 */

import type { AutomationConfig } from '../config/schema';
import { log } from '../utils';
import { type AutomationEventBus, getGlobalEventBus } from './event-bus';
import { AutomationQueue } from './queue';

/** Event types for preflight triggers */
export type PreflightTriggerEventType =
	| 'preflight.requested'
	| 'preflight.triggered'
	| 'preflight.skipped'
	| 'phase.boundary.detected';

/** Preflight trigger payload */
export interface PreflightRequestPayload {
	triggerSource: 'phase_boundary' | 'manual' | 'scheduled';
	currentPhase: number;
	reason: string;
	metadata?: Record<string, unknown>;
}

/** Phase boundary detection result */
export interface PhaseBoundaryResult {
	detected: boolean;
	previousPhase: number;
	currentPhase: number;
	reason: string;
	completedTaskCount: number;
	totalTaskCount: number;
}

/** Preflight trigger configuration */
export interface PreflightTriggerConfig {
	/** Minimum tasks that must be completed in a phase to trigger */
	minCompletedTasksThreshold?: number;
	/** Enable trigger even if no tasks (phase auto-complete mode) */
	allowZeroTaskTrigger?: boolean;
	/** Directory to run preflight checks in */
	directory?: string;
}

/** Preflight handler type */
export type PreflightHandler = (request: PreflightRequest) => Promise<void>;

/** Preflight request queue item */
export interface PreflightRequest {
	id: string;
	triggeredAt: number;
	currentPhase: number;
	source: 'phase_boundary' | 'manual' | 'scheduled';
	reason: string;
	metadata?: Record<string, unknown>;
}

/** Phase boundary detection result */
export interface PhaseBoundaryResult {
	detected: boolean;
	previousPhase: number;
	currentPhase: number;
	reason: string;
	completedTaskCount: number;
	totalTaskCount: number;
}

/** Preflight trigger configuration */
export interface PreflightTriggerConfig {
	/** Minimum tasks that must be completed in a phase to trigger */
	minCompletedTasksThreshold?: number;
	/** Enable trigger even if no tasks (phase auto-complete mode) */
	allowZeroTaskTrigger?: boolean;
}

/**
 * Phase-Boundary Trigger Detector
 *
 * Monitors plan state to detect when a phase transition occurs.
 */
export class PhaseBoundaryTrigger {
	private readonly eventBus: AutomationEventBus;
	private readonly config: PreflightTriggerConfig;
	private lastKnownPhase: number = 0;
	private lastTriggeredPhase: number = 0;

	constructor(eventBus?: AutomationEventBus, config?: PreflightTriggerConfig) {
		this.eventBus = eventBus ?? getGlobalEventBus();
		this.config = {
			minCompletedTasksThreshold: config?.minCompletedTasksThreshold ?? 1,
			allowZeroTaskTrigger: config?.allowZeroTaskTrigger ?? false,
		};
	}

	/**
	 * Set the current phase from external source (plan)
	 */
	setCurrentPhase(phase: number): void {
		this.lastKnownPhase = phase;
	}

	/**
	 * Get the last known phase
	 */
	getCurrentPhase(): number {
		return this.lastKnownPhase;
	}

	/**
	 * Get the last triggered phase (for external access)
	 */
	get lastTriggeredPhaseValue(): number {
		return this.lastTriggeredPhase;
	}

	/**
	 * Check if a phase boundary has been crossed
	 * Returns the result of the detection
	 */
	detectBoundary(
		newPhase: number,
		completedTasks: number,
		totalTasks: number,
	): PhaseBoundaryResult {
		// If phase hasn't changed, no boundary
		if (newPhase === this.lastKnownPhase) {
			return {
				detected: false,
				previousPhase: this.lastKnownPhase,
				currentPhase: newPhase,
				reason: 'Phase unchanged',
				completedTaskCount: completedTasks,
				totalTaskCount: totalTasks,
			};
		}

		// Phase changed - this is a boundary
		const boundaryResult: PhaseBoundaryResult = {
			detected: true,
			previousPhase: this.lastKnownPhase,
			currentPhase: newPhase,
			reason: `Phase transition from ${this.lastKnownPhase} to ${newPhase}`,
			completedTaskCount: completedTasks,
			totalTaskCount: totalTasks,
		};

		// Update tracked phase
		this.lastKnownPhase = newPhase;

		// Publish phase boundary detected event
		this.eventBus.publish('phase.boundary.detected', boundaryResult);

		return boundaryResult;
	}

	/**
	 * Check if preflight should be triggered based on phase boundary
	 * Must be called AFTER phase boundary is detected
	 */
	shouldTriggerPreflight(boundaryResult: PhaseBoundaryResult): boolean {
		// Already triggered for this phase
		if (this.lastTriggeredPhase === boundaryResult.currentPhase) {
			log('[Trigger] Preflight already triggered for phase', {
				phase: boundaryResult.currentPhase,
			});
			return false;
		}

		// Check task completion threshold
		const threshold = this.config.minCompletedTasksThreshold ?? 1;
		const hasMinimumCompletion =
			this.config.allowZeroTaskTrigger ||
			boundaryResult.completedTaskCount >= threshold;

		if (!hasMinimumCompletion) {
			log('[Trigger] Preflight skipped - insufficient task completion', {
				completed: boundaryResult.completedTaskCount,
				required: threshold,
			});
			return false;
		}

		return true;
	}

	/**
	 * Mark that preflight was triggered for a phase
	 */
	markTriggered(phase: number): void {
		this.lastTriggeredPhase = phase;
	}

	/**
	 * Reset trigger state (for testing)
	 */
	reset(): void {
		this.lastKnownPhase = 0;
		this.lastTriggeredPhase = 0;
	}
}

/**
 * Preflight Trigger Manager
 *
 * Orchestrates trigger detection, feature flag gating, and request publishing.
 */
export class PreflightTriggerManager {
	private readonly automationConfig: AutomationConfig;
	private readonly eventBus: AutomationEventBus;
	private readonly trigger: PhaseBoundaryTrigger;
	private readonly requestQueue: AutomationQueue<PreflightRequest>;
	private requestCounter = 0;
	private preflightHandler: PreflightHandler | null = null;
	private unsubscribe: (() => void) | null = null;

	constructor(
		automationConfig: AutomationConfig,
		eventBus?: AutomationEventBus,
		triggerConfig?: PreflightTriggerConfig,
	) {
		this.automationConfig = automationConfig;
		this.eventBus = eventBus ?? getGlobalEventBus();
		this.trigger = new PhaseBoundaryTrigger(this.eventBus, triggerConfig);
		this.requestQueue = new AutomationQueue<PreflightRequest>({
			maxSize: 100,
			defaultMaxRetries: 3,
		});
	}

	/**
	 * Check if preflight triggers are enabled via feature flags
	 * Returns false if config is missing/invalid (fail-safe)
	 */
	isEnabled(): boolean {
		// Fail-safe: return false if config itself is missing/null
		if (!this.automationConfig) {
			return false;
		}

		// Fail-safe: return false if capabilities is missing/invalid
		if (!this.automationConfig.capabilities) {
			return false;
		}

		// Safe read: use optional chaining for mode to handle malformed config
		const mode = this.automationConfig.mode;
		if (mode === 'manual') {
			return false;
		}

		return this.automationConfig.capabilities.phase_preflight === true;
	}

	/**
	 * Get the automation mode
	 * Returns 'unknown' for malformed config (fail-safe)
	 */
	getMode(): string {
		// Fail-safe: return 'unknown' if config is missing/null/undefined
		if (!this.automationConfig) {
			return 'unknown';
		}

		// Return mode if present, otherwise 'unknown'
		return this.automationConfig.mode ?? 'unknown';
	}

	/**
	 * Update current phase from plan state
	 */
	updatePhase(phase: number): void {
		this.trigger.setCurrentPhase(phase);
	}

	/**
	 * Check for phase boundary and potentially trigger preflight
	 * Returns true if preflight was triggered
	 */
	async checkAndTrigger(
		currentPhase: number,
		completedTasks: number,
		totalTasks: number,
	): Promise<boolean> {
		// Check feature flags - use safe read to handle malformed config
		const phasePreflight = this.automationConfig?.capabilities?.phase_preflight;
		const mode = this.automationConfig?.mode;
		if (!this.isEnabled()) {
			log('[PreflightTrigger] Disabled via feature flags', {
				mode: mode ?? 'unknown',
				phase_preflight: phasePreflight,
			});
			await this.eventBus.publish('preflight.skipped', {
				reason: 'feature_disabled',
				mode: mode ?? 'unknown',
				phase_preflight: phasePreflight,
			});
			return false;
		}

		// Feature flag check done above - proceed to detection

		// Detect phase boundary (this also updates internal phase tracking)
		const boundaryResult = this.trigger.detectBoundary(
			currentPhase,
			completedTasks,
			totalTasks,
		);

		if (!boundaryResult.detected) {
			return false;
		}

		// Check if we should trigger preflight
		if (!this.trigger.shouldTriggerPreflight(boundaryResult)) {
			await this.eventBus.publish('preflight.skipped', {
				reason: 'threshold_not_met',
				boundary: boundaryResult,
			});
			return false;
		}

		// Trigger preflight request
		return this.triggerPreflight(boundaryResult);
	}

	/**
	 * Trigger a preflight request
	 */
	private async triggerPreflight(
		boundaryResult: PhaseBoundaryResult,
	): Promise<boolean> {
		const requestId = `preflight-${Date.now()}-${++this.requestCounter}`;

		const request: PreflightRequest = {
			id: requestId,
			triggeredAt: Date.now(),
			currentPhase: boundaryResult.currentPhase,
			source: 'phase_boundary',
			reason: boundaryResult.reason,
			metadata: {
				completedTaskCount: boundaryResult.completedTaskCount,
				totalTaskCount: boundaryResult.totalTaskCount,
			},
		};

		// Enqueue the request with overflow protection
		try {
			this.requestQueue.enqueue(request, 'high');
		} catch (error) {
			// Queue overflow - handle gracefully without crashing
			log('[PreflightTrigger] Queue overflow - request skipped', {
				requestId,
				phase: boundaryResult.currentPhase,
				error: error instanceof Error ? error.message : String(error),
			});

			// Publish failure event instead of crashing
			await this.eventBus.publish('preflight.skipped', {
				reason: 'queue_overflow',
				requestId,
				phase: boundaryResult.currentPhase,
			});
			return false;
		}

		// Mark as triggered
		this.trigger.markTriggered(boundaryResult.currentPhase);

		// Publish events
		await this.eventBus.publish('preflight.requested', request);
		await this.eventBus.publish('preflight.triggered', {
			requestId,
			phase: boundaryResult.currentPhase,
			timestamp: request.triggeredAt,
		});

		log('[PreflightTrigger] Preflight triggered', {
			requestId,
			phase: boundaryResult.currentPhase,
			completed: boundaryResult.completedTaskCount,
			total: boundaryResult.totalTaskCount,
		});

		return true;
	}

	/**
	 * Get pending preflight requests
	 */
	getPendingRequests(): PreflightRequest[] {
		return this.requestQueue.getAll().map((item) => item.payload);
	}

	/**
	 * Get queue size
	 */
	getQueueSize(): number {
		return this.requestQueue.size();
	}

	/**
	 * Get trigger stats
	 * All values are fail-safe for malformed config
	 */
	getStats(): {
		enabled: boolean;
		mode: string;
		currentPhase: number;
		lastTriggeredPhase: number;
		pendingRequests: number;
	} {
		// getMode() is now fail-safe, but wrap in try-catch for extra safety
		let mode = 'unknown';
		try {
			mode = this.getMode();
		} catch {
			// Fallback to 'unknown' if getMode() throws for any reason
			mode = 'unknown';
		}

		return {
			enabled: this.isEnabled(),
			mode,
			currentPhase: this.trigger.getCurrentPhase(),
			lastTriggeredPhase: this.trigger.lastTriggeredPhaseValue,
			pendingRequests: this.getQueueSize(),
		};
	}

	/**
	 * Reset state (for testing)
	 */
	reset(): void {
		this.trigger.reset();
		this.requestQueue.clear();
		if (this.unsubscribe) {
			this.unsubscribe();
			this.unsubscribe = null;
		}
	}

	/**
	 * Register a handler to be called when preflight is requested.
	 * The handler will be invoked with the preflight request details.
	 * Only one handler can be registered at a time.
	 */
	registerHandler(handler: PreflightHandler): void {
		// Unsubscribe from previous handler if exists
		if (this.unsubscribe) {
			this.unsubscribe();
		}

		this.preflightHandler = handler;

		// Default handler timeout (2 minutes)
		const HANDLER_TIMEOUT_MS = 120_000;

		// Subscribe to preflight.requested events
		this.unsubscribe = this.eventBus.subscribe(
			'preflight.requested',
			async (event) => {
				if (this.preflightHandler) {
					const request = event.payload as PreflightRequest;
					let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
					try {
						// Wrap handler execution with timeout guard
						await Promise.race([
							this.preflightHandler(request),
							new Promise<never>((_, reject) => {
								timeoutHandle = setTimeout(() => {
									reject(
										new Error(
											`Preflight handler timed out after ${HANDLER_TIMEOUT_MS}ms`,
										),
									);
								}, HANDLER_TIMEOUT_MS);
							}),
						]);
					} catch (error) {
						// Log error without exposing sensitive details
						log('[PreflightTrigger] Handler error', {
							requestId: request.id,
							phase: request.currentPhase,
							// Error message may contain sensitive info, don't log it
							errorType: error instanceof Error ? error.name : 'unknown',
						});
					} finally {
						clearTimeout(timeoutHandle);
					}
				}
			},
		);

		log('[PreflightTrigger] Handler registered');
	}

	/**
	 * Unregister the preflight handler
	 */
	unregisterHandler(): void {
		if (this.unsubscribe) {
			this.unsubscribe();
			this.unsubscribe = null;
		}
		this.preflightHandler = null;
		log('[PreflightTrigger] Handler unregistered');
	}

	/**
	 * Check if a handler is registered
	 */
	hasHandler(): boolean {
		return this.preflightHandler !== null;
	}
}
