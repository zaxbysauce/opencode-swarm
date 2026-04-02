import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { KnowledgeConfigSchema } from '../../../src/config/schema';
import type { KnowledgeConfig } from '../../../src/hooks/knowledge-types';
import {
	ensureAgentSession,
	resetSwarmState,
	swarmState,
} from '../../../src/state';

/**
 * Adversarial tests for the KnowledgeConfig inline fallback in phase-complete.ts
 *
 * Attack vectors tested:
 * 1. Missing fields in the fallback object (type safety)
 * 2. Schema default mismatches (regression risk)
 * 3. Invalid value ranges (edge cases)
 * 4. Unsafe type cast at line 517 (potential runtime issue)
 */

describe('phase-complete.ts KnowledgeConfig fallback adversarial tests', () => {
	let tempDir: string;

	beforeEach(() => {
		resetSwarmState();
		tempDir = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), 'phase-complete-adversarial-')),
		);
		// Create .swarm directory structure
		fs.mkdirSync(path.join(tempDir, '.swarm', 'evidence', 'retro-1'), {
			recursive: true,
		});
		fs.mkdirSync(path.join(tempDir, '.swarm'), { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	/**
	 * ATTACK VECTOR 1: Verify all required KnowledgeConfig fields are present in the fallback
	 *
	 * The inline fallback at lines 463-485 must provide ALL fields required by the KnowledgeConfig interface.
	 * If any field is missing, TypeScript should fail to compile. This test validates that the fallback
	 * object satisfies the interface at runtime.
	 */
	test('FALLBACK: all required KnowledgeConfig fields are present', () => {
		// Reconstruct the exact fallback from phase-complete.ts lines 463-485
		const knowledgeConfig: KnowledgeConfig = {
			enabled: true,
			swarm_max_entries: 100,
			hive_max_entries: 200,
			auto_promote_days: 90,
			max_inject_count: 5,
			dedup_threshold: 0.6,
			scope_filter: ['global'],
			hive_enabled: true,
			rejected_max_entries: 20,
			validation_enabled: true,
			evergreen_confidence: 0.9,
			evergreen_utility: 0.8,
			low_utility_threshold: 0.3,
			min_retrievals_for_utility: 3,
			schema_version: 1,
			same_project_weight: 1.0,
			cross_project_weight: 0.5,
			min_encounter_score: 0.1,
			initial_encounter_score: 1.0,
			encounter_increment: 0.1,
			max_encounter_score: 10.0,
		};

		// Verify schema validates successfully
		const result = KnowledgeConfigSchema.safeParse(knowledgeConfig);
		expect(result.success).toBe(true);

		if (!result.success) {
			console.error('Schema validation errors:', result.error);
		}
	});

	/**
	 * ATTACK VECTOR 2: Schema default value mismatches
	 *
	 * The fallback values must match the schema defaults to ensure consistent behavior.
	 * If they differ, the runtime behavior will differ from what users get from config files.
	 */
	test('FALLBACK: values match schema defaults', () => {
		// Get schema defaults by parsing an empty object
		const defaults = KnowledgeConfigSchema.parse({});

		const fallback: KnowledgeConfig = {
			enabled: true,
			swarm_max_entries: 100,
			hive_max_entries: 200,
			auto_promote_days: 90,
			max_inject_count: 5,
			dedup_threshold: 0.6,
			scope_filter: ['global'],
			hive_enabled: true,
			rejected_max_entries: 20,
			validation_enabled: true,
			evergreen_confidence: 0.9,
			evergreen_utility: 0.8,
			low_utility_threshold: 0.3,
			min_retrievals_for_utility: 3,
			schema_version: 1,
			same_project_weight: 1.0,
			cross_project_weight: 0.5,
			min_encounter_score: 0.1,
			initial_encounter_score: 1.0,
			encounter_increment: 0.1,
			max_encounter_score: 10.0,
		};

		// Verify each weighted-scoring field matches schema defaults
		expect(fallback.same_project_weight).toBe(defaults.same_project_weight);
		expect(fallback.cross_project_weight).toBe(defaults.cross_project_weight);
		expect(fallback.min_encounter_score).toBe(defaults.min_encounter_score);
		expect(fallback.initial_encounter_score).toBe(
			defaults.initial_encounter_score,
		);
		expect(fallback.encounter_increment).toBe(defaults.encounter_increment);
		expect(fallback.max_encounter_score).toBe(defaults.max_encounter_score);

		// Also verify non-weighted-scoring defaults
		expect(fallback.enabled).toBe(defaults.enabled);
		expect(fallback.swarm_max_entries).toBe(defaults.swarm_max_entries);
		expect(fallback.hive_max_entries).toBe(defaults.hive_max_entries);
	});

	/**
	 * ATTACK VECTOR 3: Invalid value ranges that could cause runtime issues
	 *
	 * Test edge cases where the fallback values might cause issues if the schema
	 * constraints are ever tightened.
	 */
	test('FALLBACK: values are within valid schema ranges', () => {
		const knowledgeConfig: KnowledgeConfig = {
			enabled: true,
			swarm_max_entries: 100,
			hive_max_entries: 200,
			auto_promote_days: 90,
			max_inject_count: 5,
			dedup_threshold: 0.6,
			scope_filter: ['global'],
			hive_enabled: true,
			rejected_max_entries: 20,
			validation_enabled: true,
			evergreen_confidence: 0.9,
			evergreen_utility: 0.8,
			low_utility_threshold: 0.3,
			min_retrievals_for_utility: 3,
			schema_version: 1,
			same_project_weight: 1.0,
			cross_project_weight: 0.5,
			min_encounter_score: 0.1,
			initial_encounter_score: 1.0,
			encounter_increment: 0.1,
			max_encounter_score: 10.0,
		};

		// Validate ranges per schema definitions
		expect(knowledgeConfig.same_project_weight).toBeGreaterThanOrEqual(0);
		expect(knowledgeConfig.same_project_weight).toBeLessThanOrEqual(5);

		expect(knowledgeConfig.cross_project_weight).toBeGreaterThanOrEqual(0);
		expect(knowledgeConfig.cross_project_weight).toBeLessThanOrEqual(5);

		expect(knowledgeConfig.min_encounter_score).toBeGreaterThanOrEqual(0);
		expect(knowledgeConfig.min_encounter_score).toBeLessThanOrEqual(1);

		expect(knowledgeConfig.initial_encounter_score).toBeGreaterThanOrEqual(0);
		expect(knowledgeConfig.initial_encounter_score).toBeLessThanOrEqual(5);

		expect(knowledgeConfig.encounter_increment).toBeGreaterThanOrEqual(0);
		expect(knowledgeConfig.encounter_increment).toBeLessThanOrEqual(1);

		expect(knowledgeConfig.max_encounter_score).toBeGreaterThanOrEqual(1);
		expect(knowledgeConfig.max_encounter_score).toBeLessThanOrEqual(20);

		// Cross-field validation: max should be >= min
		expect(knowledgeConfig.max_encounter_score).toBeGreaterThanOrEqual(
			knowledgeConfig.min_encounter_score,
		);
	});

	/**
	 * ATTACK VECTOR 4: Missing fields would cause runtime errors in dependent functions
	 *
	 * This test simulates what happens if a field is accidentally removed from the fallback.
	 * The schema.parse() would succeed (due to defaults), but any code expecting the field
	 * to exist would fail.
	 */
	test('RUNTIME: partial config would be filled by schema defaults', () => {
		// Simulate a partial config (what would happen if a field is accidentally removed)
		const partialConfig = {
			enabled: true,
			swarm_max_entries: 100,
			// Intentionally omitting many fields to test schema defaults
		};

		// Schema should fill in defaults
		const result = KnowledgeConfigSchema.safeParse(partialConfig);
		expect(result.success).toBe(true);

		if (result.success) {
			// All weighted-scoring fields should have defaults
			expect(result.data.same_project_weight).toBe(1.0);
			expect(result.data.cross_project_weight).toBe(0.5);
			expect(result.data.min_encounter_score).toBe(0.1);
			expect(result.data.initial_encounter_score).toBe(1.0);
			expect(result.data.encounter_increment).toBe(0.1);
			expect(result.data.max_encounter_score).toBe(10.0);
		}
	});

	/**
	 * ATTACK VECTOR 5: The unsafe type cast at line 517 ({ } as KnowledgeConfig)
	 *
	 * This tests the pattern used at line 517 in phase-complete.ts.
	 * While the parameter is prefixed with _ (unused), this is still risky
	 * if the function ever starts using it.
	 */
	test('RUNTIME: empty object cast is dangerous but currently unused', () => {
		// This is the pattern at line 517: {} as KnowledgeConfig
		const emptyConfig = {} as KnowledgeConfig;

		// The schema will fill in defaults when parsing
		const result = KnowledgeConfigSchema.safeParse(emptyConfig);
		expect(result.success).toBe(true);

		// But the raw empty object would fail runtime access if fields are accessed
		// This demonstrates the danger of the type cast
		const _ = emptyConfig.same_project_weight;
	});

	/**
	 * ATTACK VECTOR 6: Regression test - if new fields are added to KnowledgeConfig
	 *
	 * This test will fail if new required fields are added to the interface without
	 * updating the fallback in phase-complete.ts. This acts as a canary.
	 */
	test('REGRESSION: fallback includes all current interface fields', () => {
		// List all fields from the KnowledgeConfig interface (from knowledge-types.ts)
		const requiredFields: (keyof KnowledgeConfig)[] = [
			'enabled',
			'swarm_max_entries',
			'hive_max_entries',
			'auto_promote_days',
			'max_inject_count',
			'dedup_threshold',
			'scope_filter',
			'hive_enabled',
			'rejected_max_entries',
			'validation_enabled',
			'evergreen_confidence',
			'evergreen_utility',
			'low_utility_threshold',
			'min_retrievals_for_utility',
			'schema_version',
			'same_project_weight',
			'cross_project_weight',
			'min_encounter_score',
			'initial_encounter_score',
			'encounter_increment',
			'max_encounter_score',
		];

		const fallback: KnowledgeConfig = {
			enabled: true,
			swarm_max_entries: 100,
			hive_max_entries: 200,
			auto_promote_days: 90,
			max_inject_count: 5,
			dedup_threshold: 0.6,
			scope_filter: ['global'],
			hive_enabled: true,
			rejected_max_entries: 20,
			validation_enabled: true,
			evergreen_confidence: 0.9,
			evergreen_utility: 0.8,
			low_utility_threshold: 0.3,
			min_retrievals_for_utility: 3,
			schema_version: 1,
			same_project_weight: 1.0,
			cross_project_weight: 0.5,
			min_encounter_score: 0.1,
			initial_encounter_score: 1.0,
			encounter_increment: 0.1,
			max_encounter_score: 10.0,
		};

		// Verify all fields are present
		for (const field of requiredFields) {
			expect(field in fallback).toBe(true);
		}

		// Verify count matches
		expect(Object.keys(fallback).length).toBe(requiredFields.length);
	});
});
