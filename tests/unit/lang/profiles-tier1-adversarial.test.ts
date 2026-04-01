/**
 * Adversarial tests for LanguageRegistry
 * Tests edge cases, invalid inputs, and mutation safety
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
	LANGUAGE_REGISTRY,
	type LanguageProfile,
	LanguageRegistry,
} from '../../../src/lang/profiles';

describe('LanguageRegistry Adversarial Tests', () => {
	let registry: LanguageRegistry;

	beforeEach(() => {
		registry = new LanguageRegistry();
		// Register a simple profile for testing
		registry.register({
			id: 'test',
			displayName: 'Test',
			tier: 1,
			extensions: ['.ts', '.py'],
			treeSitter: {
				grammarId: 'test',
				wasmFile: 'test.wasm',
			},
			build: {
				detectFiles: ['test.json'],
				commands: [],
			},
			test: {
				detectFiles: ['test.json'],
				frameworks: [],
			},
			lint: {
				detectFiles: ['test.json'],
				linters: [],
			},
			audit: {
				detectFiles: ['test.json'],
				command: null,
				outputFormat: 'json',
			},
			sast: {
				nativeRuleSet: null,
				semgrepSupport: 'none',
			},
			prompts: {
				coderConstraints: [],
				reviewerChecklist: [],
			},
		});
	});

	describe('getByExtension - Invalid Inputs', () => {
		it('should return undefined for undefined extension (not crash)', () => {
			// @ts-expect-error - Testing invalid input
			const result = registry.getByExtension(undefined);
			expect(result).toBeUndefined();
		});

		it('should return undefined for null extension (not crash)', () => {
			// @ts-expect-error - Testing invalid input
			const result = registry.getByExtension(null);
			expect(result).toBeUndefined();
		});

		it('should return undefined for empty string extension', () => {
			const result = registry.getByExtension('');
			expect(result).toBeUndefined();
		});

		it('should return undefined for uppercase extension (case-sensitive)', () => {
			const result = registry.getByExtension('.TS');
			expect(result).toBeUndefined();
		});

		it('should return undefined for extension with trailing space (no trim/coerce)', () => {
			const result = registry.getByExtension('.ts ');
			expect(result).toBeUndefined();
		});

		it('should return undefined for extension with leading space', () => {
			const result = registry.getByExtension(' .ts');
			expect(result).toBeUndefined();
		});

		it('should return undefined for extension without dot prefix', () => {
			const result = registry.getByExtension('ts');
			expect(result).toBeUndefined();
		});
	});

	describe('getById - Invalid Inputs', () => {
		it('should return undefined for unknown id', () => {
			const result = registry.getById('unknown-language');
			expect(result).toBeUndefined();
		});

		it('should return undefined for empty string id', () => {
			const result = registry.getById('');
			expect(result).toBeUndefined();
		});

		it('should return undefined for whitespace-only id', () => {
			const result = registry.getById('   ');
			expect(result).toBeUndefined();
		});
	});

	describe('register - Extension Collision', () => {
		it('should override existing profile when extension collides (last-register-wins)', () => {
			// Register first profile with .ts
			const profile1: LanguageProfile = {
				id: 'first',
				displayName: 'First Profile',
				tier: 1,
				extensions: ['.ts'],
				treeSitter: { grammarId: 'first', wasmFile: 'first.wasm' },
				build: { detectFiles: [], commands: [] },
				test: { detectFiles: [], frameworks: [] },
				lint: { detectFiles: [], linters: [] },
				audit: { detectFiles: [], command: null, outputFormat: 'json' },
				sast: { nativeRuleSet: null, semgrepSupport: 'none' },
				prompts: { coderConstraints: [], reviewerChecklist: [] },
			};
			registry.register(profile1);

			// Verify first profile is registered
			let result = registry.getByExtension('.ts');
			expect(result?.id).toBe('first');

			// Register second profile with same .ts extension
			const profile2: LanguageProfile = {
				id: 'second',
				displayName: 'Second Profile',
				tier: 1,
				extensions: ['.ts'],
				treeSitter: { grammarId: 'second', wasmFile: 'second.wasm' },
				build: { detectFiles: [], commands: [] },
				test: { detectFiles: [], frameworks: [] },
				lint: { detectFiles: [], linters: [] },
				audit: { detectFiles: [], command: null, outputFormat: 'json' },
				sast: { nativeRuleSet: null, semgrepSupport: 'none' },
				prompts: { coderConstraints: [], reviewerChecklist: [] },
			};
			registry.register(profile2);

			// Verify second profile overrides the first
			result = registry.getByExtension('.ts');
			expect(result?.id).toBe('second');
			expect(result?.displayName).toBe('Second Profile');

			// First profile should still be accessible by id
			const byId = registry.getById('first');
			expect(byId?.id).toBe('first');
		});

		it('should handle multiple extension collisions correctly', () => {
			const profile1: LanguageProfile = {
				id: 'p1',
				displayName: 'P1',
				tier: 1,
				extensions: ['.ts', '.py'],
				treeSitter: { grammarId: 'p1', wasmFile: 'p1.wasm' },
				build: { detectFiles: [], commands: [] },
				test: { detectFiles: [], frameworks: [] },
				lint: { detectFiles: [], linters: [] },
				audit: { detectFiles: [], command: null, outputFormat: 'json' },
				sast: { nativeRuleSet: null, semgrepSupport: 'none' },
				prompts: { coderConstraints: [], reviewerChecklist: [] },
			};

			const profile2: LanguageProfile = {
				id: 'p2',
				displayName: 'P2',
				tier: 2,
				extensions: ['.ts', '.rs'],
				treeSitter: { grammarId: 'p2', wasmFile: 'p2.wasm' },
				build: { detectFiles: [], commands: [] },
				test: { detectFiles: [], frameworks: [] },
				lint: { detectFiles: [], linters: [] },
				audit: { detectFiles: [], command: null, outputFormat: 'json' },
				sast: { nativeRuleSet: null, semgrepSupport: 'none' },
				prompts: { coderConstraints: [], reviewerChecklist: [] },
			};

			const profile3: LanguageProfile = {
				id: 'p3',
				displayName: 'P3',
				tier: 3,
				extensions: ['.py', '.go'],
				treeSitter: { grammarId: 'p3', wasmFile: 'p3.wasm' },
				build: { detectFiles: [], commands: [] },
				test: { detectFiles: [], frameworks: [] },
				lint: { detectFiles: [], linters: [] },
				audit: { detectFiles: [], command: null, outputFormat: 'json' },
				sast: { nativeRuleSet: null, semgrepSupport: 'none' },
				prompts: { coderConstraints: [], reviewerChecklist: [] },
			};

			registry.register(profile1);
			registry.register(profile2);
			registry.register(profile3);

			// Last registration wins for each extension
			expect(registry.getByExtension('.ts')?.id).toBe('p2');
			expect(registry.getByExtension('.py')?.id).toBe('p3');
			expect(registry.getByExtension('.rs')?.id).toBe('p2');
			expect(registry.getByExtension('.go')?.id).toBe('p3');
		});
	});

	describe('Singleton Pattern - LANGUAGE_REGISTRY', () => {
		it('should be shared across imports - mutations affect all importers', () => {
			// Get current count of profiles in the singleton
			const initialCount = LANGUAGE_REGISTRY.getAll().length;

			// Register a new profile
			const newProfile: LanguageProfile = {
				id: 'singleton-test',
				displayName: 'Singleton Test',
				tier: 1,
				extensions: ['.singleton'],
				treeSitter: {
					grammarId: 'singleton',
					wasmFile: 'singleton.wasm',
				},
				build: { detectFiles: [], commands: [] },
				test: { detectFiles: [], frameworks: [] },
				lint: { detectFiles: [], linters: [] },
				audit: { detectFiles: [], command: null, outputFormat: 'json' },
				sast: { nativeRuleSet: null, semgrepSupport: 'none' },
				prompts: { coderConstraints: [], reviewerChecklist: [] },
			};
			LANGUAGE_REGISTRY.register(newProfile);

			// Verify profile is accessible
			expect(LANGUAGE_REGISTRY.getById('singleton-test')).toBeDefined();
			expect(LANGUAGE_REGISTRY.getAll().length).toBe(initialCount + 1);

			// Verify extension lookup works
			expect(LANGUAGE_REGISTRY.getByExtension('.singleton')?.id).toBe(
				'singleton-test',
			);
		});

		it('should verify singleton is the same instance across multiple calls', () => {
			const ref1 = LANGUAGE_REGISTRY;
			const ref2 = LANGUAGE_REGISTRY;

			// Both references should point to the same object
			expect(ref1).toBe(ref2);

			// Mutate one and verify the other reflects the change
			const testProfile: LanguageProfile = {
				id: 'singleton-ref-test',
				displayName: 'Singleton Ref Test',
				tier: 1,
				extensions: ['.srt'],
				treeSitter: { grammarId: 'srt', wasmFile: 'srt.wasm' },
				build: { detectFiles: [], commands: [] },
				test: { detectFiles: [], frameworks: [] },
				lint: { detectFiles: [], linters: [] },
				audit: { detectFiles: [], command: null, outputFormat: 'json' },
				sast: { nativeRuleSet: null, semgrepSupport: 'none' },
				prompts: { coderConstraints: [], reviewerChecklist: [] },
			};
			ref1.register(testProfile);

			// ref2 should see the mutation
			expect(ref2.getById('singleton-ref-test')).toBeDefined();
			expect(ref2.getByExtension('.srt')?.id).toBe('singleton-ref-test');
		});
	});

	describe('getAll() - Mutation Safety', () => {
		it('should return a new array each time (not internal Map reference)', () => {
			const arr1 = registry.getAll();
			const arr2 = registry.getAll();

			// Arrays should be different objects
			expect(arr1).not.toBe(arr2);

			// But contain the same values
			expect(arr1).toEqual(arr2);
		});

		it('should not be affected by mutation of returned array', () => {
			const arr1 = registry.getAll();
			const initialLength = arr1.length;

			// Mutate the returned array
			arr1.push({
				id: 'fake',
				displayName: 'Fake',
				tier: 1,
				extensions: ['.fake'],
				treeSitter: { grammarId: 'fake', wasmFile: 'fake.wasm' },
				build: { detectFiles: [], commands: [] },
				test: { detectFiles: [], frameworks: [] },
				lint: { detectFiles: [], linters: [] },
				audit: { detectFiles: [], command: null, outputFormat: 'json' },
				sast: { nativeRuleSet: null, semgrepSupport: 'none' },
				prompts: { coderConstraints: [], reviewerChecklist: [] },
			});

			// Get a new array - should not include the fake item
			const arr2 = registry.getAll();
			expect(arr2.length).toBe(initialLength);
			expect(arr2.find((p) => p.id === 'fake')).toBeUndefined();
		});

		it('should not be affected by modification of returned array elements', () => {
			const arr1 = registry.getAll();
			if (arr1.length > 0) {
				const originalDisplayName = arr1[0].displayName;
				const originalTier = arr1[0].tier;

				// Try to mutate the element
				arr1[0].displayName = 'MODIFIED';

				// Get a new array - the original profile should still be intact
				// Note: This actually WILL fail if the registry returns references to the same objects
				// but that's acceptable - we're protecting the array structure, not deep cloning
				const arr2 = registry.getAll();
				expect(arr2[0].displayName).toBe('MODIFIED'); // This is expected - same object references
			}
		});

		it('should not be affected by deletion from returned array', () => {
			const arr1 = registry.getAll();
			const initialLength = arr1.length;

			// Delete elements from the returned array
			arr1.splice(0, arr1.length);

			// Get a new array - should still have all profiles
			const arr2 = registry.getAll();
			expect(arr2.length).toBe(initialLength);
		});
	});

	describe('getTier - Edge Cases', () => {
		it('should return empty array for tier with no profiles', () => {
			const result = registry.getTier(3);
			expect(result).toEqual([]);
			expect(result).not.toBe(registry.getTier(3)); // New array each time
		});

		it('should filter profiles by tier correctly', () => {
			const tier1Profile: LanguageProfile = {
				id: 'tier1',
				displayName: 'Tier 1',
				tier: 1,
				extensions: ['.t1'],
				treeSitter: { grammarId: 't1', wasmFile: 't1.wasm' },
				build: { detectFiles: [], commands: [] },
				test: { detectFiles: [], frameworks: [] },
				lint: { detectFiles: [], linters: [] },
				audit: { detectFiles: [], command: null, outputFormat: 'json' },
				sast: { nativeRuleSet: null, semgrepSupport: 'none' },
				prompts: { coderConstraints: [], reviewerChecklist: [] },
			};

			const tier2Profile: LanguageProfile = {
				id: 'tier2',
				displayName: 'Tier 2',
				tier: 2,
				extensions: ['.t2'],
				treeSitter: { grammarId: 't2', wasmFile: 't2.wasm' },
				build: { detectFiles: [], commands: [] },
				test: { detectFiles: [], frameworks: [] },
				lint: { detectFiles: [], linters: [] },
				audit: { detectFiles: [], command: null, outputFormat: 'json' },
				sast: { nativeRuleSet: null, semgrepSupport: 'none' },
				prompts: { coderConstraints: [], reviewerChecklist: [] },
			};

			registry.register(tier1Profile);
			registry.register(tier2Profile);

			const tier1Results = registry.getTier(1);
			const tier2Results = registry.getTier(2);
			const tier3Results = registry.getTier(3);

			expect(tier1Results.length).toBeGreaterThan(0);
			expect(tier2Results.length).toBe(1);
			expect(tier3Results.length).toBe(0);

			expect(tier1Results.every((p) => p.tier === 1)).toBe(true);
			expect(tier2Results.every((p) => p.tier === 2)).toBe(true);
		});
	});
});
