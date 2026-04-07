/**
 * Phase Monitor Hook
 *
 * Detects phase transitions by reading plan state on each system prompt transform.
 * When a phase change is detected, triggers preflight via PreflightTriggerManager.
 * Wrapped in safeHook — errors must never propagate.
 */
import type { PreflightTriggerManager } from '../background/trigger';
import { type CuratorLLMDelegate } from './curator';
import type { CuratorConfig, CuratorInitResult } from './curator-types';
/** Injectable curator runner type — allows test injection without module mocking. */
export type CuratorInitRunner = (directory: string, config: CuratorConfig, llmDelegate?: CuratorLLMDelegate) => Promise<CuratorInitResult>;
/** Factory that creates a CuratorLLMDelegate for a given session — enables session-aware resolution. */
export type CuratorDelegateFactory = (sessionId?: string) => CuratorLLMDelegate | undefined;
/**
 * Creates a hook that monitors plan phase transitions and triggers preflight.
 *
 * @param directory - Project directory (where .swarm/ lives)
 * @param preflightManager - Optional PreflightTriggerManager to call on phase change.
 *   When undefined, preflight checks are skipped but curator initialization still runs
 *   at session start (useful when knowledge.enabled but phase_preflight is disabled).
 * @param curatorRunner - Optional curator init runner (defaults to runCuratorInit; injectable for tests)
 * @param delegateFactory - Optional factory that creates a CuratorLLMDelegate for the calling session.
 *   Called lazily at hook invocation time with the session ID extracted from the hook input,
 *   enabling correct multi-swarm curator resolution. For test injection of a pre-built delegate,
 *   pass `() => myDelegate`.
 * @returns A safeHook-wrapped system.transform handler
 */
export declare function createPhaseMonitorHook(directory: string, preflightManager?: PreflightTriggerManager, curatorRunner?: CuratorInitRunner, delegateFactory?: CuratorDelegateFactory): (input: unknown, output: unknown) => Promise<void>;
