/**
 * System Enhancer Hook
 *
 * Enhances the system prompt with current phase information from the plan
 * and cross-agent context from the activity log.
 * Reads plan.md and injects phase context into the system prompt.
 */
import type { PluginConfig } from '../config';
/**
 * Build a retrospective injection string for the architect system message.
 * Tier 1: direct phase-scoped lookup for same-plan previous phase.
 * Tier 2: cross-project historical lessons (Phase 1 only).
 * Returns null if no valid retrospective found.
 */
export declare function buildRetroInjection(directory: string, currentPhaseNumber: number, currentPlanTitle?: string): Promise<string | null>;
/**
 * Creates the experimental.chat.system.transform hook for system enhancement.
 */
export declare function createSystemEnhancerHook(config: PluginConfig, directory: string): Record<string, unknown>;
/**
 * Architect operational mode derived from plan state.
 */
export type ArchitectMode = 'DISCOVER' | 'PLAN' | 'EXECUTE' | 'PHASE-WRAP' | 'UNKNOWN';
/**
 * Detect the current architect operational mode based on plan state.
 *
 * @param directory - The project directory to check
 * @returns The current architect mode based on plan state
 */
export declare function detectArchitectMode(directory: string): Promise<ArchitectMode>;
