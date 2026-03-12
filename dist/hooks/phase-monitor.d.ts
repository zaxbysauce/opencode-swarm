/**
 * Phase Monitor Hook
 *
 * Detects phase transitions by reading plan state on each system prompt transform.
 * When a phase change is detected, triggers preflight via PreflightTriggerManager.
 * Wrapped in safeHook — errors must never propagate.
 */
import type { PreflightTriggerManager } from '../background/trigger';
import type { CuratorConfig, CuratorInitResult } from './curator-types';
/** Injectable curator runner type — allows test injection without module mocking. */
export type CuratorInitRunner = (directory: string, config: CuratorConfig) => Promise<CuratorInitResult>;
/**
 * Creates a hook that monitors plan phase transitions and triggers preflight.
 *
 * @param directory - Project directory (where .swarm/ lives)
 * @param preflightManager - The PreflightTriggerManager to call on phase change
 * @param curatorRunner - Optional curator init runner (defaults to runCuratorInit; injectable for tests)
 * @returns A safeHook-wrapped system.transform handler
 */
export declare function createPhaseMonitorHook(directory: string, preflightManager?: PreflightTriggerManager, curatorRunner?: CuratorInitRunner): (input: unknown, output: unknown) => Promise<void>;
