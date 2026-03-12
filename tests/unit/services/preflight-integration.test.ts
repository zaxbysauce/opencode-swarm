import { describe, expect, it } from 'bun:test';
import { createPreflightIntegration } from '../../../src/services/preflight-integration';

describe('createPreflightIntegration null-safety', () => {
	const validConfig = {
		mode: 'hybrid' as const,
		capabilities: {
			phase_preflight: true,
			plan_sync: false,
			config_doctor_on_startup: false,
			evidence_auto_summaries: false,
			decision_drift_detection: false,
		},
	};

	it('should throw descriptive error when automationConfig is null', () => {
		expect(() =>
			createPreflightIntegration({
				// @ts-expect-error - testing runtime behavior with null
				automationConfig: null,
				directory: '/test',
				swarmDir: '/test/.swarm',
			}),
		).toThrow(/Preflight is not enabled/);
	});

	it('should throw descriptive error when automationConfig is undefined', () => {
		expect(() =>
			createPreflightIntegration({
				// @ts-expect-error - testing runtime behavior with undefined
				automationConfig: undefined,
				directory: '/test',
				swarmDir: '/test/.swarm',
			}),
		).toThrow(/Preflight is not enabled/);
	});

	it('should throw descriptive error when capabilities is missing', () => {
		expect(() =>
			createPreflightIntegration({
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				automationConfig: { mode: 'hybrid' } as any,
				directory: '/test',
				swarmDir: '/test/.swarm',
			}),
		).toThrow(/Preflight is not enabled/);
	});

	it('should throw descriptive error when capabilities is null', () => {
		expect(() =>
			createPreflightIntegration({
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				automationConfig: { mode: 'hybrid', capabilities: null } as any,
				directory: '/test',
				swarmDir: '/test/.swarm',
			}),
		).toThrow(/Preflight is not enabled/);
	});

	it('should throw descriptive error when phase_preflight capability is false', () => {
		expect(() =>
			createPreflightIntegration({
				automationConfig: {
					mode: 'hybrid',
					capabilities: {
						phase_preflight: false,
						plan_sync: false,
						config_doctor_on_startup: false,
						evidence_auto_summaries: false,
						decision_drift_detection: false,
					},
				},
				directory: '/test',
				swarmDir: '/test/.swarm',
			}),
		).toThrow(/Preflight is not enabled/);
	});

	it('should succeed when config is valid with phase_preflight enabled', () => {
		const result = createPreflightIntegration({
			automationConfig: validConfig,
			directory: '/test',
			swarmDir: '/test/.swarm',
		});

		expect(result.manager).toBeDefined();
		expect(result.cleanup).toBeDefined();
		expect(typeof result.cleanup).toBe('function');

		// Clean up
		result.cleanup();
	});
});
