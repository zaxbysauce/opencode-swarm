/**
 * Verification and adversarial tests for phase-monitor.ts curator integration.
 * Tests that the first-call guard correctly calls runCuratorInit when enabled,
 * and that errors from runCuratorInit do not block the hook.
 *
 * Uses dependency injection (curatorRunner parameter) instead of mock.module
 * for the curator module to avoid mock leakage when tests run in the same worker.
 * Uses real CuratorConfigSchema to avoid leaking into other test files.
 */

import { describe, it, expect, beforeEach, jest, mock } from 'bun:test';
import type { Plan } from '../../../src/config/plan-schema';
import type { PreflightTriggerManager } from '../../../src/background/trigger';
import type { CuratorConfig, CuratorInitResult } from '../../../src/hooks/curator-types';

// Mock loadPlan — scope-safe as loadPlan is not used by phase-complete or curator
mock.module('../../../src/plan/manager', () => ({
	loadPlan: jest.fn<(_directory: string) => Promise<Plan | null>>(),
}));

// Mock loadPluginConfigWithMeta — controls config returned to the hook
const mockLoadPluginConfigWithMeta = jest.fn<
	(_directory: string) => { config: { curator?: unknown } }
>();

mock.module('../../../src/config/index.js', () => ({
	loadPluginConfigWithMeta: mockLoadPluginConfigWithMeta,
}));

import { loadPlan } from '../../../src/plan/manager';
import { createPhaseMonitorHook } from '../../../src/hooks/phase-monitor';

const mockLoadPlan = loadPlan as jest.MockedFunction<typeof loadPlan>;

// Injected curator runner mock — does NOT use mock.module to avoid leakage
const mockRunCuratorInit = jest.fn<(_directory: string, _config: CuratorConfig) => Promise<CuratorInitResult>>();

// Mock the preflightManager
const mockCheckAndTrigger = jest.fn<
	(_phase: number, _completedTasks: number, _totalTasks: number) => Promise<boolean>
>();

const mockPreflightManager = {
	checkAndTrigger: mockCheckAndTrigger,
} as unknown as PreflightTriggerManager;

/** Default curator config for enabled tests — matches real schema defaults */
const CURATOR_ENABLED_CONFIG: CuratorConfig = {
	enabled: true,
	init_enabled: true,
	phase_enabled: true,
	max_summary_tokens: 2000,
	min_knowledge_confidence: 0.7,
	compliance_report: true,
	suppress_warnings: true,
	drift_inject_max_chars: 500,
};

// Test helper to create a mock Plan
function createMockPlan(currentPhaseId: number, phases: Array<{
	id: number;
	tasks: Array<{ status: string }>;
}>): Plan {
	return {
		schema_version: '1.0.0' as const,
		title: 'Test Plan',
		swarm: 'test-swarm',
		current_phase: currentPhaseId,
		phases: phases.map((p) => ({
			id: p.id,
			name: `Phase ${p.id}`,
			status: 'in_progress' as const,
			tasks: p.tasks as unknown as Plan['phases'][number]['tasks'],
		})),
	};
}

