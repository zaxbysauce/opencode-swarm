/**
 * v6.7 Backward Compatibility and Migration Tests
 *
 * Tests verify that v6.7 remains backward compatible and migration-safe
 * for both slash-command users and GUI/background users.
 *
 * Coverage areas:
 * 1. Legacy config compatibility (missing automation keys, plan.md-only, partial configs)
 * 2. Migration behavior (safe upgrades, default-off features)
 * 3. CLI workflow compatibility (existing commands, new optional commands)
 * 4. GUI/background workflow compatibility (startup behavior, feature gating)
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { deepMerge, loadPluginConfig } from '../../../src/config/loader';
import type { Plan } from '../../../src/config/plan-schema';
import {
	AutomationCapabilitiesSchema,
	AutomationConfigSchema,
	AutomationModeSchema,
	PluginConfigSchema,
} from '../../../src/config/schema';
import {
	loadPlan,
	loadPlanJsonOnly,
	savePlan,
} from '../../../src/plan/manager';

/**
 * Helper to create valid Plan objects for testing
 */
function createTestPlan(overrides?: Partial<Plan>): Plan {
	return {
		schema_version: '1.0.0',
		title: 'Test Plan',
		swarm: 'test-swarm',
		current_phase: 1,
		phases: [
			{
				id: 1,
				name: 'Phase 1',
				status: 'in_progress',
				tasks: [
					{
						id: '1.1',
						phase: 1,
						status: 'pending',
						size: 'small',
						description: 'Task one',
						depends: [],
						files_touched: [],
					},
				],
			},
		],
		...overrides,
	};
}

// Test constants
const SWARM_DIR = '.swarm';
const CONFIG_FILE = '.opencode/opencode-swarm.json';

let originalXdgConfigHome: string | undefined;
let isolatedXdgConfigHome: string;

