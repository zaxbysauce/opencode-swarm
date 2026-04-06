/**
 * Background Automation Framework
 *
 * Provides infrastructure for v6.7 background-first automation:
 * - Typed event bus for internal automation events
 * - Lightweight in-process queue with priorities and retry metadata
 * - Worker lifecycle manager (start/stop/register handlers)
 * - Circuit breaker + loop protection primitives
 * - Phase-boundary trigger detection and preflight request plumbing
 * - Passive status artifact writer for GUI visibility
 *
 * Gated behind Task 5.2 automation feature flags and default-off behavior.
 */
export { CircuitBreaker, type CircuitBreakerConfig, type CircuitBreakerState, LoopProtection, } from './circuit-breaker';
export { type AutomationEvent, AutomationEventBus, type AutomationEventType, } from './event-bus';
export { createEvidenceSummaryIntegration, type EvidenceSummaryIntegrationConfig, type EvidenceSummaryTriggerEvent, type EvidenceSummaryTriggerPayload, } from './evidence-summary-integration';
export { type AutomationFrameworkConfig, BackgroundAutomationManager, createAutomationManager, } from './manager';
export { PlanSyncWorker, type PlanSyncWorkerOptions, type PlanSyncWorkerStatus, } from './plan-sync-worker';
export { AutomationQueue, type QueueItem, type QueuePriority, type RetryMetadata, } from './queue';
export { AutomationStatusArtifact, type AutomationStatusSnapshot, } from './status-artifact';
export { type PhaseBoundaryResult, PhaseBoundaryTrigger, type PreflightHandler, type PreflightRequest, type PreflightRequestPayload, type PreflightTriggerConfig, type PreflightTriggerEventType, PreflightTriggerManager, } from './trigger';
export { type WorkerHandler, WorkerManager, type WorkerRegistration, } from './worker';
