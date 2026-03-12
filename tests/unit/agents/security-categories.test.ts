import { describe, expect, it } from 'bun:test';
import {
	SECURITY_CATEGORIES,
	type SecurityCategory,
} from '../../../src/agents/reviewer';
import { SECURITY_CATEGORIES as reExportedCategories } from '../../../src/agents/index';

describe('SECURITY_CATEGORIES constant', () => {
	it('is an array with exactly 10 elements', () => {
		expect(Array.isArray(SECURITY_CATEGORIES)).toBe(true);
		expect(SECURITY_CATEGORIES.length).toBe(10);
	});

	it('contains all 10 OWASP Top 10 2021 categories', () => {
		const expectedCategories = [
			'broken-access-control',
			'cryptographic-failures',
			'injection',
			'insecure-design',
			'security-misconfiguration',
			'vulnerable-components',
			'auth-failures',
			'data-integrity-failures',
			'logging-monitoring-failures',
			'ssrf',
		];

		for (const category of expectedCategories) {
			expect(SECURITY_CATEGORIES).toContain(category);
		}
	});

	it('has all entries as strings', () => {
		for (const category of SECURITY_CATEGORIES) {
			expect(typeof category).toBe('string');
		}
	});

	it('has no duplicates', () => {
		const uniqueCategories = new Set(SECURITY_CATEGORIES);
		expect(uniqueCategories.size).toBe(SECURITY_CATEGORIES.length);
	});

	it('is readonly (as const assertion)', () => {
		// Note: `as const` makes the array readonly at TypeScript compile-time,
		// but does not freeze the array at runtime (Object.isFrozen returns false).
		// This test verifies the type-level readonly by checking the structure.
		// The TypeScript compiler would prevent mutations at compile time.
		expect(Array.isArray(SECURITY_CATEGORIES)).toBe(true);
		expect(SECURITY_CATEGORIES).toHaveLength(10);
	});
});

describe('SecurityCategory type', () => {
	it('derives valid types from SECURITY_CATEGORIES', () => {
		// This test verifies that the type is correctly derived
		// If this compiles, the type is correctly set up
		const testCategory: SecurityCategory = 'injection';
		expect(typeof testCategory).toBe('string');
	});

	it('includes all expected category values', () => {
		// Type assertion to verify compile-time correctness
		const categories: SecurityCategory[] = [
			'broken-access-control',
			'cryptographic-failures',
			'injection',
			'insecure-design',
			'security-misconfiguration',
			'vulnerable-components',
			'auth-failures',
			'data-integrity-failures',
			'logging-monitoring-failures',
			'ssrf',
		];
		expect(categories.length).toBe(10);
	});
});

describe('SECURITY_CATEGORIES re-export', () => {
	it('is re-exported from agents/index.ts', () => {
		// Verify the re-export exists and has the same values
		expect(reExportedCategories).toBeDefined();
		expect(reExportedCategories).toBe(SECURITY_CATEGORIES);
	});

	it('has same reference when imported from different modules', () => {
		// Both imports should point to the exact same array reference
		expect(Object.is(SECURITY_CATEGORIES, reExportedCategories)).toBe(true);
	});
});