describe('createPhaseMonitorHook - Curator Integration', () => {
	const testDirectory = '/test/project';

	beforeEach(() => {
		mockLoadPlan.mockClear();
		mockCheckAndTrigger.mockClear();
		mockRunCuratorInit.mockClear();
		mockLoadPluginConfigWithMeta.mockClear();

		// Default: no curator config (disabled by real schema defaults)
		mockLoadPluginConfigWithMeta.mockReturnValue({ config: {} });
	});

	describe('Verification Tests', () => {
		it('1. Curator init skipped by default (enabled: false)', async () => {
			const plan = createMockPlan(1, [
				{ id: 1, tasks: [{ status: 'pending' }] },
			]);
			mockLoadPlan.mockResolvedValue(plan);

			const hook = createPhaseMonitorHook(testDirectory, mockPreflightManager, mockRunCuratorInit);
			await hook({}, {});

			// runCuratorInit should NOT be called because enabled defaults to false
			expect(mockRunCuratorInit).not.toHaveBeenCalled();
		});

		it('2. Curator init called on first invocation when enabled', async () => {
			// Pass enabled config through loadPluginConfigWithMeta
			mockLoadPluginConfigWithMeta.mockReturnValue({ config: { curator: { enabled: true } } });

			mockRunCuratorInit.mockResolvedValue({
				briefing: 'Test briefing',
				contradictions: [],
				knowledge_entries_reviewed: 0,
				prior_phases_covered: 0,
			});

			const plan = createMockPlan(1, [
				{ id: 1, tasks: [{ status: 'pending' }] },
			]);
			mockLoadPlan.mockResolvedValue(plan);

			const hook = createPhaseMonitorHook(testDirectory, mockPreflightManager, mockRunCuratorInit);
			await hook({}, {});

			// runCuratorInit SHOULD be called because enabled && init_enabled
			expect(mockRunCuratorInit).toHaveBeenCalledWith(testDirectory, expect.objectContaining({
				enabled: true,
				init_enabled: true,
			}));
		});

		it('3. Curator init error does not block hook', async () => {
			mockLoadPluginConfigWithMeta.mockReturnValue({ config: { curator: { enabled: true } } });

			// Make runCuratorInit throw
			mockRunCuratorInit.mockRejectedValue(new Error('Curator init failed!'));

			const plan = createMockPlan(1, [
				{ id: 1, tasks: [{ status: 'pending' }] },
			]);
			mockLoadPlan.mockResolvedValue(plan);

			const hook = createPhaseMonitorHook(testDirectory, mockPreflightManager, mockRunCuratorInit);

			// Should NOT throw - error should be caught internally
			const result = await hook({}, {});
			expect(result).toBeUndefined();

			// runCuratorInit was called and threw
			expect(mockRunCuratorInit).toHaveBeenCalled();
		});

		it('4. Hook still detects phase transitions after curator init', async () => {
			mockLoadPluginConfigWithMeta.mockReturnValue({ config: { curator: { enabled: true } } });

			mockRunCuratorInit.mockResolvedValue({
				briefing: 'Test briefing',
				contradictions: [],
				knowledge_entries_reviewed: 0,
				prior_phases_covered: 0,
			});

			// First call: phase 1
			const planPhase1 = createMockPlan(1, [
				{ id: 1, tasks: [{ status: 'pending' }] },
			]);
			mockLoadPlan.mockResolvedValue(planPhase1);

			const hook = createPhaseMonitorHook(testDirectory, mockPreflightManager, mockRunCuratorInit);

			// First invocation - curator init should be called
			await hook({}, {});
			expect(mockRunCuratorInit).toHaveBeenCalledTimes(1);

			mockLoadPlan.mockClear();
			mockCheckAndTrigger.mockClear();

			// Second call: phase changed to 2
			const planPhase2 = createMockPlan(2, [
				{ id: 1, tasks: [{ status: 'completed' }] },
				{ id: 2, tasks: [{ status: 'pending' }] },
			]);
			mockLoadPlan.mockResolvedValue(planPhase2);

			// Third invocation - should detect phase transition
			await hook({}, {});

			// checkAndTrigger should be called for phase transition
			expect(mockCheckAndTrigger).toHaveBeenCalledWith(2, 1, 1);
		});

		it('5. Curator init only called once (on first invocation)', async () => {
			mockLoadPluginConfigWithMeta.mockReturnValue({ config: { curator: { enabled: true } } });

			mockRunCuratorInit.mockResolvedValue({
				briefing: 'Test briefing',
				contradictions: [],
				knowledge_entries_reviewed: 0,
				prior_phases_covered: 0,
			});

			const plan = createMockPlan(1, [
				{ id: 1, tasks: [{ status: 'pending' }] },
			]);
			mockLoadPlan.mockResolvedValue(plan);

			const hook = createPhaseMonitorHook(testDirectory, mockPreflightManager, mockRunCuratorInit);

			// First invocation
			await hook({}, {});
			expect(mockRunCuratorInit).toHaveBeenCalledTimes(1);

			mockLoadPlan.mockClear();

			// Second invocation - different phase
			const planPhase2 = createMockPlan(2, [
				{ id: 1, tasks: [{ status: 'completed' }] },
				{ id: 2, tasks: [{ status: 'pending' }] },
			]);
			mockLoadPlan.mockResolvedValue(planPhase2);

			// Third invocation
			await hook({}, {});

			// runCuratorInit should NOT be called again - only on first invocation
			expect(mockRunCuratorInit).toHaveBeenCalledTimes(1);
		});
	});

	describe('Adversarial Tests', () => {
		it('6. runCuratorInit throws synchronously - hook does not throw', async () => {
			mockLoadPluginConfigWithMeta.mockReturnValue({ config: { curator: { enabled: true } } });

			// Make runCuratorInit throw synchronously
			mockRunCuratorInit.mockImplementation(() => {
				throw new Error('Synchronous curator init failure');
			});

			const plan = createMockPlan(1, [
				{ id: 1, tasks: [{ status: 'pending' }] },
			]);
			mockLoadPlan.mockResolvedValue(plan);

			const hook = createPhaseMonitorHook(testDirectory, mockPreflightManager, mockRunCuratorInit);

			// Should NOT throw - error should be caught internally
			const result = await hook({}, {});
			expect(result).toBeUndefined();
		});

		it('7. runCuratorInit rejects with a non-Error - hook handles gracefully', async () => {
			mockLoadPluginConfigWithMeta.mockReturnValue({ config: { curator: { enabled: true } } });

			// Make runCuratorInit reject with a string (non-Error)
			mockRunCuratorInit.mockRejectedValue('String rejection not an Error');

			const plan = createMockPlan(1, [
				{ id: 1, tasks: [{ status: 'pending' }] },
			]);
			mockLoadPlan.mockResolvedValue(plan);

			const hook = createPhaseMonitorHook(testDirectory, mockPreflightManager, mockRunCuratorInit);

			// Should NOT throw - error should be caught internally
			const result = await hook({}, {});
			expect(result).toBeUndefined();
		});

		it('8. runCuratorInit rejects with a number - hook handles gracefully', async () => {
			mockLoadPluginConfigWithMeta.mockReturnValue({ config: { curator: { enabled: true } } });

			// Make runCuratorInit reject with a number (non-Error)
			mockRunCuratorInit.mockRejectedValue(42);

			const plan = createMockPlan(1, [
				{ id: 1, tasks: [{ status: 'pending' }] },
			]);
			mockLoadPlan.mockResolvedValue(plan);

			const hook = createPhaseMonitorHook(testDirectory, mockPreflightManager, mockRunCuratorInit);

			// Should NOT throw - error should be caught internally
			const result = await hook({}, {});
			expect(result).toBeUndefined();
		});

		it('9. runCuratorInit rejects with null - hook handles gracefully', async () => {
			mockLoadPluginConfigWithMeta.mockReturnValue({ config: { curator: { enabled: true } } });

			// Make runCuratorInit reject with null
			mockRunCuratorInit.mockRejectedValue(null);

			const plan = createMockPlan(1, [
				{ id: 1, tasks: [{ status: 'pending' }] },
			]);
			mockLoadPlan.mockResolvedValue(plan);

			const hook = createPhaseMonitorHook(testDirectory, mockPreflightManager, mockRunCuratorInit);

			// Should NOT throw - error should be caught internally
			const result = await hook({}, {});
			expect(result).toBeUndefined();
		});

		it('10. loadPluginConfigWithMeta throws - hook handles gracefully', async () => {
			// Make loadPluginConfigWithMeta throw (simulates config load failure)
			mockLoadPluginConfigWithMeta.mockImplementation(() => {
				throw new Error('Config load error');
			});

			const plan = createMockPlan(1, [
				{ id: 1, tasks: [{ status: 'pending' }] },
			]);
			mockLoadPlan.mockResolvedValue(plan);

			const hook = createPhaseMonitorHook(testDirectory, mockPreflightManager, mockRunCuratorInit);

			// Should NOT throw - error should be caught internally
			const result = await hook({}, {});
			expect(result).toBeUndefined();

			// runCuratorInit should NOT be called due to config error
			expect(mockRunCuratorInit).not.toHaveBeenCalled();
		});
	});
});
