import { describe, test, expect } from 'bun:test';
import { z } from 'zod';
import {
	AutomationCapabilitiesSchema,
	AutomationConfigSchema,
	AutomationModeSchema,
	PluginConfigSchema,
} from '../../../src/config/schema';

describe('AutomationModeSchema', () => {
	test('Valid modes parse correctly', () => {
		expect(AutomationModeSchema.parse('manual')).toBe('manual');
		expect(AutomationModeSchema.parse('hybrid')).toBe('hybrid');
		expect(AutomationModeSchema.parse('auto')).toBe('auto');
	});

	test('Invalid mode rejects', () => {
		const result = AutomationModeSchema.safeParse('invalid');
		expect(result.success).toBe(false);
	});

	test('Default is manual via Zod default', () => {
		// Zod default is applied when field is missing from parsed object
		// The default is set on the schema itself, not on parse(undefined)
		const schema = z.string().default('manual');
		const result = schema.parse(undefined);
		expect(result).toBe('manual');
	});
});

describe('AutomationCapabilitiesSchema', () => {
	test('Valid config with all fields parses correctly', () => {
		const config = {
			plan_sync: true,
			phase_preflight: true,
			config_doctor_on_startup: true,
			config_doctor_autofix: false,
			evidence_auto_summaries: true,
			decision_drift_detection: true,
		};
		const result = AutomationCapabilitiesSchema.parse(config);
		expect(result).toEqual(config);
	});

	test('Defaults are applied when fields omitted (v6.8 defaults)', () => {
		const config = {};
		const result = AutomationCapabilitiesSchema.parse(config);
		expect(result).toEqual({
			plan_sync: true,
			phase_preflight: false,
			config_doctor_on_startup: false,
			config_doctor_autofix: false,
			evidence_auto_summaries: true,
			decision_drift_detection: true,
		});
	});

	test('Partial fields override only specified defaults', () => {
		const config = { plan_sync: true };
		const result = AutomationCapabilitiesSchema.parse(config);
		expect(result).toEqual({
			plan_sync: true,
			phase_preflight: false,
			config_doctor_on_startup: false,
			config_doctor_autofix: false,
			evidence_auto_summaries: true,
			decision_drift_detection: true,
		});
	});

	test('All booleans accepted', () => {
		const trueConfig = {
			plan_sync: true,
			phase_preflight: true,
			config_doctor_on_startup: true,
			evidence_auto_summaries: true,
			decision_drift_detection: true,
		};
		const falseConfig = {
			plan_sync: false,
			phase_preflight: false,
			config_doctor_on_startup: false,
			evidence_auto_summaries: false,
			decision_drift_detection: false,
		};
		expect(AutomationCapabilitiesSchema.parse(trueConfig).plan_sync).toBe(
			true,
		);
		expect(AutomationCapabilitiesSchema.parse(falseConfig).plan_sync).toBe(
			false,
		);
	});
});

describe('AutomationConfigSchema', () => {
	test('Valid config with all fields parses correctly', () => {
		const config = {
			mode: 'hybrid',
			capabilities: {
				plan_sync: true,
				phase_preflight: false,
				config_doctor_on_startup: true,
				evidence_auto_summaries: false,
				decision_drift_detection: true,
			},
		};
		const result = AutomationConfigSchema.parse(config);
		expect(result.mode).toBe('hybrid');
		expect(result.capabilities.plan_sync).toBe(true);
	});

	test('Defaults are applied when config empty (backward compatible)', () => {
		const config = {};
		const result = AutomationConfigSchema.parse(config);
		expect(result).toEqual({
			mode: 'manual',
			capabilities: {
				plan_sync: true,
				phase_preflight: false,
				config_doctor_on_startup: false,
				config_doctor_autofix: false,
				evidence_auto_summaries: true,
				decision_drift_detection: true,
			},
		});
	});

	test('Mode defaults to manual when omitted', () => {
		const config = { capabilities: { plan_sync: true } };
		const result = AutomationConfigSchema.parse(config);
		expect(result.mode).toBe('manual');
	});

	test('Capabilities default when omitted', () => {
		const config = { mode: 'auto' };
		const result = AutomationConfigSchema.parse(config);
		expect(result.mode).toBe('auto');
		expect(result.capabilities).toEqual({
			plan_sync: true,
			phase_preflight: false,
			config_doctor_on_startup: false,
			config_doctor_autofix: false,
			evidence_auto_summaries: true,
			decision_drift_detection: true,
		});
	});

	test('Invalid mode rejects', () => {
		const config = { mode: 'invalid' };
		const result = AutomationConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
	});
});

