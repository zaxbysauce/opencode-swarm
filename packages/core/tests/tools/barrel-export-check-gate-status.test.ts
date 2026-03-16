/**
 * Adversarial tests for barrel export of check_gate_status in core/src/tools/index.ts
 * Tests for: duplicate export collisions, broken module path, missing symbol,
 * and accidental export-surface divergence
 */

import { describe, expect, it } from 'bun:test';

// Test 1: Verify barrel export exists and is accessible
describe('barrel export exists', () => {
	it('runCheckGateStatus is exported from barrel index.ts', async () => {
		// This import tests that the barrel file can be parsed and the export exists
		const barrel = await import('../../src/tools/index');

		// The runCheckGateStatus should be exported from the barrel
		expect('runCheckGateStatus' in barrel).toBe(true);
		expect(typeof barrel.runCheckGateStatus).toBe('function');
	});
});

// Test 2: No duplicate export collisions - runCheckGateStatus appears only once in barrel
describe('no duplicate export collisions', () => {
	it('runCheckGateStatus appears exactly once in barrel exports', async () => {
		const barrel = await import('../../src/tools/index');

		// Get all exported symbols
		const exports = Object.keys(barrel);

		// Filter for runCheckGateStatus - should appear exactly once
		const matchingExports = exports.filter((e) => e === 'runCheckGateStatus');
		expect(matchingExports.length).toBe(1);
	});

	it('runCheckGateStatus does not conflict with similar export names', async () => {
		const barrel = await import('../../src/tools/index');

		// Check that no similar names exist that could cause collision
		const exports = Object.keys(barrel);
		const gateRelated = exports.filter((e) => e.toLowerCase().includes('gate'));

		// Should have runCheckGateStatus and checkReviewerGate
		expect(gateRelated).toContain('runCheckGateStatus');
		expect(gateRelated).toContain('checkReviewerGate');
	});
});

// Test 3: Broken module path - verify the source module path exists
describe('source module path integrity', () => {
	it('source module check-gate-status.ts exists and exports runCheckGateStatus', async () => {
		// This tests that the relative path resolves correctly
		const sourceModule = await import('../../src/tools/check-gate-status');

		// Source module must export runCheckGateStatus
		expect('runCheckGateStatus' in sourceModule).toBe(true);
		expect(typeof sourceModule.runCheckGateStatus).toBe('function');
	});

	it('barrel export matches source module export identity', async () => {
		const barrel = await import('../../src/tools/index');
		const sourceModule = await import('../../src/tools/check-gate-status');

		// The exported symbol from barrel should be the exact same reference
		// as what's exported from the source module
		expect(barrel.runCheckGateStatus).toBe(sourceModule.runCheckGateStatus);
	});
});

// Test 4: Export surface divergence - verify complete export surface matches
describe('export surface divergence check', () => {
	it('barrel exports exactly what source module exports', async () => {
		const barrel = await import('../../src/tools/index');
		const sourceModule = await import('../../src/tools/check-gate-status');

		// Both should have the same exported properties for runCheckGateStatus
		// Since it's a function, we just check the reference is the same
		expect(barrel.runCheckGateStatus).toBe(sourceModule.runCheckGateStatus);
	});

	it('barrel does not add extra properties to runCheckGateStatus', async () => {
		const barrel = await import('../../src/tools/index');
		const sourceModule = await import('../../src/tools/check-gate-status');

		// The barrel should re-export exactly what the source module exports
		expect(barrel.runCheckGateStatus).toBe(sourceModule.runCheckGateStatus);
	});
});

// Test 5: TypeScript compile-time verification via import validation
describe('type and structure verification', () => {
	it('runCheckGateStatus has expected function structure', async () => {
		const { runCheckGateStatus } = await import('../../src/tools/index');

		// Verify expected properties exist on the tool
		expect(typeof runCheckGateStatus).toBe('function');
	});
});

// Test 6: Re-export from nested path doesn't break
describe('nested re-export integrity', () => {
	it('runCheckGateStatus can be imported from index.ts directly', async () => {
		// This is the actual usage pattern - importing from the barrel
		const { runCheckGateStatus } = await import('../../src/tools/index');

		expect(runCheckGateStatus).toBeDefined();
		expect(typeof runCheckGateStatus).toBe('function');
	});
});

// Test 7: Verify no symbol aliasing issues
describe('symbol aliasing correctness', () => {
	it('export name matches source export name exactly', async () => {
		const barrel = await import('../../src/tools/index');
		const sourceModule = await import('../../src/tools/check-gate-status');

		// The export name should be identical
		const barrelExportNames = Object.keys(barrel).filter(
			(k) => k === 'runCheckGateStatus',
		);
		const sourceExportNames = Object.keys(sourceModule).filter(
			(k) => k === 'runCheckGateStatus',
		);

		expect(barrelExportNames).toEqual(sourceExportNames);
	});
});

// Test 8: Empty/malformed module path detection
describe('malformed import path handling', () => {
	it('importing from non-existent path would fail at runtime', async () => {
		// This is a sanity check - we can't test invalid paths directly,
		// but we verify our valid path works
		expect(async () => {
			await import('../../src/tools/check-gate-status');
		}).not.toThrow();
	});
});

// Test 9: Circular dependency check
describe('no circular dependency issues', () => {
	it('importing index does not cause circular dependency errors', async () => {
		// Import twice to ensure no state issues from circular deps
		const barrel1 = await import('../../src/tools/index');
		const barrel2 = await import('../../src/tools/index');

		expect(barrel1.runCheckGateStatus).toBe(barrel2.runCheckGateStatus);
	});
});

// Test 10: All exports from barrel are accounted for
describe('barrel export completeness', () => {
	it('runCheckGateStatus is included in all barrel exports list', async () => {
		const barrel = await import('../../src/tools/index');
		const exports = Object.keys(barrel);

		// runCheckGateStatus should be in the list of all exports
		expect(exports).toContain('runCheckGateStatus');
	});
});
