/**
 * Phase Monitor Hook
 *
 * Detects phase transitions by reading plan state on each system prompt transform.
 * When a phase change is detected, triggers preflight via PreflightTriggerManager.
 * Wrapped in safeHook — errors must never propagate.
 */

import type { PreflightTriggerManager } from '../background/trigger';
import { CuratorConfigSchema } from '../config/schema';
import { loadPlan } from '../plan/manager';
import { runCuratorInit } from './curator';
import { safeHook } from './utils';

/**
 * Creates a hook that monitors plan phase transitions and triggers preflight.
 *
 * @param directory - Project directory (where .swarm/ lives)
 * @param preflightManager - The PreflightTriggerManager to call on phase change
 * @returns A safeHook-wrapped system.transform handler
 */
export function createPhaseMonitorHook(
	directory: string,
	preflightManager: PreflightTriggerManager,
): (input: unknown, output: unknown) => Promise<void> {
	let lastKnownPhase: number | null = null;

	const handler = async (_input: unknown, _output: unknown): Promise<void> => {
		const plan = await loadPlan(directory);
		if (!plan) return;

		const currentPhase = plan.current_phase ?? 1;

		// First call: initialize without triggering
		if (lastKnownPhase === null) {
			lastKnownPhase = currentPhase;
			try {
				const { loadPluginConfigWithMeta } = await import('../config/index.js');
				const { config } = loadPluginConfigWithMeta(directory);
				const curatorConfig = CuratorConfigSchema.parse(config.curator ?? {});
				if (curatorConfig.enabled && curatorConfig.init_enabled) {
					await runCuratorInit(directory, curatorConfig);
				}
			} catch {
				// curator init failures must never propagate
			}
			return;
		}

		// Phase changed: trigger preflight
		if (currentPhase !== lastKnownPhase) {
			const previousPhase = lastKnownPhase;
			lastKnownPhase = currentPhase;

			// Count completed and total tasks for the previous phase
			const phase = plan.phases.find((p) => p.id === previousPhase);
			const completedTasks =
				phase?.tasks.filter((t) => t.status === 'completed').length ?? 0;
			const totalTasks = phase?.tasks.length ?? 0;

			await preflightManager.checkAndTrigger(
				currentPhase,
				completedTasks,
				totalTasks,
			);
		}
	};

	return safeHook(handler);
}
