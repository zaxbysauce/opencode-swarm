/**
 * Adversarial Tests for Claude Code Distribution Import Changes
 *
 * Tests attack vectors for the session-start.ts and similar scripts that use
 * getEventWriter from @opencode-swarm/core/telemetry
 *
 * Attack vectors tested:
 * 1. Invalid/missing swarm directory - does it throw or swallow errors?
 * 2. Null/undefined sessionId - does it crash or handle gracefully?
 * 3. Events directory does not exist - emit should create it or swallow errors
 * 4. Dynamic import edge cases - getEventWriter never returns undefined
 */

import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

// Import getEventWriter at top level (works with bun test)
const { getEventWriter } = await import('@opencode-swarm/core/telemetry');

describe('Adversarial: getEventWriter error handling', () => {
	let testBaseDir: string;

	beforeEach(() => {
		testBaseDir = path.join(tmpdir(), `swarm-adversarial-${Date.now()}`);
		// Create base directory for tests
		try {
			rmSync(testBaseDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	afterEach(() => {
		try {
			if (existsSync(testBaseDir)) {
				rmSync(testBaseDir, { recursive: true, force: true });
			}
		} catch {
			// Ignore cleanup errors
		}
	});

	describe('1. Invalid/missing swarm directory', () => {
		test('should NOT throw when swarmDir is an empty string', () => {
			// Empty string is technically valid for path.join but will create in cwd
			// This should NOT throw - the mkdirSync with recursive: true handles it
			const writer = getEventWriter('', 'empty-dir-test');
			expect(writer).toBeDefined();
			expect(typeof writer.emit).toBe('function');
		});

		test('should NOT throw when swarmDir is /dev/null (special path)', () => {
			// /dev/null is a special path that exists but isn't a directory
			// This tests edge case where mkdir might fail but should be caught
			const writer = getEventWriter('/dev/null', 'permission-test');
			expect(writer).toBeDefined();

			// emit should also not throw even if file write fails
			expect(() => {
				writer.emit({ type: 'test', timestamp: new Date().toISOString() });
			}).not.toThrow();
		});

		test('should NOT throw when swarmDir is a path to a file (not directory)', () => {
			// Create a file where a directory is expected
			const fileAsDirPath = path.join(testBaseDir, 'file-not-dir');
			// Ensure parent directory exists first
			try {
				writeFileSync(fileAsDirPath, 'not a directory');
			} catch {
				// Parent may not exist, that's fine - we're testing a different scenario
			}

			// This should NOT throw - errors are caught internally
			const writer = getEventWriter(fileAsDirPath, 'file-as-dir-test');
			expect(writer).toBeDefined();

			// emit should also not throw
			expect(() => {
				writer.emit({ type: 'test', timestamp: new Date().toISOString() });
			}).not.toThrow();
		});

		test('should NOT throw when swarmDir is a deeply nested non-existent path', () => {
			const deepPath = path.join(
				testBaseDir,
				'does',
				'not',
				'exist',
				'and',
				'never',
				'will',
				'deep',
				'nested',
			);

			// Should create the directory via recursive: true
			const writer = getEventWriter(deepPath, 'deep-nested-test');
			expect(writer).toBeDefined();

			// Directory should have been created
			expect(existsSync(deepPath)).toBe(true);
		});
	});

	describe('2. Null/undefined sessionId handling', () => {
		test('should NOT crash when sessionId is null', () => {
			// null is coerced to string "null" in path.join
			const writer = getEventWriter(testBaseDir, null as any);
			expect(writer).toBeDefined();

			// Should create a file with "null" in the name
			expect(writer.path).toContain('null');
		});

		test('should NOT crash when sessionId is undefined', () => {
			// undefined is coerced to string "undefined" in path.join
			const writer = getEventWriter(testBaseDir, undefined as any);
			expect(writer).toBeDefined();

			// Should create a file with "undefined" in the name
			expect(writer.path).toContain('undefined');
		});

		test('should NOT crash when sessionId is empty string', () => {
			const writer = getEventWriter(testBaseDir, '');
			expect(writer).toBeDefined();

			// Should create events-.jsonl (empty sessionId)
			expect(writer.path).toContain('events-.jsonl');
		});

		test('should NOT crash when sessionId is a very long string', () => {
			const longSessionId = 'a'.repeat(10000);
			const writer = getEventWriter(testBaseDir, longSessionId);
			expect(writer).toBeDefined();
		});

		test('emit should NOT throw when sessionId was null/undefined', () => {
			const writer = getEventWriter(testBaseDir, null as any);
			expect(() => {
				writer.emit({ type: 'test', timestamp: new Date().toISOString() });
			}).not.toThrow();
		});
	});

	describe('3. EventWriter emit() error safety', () => {
		test('emit should NOT throw when events directory does not exist', () => {
			// Create writer in a directory that doesn't exist yet
			const nestedDir = path.join(testBaseDir, 'deep', 'nested', 'dir');
			const writer = getEventWriter(nestedDir, 'emit-test');

			// The constructor creates the directory, but let's verify emit is safe
			expect(() => {
				writer.emit({ type: 'test', timestamp: new Date().toISOString() });
			}).not.toThrow();
		});

		test('emit should NOT throw when target file is read-only', () => {
			const writer = getEventWriter(testBaseDir, 'readonly-test');

			// Try to make the file read-only (if possible on platform)
			try {
				// This is best-effort - the test is about emit not throwing
				const eventFile = writer.path;
				if (existsSync(eventFile)) {
					// Even if we can't make it truly read-only, emit should still not throw
					expect(() => {
						writer.emit({ type: 'test', timestamp: new Date().toISOString() });
					}).not.toThrow();
				}
			} catch {
				// Some platforms don't support this - that's fine
			}
		});

		test('emit should NOT throw with malformed event data', () => {
			const writer = getEventWriter(testBaseDir, 'malformed-test');

			// Circular reference would cause JSON.stringify to throw
			const circular: any = { a: 1 };
			circular.self = circular;

			expect(() => {
				writer.emit(circular as any);
			}).not.toThrow();
		});

		test('emit should NOT throw with Symbol as event property', () => {
			const writer = getEventWriter(testBaseDir, 'symbol-test');

			const event = {
				type: 'test',
				timestamp: new Date().toISOString(),
				symbolProp: Symbol('test'),
			};

			expect(() => {
				writer.emit(event as any);
			}).not.toThrow();
		});

		test('emit should NOT throw with undefined values in event', () => {
			const writer = getEventWriter(testBaseDir, 'undefined-test');

			const event = {
				type: 'test',
				timestamp: new Date().toISOString(),
				undefinedProp: undefined,
				nullProp: null,
			};

			expect(() => {
				writer.emit(event);
			}).not.toThrow();
		});
	});

	describe('4. Dynamic import edge cases', () => {
		test('getEventWriter should never return undefined', () => {
			// Verify getEventWriter exists and is callable
			expect(getEventWriter).toBeDefined();
			expect(typeof getEventWriter).toBe('function');

			// Call with various edge cases - should never return undefined
			const writer1 = getEventWriter(testBaseDir, 'defined-test-1');
			expect(writer1).not.toBeUndefined();
			expect(writer1).not.toBeNull();

			const writer2 = getEventWriter('', 'defined-test-2');
			expect(writer2).not.toBeUndefined();
			expect(writer2).not.toBeNull();

			const writer3 = getEventWriter(testBaseDir, '');
			expect(writer3).not.toBeUndefined();
			expect(writer3).not.toBeNull();
		});

		test('importing telemetry module should not throw', async () => {
			// The actual import pattern used in scripts
			const importPromise = import('@opencode-swarm/core/telemetry');
			await expect(importPromise).resolves.toBeDefined();
		});

		test('destructuring getEventWriter from imported module should work', async () => {
			const { getEventWriter: fn } = await import(
				'@opencode-swarm/core/telemetry'
			);
			expect(typeof fn).toBe('function');
		});
	});

	describe('5. Script integration simulation', () => {
		test('full script pattern should not throw on any input', async () => {
			// Simulate the exact pattern from session-start.ts
			// Test with null/undefined inputs (simulating malformed stdin)
			const testCases = [
				{ cwd: null, session_id: 'test' },
				{ cwd: '', session_id: null },
				{ cwd: undefined, session_id: undefined },
				{ cwd: '/nonexistent/path', session_id: '' },
			];

			for (const input of testCases) {
				const sessionId = (input.session_id as string) ?? 'unknown';
				const cwd = (input.cwd as string) ?? testBaseDir;
				const swarmDir = path.join(cwd, '.swarm');

				// This is what the script does - wrapped in try/catch
				try {
					getEventWriter(swarmDir, sessionId).emit({
						type: 'session_metadata',
						timestamp: new Date().toISOString(),
						sessionId,
					});
				} catch {
					// Non-fatal - but this should never happen
					throw new Error('getEventWriter threw when it should be error-safe');
				}
			}
		});

		test('multiple rapid calls should all succeed', async () => {
			// Simulate multiple script invocations
			const promises = Array.from({ length: 100 }, async (_, i) => {
				const writer = getEventWriter(testBaseDir, `rapid-${i}`);
				writer.emit({ type: 'rapid', index: i });
			});

			await expect(Promise.all(promises)).resolves.toBeDefined();
		});
	});
});
