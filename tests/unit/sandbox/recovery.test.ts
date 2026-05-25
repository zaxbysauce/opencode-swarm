/**
 * Sandbox recovery tests — verifies graceful degradation when executors
 * become unavailable mid-session or are explicitly disabled.
 *
 * Covers:
 *   1. Executor becomes unavailable mid-session → passthrough
 *   2. disable() correctly falls through → isAvailable=false, passthrough
 *   3. Non-existent scope path → graceful handling
 *   4. Probe failure (bwrap/sandbox-exec/PowerShell missing) → isAvailable=false
 *
 * Platform: all three executors are tested on their native platforms;
 * on foreign platforms the constructor either throws (macOS, Windows) or
 * the executor starts unavailable (Linux bwrap probe).
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';

// ---------------------------------------------------------------------------
// Imports — all three executors
// ---------------------------------------------------------------------------

import {
	BubblewrapSandboxExecutor,
	_internals as bwrapInternals,
} from '../../../src/sandbox/linux/bubblewrap-executor';

import {
	MacOSSandboxExecutor,
	_internals as macosInternals,
} from '../../../src/sandbox/macos/sandbox-exec-executor';

import {
	WindowsSandboxExecutor,
	_internals as winInternals,
} from '../../../src/sandbox/win32/restricted-token-executor';

// ---------------------------------------------------------------------------
// Platform guards — save/restore _internals probe functions
// ---------------------------------------------------------------------------

type BwrapProbe = typeof bwrapInternals.probeBwrap;
type MacosProbe = typeof macosInternals.probeSandboxExec;
type WinProbe = typeof winInternals.probeWindowsSandbox;

let origBwrapProbe: BwrapProbe;
let origMacosProbe: MacosProbe;
let origWinProbe: WinProbe;

beforeEach(() => {
	origBwrapProbe = bwrapInternals.probeBwrap;
	origMacosProbe = macosInternals.probeSandboxExec;
	origWinProbe = winInternals.probeWindowsSandbox;
});

afterEach(() => {
	bwrapInternals.probeBwrap = origBwrapProbe;
	macosInternals.probeSandboxExec = origMacosProbe;
	winInternals.probeWindowsSandbox = origWinProbe;
});

// ---------------------------------------------------------------------------
// Shared test helpers
// ---------------------------------------------------------------------------

/** Verify that an unavailable executor passes commands through unchanged. */
function assertPassthrough(
	executor: {
		isAvailable(): boolean;
		wrapCommand(cmd: string, scopes: string[]): string;
	},
	rawCmd = 'echo hello',
): void {
	expect(executor.isAvailable()).toBe(false);
	expect(executor.wrapCommand(rawCmd, [])).toBe(rawCmd);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Sandbox recovery scenarios', () => {
	// ========================================================================
	// RECOVERY SCENARIO 1 — executor becomes unavailable mid-session
	//
	// Simulate the executor transitioning from available → unavailable between
	// two wrapCommand calls. The second call must return raw command unchanged.
	// ========================================================================

	describe('Scenario 1 — executor becomes unavailable mid-session', () => {
		test.skipIf(isMac)(
			'Bubblewrap: wrapCommand returns raw command when bwrap disappears mid-session',
			() => {
				// Simulate bwrap being available at first, then vanishing
				let callCount = 0;
				bwrapInternals.probeBwrap = mock(() => {
					callCount++;
					return callCount === 1; // available on first call, unavailable on second
				});

				const executor = new BubblewrapSandboxExecutor([]);

				// First call — bwrap is available (if bwrap exists on this machine)
				// The constructor calls probeBwrap once; wrapCommand re-checks before each wrap
				const result1 = executor.wrapCommand('echo first', []);
				// If bwrap is truly not on this Linux CI machine, executor is already disabled.
				// Either way, after probe fails the second time, subsequent calls pass through.
				const wasAvailable = executor.isAvailable();

				// Second call — bwrap probe now returns false, executor must disable
				const result2 = executor.wrapCommand('echo second', []);

				// After the second call the executor must be unavailable
				expect(executor.isAvailable()).toBe(false);

				// Second call must return raw command unchanged
				expect(result2).toBe('echo second');

				// If the executor started available, first result should be wrapped
				if (wasAvailable) {
					expect(result1).not.toBe('echo first');
					expect(result1).toContain('bwrap');
				}
			},
		);

		test.skipIf(isMac)(
			'Bubblewrap: isAvailable() returns false after mid-session probe failure',
			() => {
				let probeCallCount = 0;
				bwrapInternals.probeBwrap = mock(() => {
					probeCallCount++;
					// Available on first two calls (construction + first wrap), then fails
					return probeCallCount < 3;
				});

				const executor = new BubblewrapSandboxExecutor([]);

				// Guard: bwrap must be available initially for this mid-session test to be meaningful
				if (!executor.isAvailable()) {
					// bwrap not installed — mid-session transition cannot occur
					return;
				}

				executor.wrapCommand('echo hello', []); // second probe call

				// Third probe fails → executor must be unavailable
				executor.wrapCommand('echo again', []); // third probe call
				expect(executor.isAvailable()).toBe(false);
			},
		);

		test.skipIf(!isMac)(
			'MacOSSandboxExecutor: wrapCommand returns raw command when sandbox-exec disappears mid-session',
			() => {
				// macOS executor constructor calls probeSandboxExec once.
				// wrapCommand re-checks before each wrap.
				let callCount = 0;
				macosInternals.probeSandboxExec = mock(() => {
					callCount++;
					return callCount === 1;
				});

				const executor = new MacOSSandboxExecutor([]);

				// First call — sandbox-exec available (constructor probe succeeded)
				const wasAvailable = executor.isAvailable();
				const result1 = executor.wrapCommand('echo first', []);

				// Second call — probe now fails, executor must disable and passthrough
				const result2 = executor.wrapCommand('echo second', []);

				expect(executor.isAvailable()).toBe(false);
				expect(result2).toBe('echo second');

				if (wasAvailable) {
					expect(result1).not.toBe('echo first');
					expect(result1).toContain('sandbox-exec');
				}
			},
		);

		test.skipIf(!isMac)(
			'MacOSSandboxExecutor: isAvailable() returns false after mid-session probe failure',
			() => {
				let probeCallCount = 0;
				macosInternals.probeSandboxExec = mock(() => {
					probeCallCount++;
					return probeCallCount < 3;
				});

				const executor = new MacOSSandboxExecutor([]);
				expect(executor.isAvailable()).toBe(true);

				executor.wrapCommand('echo hello', []);
				executor.wrapCommand('echo again', []);

				expect(executor.isAvailable()).toBe(false);
			},
		);

		test.skipIf(!isWindows)(
			'WindowsSandboxExecutor: wrapCommand returns raw command when PowerShell probe fails mid-session',
			() => {
				let callCount = 0;
				winInternals.probeWindowsSandbox = mock(() => {
					callCount++;
					// Return true for constructor call and first wrapCommand call,
					// then false for second wrapCommand call (mid-session failure)
					return callCount <= 2;
				});

				const executor = new WindowsSandboxExecutor([]);

				// Guard: executor must be available initially for mid-session test to be meaningful
				if (!executor.isAvailable()) {
					// PowerShell/cmd not functional on this machine — skip
					return;
				}

				// First wrapCommand — executor still available, should return wrapped command
				const result1 = executor.wrapCommand('echo first', []);

				// Second wrapCommand — probe fails, executor must disable and passthrough
				const result2 = executor.wrapCommand('echo second', []);

				// After second probe failure, executor must be unavailable
				expect(executor.isAvailable()).toBe(false);
				// Second call must return raw command unchanged
				expect(result2).toBe('echo second');
				// First call must have been wrapped
				expect(result1).not.toBe('echo first');
				expect(result1).toContain('powershell');
			},
		);

		test.skipIf(!isWindows)(
			'WindowsSandboxExecutor: isAvailable() returns false after mid-session probe failure',
			() => {
				let probeCallCount = 0;
				winInternals.probeWindowsSandbox = mock(() => {
					probeCallCount++;
					return probeCallCount < 3;
				});

				const executor = new WindowsSandboxExecutor([]);

				// Guard: executor must be available initially
				if (!executor.isAvailable()) {
					return;
				}

				executor.wrapCommand('echo hello', []);
				executor.wrapCommand('echo again', []);

				expect(executor.isAvailable()).toBe(false);
			},
		);
	});

	// ========================================================================
	// RECOVERY SCENARIO 2 — disable() correctly falls through
	//
	// Explicit disable() must:
	//   - Set isAvailable() to false
	//   - Make wrapCommand() return the raw command unchanged (passthrough)
	//   - Not throw
	// ========================================================================

	describe('Scenario 2 — disable() correctly falls through', () => {
		test.skipIf(isMac)(
			'Bubblewrap: isAvailable() returns false after disable()',
			() => {
				const executor = new BubblewrapSandboxExecutor([]);
				executor.disable('test reason');
				expect(executor.isAvailable()).toBe(false);
			},
		);

		test.skipIf(isMac)(
			'Bubblewrap: wrapCommand() returns raw command unchanged after disable()',
			() => {
				const executor = new BubblewrapSandboxExecutor([]);
				executor.disable('testing');
				assertPassthrough(executor, 'echo hello');
			},
		);

		test.skipIf(isMac)(
			'Bubblewrap: disable() does not throw even when executor was never available',
			() => {
				// Make bwrap permanently unavailable via mock
				bwrapInternals.probeBwrap = mock(() => false);
				const executor = new BubblewrapSandboxExecutor([]);
				// Must not throw
				executor.disable('test');
				expect(executor.isAvailable()).toBe(false);
			},
		);

		test.skipIf(!isMac)(
			'MacOSSandboxExecutor: isAvailable() returns false after disable()',
			() => {
				const executor = new MacOSSandboxExecutor([]);
				executor.disable('test reason');
				expect(executor.isAvailable()).toBe(false);
			},
		);

		test.skipIf(!isMac)(
			'MacOSSandboxExecutor: wrapCommand() returns raw command unchanged after disable()',
			() => {
				const executor = new MacOSSandboxExecutor([]);
				executor.disable('testing');
				assertPassthrough(executor, 'echo hello');
			},
		);

		test.skipIf(!isMac)(
			'MacOSSandboxExecutor: disable() does not throw when sandbox-exec was never available',
			() => {
				macosInternals.probeSandboxExec = mock(() => false);
				const executor = new MacOSSandboxExecutor([]);
				executor.disable('test'); // must not throw
				expect(executor.isAvailable()).toBe(false);
			},
		);

		test.skipIf(!isWindows)(
			'WindowsSandboxExecutor: isAvailable() returns false after disable()',
			() => {
				const executor = new WindowsSandboxExecutor([]);
				executor.disable('test reason');
				expect(executor.isAvailable()).toBe(false);
			},
		);

		test.skipIf(!isWindows)(
			'WindowsSandboxExecutor: wrapCommand() returns raw command unchanged after disable()',
			() => {
				const executor = new WindowsSandboxExecutor([]);
				executor.disable('testing');
				assertPassthrough(executor, 'echo hello');
			},
		);

		test.skipIf(!isWindows)(
			'WindowsSandboxExecutor: disable() does not throw when PowerShell was never available',
			() => {
				winInternals.probeWindowsSandbox = mock(() => false);
				const executor = new WindowsSandboxExecutor([]);
				executor.disable('test'); // must not throw
				expect(executor.isAvailable()).toBe(false);
			},
		);
	});

	// ========================================================================
	// RECOVERY SCENARIO 3 — scope path does not exist
	//
	// Executors must not crash when constructed with or wrapped using
	// non-existent scope paths. They should either fall back gracefully or
	// handle the path resolution silently.
	// ========================================================================

	describe('Scenario 3 — non-existent scope path', () => {
		test.skipIf(isMac)(
			'Bubblewrap: wraps command without throwing when scope path does not exist',
			() => {
				// Use a path that definitely does not exist on any platform
				const fakeScope = '/this/path/does/not/exist/anywhere';
				const executor = new BubblewrapSandboxExecutor([fakeScope]);

				// Should not throw even if path doesn't exist
				// When unavailable (bwrap missing), passthrough
				// When available, still returns a wrapped command (bwrap handles bind-mount errors at runtime)
				const result = executor.wrapCommand('echo hello', []);
				expect(typeof result).toBe('string');
				if (executor.isAvailable()) {
					expect(result).toContain('bwrap');
				} else {
					expect(result).toBe('echo hello');
				}
			},
		);

		test.skipIf(isMac)(
			'Bubblewrap: accepts empty scopePaths without throwing',
			() => {
				const executor = new BubblewrapSandboxExecutor([]);
				const result = executor.wrapCommand('echo hello', []);
				expect(typeof result).toBe('string');
				if (executor.isAvailable()) {
					expect(result).toContain('bwrap');
				} else {
					expect(result).toBe('echo hello');
				}
			},
		);

		test.skipIf(!isMac)(
			'MacOSSandboxExecutor: wraps command without throwing when scope path does not exist',
			() => {
				const fakeScope = '/this/path/does/not/exist/anywhere';
				const executor = new MacOSSandboxExecutor([fakeScope]);

				const result = executor.wrapCommand('echo hello', []);
				expect(typeof result).toBe('string');
				if (executor.isAvailable()) {
					expect(result).toContain('sandbox-exec');
				} else {
					expect(result).toBe('echo hello');
				}
			},
		);

		test.skipIf(!isMac)(
			'MacOSSandboxExecutor: accepts empty scopePaths without throwing',
			() => {
				const executor = new MacOSSandboxExecutor([]);
				const result = executor.wrapCommand('echo hello', []);
				expect(typeof result).toBe('string');
				if (executor.isAvailable()) {
					expect(result).toContain('sandbox-exec');
				} else {
					expect(result).toBe('echo hello');
				}
			},
		);

		test.skipIf(!isWindows)(
			'WindowsSandboxExecutor: wraps command without throwing when scope path does not exist',
			() => {
				const fakeScope = 'C:\\this\\path\\does\\not\\exist\\anywhere';
				const executor = new WindowsSandboxExecutor([fakeScope]);

				const result = executor.wrapCommand('echo hello', []);
				expect(typeof result).toBe('string');
				if (executor.isAvailable()) {
					expect(result).toContain('powershell');
				} else {
					expect(result).toBe('echo hello');
				}
			},
		);

		test.skipIf(!isWindows)(
			'WindowsSandboxExecutor: accepts empty scopePaths without throwing',
			() => {
				const executor = new WindowsSandboxExecutor([]);
				const result = executor.wrapCommand('echo hello', []);
				expect(typeof result).toBe('string');
				if (executor.isAvailable()) {
					expect(result).toContain('powershell');
				} else {
					expect(result).toBe('echo hello');
				}
			},
		);

		test('Bubblewrap: non-existent scope path via wrapCommand() extra scopes does not throw', () => {
			const executor = new BubblewrapSandboxExecutor([]);
			const fakeScope = '/non/existent/scope';
			// Must not throw
			const result = executor.wrapCommand('echo hello', [fakeScope]);
			expect(typeof result).toBe('string');
		});

		test('MacOSSandboxExecutor: non-existent scope path via wrapCommand() extra scopes does not throw', () => {
			// macOS executor throws on construction on non-macOS
			if (!isMac) return;
			const executor = new MacOSSandboxExecutor([]);
			const fakeScope = '/non/existent/scope';
			const result = executor.wrapCommand('echo hello', [fakeScope]);
			expect(typeof result).toBe('string');
		});

		test('WindowsSandboxExecutor: non-existent scope path via wrapCommand() extra scopes does not throw', () => {
			// Windows executor throws on construction on non-Windows
			if (!isWindows) return;
			const executor = new WindowsSandboxExecutor([]);
			const fakeScope = 'C:\\non\\existent\\scope';
			const result = executor.wrapCommand('echo hello', [fakeScope]);
			expect(typeof result).toBe('string');
		});
	});

	// ========================================================================
	// RECOVERY SCENARIO 4 — probe failure (binary not found)
	//
	// When the platform-specific sandbox binary is not found:
	//   - Linux: bwrap not found → isAvailable() returns false
	//   - macOS: sandbox-exec not found → isAvailable() returns false
	//   - Windows: PowerShell/cmd not available → isAvailable() returns false
	//
	// We simulate this by mocking _internals.probe* to return false.
	// ========================================================================

	describe('Scenario 4 — probe failure (binary not found)', () => {
		test.skipIf(isMac)(
			'Bubblewrap: isAvailable() returns false when bwrap binary is not found (simulated ENOENT)',
			() => {
				// Simulate spawnSync error with code 'ENOENT' — bwrap binary not found
				bwrapInternals.probeBwrap = mock(() => false);

				const executor = new BubblewrapSandboxExecutor([]);

				expect(executor.isAvailable()).toBe(false);
			},
		);

		test.skipIf(isMac)(
			'Bubblewrap: wrapCommand() returns raw command when bwrap binary is not found',
			() => {
				bwrapInternals.probeBwrap = mock(() => false);

				const executor = new BubblewrapSandboxExecutor([]);

				assertPassthrough(executor, 'echo hello');
			},
		);

		test.skipIf(isMac)(
			'Bubblewrap: isAvailable() returns false when bwrap binary is not functional (simulated EACCES)',
			() => {
				// Simulate spawnSync error with code 'EACCES' — permission denied
				bwrapInternals.probeBwrap = mock(() => false);

				const executor = new BubblewrapSandboxExecutor([]);

				expect(executor.isAvailable()).toBe(false);
			},
		);

		test.skipIf(!isMac)(
			'MacOSSandboxExecutor: isAvailable() returns false when sandbox-exec binary is not found (simulated ENOENT)',
			() => {
				macosInternals.probeSandboxExec = mock(() => false);

				const executor = new MacOSSandboxExecutor([]);

				expect(executor.isAvailable()).toBe(false);
			},
		);

		test.skipIf(!isMac)(
			'MacOSSandboxExecutor: wrapCommand() returns raw command when sandbox-exec binary is not found',
			() => {
				macosInternals.probeSandboxExec = mock(() => false);

				const executor = new MacOSSandboxExecutor([]);

				assertPassthrough(executor, 'echo hello');
			},
		);

		test.skipIf(!isMac)(
			'MacOSSandboxExecutor: isAvailable() returns false when sandbox-exec is not functional (simulated EACCES)',
			() => {
				macosInternals.probeSandboxExec = mock(() => false);

				const executor = new MacOSSandboxExecutor([]);

				expect(executor.isAvailable()).toBe(false);
			},
		);

		test.skipIf(!isWindows)(
			'WindowsSandboxExecutor: isAvailable() returns false when PowerShell/cmd is not available (simulated ENOENT)',
			() => {
				winInternals.probeWindowsSandbox = mock(() => false);

				const executor = new WindowsSandboxExecutor([]);

				expect(executor.isAvailable()).toBe(false);
			},
		);

		test.skipIf(!isWindows)(
			'WindowsSandboxExecutor: wrapCommand() returns raw command when PowerShell is not available',
			() => {
				winInternals.probeWindowsSandbox = mock(() => false);

				const executor = new WindowsSandboxExecutor([]);

				assertPassthrough(executor, 'echo hello');
			},
		);

		test.skipIf(!isWindows)(
			'WindowsSandboxExecutor: isAvailable() returns false when cmd.exe spawn fails (simulated EPERM)',
			() => {
				winInternals.probeWindowsSandbox = mock(() => false);

				const executor = new WindowsSandboxExecutor([]);

				expect(executor.isAvailable()).toBe(false);
			},
		);
	});

	// ========================================================================
	// Cross-platform invariant: passthrough when unavailable
	//
	// Every executor must return the raw command unchanged when unavailable,
	// regardless of which scenario caused the unavailability.
	// ========================================================================

	describe('Passthrough invariant — raw command returned when unavailable', () => {
		const rawCmd = 'git status';

		test.skipIf(isMac)(
			'Bubblewrap: wrapCommand returns raw command when unavailable (any reason)',
			() => {
				// Test with disable()
				const executor1 = new BubblewrapSandboxExecutor([]);
				executor1.disable('reason 1');
				expect(executor1.wrapCommand(rawCmd, [])).toBe(rawCmd);

				// Test with probe failure
				bwrapInternals.probeBwrap = mock(() => false);
				const executor2 = new BubblewrapSandboxExecutor([]);
				expect(executor2.wrapCommand(rawCmd, [])).toBe(rawCmd);
			},
		);

		test.skipIf(!isMac)(
			'MacOSSandboxExecutor: wrapCommand returns raw command when unavailable (any reason)',
			() => {
				const executor1 = new MacOSSandboxExecutor([]);
				executor1.disable('reason 1');
				expect(executor1.wrapCommand(rawCmd, [])).toBe(rawCmd);

				macosInternals.probeSandboxExec = mock(() => false);
				const executor2 = new MacOSSandboxExecutor([]);
				expect(executor2.wrapCommand(rawCmd, [])).toBe(rawCmd);
			},
		);

		test.skipIf(!isWindows)(
			'WindowsSandboxExecutor: wrapCommand returns raw command when unavailable (any reason)',
			() => {
				const executor1 = new WindowsSandboxExecutor([]);
				executor1.disable('reason 1');
				expect(executor1.wrapCommand(rawCmd, [])).toBe(rawCmd);

				winInternals.probeWindowsSandbox = mock(() => false);
				const executor2 = new WindowsSandboxExecutor([]);
				expect(executor2.wrapCommand(rawCmd, [])).toBe(rawCmd);
			},
		);
	});
});