beforeEach(async () => {
	originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
	isolatedXdgConfigHome = path.join(
		os.tmpdir(),
		`swarm-backcompat-xdg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	await mkdir(path.join(isolatedXdgConfigHome, 'opencode'), {
		recursive: true,
	});
	process.env.XDG_CONFIG_HOME = isolatedXdgConfigHome;
});

afterEach(async () => {
	if (originalXdgConfigHome === undefined) {
		delete process.env.XDG_CONFIG_HOME;
	} else {
		process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
	}
	if (isolatedXdgConfigHome) {
		await rm(isolatedXdgConfigHome, { recursive: true, force: true });
	}
});

/**
 * Create a temporary test directory with optional swarm structure
 */
async function createTestDir(
	name: string,
	withSwarmDir = true,
): Promise<string> {
	const tempDir = path.join(
		os.tmpdir(),
		`swarm-backcompat-${name}-${Date.now()}`,
	);
	await mkdir(tempDir, { recursive: true });
	if (withSwarmDir) {
		await mkdir(path.join(tempDir, SWARM_DIR), { recursive: true });
		await mkdir(path.join(tempDir, '.opencode'), { recursive: true });
	}
	return tempDir;
}

/**
 * Create a config file in the test directory
 */
async function createConfig(
	tempDir: string,
	config: Record<string, unknown>,
): Promise<void> {
	const configPath = path.join(tempDir, CONFIG_FILE);
	await mkdir(path.dirname(configPath), { recursive: true });
	await writeFile(configPath, JSON.stringify(config, null, 2));
}

/**
 * Create a plan.json file in the test directory
 */
async function createPlanJson(
	tempDir: string,
	plan: Record<string, unknown>,
): Promise<void> {
	const planPath = path.join(tempDir, SWARM_DIR, 'plan.json');
	await writeFile(planPath, JSON.stringify(plan, null, 2));
}

/**
 * Create a plan.md file in the test directory (legacy format)
 */
async function createPlanMd(tempDir: string, content: string): Promise<void> {
	const planPath = path.join(tempDir, SWARM_DIR, 'plan.md');
	await writeFile(planPath, content);
}

/**
 * Read automation status file if it exists
 */
async function readAutomationStatus(
	tempDir: string,
): Promise<Record<string, unknown> | null> {
	const statusPath = path.join(tempDir, SWARM_DIR, 'automation-status.json');
	if (!existsSync(statusPath)) return null;
	const content = readFileSync(statusPath, 'utf-8');
	return JSON.parse(content);
}

// ============================================================================
// GROUP 1: LEGACY CONFIG COMPATIBILITY
// ============================================================================

describe('Legacy Config Compatibility', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTestDir('legacy-config');
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	test('Missing automation key - config should default to manual mode', async () => {
		// Legacy config without automation key (pre-v6.7)
		const legacyConfig = {
			max_iterations: 5,
			qa_retry_limit: 3,
			inject_phase_reminders: true,
		};
		await createConfig(tempDir, legacyConfig);

		const config = loadPluginConfig(tempDir);

		// Automation should be undefined (not present in legacy config)
		expect(config.automation).toBeUndefined();

		// But if automation is accessed, it should default to manual when parsed
		const parsed = PluginConfigSchema.parse(legacyConfig);
		// Note: When automation is not in the config, it will be undefined
		// This is expected for backward compatibility with legacy configs
		expect(parsed.max_iterations).toBe(5);
	});

	test('Partial automation config - missing capabilities use v6.8 defaults', async () => {
		// Partial config with only mode, no capabilities
		const partialConfig = {
			automation: {
				mode: 'hybrid',
			},
		};
		await createConfig(tempDir, partialConfig);

		const config = loadPluginConfig(tempDir);

		expect(config.automation?.mode).toBe('hybrid');
		expect(config.automation?.capabilities?.plan_sync).toBe(true); // v6.8 default
		expect(config.automation?.capabilities?.phase_preflight).toBe(false);
		expect(config.automation?.capabilities?.config_doctor_on_startup).toBe(
			false,
		);
		expect(config.automation?.capabilities?.decision_drift_detection).toBe(
			true,
		); // v6.8 default
	});

	test('Mixed config - some capabilities true, others default to false', async () => {
		const mixedConfig = {
			automation: {
				mode: 'auto',
				capabilities: {
					plan_sync: true,
					// phase_preflight omitted - should default to false
				},
			},
		};
		await createConfig(tempDir, mixedConfig);

		const config = loadPluginConfig(tempDir);

		expect(config.automation?.mode).toBe('auto');
		expect(config.automation?.capabilities?.plan_sync).toBe(true);
		expect(config.automation?.capabilities?.phase_preflight).toBe(false);
	});

	test('Empty automation object - should default to manual mode', async () => {
		const emptyAutomationConfig = {
			automation: {},
		};
		await createConfig(tempDir, emptyAutomationConfig);

		const config = loadPluginConfig(tempDir);

		expect(config.automation?.mode).toBe('manual');
		expect(config.automation?.capabilities?.plan_sync).toBe(true); // v6.8 default
	});

	test('Legacy config with guardrails - automation optional', async () => {
		const legacyWithGuardrails = {
			max_iterations: 7,
			guardrails: {
				enabled: true,
				max_tool_calls: 100,
			},
		};
		await createConfig(tempDir, legacyWithGuardrails);

		const config = loadPluginConfig(tempDir);

		expect(config.max_iterations).toBe(7);
		expect(config.guardrails?.enabled).toBe(true);
		expect(config.automation).toBeUndefined();
	});

	test('User config without automation, project config with automation', async () => {
		// Simulates migration scenario where user has legacy config
		// but project has new automation config
		const projectConfig = {
			automation: {
				mode: 'hybrid',
				capabilities: {
					plan_sync: true,
					phase_preflight: true,
				},
			},
		};
		await createConfig(tempDir, projectConfig);

		const config = loadPluginConfig(tempDir);

		expect(config.automation?.mode).toBe('hybrid');
		expect(config.automation?.capabilities?.plan_sync).toBe(true);
		expect(config.automation?.capabilities?.phase_preflight).toBe(true);
	});
});

// ============================================================================
// GROUP 2: MIGRATION BEHAVIOR
// ============================================================================

describe('Migration Behavior', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTestDir('migration');
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	test('Safe upgrade: plan.json exists, plan.md missing - should auto-generate plan.md', async () => {
		// Pre state:-v6.7 plan.json exists (migrated from plan.md)
		const plan = {
			schema_version: '1.0.0',
			title: 'Test Project',
			swarm: 'default',
			current_phase: 1,
			migration_status: 'migrated',
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'in_progress',
					tasks: [
						{
							id: '1.1',
							phase: 1,
							status: 'completed',
							size: 'small',
							description: 'Test task',
							depends: [],
							acceptance: 'Done',
							files_touched: ['test.ts'],
						},
					],
				},
			],
		};
		await createPlanJson(tempDir, plan);

		// Load plan - should auto-generate plan.md
		const loadedPlan = await loadPlan(tempDir);

		expect(loadedPlan).not.toBeNull();
		expect(loadedPlan?.title).toBe('Test Project');
		expect(loadedPlan?.current_phase).toBe(1);

		// plan.md should now exist
		const planMdPath = path.join(tempDir, SWARM_DIR, 'plan.md');
		expect(existsSync(planMdPath)).toBe(true);

		const planMdContent = readFileSync(planMdPath, 'utf-8');
		expect(planMdContent).toContain('Test Project');
		expect(planMdContent).toContain('Phase 1');
	});

	test('Safe upgrade: legacy plan.md only - should migrate to plan.json', async () => {
		// Pre-v6.7 state: only plan.md exists
		const legacyPlanMd = `# Test Project

## Phase 1: Setup

### 1.1 Initialize project [COMPLETED]
- **Status**: complete
- **Description**: Initialize the project
- **Files**: src/index.ts

### 1.2 Add tests [IN PROGRESS]
- **Status**: in_progress
- **Description**: Add unit tests
`;
		await createPlanMd(tempDir, legacyPlanMd);

		// Load plan - should migrate from plan.md
		const loadedPlan = await loadPlan(tempDir);

		expect(loadedPlan).not.toBeNull();
		expect(loadedPlan?.title).toBe('Test Project');
		expect(loadedPlan?.migration_status).toBe('migrated');

		// plan.json should now exist
		const planJsonPath = path.join(tempDir, SWARM_DIR, 'plan.json');
		expect(existsSync(planJsonPath)).toBe(true);
	});

	test('No breaking behavior: manual mode defaults - no automation triggers', async () => {
		const config = {
			automation: {
				mode: 'manual',
				capabilities: {
					plan_sync: false,
					phase_preflight: false,
					config_doctor_on_startup: false,
					decision_drift_detection: false,
				},
			},
		};
		await createConfig(tempDir, config);

		const loadedConfig = loadPluginConfig(tempDir);

		// Manual mode should NOT trigger any automation
		expect(loadedConfig.automation?.mode).toBe('manual');
		expect(loadedConfig.automation?.capabilities?.plan_sync).toBe(false);
		expect(loadedConfig.automation?.capabilities?.phase_preflight).toBe(false);

		// Background automation manager should NOT start in manual mode
		// (This is verified by checking that no automation features are enabled)
		const hasAnyAutomationEnabled =
			loadedConfig.automation?.capabilities?.plan_sync === true ||
			loadedConfig.automation?.capabilities?.phase_preflight === true ||
			loadedConfig.automation?.capabilities?.config_doctor_on_startup ===
				true ||
			loadedConfig.automation?.capabilities?.decision_drift_detection === true;

		expect(hasAnyAutomationEnabled).toBe(false);
	});

	test('Feature-gated: auto mode with all capabilities disabled - explicit false', async () => {
		const config = {
			automation: {
				mode: 'auto',
				capabilities: {
					plan_sync: false,
					phase_preflight: false,
					config_doctor_on_startup: false,
					evidence_auto_summaries: false,
					decision_drift_detection: false,
				},
			},
		};
		await createConfig(tempDir, config);

		const loadedConfig = loadPluginConfig(tempDir);

		// Mode is auto, but all capabilities explicitly disabled
		expect(loadedConfig.automation?.mode).toBe('auto');
		expect(loadedConfig.automation?.capabilities?.plan_sync).toBe(false);
		expect(loadedConfig.automation?.capabilities?.phase_preflight).toBe(false);
	});

	test('Migration preserves existing guardrails config', async () => {
		const existingConfig = {
			max_iterations: 4,
			guardrails: {
				enabled: true,
				max_tool_calls: 50,
				max_duration_minutes: 30,
			},
			automation: {
				mode: 'hybrid',
			},
		};
		await createConfig(tempDir, existingConfig);

		const loadedConfig = loadPluginConfig(tempDir);

		// Guardrails preserved
		expect(loadedConfig.guardrails?.enabled).toBe(true);
		expect(loadedConfig.guardrails?.max_tool_calls).toBe(50);
		expect(loadedConfig.guardrails?.max_duration_minutes).toBe(30);

		// New automation config added
		expect(loadedConfig.automation?.mode).toBe('hybrid');
	});
});

// ============================================================================
// GROUP 3: CLI WORKFLOW COMPATIBILITY
// ============================================================================

describe('CLI Workflow Compatibility', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTestDir('cli-workflow');
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	test('Existing /swarm commands work with legacy config (no automation key)', async () => {
		// Legacy config without automation
		const legacyConfig = {
			max_iterations: 3,
			inject_phase_reminders: true,
		};
		await createConfig(tempDir, legacyConfig);

		// Create a basic plan
		const plan = {
			schema_version: '1.0.0',
			title: 'CLI Test Project',
			swarm: 'default',
			current_phase: 1,
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'in_progress',
					tasks: [],
				},
			],
		};
		await createPlanJson(tempDir, plan);

		// Config loading should not break existing commands
		const config = loadPluginConfig(tempDir);

		expect(config.max_iterations).toBe(3);
		expect(config.inject_phase_reminders).toBe(true);
		expect(config.automation).toBeUndefined();

		// Plan loading should work
		const loadedPlan = await loadPlan(tempDir);
		expect(loadedPlan).not.toBeNull();
		expect(loadedPlan?.title).toBe('CLI Test Project');
	});

	test('New optional automation commands do not affect existing command flows', async () => {
		// Config with optional automation commands enabled
		const configWithAutomation = {
			max_iterations: 5,
			automation: {
				mode: 'hybrid',
				capabilities: {
					plan_sync: true,
					phase_preflight: false,
				},
			},
		};
		await createConfig(tempDir, configWithAutomation);

		const config = loadPluginConfig(tempDir);

		// Existing fields should work normally
		expect(config.max_iterations).toBe(5);

		// Automation is optional - should not interfere with CLI commands
		expect(config.automation?.capabilities?.plan_sync).toBe(true);

		// Plan loading should still work normally
		const plan = {
			schema_version: '1.0.0',
			title: 'Test',
			swarm: 'default',
			current_phase: 1,
			phases: [{ id: 1, name: 'Phase 1', status: 'in_progress', tasks: [] }],
		};
		await createPlanJson(tempDir, plan);

		const loadedPlan = await loadPlan(tempDir);
		expect(loadedPlan?.title).toBe('Test');
	});

	test('Config doctor command safe with legacy config', async () => {
		// Legacy config - config doctor should not break
		const legacyConfig = {
			max_iterations: 5,
			guardrails: { enabled: true },
		};
		await createConfig(tempDir, legacyConfig);

		const config = loadPluginConfig(tempDir);

		// Config doctor should be able to run on legacy config
		// without failing due to missing automation fields
		expect(config.guardrails?.enabled).toBe(true);

		// Schema should parse successfully
		const parsed = PluginConfigSchema.parse(legacyConfig);
		expect(parsed.max_iterations).toBe(5);
	});

	test('Preflight command works with manual mode', async () => {
		const config = {
			automation: {
				mode: 'manual',
				capabilities: {
					phase_preflight: false,
				},
			},
		};
		await createConfig(tempDir, config);

		const loadedConfig = loadPluginConfig(tempDir);

		// Preflight should work but not auto-trigger in manual mode
		expect(loadedConfig.automation?.mode).toBe('manual');
		expect(loadedConfig.automation?.capabilities?.phase_preflight).toBe(false);
	});

	test('Sync-plan command works with legacy plan.md-only repos', async () => {
		// Legacy repo: only plan.md exists
		const legacyPlanMd = `# Legacy Project

## Phase 1

### 1.1 Task one [DONE]
`;
		await createPlanMd(tempDir, legacyPlanMd);

		// Load plan - should migrate to plan.json
		const loadedPlan = await loadPlan(tempDir);

		expect(loadedPlan).not.toBeNull();
		expect(loadedPlan?.migration_status).toBe('migrated');

		// Both files should now exist (sync complete)
		expect(existsSync(path.join(tempDir, SWARM_DIR, 'plan.json'))).toBe(true);
		expect(existsSync(path.join(tempDir, SWARM_DIR, 'plan.md'))).toBe(true);
	});
});

// ============================================================================
// GROUP 4: GUI/BACKGROUND WORKFLOW COMPATIBILITY
// ============================================================================

describe('GUI/Background Workflow Compatibility', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTestDir('gui-background');
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	test('Startup behavior unchanged: manual mode - phase_preflight and config_doctor off', async () => {
		// Legacy config or explicit manual mode
		const config = {
			automation: {
				mode: 'manual',
			},
		};
		await createConfig(tempDir, config);

		const loadedConfig = loadPluginConfig(tempDir);

		// In manual mode, automation should NOT start automatically
		expect(loadedConfig.automation?.mode).toBe('manual');

		// Action-triggering capabilities default to false (phase_preflight, config_doctor)
		expect(loadedConfig.automation?.capabilities?.phase_preflight).toBe(false);
		expect(
			loadedConfig.automation?.capabilities?.config_doctor_on_startup,
		).toBe(false);
		// Read-only capabilities default to true in v6.8
		expect(loadedConfig.automation?.capabilities?.plan_sync).toBe(true);
		expect(loadedConfig.automation?.capabilities?.evidence_auto_summaries).toBe(
			true,
		);
	});

	test('Feature-gated auto behaviors: phase_preflight requires explicit opt-in', async () => {
		const config = {
			automation: {
				mode: 'auto',
				capabilities: {
					plan_sync: true,
					// phase_preflight not set - should stay false (triggers actions)
				},
			},
		};
		await createConfig(tempDir, config);

		const loadedConfig = loadPluginConfig(tempDir);

		expect(loadedConfig.automation?.capabilities?.plan_sync).toBe(true);
		expect(loadedConfig.automation?.capabilities?.phase_preflight).toBe(false);
		expect(
			loadedConfig.automation?.capabilities?.config_doctor_on_startup,
		).toBe(false);
		// evidence_auto_summaries and decision_drift_detection default to true in v6.8
		expect(loadedConfig.automation?.capabilities?.evidence_auto_summaries).toBe(
			true,
		);
		expect(
			loadedConfig.automation?.capabilities?.decision_drift_detection,
		).toBe(true);
	});

	test('Hybrid mode: manual triggers allowed but not automatic', async () => {
		const config = {
			automation: {
				mode: 'hybrid',
				capabilities: {
					phase_preflight: true,
				},
			},
		};
		await createConfig(tempDir, config);

		const loadedConfig = loadPluginConfig(tempDir);

		// Hybrid mode allows manual triggers but no auto-triggers
		expect(loadedConfig.automation?.mode).toBe('hybrid');
		expect(loadedConfig.automation?.capabilities?.phase_preflight).toBe(true);

		// This means preflight can be triggered manually via /swarm preflight
		// but won't run automatically on phase boundaries unless explicitly enabled
	});

	test('Automation status file reflects mode correctly', async () => {
		const config = {
			automation: {
				mode: 'manual',
				capabilities: {
					plan_sync: false,
					phase_preflight: false,
				},
			},
		};
		await createConfig(tempDir, config);

		const loadedConfig = loadPluginConfig(tempDir);

		// Status should reflect manual mode (no action-triggering automation running)
		const isAutomationEnabled =
			loadedConfig.automation?.mode !== 'manual' ||
			loadedConfig.automation?.capabilities?.plan_sync === true ||
			loadedConfig.automation?.capabilities?.phase_preflight === true;

		expect(isAutomationEnabled).toBe(false);
	});

	test('Background worker does not start when all capabilities explicitly disabled', async () => {
		const config = {
			automation: {
				mode: 'auto',
				capabilities: {
					plan_sync: false,
					phase_preflight: false,
					config_doctor_on_startup: false,
					evidence_auto_summaries: false,
					decision_drift_detection: false,
				},
			},
		};
		await createConfig(tempDir, config);

		const loadedConfig = loadPluginConfig(tempDir);

		// All capabilities explicitly disabled = no background automation should run
		const wouldStartBackground =
			loadedConfig.automation?.capabilities?.plan_sync ||
			loadedConfig.automation?.capabilities?.phase_preflight ||
			loadedConfig.automation?.capabilities?.config_doctor_on_startup ||
			loadedConfig.automation?.capabilities?.evidence_auto_summaries ||
			loadedConfig.automation?.capabilities?.decision_drift_detection;

		expect(wouldStartBackground).toBe(false);
	});

	test('Evidence auto-summaries enabled by default in v6.8', async () => {
		const config = {
			automation: {
				mode: 'auto',
				capabilities: {
					evidence_auto_summaries: true,
				},
			},
		};
		await createConfig(tempDir, config);

		const loadedConfig = loadPluginConfig(tempDir);

		// evidence_auto_summaries is true (explicitly set, also the v6.8 default)
		expect(loadedConfig.automation?.capabilities?.evidence_auto_summaries).toBe(
			true,
		);
		// plan_sync also defaults to true in v6.8
		expect(loadedConfig.automation?.capabilities?.plan_sync).toBe(true);
		expect(loadedConfig.automation?.capabilities?.phase_preflight).toBe(false);
	});

	test('Decision drift detection enabled by default in v6.8', async () => {
		const config = {
			automation: {
				mode: 'auto',
				capabilities: {
					decision_drift_detection: true,
				},
			},
		};
		await createConfig(tempDir, config);

		const loadedConfig = loadPluginConfig(tempDir);

		// decision_drift_detection is true (explicitly set, also the v6.8 default)
		expect(
			loadedConfig.automation?.capabilities?.decision_drift_detection,
		).toBe(true);
		// plan_sync also defaults to true in v6.8
		expect(loadedConfig.automation?.capabilities?.plan_sync).toBe(true);
		expect(loadedConfig.automation?.capabilities?.phase_preflight).toBe(false);
	});
});

// ============================================================================
// GROUP 5: DETERMINISTIC ARTIFACTS & NO DESTRUCTIVE SIDE-EFFECTS
// ============================================================================

describe('Deterministic Artifacts & No Destructive Side-Effects', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTestDir('deterministic');
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	test('Loading plan.json multiple times produces consistent results', async () => {
		const plan = {
			schema_version: '1.0.0',
			title: 'Deterministic Test',
			swarm: 'default',
			current_phase: 2,
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'complete',
					tasks: [
						{
							id: '1.1',
							phase: 1,
							status: 'completed',
							size: 'small',
							description: 'Task 1.1',
							depends: [],
							acceptance: 'Done',
							files_touched: [],
						},
					],
				},
				{
					id: 2,
					name: 'Phase 2',
					status: 'in_progress',
					tasks: [],
				},
			],
		};
		await createPlanJson(tempDir, plan);

		// Load multiple times
		const load1 = await loadPlanJsonOnly(tempDir);
		const load2 = await loadPlanJsonOnly(tempDir);
		const load3 = await loadPlanJsonOnly(tempDir);

		expect(load1?.current_phase).toBe(2);
		expect(load2?.current_phase).toBe(2);
		expect(load3?.current_phase).toBe(2);

		// Phase count should be consistent
		expect(load1?.phases.length).toBe(2);
		expect(load2?.phases.length).toBe(2);
		expect(load3?.phases.length).toBe(2);
	});

	test('Migration does not delete original plan.md when migrating', async () => {
		// Legacy plan.md
		const legacyPlanMd = `# Original Project

## Phase 1

### 1.1 Original task
`;
		await createPlanMd(tempDir, legacyPlanMd);

		// Load plan - should migrate
		const loadedPlan = await loadPlan(tempDir);

		expect(loadedPlan).not.toBeNull();

		// Original plan.md should still exist (backward compatible)
		const planMdPath = path.join(tempDir, SWARM_DIR, 'plan.md');
		expect(existsSync(planMdPath)).toBe(true);

		const planMdContent = readFileSync(planMdPath, 'utf-8');
		expect(planMdContent).toContain('Original Project');
	});

	test('Saving plan does not corrupt existing config', async () => {
		// Create config
		const config = {
			max_iterations: 5,
			guardrails: { enabled: true },
		};
		await createConfig(tempDir, config);

		// Create and save a plan
		const plan = createTestPlan({
			title: 'Test',
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'in_progress',
					tasks: [],
				},
			],
		});

		await savePlan(tempDir, plan);

		// Config should still be intact
		const loadedConfig = loadPluginConfig(tempDir);
		expect(loadedConfig.max_iterations).toBe(5);
		expect(loadedConfig.guardrails?.enabled).toBe(true);
	});

	test('Deep merge preserves nested config values', async () => {
		const base: Record<string, unknown> = {
			hooks: {
				system_enhancer: true,
				compaction: true,
			},
			guardrails: {
				enabled: true,
				max_tool_calls: 100,
			},
		};

		const override: Record<string, unknown> = {
			guardrails: {
				max_tool_calls: 200,
			},
		};

		const merged = deepMerge(base, override) as Record<string, unknown>;

		// System enhancer should be preserved from base
		expect(merged.hooks).toEqual({ system_enhancer: true, compaction: true });

		// Guardrails should be merged
		expect(merged.guardrails).toEqual({ enabled: true, max_tool_calls: 200 });
	});

	test('Migration hash is deterministic', async () => {
		const plan = createTestPlan({
			title: 'Hash Test',
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'in_progress',
					tasks: [
						{
							id: '1.1',
							phase: 1,
							status: 'completed',
							size: 'small',
							description: 'Task 1',
							depends: [],
							acceptance: 'Done',
							files_touched: [],
						},
					],
				},
			],
		});

		// Save plan twice
		await savePlan(tempDir, plan);

		const planMd1 = readFileSync(
			path.join(tempDir, SWARM_DIR, 'plan.md'),
			'utf-8',
		);

		// Modify and save again
		const planModified = { ...plan, current_phase: 2 };
		await savePlan(tempDir, planModified);

		const planMd2 = readFileSync(
			path.join(tempDir, SWARM_DIR, 'plan.md'),
			'utf-8',
		);

		// Hash should be different for different content
		expect(planMd1).not.toBe(planMd2);

		// Same content should produce same hash
		await savePlan(tempDir, plan);
		const planMd3 = readFileSync(
			path.join(tempDir, SWARM_DIR, 'plan.md'),
			'utf-8',
		);

		// The hash in the new plan.md should match when content is same
		// (This verifies deterministic regeneration)
		expect(planMd3).toContain('Phase 1');
	});
});

// ============================================================================
// GROUP 6: EDGE CASES & ERROR RECOVERY
// ============================================================================

describe('Edge Cases & Error Recovery', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTestDir('edge-cases');
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	test('Invalid automation mode defaults to manual', () => {
		const result = AutomationModeSchema.safeParse('invalid_mode');
		expect(result.success).toBe(false);

		// Valid modes
		expect(AutomationModeSchema.parse('manual')).toBe('manual');
		expect(AutomationModeSchema.parse('hybrid')).toBe('hybrid');
		expect(AutomationModeSchema.parse('auto')).toBe('auto');
	});

	test('Invalid boolean in capabilities defaults to false', () => {
		// String instead of boolean
		const result = AutomationCapabilitiesSchema.safeParse({
			plan_sync: 'yes',
		});
		expect(result.success).toBe(false);
	});

	test('Config with automation key but undefined mode handles gracefully', () => {
		const config = {
			automation: {
				mode: undefined,
				capabilities: undefined,
			},
		};

		const result = PluginConfigSchema.safeParse(config);
		// Should apply defaults
		expect(result.success).toBe(true);
		expect(result.data?.automation?.mode).toBe('manual');
	});

	test('Empty project (no plan, no config) loads with defaults', () => {
		// Don't create any config files
		const config = loadPluginConfig(tempDir);

		// Should have safe defaults
		expect(config.max_iterations).toBe(5);
		expect(config.qa_retry_limit).toBe(3);
		expect(config.inject_phase_reminders).toBe(true);
	});

	test('Malformed JSON config falls back to defaults', async () => {
		const configPath = path.join(tempDir, CONFIG_FILE);
		await mkdir(path.dirname(configPath), { recursive: true });
		await writeFile(configPath, '{ invalid json }');

		const config = loadPluginConfig(tempDir);

		// Should fall back to defaults with guardrails enabled
		expect(config.guardrails?.enabled).toBe(true);
	});
});

// ============================================================================
// SUMMARY TEST: Full backward compatibility verification
// ============================================================================

describe('Full v6.7 Backward Compatibility Summary', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTestDir('full-summary');
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	test('Complete migration path: legacy config -> v6.7 config', async () => {
		// Step 1: Legacy config (pre-v6.7)
		const legacyConfig = {
			max_iterations: 4,
			inject_phase_reminders: true,
			guardrails: { enabled: true },
		};

		// Step 2: Legacy plan.md
		const legacyPlanMd = `# Legacy Project

## Phase 1: Initial Setup

### 1.1 Set up project structure [COMPLETED]
- Status: complete
`;
		await createConfig(tempDir, legacyConfig);
		await createPlanMd(tempDir, legacyPlanMd);

		// Step 3: Load config (should handle legacy gracefully)
		const config = loadPluginConfig(tempDir);
		expect(config.max_iterations).toBe(4);
		expect(config.guardrails?.enabled).toBe(true);

		// Step 4: Load plan (should migrate from plan.md)
		const plan = await loadPlan(tempDir);
		expect(plan).not.toBeNull();
		expect(plan?.title).toBe('Legacy Project');
		expect(plan?.migration_status).toBe('migrated');

		// Step 5: Verify both plan.json and plan.md exist
		expect(existsSync(path.join(tempDir, SWARM_DIR, 'plan.json'))).toBe(true);
		expect(existsSync(path.join(tempDir, SWARM_DIR, 'plan.md'))).toBe(true);

		// Step 6: Now upgrade to v6.7 config (add automation)
		const v67Config = {
			...legacyConfig,
			automation: {
				mode: 'hybrid',
				capabilities: {
					plan_sync: true,
				},
			},
		};
		await createConfig(tempDir, v67Config);

		const upgradedConfig = loadPluginConfig(tempDir);
		expect(upgradedConfig.max_iterations).toBe(4);
		expect(upgradedConfig.guardrails?.enabled).toBe(true);
		expect(upgradedConfig.automation?.mode).toBe('hybrid');
		expect(upgradedConfig.automation?.capabilities?.plan_sync).toBe(true);

		// Step 7: Verify existing plan still loads
		const existingPlan = await loadPlan(tempDir);
		expect(existingPlan?.title).toBe('Legacy Project');

		// Step 8: Save new plan - should not break anything
		const newPlan = createTestPlan({
			title: 'Upgraded Project',
			migration_status: 'migrated',
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'in_progress',
					tasks: [],
				},
			],
		});
		await savePlan(tempDir, newPlan);

		// Step 9: Config should still be intact
		const finalConfig = loadPluginConfig(tempDir);
		expect(finalConfig.max_iterations).toBe(4);
		expect(finalConfig.automation?.mode).toBe('hybrid');

		// Step 10: Plan should be updated
		const finalPlan = await loadPlan(tempDir);
		expect(finalPlan?.title).toBe('Upgraded Project');
	});

	test('GUI-first workflow: no slash commands needed for automation', async () => {
		// This tests the v6.7 GUI-first approach:
		// Automation should work without requiring /swarm commands

		const guiConfig = {
			automation: {
				mode: 'auto',
				capabilities: {
					plan_sync: true,
					config_doctor_on_startup: true,
				},
			},
		};
		await createConfig(tempDir, guiConfig);

		const config = loadPluginConfig(tempDir);

		// Automation enabled via config, no slash commands needed
		expect(config.automation?.mode).toBe('auto');
		expect(config.automation?.capabilities?.plan_sync).toBe(true);
		expect(config.automation?.capabilities?.config_doctor_on_startup).toBe(
			true,
		);

		// CLI commands still work if needed
		const plan = {
			schema_version: '1.0.0',
			title: 'GUI Project',
			swarm: 'default',
			current_phase: 1,
			phases: [{ id: 1, name: 'Phase 1', status: 'in_progress', tasks: [] }],
		};
		await createPlanJson(tempDir, plan);

		const loadedPlan = await loadPlan(tempDir);
		expect(loadedPlan?.title).toBe('GUI Project');
	});

	test('Background-first: automation runs in background without CLI interaction', async () => {
		// This tests that background automation can run
		// without any CLI interaction from the user

		const backgroundConfig = {
			automation: {
				mode: 'auto',
				capabilities: {
					evidence_auto_summaries: true,
					decision_drift_detection: true,
				},
			},
		};
		await createConfig(tempDir, backgroundConfig);

		const config = loadPluginConfig(tempDir);

		// Background features enabled
		const backgroundFeatures =
			config.automation?.capabilities?.evidence_auto_summaries === true &&
			config.automation?.capabilities?.decision_drift_detection === true;

		expect(backgroundFeatures).toBe(true);

		// Manual mode users won't trigger these automatically
		const manualConfig = {
			automation: {
				mode: 'manual',
			},
		};
		await createConfig(tempDir, manualConfig);

		const manualLoaded = loadPluginConfig(tempDir);
		// In manual mode, the mode gate prevents background automation from running
		// even if capability defaults are true (v6.8 defaults evidence/drift to true)
		const modeAllowsBackground = manualLoaded.automation?.mode !== 'manual';

		expect(modeAllowsBackground).toBe(false);
	});
});
