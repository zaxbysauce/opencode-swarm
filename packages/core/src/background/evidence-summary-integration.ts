/**
 * Evidence Summary Background Integration
 *
 * Wires the evidence summary service to background automation:
 * - Subscribes to preflight and phase boundary events
 * - Generates evidence summaries automatically
 * - Persists artifacts under .swarm/ for GUI consumption
 * - Respects feature flags (evidence_auto_summaries) with default-off safety
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import {
	type AutomationEventBus,
	type AutomationEventType,
	getGlobalEventBus,
} from '../background/event-bus';
import type { AutomationConfig } from '../config/schema';
import {
	buildEvidenceSummary,
	type EvidenceSummaryArtifact,
	isAutoSummaryEnabled,
} from '../services/evidence-summary-service';
import { log } from '../utils';

/** Evidence summary integration configuration */
export interface EvidenceSummaryIntegrationConfig {
	/** Automation configuration for feature flag gating */
	automationConfig: AutomationConfig;
	/** Directory to run evidence analysis in */
	directory: string;
	/** Swarm directory for persisting summary artifacts */
	swarmDir: string;
	/** Filename for the summary artifact (default: evidence-summary.json) */
	summaryFilename?: string;
}

/** Event types that can trigger evidence summary generation */
export type EvidenceSummaryTriggerEvent =
	| 'preflight.completed'
	| 'phase.boundary.detected'
	| 'phase.status.checked'
	| 'task.completed';

/** Payload for evidence summary trigger events */
export interface EvidenceSummaryTriggerPayload {
	trigger: EvidenceSummaryTriggerEvent;
	phase: number;
	reason: string;
	metadata?: Record<string, unknown>;
}

/**
 * Persist evidence summary artifact to disk
 */
function persistSummary(
	swarmDir: string,
	artifact: EvidenceSummaryArtifact,
	filename: string,
): string {
	// Ensure .swarm directory exists
	const swarmPath = path.join(swarmDir, '.swarm');
	if (!existsSync(swarmPath)) {
		mkdirSync(swarmPath, { recursive: true });
	}

	// Write artifact
	const artifactPath = path.join(swarmPath, filename);
	const content = JSON.stringify(artifact, null, 2);
	writeFileSync(artifactPath, content, 'utf-8');

	log('[EvidenceSummaryIntegration] Summary persisted', {
		path: artifactPath,
		size: content.length,
	});

	return artifactPath;
}

/**
 * Evidence Summary Integration
 *
 * Automatically generates and persists evidence summaries on relevant events.
 */
export class EvidenceSummaryIntegration {
	private readonly config: EvidenceSummaryIntegrationConfig;
	private readonly eventBus: AutomationEventBus;
	private unsubscribes: Array<() => void> = [];

	constructor(config: EvidenceSummaryIntegrationConfig) {
		this.config = config;
		this.eventBus = getGlobalEventBus();
	}

	/**
	 * Check if auto-summaries are enabled
	 */
	isEnabled(): boolean {
		return isAutoSummaryEnabled(this.config.automationConfig);
	}

	/**
	 * Initialize the integration by subscribing to trigger events
	 * Only subscribes if enabled via feature flags
	 */
	initialize(): void {
		if (!this.isEnabled()) {
			log(
				'[EvidenceSummaryIntegration] Disabled via feature flags (evidence_auto_summaries=false or mode=manual)',
			);
			return;
		}

		log('[EvidenceSummaryIntegration] Initializing...');

		// Subscribe to preflight completion
		this.subscribeToEvent('preflight.completed', async (event) => {
			const payload = event.payload as { phase?: number };
			const phase = payload?.phase ?? 1;
			await this.generateSummary(phase, 'preflight.completed');
		});

		// Subscribe to phase boundary detection
		this.subscribeToEvent('phase.boundary.detected', async (event) => {
			const payload = event.payload as { currentPhase?: number };
			const phase = payload?.currentPhase ?? 1;
			await this.generateSummary(phase, 'phase.boundary.detected');
		});

		log('[EvidenceSummaryIntegration] Initialized and subscribed to events');
	}

	/**
	 * Subscribe to an event type
	 */
	private subscribeToEvent(
		type: AutomationEventType,
		handler: (event: { payload: unknown }) => void | Promise<void>,
	): void {
		const unsubscribe = this.eventBus.subscribe(type, handler);
		this.unsubscribes.push(unsubscribe);
	}

	/**
	 * Generate and persist evidence summary
	 */
	async generateSummary(
		phase: number,
		trigger: EvidenceSummaryTriggerEvent,
	): Promise<EvidenceSummaryArtifact | null> {
		log('[EvidenceSummaryIntegration] Generating summary', {
			phase,
			trigger,
			directory: this.config.directory,
		});

		try {
			const artifact = await buildEvidenceSummary(this.config.directory, phase);

			if (!artifact) {
				log('[EvidenceSummaryIntegration] No plan found, skipping');
				return null;
			}

			// Persist to disk
			const filename = this.config.summaryFilename ?? 'evidence-summary.json';
			const artifactPath = persistSummary(
				this.config.swarmDir,
				artifact,
				filename,
			);

			log('[EvidenceSummaryIntegration] Summary generated and persisted', {
				path: artifactPath,
				completionRatio: artifact.overallCompletionRatio,
				blockers: artifact.overallBlockers.length,
			});

			// Publish completion event
			await this.eventBus.publish('evidence.summary.generated', {
				trigger,
				phase,
				artifactPath,
				completionRatio: artifact.overallCompletionRatio,
				blockerCount: artifact.overallBlockers.length,
				timestamp: Date.now(),
			});

			return artifact;
		} catch (error) {
			log('[EvidenceSummaryIntegration] Error generating summary', {
				error: error instanceof Error ? error.message : String(error),
			});

			// Publish error event
			await this.eventBus.publish('evidence.summary.error', {
				trigger,
				phase,
				error: error instanceof Error ? error.message : String(error),
				timestamp: Date.now(),
			});

			return null;
		}
	}

	/**
	 * Manually trigger summary generation (for CLI or testing)
	 */
	async triggerManual(phase?: number): Promise<EvidenceSummaryArtifact | null> {
		const isDisabled = !this.isEnabled();
		if (isDisabled) {
			log(
				'[EvidenceSummaryIntegration] Manual trigger with feature disabled - generating anyway for CLI use',
			);
		}

		log('[EvidenceSummaryIntegration] Manual trigger', { phase, isDisabled });
		return this.generateSummary(phase ?? 1, 'preflight.completed');
	}

	/**
	 * Cleanup subscriptions
	 */
	cleanup(): void {
		for (const unsubscribe of this.unsubscribes) {
			unsubscribe();
		}
		this.unsubscribes = [];
		log('[EvidenceSummaryIntegration] Cleanup complete');
	}
}

/**
 * Create evidence summary integration
 *
 * Factory function that creates and optionally initializes the integration.
 */
export function createEvidenceSummaryIntegration(
	config: EvidenceSummaryIntegrationConfig,
	autoInitialize = true,
): EvidenceSummaryIntegration {
	const integration = new EvidenceSummaryIntegration(config);

	if (autoInitialize) {
		integration.initialize();
	}

	return integration;
}