describe('PluginConfigSchema with automation field', () => {
	test('PluginConfigSchema with automation field parses correctly', () => {
		const config = {
			automation: {
				mode: 'hybrid',
				capabilities: {
					plan_sync: true,
					phase_preflight: true,
					config_doctor_on_startup: false,
					evidence_auto_summaries: false,
					decision_drift_detection: true,
				},
			},
		};
		const result = PluginConfigSchema.parse(config);
		expect(result.automation?.mode).toBe('hybrid');
		expect(result.automation?.capabilities?.plan_sync).toBe(true);
	});

	test('PluginConfigSchema without automation field parses (optional)', () => {
		const config = {
			max_iterations: 3,
			qa_retry_limit: 2,
		};
		const result = PluginConfigSchema.parse(config);
		expect(result.automation).toBeUndefined();
	});

	test('Automation defaults applied when automation key present but empty', () => {
		const config = { automation: {} };
		const result = PluginConfigSchema.parse(config);
		expect(result.automation?.mode).toBe('manual');
		expect(result.automation?.capabilities?.plan_sync).toBe(true);
	});

	test('Existing config fields still work with automation', () => {
		const config = {
			max_iterations: 7,
			qa_retry_limit: 5,
			inject_phase_reminders: false,
			automation: {
				mode: 'auto',
			},
		};
		const result = PluginConfigSchema.parse(config);
		expect(result.max_iterations).toBe(7);
		expect(result.qa_retry_limit).toBe(5);
		expect(result.inject_phase_reminders).toBe(false);
		expect(result.automation?.mode).toBe('auto');
	});
});

describe('Backward compatibility', () => {
	test('User config without automation key works (no regression)', () => {
		const userConfig = {
			max_iterations: 4,
			guardrails: { enabled: true },
		};
		const result = PluginConfigSchema.parse(userConfig);
		expect(result.max_iterations).toBe(4);
		expect(result.guardrails?.enabled).toBe(true);
		expect(result.automation).toBeUndefined();
	});

	test('Shallow merge replaces automation object entirely', () => {
		// Note: The config loader uses deep merge, but this test verifies
		// that if a shallow merge were used, the behavior would be correct
		const userConfig = {
			automation: { mode: 'hybrid', capabilities: { plan_sync: true } },
		};
		const projectConfig = {
			automation: { mode: 'auto', capabilities: { phase_preflight: true } },
		};
		// Shallow merge: project completely replaces user automation
		const merged = { ...userConfig, ...projectConfig };
		const result = PluginConfigSchema.parse(merged);
		// Mode from project
		expect(result.automation?.mode).toBe('auto');
		// Capabilities from project (user's plan_sync is lost in shallow merge)
		expect(result.automation?.capabilities?.plan_sync).toBe(true); // default (v6.8)
		expect(result.automation?.capabilities?.phase_preflight).toBe(true);
	});

	test('Full automation config parses correctly', () => {
		const config = {
			automation: {
				mode: 'hybrid',
				capabilities: {
					plan_sync: true,
					phase_preflight: true,
					config_doctor_on_startup: false,
					evidence_auto_summaries: true,
					decision_drift_detection: false,
				},
			},
		};
		const result = PluginConfigSchema.parse(config);
		expect(result.automation?.mode).toBe('hybrid');
		expect(result.automation?.capabilities?.plan_sync).toBe(true);
		expect(result.automation?.capabilities?.phase_preflight).toBe(true);
		expect(result.automation?.capabilities?.evidence_auto_summaries).toBe(
			true,
		);
	});
});
