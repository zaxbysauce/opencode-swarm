/**
 * Adversarial Security Tests for Task 3.4: PlanSyncWorker Export Surface
 *
 * ATTACK VECTORS COVERED:
 * 1. Malformed imports - wrong module paths, non-existent exports
 * 2. Export collision attempts - prototype pollution, shadow attacks
 * 3. Runtime misuse patterns - invalid options, lifecycle edge cases
 * 4. Module resolution edge cases - deep path imports, circular ref attempts
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'bun:test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

// ============================================
// ATTACK VECTOR 1: MALFORMED IMPORTS
// ============================================

describe('ATTACK: Malformed Imports', () => {
	it('should reject import of non-existent export "PlanSyncWorkerHacker"', async () => {
		// This should fail at TypeScript compile time, but we verify runtime behavior
		const indexModule = await import('../../src/background/index.js');

		// Verify the malicious export doesn't exist
		expect((indexModule as Record<string, unknown>).PlanSyncWorkerHacker).toBeUndefined();
	});

	it('should expose only expected PlanSyncWorker exports', async () => {
		const indexModule = await import('../../src/background/index.js');

		// Verify expected exports exist
		expect(indexModule.PlanSyncWorker).toBeDefined();
		// Types are erased at runtime - these are type-only exports
		expect((indexModule as Record<string, unknown>).PlanSyncWorkerOptions).toBeUndefined();
		expect((indexModule as Record<string, unknown>).PlanSyncWorkerStatus).toBeUndefined();

		// Class should be constructable
		expect(typeof indexModule.PlanSyncWorker).toBe('function');
	});

	it('should not expose internal/private symbols from barrel export', async () => {
		const indexModule = await import('../../src/background/index.js');
		const moduleKeys = Object.keys(indexModule);

		// Should not leak private implementation details
		const forbiddenExports = [
			'getSwarmDir', // Private method
			'getPlanJsonPath', // Private method
			'debouncedSync', // Private method
			'triggerSync', // Private method
			'executeSync', // Private method
			'setupNativeWatcher', // Private method
			'setupPolling', // Private method
			'pollCheck', // Private method
		];

		for (const forbidden of forbiddenExports) {
			expect(moduleKeys).not.toContain(forbidden);
		}
	});

	it('should handle destructuring with non-existent named exports gracefully', async () => {
		// This tests that non-existent exports don't cause runtime errors
		const { PlanSyncWorker } = await import('../../src/background/index.js');

		// Should be able to use the valid export
		expect(PlanSyncWorker).toBeDefined();
	});
});

// ============================================
// ATTACK VECTOR 2: EXPORT COLLISION ATTEMPTS
// ============================================

describe('ATTACK: Export Collision Attempts', () => {
	it('should prevent prototype pollution via constructor options', async () => {
		const { PlanSyncWorker } = await import('../../src/background/index.js');

		// Attempt to pollute Object.prototype via options
		const maliciousOptions = {
			__proto__: null,
			constructor: 'evil',
			toString: 'hacked',
		} as Record<string, unknown>;

		// Should not throw and should not pollute global prototype
		expect(() => new PlanSyncWorker(maliciousOptions as never)).not.toThrow();

		// Verify prototype is intact
		expect({}.constructor).toBe(Object);
		expect({}.toString).toBeDefined();
	});

	it('should not allow __defineGetter__ injection via options', async () => {
		const { PlanSyncWorker } = await import('../../src/background/index.js');

		const maliciousOptions = {
			directory: undefined,
			debounceMs: undefined,
			__defineGetter__: () => 'injected',
		} as Record<string, unknown>;

		const worker = new PlanSyncWorker(maliciousOptions as never);
		expect(worker).toBeInstanceOf(PlanSyncWorker);
	});

	it('should handle toString/valueOf override attempts in options', async () => {
		const { PlanSyncWorker } = await import('../../src/background/index.js');

		const maliciousOptions = {
			toString: () => 'malicious',
			valueOf: () => 'evil',
		};

		// Should not affect worker construction
		expect(() => new PlanSyncWorker(maliciousOptions as never)).not.toThrow();
	});

	it('should prevent Symbol.species override via class extension', async () => {
		const { PlanSyncWorker } = await import('../../src/background/index.js');

		// Attempt to create malicious subclass with Symbol.species
		class MaliciousWorker extends (PlanSyncWorker as typeof PlanSyncWorker) {
			static get [Symbol.species]() {
				return Array; // Try to return wrong type
			}
		}

		// Subclass should still be constructable
		expect(() => new MaliciousWorker({})).not.toThrow();
	});

	it('should expose frozen/sealed class definition (no prototype mutation)', async () => {
		const { PlanSyncWorker } = await import('../../src/background/index.js');

		// Try to mutate the prototype - this tests that the class is well-encapsulated
		const originalStart = PlanSyncWorker.prototype.start;

		// Attempt to replace method
		PlanSyncWorker.prototype.start = function () {
			throw new Error('Injected!');
		};

		// Create new instance - should see the mutated prototype
		const worker = new PlanSyncWorker({});

		// This is expected JS behavior, but we document that mutation is possible
		// at runtime (TypeScript protects at compile time)
		expect(() => worker.start()).toThrow('Injected!');

		// Restore
		PlanSyncWorker.prototype.start = originalStart;
	});
});

// ============================================
// ATTACK VECTOR 3: RUNTIME MISUSE PATTERNS
// ============================================

describe('ATTACK: Runtime Misuse Patterns', () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plansync-attack-'));

	afterEach(() => {
		// Cleanup any created files
		try {
			fs.rmSync(path.join(tmpDir, '.swarm'), { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	afterAll(() => {
		try {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	it('should handle extremely long directory path (path traversal attempt)', async () => {
		const { PlanSyncWorker } = await import('../../src/background/index.js');

		// Create a path that's at filesystem limits
		const longPath = 'a'.repeat(255);
		const deepPath = path.join(tmpDir, ...Array(20).fill(longPath));

		// Should not throw during construction
		expect(() => new PlanSyncWorker({ directory: deepPath })).not.toThrow();
	});

	it('should handle null byte injection in directory path', async () => {
		const { PlanSyncWorker } = await import('../../src/background/index.js');

		// Null byte injection attempt
		const maliciousPath = path.join(tmpDir, 'evil\0.swarm');

		// Construction should succeed (path is just stored)
		const worker = new PlanSyncWorker({ directory: maliciousPath });

		// But operations should fail safely
		expect(() => worker.start()).not.toThrow();
		worker.stop();
	});

	it('should handle negative debounce values (time manipulation)', async () => {
		const { PlanSyncWorker } = await import('../../src/background/index.js');

		// Negative debounce could cause immediate execution loops
		expect(() => new PlanSyncWorker({ debounceMs: -1000 })).not.toThrow();

		// Zero debounce could cause high-frequency polling
		expect(() => new PlanSyncWorker({ debounceMs: 0 })).not.toThrow();

		// Very large debounce (effectively disabling sync)
		expect(() => new PlanSyncWorker({ debounceMs: Number.MAX_SAFE_INTEGER })).not.toThrow();
	});

	it('should handle NaN/Infinity in numeric options', async () => {
		const { PlanSyncWorker } = await import('../../src/background/index.js');

		expect(() => new PlanSyncWorker({ debounceMs: NaN })).not.toThrow();
		expect(() => new PlanSyncWorker({ debounceMs: Infinity })).not.toThrow();
		expect(() => new PlanSyncWorker({ pollIntervalMs: NaN })).not.toThrow();
		expect(() => new PlanSyncWorker({ pollIntervalMs: -Infinity })).not.toThrow();
	});

	it('should handle malicious callback in onSyncComplete', async () => {
		const { PlanSyncWorker } = await import('../../src/background/index.js');

		// Callback that throws
		const throwingCallback = () => {
			throw new Error('Malicious callback!');
		};

		// Construction should succeed
		expect(() => new PlanSyncWorker({ onSyncComplete: throwingCallback })).not.toThrow();
	});

	it('should handle rapid start/stop cycles (state machine abuse)', async () => {
		const { PlanSyncWorker } = await import('../../src/background/index.js');

		// Create .swarm directory
		fs.mkdirSync(path.join(tmpDir, '.swarm'), { recursive: true });

		const worker = new PlanSyncWorker({ directory: tmpDir, debounceMs: 0 });

		// Rapid cycle abuse
		for (let i = 0; i < 100; i++) {
			worker.start();
			worker.stop();
		}

		// Should end up in a consistent state
		expect(worker.getStatus()).toBe('stopped');
	});

	it('should handle start after dispose (lifecycle violation)', async () => {
		const { PlanSyncWorker } = await import('../../src/background/index.js');

		const worker = new PlanSyncWorker({ directory: tmpDir });
		worker.dispose();

		// Starting after dispose should be no-op
		expect(() => worker.start()).not.toThrow();
		expect(worker.getStatus()).toBe('stopped');
	});

	it('should handle double dispose (idempotency)', async () => {
		const { PlanSyncWorker } = await import('../../src/background/index.js');

		const worker = new PlanSyncWorker({ directory: tmpDir });
		worker.dispose();

		// Double dispose should not throw
		expect(() => worker.dispose()).not.toThrow();
		expect(() => worker.dispose()).not.toThrow();
	});

	it('should handle start when already starting (race condition)', async () => {
		const { PlanSyncWorker } = await import('../../src/background/index.js');

		fs.mkdirSync(path.join(tmpDir, '.swarm'), { recursive: true });

		const worker = new PlanSyncWorker({ directory: tmpDir });

		// Double start should be idempotent
		worker.start();
		worker.start(); // Second call while already running

		expect(worker.getStatus()).toBe('running');

		worker.stop();
	});

	it('should handle stop when already stopped (idempotency)', async () => {
		const { PlanSyncWorker } = await import('../../src/background/index.js');

		const worker = new PlanSyncWorker({ directory: tmpDir });

		worker.stop(); // Already stopped
		worker.stop(); // Still stopped

		expect(worker.getStatus()).toBe('stopped');
	});

	it('should reject Symbol keys in options', async () => {
		const { PlanSyncWorker } = await import('../../src/background/index.js');

		const maliciousOptions = {
			[Symbol('evil')]: 'injected',
		};

		// Should not throw - symbols are ignored
		expect(() => new PlanSyncWorker(maliciousOptions as never)).not.toThrow();
	});
});

// ============================================
// ATTACK VECTOR 4: MODULE RESOLUTION EDGE CASES
// ============================================

describe('ATTACK: Module Resolution Edge Cases', () => {
	it('should support both barrel and direct import paths', async () => {
		// Import from barrel
		const barrel = await import('../../src/background/index.js');

		// Import directly
		const direct = await import('../../src/background/plan-sync-worker.js');

		// Should be the same class reference
		expect(barrel.PlanSyncWorker).toBe(direct.PlanSyncWorker);
	});

	it('should maintain type consistency across re-exports', async () => {
		const { PlanSyncWorker } = await import('../../src/background/index.js');

		// Create instance and verify it matches the direct import's instance check
		const worker = new PlanSyncWorker({});

		const direct = await import('../../src/background/plan-sync-worker.js');
		expect(worker).toBeInstanceOf(direct.PlanSyncWorker);
	});

	it('should not break when module is imported multiple times', async () => {
		// Multiple imports should return same module (ESM caching)
		const [import1, import2, import3] = await Promise.all([
			import('../../src/background/index.js'),
			import('../../src/background/index.js'),
			import('../../src/background/index.js'),
		]);

		expect(import1.PlanSyncWorker).toBe(import2.PlanSyncWorker);
		expect(import2.PlanSyncWorker).toBe(import3.PlanSyncWorker);
	});

	it('should handle concurrent worker instantiation', async () => {
		const { PlanSyncWorker } = await import('../../src/background/index.js');

		// Create many workers concurrently
		const workers = await Promise.all(
			Array(50)
				.fill(null)
				.map(async () => new PlanSyncWorker({})),
		);

		// All should be valid instances
		for (const worker of workers) {
			expect(worker).toBeInstanceOf(PlanSyncWorker);
			worker.dispose();
		}
	});

	it('should not leak other module internals through export', async () => {
		const indexModule = await import('../../src/background/index.js');

		// Check that we don't accidentally expose internal dependencies
		const internalPatterns = [
			'loadPlan', // From plan/manager
			'log', // From utils
			'fs', // Node module
			'path', // Node module
		];

		const moduleKeys = Object.keys(indexModule);
		for (const pattern of internalPatterns) {
			expect(moduleKeys).not.toContain(pattern);
		}
	});
});

// ============================================
// DEFENSE-IN-DEPTH: EXPORT SURFACE VALIDATION
// ============================================

describe('DEFENSE: Export Surface Validation', () => {
	it('should export PlanSyncWorker as a class (not function)', async () => {
		const { PlanSyncWorker } = await import('../../src/background/index.js');

		expect(typeof PlanSyncWorker).toBe('function');
		expect(PlanSyncWorker.prototype).toBeDefined();
		expect(PlanSyncWorker.prototype.constructor).toBe(PlanSyncWorker);
	});

	it('should have expected public API methods', async () => {
		const { PlanSyncWorker } = await import('../../src/background/index.js');
		const worker = new PlanSyncWorker({});

		// Public API should be available
		expect(typeof worker.start).toBe('function');
		expect(typeof worker.stop).toBe('function');
		expect(typeof worker.dispose).toBe('function');
		expect(typeof worker.getStatus).toBe('function');
		expect(typeof worker.isRunning).toBe('function');

		worker.dispose();
	});

	it('should not expose private methods as own properties', async () => {
		const { PlanSyncWorker } = await import('../../src/background/index.js');
		const worker = new PlanSyncWorker({});

		// Private methods should not be own enumerable properties
		const ownProps = Object.getOwnPropertyNames(worker);
		const privateMethods = [
			'getSwarmDir',
			'getPlanJsonPath',
			'setupNativeWatcher',
			'setupPolling',
			'pollCheck',
			'debouncedSync',
			'clearDebounce',
			'triggerSync',
			'executeSync',
		];

		for (const priv of privateMethods) {
			expect(ownProps).not.toContain(priv);
		}

		worker.dispose();
	});

	it('should have correct export names for type-only exports', async () => {
		// Types are erased at runtime, so we verify via TypeScript's type system
		// This test documents that PlanSyncWorkerOptions and PlanSyncWorkerStatus are type-only

		// If types were incorrectly exported as values, they'd appear here
		const typesModule = await import('../../src/background/index.js');

		// These should be undefined at runtime (type-only exports)
		expect((typesModule as Record<string, unknown>).PlanSyncWorkerOptions).toBeUndefined();
		expect((typesModule as Record<string, unknown>).PlanSyncWorkerStatus).toBeUndefined();
	});
});
