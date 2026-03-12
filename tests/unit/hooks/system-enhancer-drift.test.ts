import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createSystemEnhancerHook } from '../../../src/hooks/system-enhancer';
import type { PluginConfig } from '../../../src/config';
import { resetSwarmState, swarmState } from '../../../src/state';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('v6.7 System Enhancer Decision Drift Detection', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'swarm-drift-test-'));
		resetSwarmState();
	});

	afterEach(async () => {
		try {
			await rm(tempDir, { recursive: true, force: true });
		} catch {}
	});

	async function createSwarmFiles(planContent: string, contextContent: string): Promise<void> {
		const swarmDir = join(tempDir, '.swarm');
		await mkdir(swarmDir, { recursive: true });
		await writeFile(join(swarmDir, 'plan.md'), planContent);
		await writeFile(join(swarmDir, 'context.md'), contextContent);
	}

	async function invokeHook(config: PluginConfig, sessionID?: string): Promise<string[]> {
		const hooks = createSystemEnhancerHook(config, tempDir);
		const transform = hooks['experimental.chat.system.transform'] as (
			input: { sessionID?: string },
			output: { system: string[] },
		) => Promise<void>;
		const input = { sessionID: sessionID ?? 'test-session' };
		const output = { system: ['Initial system prompt'] };
		await transform(input, output);
		return output.system;
	}

	const defaultConfig: PluginConfig = {
		max_iterations: 5,
		qa_retry_limit: 3,
		inject_phase_reminders: true,
	};

	// Helper to create complete automation capabilities
	const withCapabilities = (decisionDrift: boolean): PluginConfig['automation'] => ({
		mode: 'manual',
		capabilities: {
			plan_sync: false,
			phase_preflight: false,
			config_doctor_on_startup: false,
			config_doctor_autofix: false,
			evidence_auto_summaries: false,
			decision_drift_detection: decisionDrift,
		},
	});

	it('does not inject drift detection when feature flag is disabled', async () => {
		await createSwarmFiles(
			'# Plan\n\nPhase: 1\n\n## Phase 1: Setup [IN PROGRESS]\n- Task 1',
			'# Context\n\n## Decisions\n- Use TypeScript',
		);

		const config: PluginConfig = {
			...defaultConfig,
			automation: withCapabilities(false),
		};

		const systemOutput = await invokeHook(config);
		const driftContent = systemOutput.filter((s) => s.includes('DECISION DRIFT'));
		expect(driftContent).toHaveLength(0);
	});

	it('does not inject drift detection when not architect', async () => {
		await createSwarmFiles(
			'# Plan\n\nPhase: 1\n\n## Phase 1: Setup [IN PROGRESS]\n- Task 1',
			'# Context\n\n## Decisions\n- Use TypeScript',
		);

		const config: PluginConfig = {
			...defaultConfig,
			automation: withCapabilities(true),
		};

		// Set active agent to coder (not architect)
		swarmState.activeAgent.set('test-session', 'swarm_coder');

		const systemOutput = await invokeHook(config, 'test-session');
		const driftContent = systemOutput.filter((s) => s.includes('DECISION DRIFT'));
		expect(driftContent).toHaveLength(0);
	});

	it('injects drift detection when feature flag enabled and is architect', async () => {
		await createSwarmFiles(
			'# Plan\n\nPhase: 2\n\n## Phase 1: Setup [COMPLETE]\n- Task 1\n\n## Phase 2: Implementation [IN PROGRESS]\n- Task 2',
			'# Context\n\n## Decisions\n- Use TypeScript Phase 1',
		);

		const config: PluginConfig = {
			...defaultConfig,
			automation: withCapabilities(true),
		};

		// Set active agent to architect
		swarmState.activeAgent.set('test-session', 'swarm_architect');

		const systemOutput = await invokeHook(config, 'test-session');
		const driftContent = systemOutput.filter((s) => s.includes('DECISION DRIFT'));
		expect(driftContent.length).toBeGreaterThan(0);
		expect(driftContent[0]).toContain('stale');
	});

	it('injects drift detection when no active agent (architect default)', async () => {
		await createSwarmFiles(
			'# Plan\n\nPhase: 2\n\n## Phase 1: Setup [COMPLETE]\n- Task 1\n\n## Phase 2: Implementation [IN PROGRESS]\n- Task 2',
			'# Context\n\n## Decisions\n- Use TypeScript Phase 1',
		);

		const config: PluginConfig = {
			...defaultConfig,
			automation: withCapabilities(true),
		};

		// No active agent set - defaults to architect
		const systemOutput = await invokeHook(config, 'test-session');
		const driftContent = systemOutput.filter((s) => s.includes('DECISION DRIFT'));
		expect(driftContent.length).toBeGreaterThan(0);
	});

	it('does not inject when no drift detected', async () => {
		await createSwarmFiles(
			'# Plan\n\nPhase: 1\n\n## Phase 1: Setup [IN PROGRESS]\n- Task 1',
			'# Context\n\n## Decisions\n- ✅ Use TypeScript [confirmed]',
		);

		const config: PluginConfig = {
			...defaultConfig,
			automation: withCapabilities(true),
		};

		const systemOutput = await invokeHook(config);
		const driftContent = systemOutput.filter((s) => s.includes('DECISION DRIFT'));
		expect(driftContent).toHaveLength(0);
	});

	it('handles missing .swarm directory gracefully', async () => {
		// Don't create any swarm files
		const config: PluginConfig = {
			...defaultConfig,
			automation: withCapabilities(true),
		};

		const systemOutput = await invokeHook(config);
		// Should not crash, just not include drift
		const driftContent = systemOutput.filter((s) => s.includes('DECISION DRIFT'));
		expect(driftContent).toHaveLength(0);
	});
});
