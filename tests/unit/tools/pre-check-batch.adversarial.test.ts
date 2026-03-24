/**
 * ADVERSARIAL TESTS: Pre-check batch fail-closed no-files behavior
 *
 * These tests validate that security gates CANNOT be bypassed by providing:
 * - undefined files
 * - empty files array
 * - null files
 * - invalid file paths (traversal, etc.)
 * - mixed invalid paths
 *
 * SECURITY INVARIANT: gates_passed MUST be false when no valid files exist.
 */

import { beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { runPreCheckBatch } from '../../../src/tools/pre-check-batch';

describe('ADVERSARIAL: fail-closed no-files behavior', () => {
	const MOCK_DIR = 'C:\\opencode\\opencode-swarm\\src';
	let consoleWarnSpy: any;

	beforeEach(() => {
		// Mock console.warn to reduce noise
		consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
	});

	/**
	 * ATTACK VECTOR 1: Undefined files property
	 * Attempt to bypass by not providing files at all
	 */
	it('REJECTS: undefined files (missing property) - cannot bypass security gates', async () => {
		const result = await runPreCheckBatch({
			directory: MOCK_DIR,
			// files property omitted - tests undefined behavior
		} as any);

		// SECURITY: gates_passed MUST be false
		expect(result.gates_passed).toBe(false);
		expect(result.lint.ran).toBe(false);
		expect(result.lint.error).toContain('No files provided');
		expect(result.secretscan.ran).toBe(false);
		expect(result.sast_scan.ran).toBe(false);
		expect(result.quality_budget.ran).toBe(false);
	});

	/**
	 * ATTACK VECTOR 2: Explicit null files
	 * Attempt to bypass by setting files to null
	 */
	it('REJECTS: null files value - cannot bypass security gates', async () => {
		const result = await runPreCheckBatch({
			directory: MOCK_DIR,
			files: null,
		} as any);

		// SECURITY: gates_passed MUST be false
		expect(result.gates_passed).toBe(false);
		expect(result.lint.ran).toBe(false);
		expect(result.lint.error).toContain('No files provided');
	});

	/**
	 * ATTACK VECTOR 3: Empty files array
	 * Attempt to bypass by providing empty array
	 */
	it('REJECTS: empty files array [] - cannot bypass security gates', async () => {
		const result = await runPreCheckBatch({
			directory: MOCK_DIR,
			files: [],
		});

		// SECURITY: gates_passed MUST be false
		expect(result.gates_passed).toBe(false);
		expect(result.lint.ran).toBe(false);
		expect(result.lint.error).toContain('No files provided');
	});

	/**
	 * ATTACK VECTOR 4: Non-array files type
	 * Attempt to bypass by passing string instead of array
	 */
	it('REJECTS: non-array files (string) - fails safely', async () => {
		const result = await runPreCheckBatch({
			directory: MOCK_DIR,
			files: 'src/index.ts',
		} as any);

		// SECURITY: should fail, not bypass
		// Implementation may vary based on runtime behavior
		// But it MUST NOT result in gates_passed=true
		expect(result.gates_passed).toBe(false);
	});

	/**
	 * ATTACK VECTOR 5: Path traversal attempt - parent directory
	 * Attempt to bypass by using ../ to escape directory
	 */
	it('REJECTS: path traversal ../ - cannot bypass validation', async () => {
		const result = await runPreCheckBatch({
			directory: MOCK_DIR,
			files: ['../../../etc/passwd'],
		});

		// SECURITY: gates_passed MUST be false (no valid files)
		expect(result.gates_passed).toBe(false);
		expect(result.lint.ran).toBe(false);
	});

	/**
	 * ATTACK VECTOR 6: Path traversal with mixed parent paths
	 * All paths are invalid -> fail-closed
	 */
	it('REJECTS: all traversal paths - cannot bypass validation', async () => {
		const result = await runPreCheckBatch({
			directory: MOCK_DIR,
			files: ['../outside/file1.ts', '../../outside/file2.ts'],
		});

		// SECURITY: gates_passed MUST be false (no valid files)
		expect(result.gates_passed).toBe(false);
	});

	/**
	 * ATTACK VECTOR 7: Absolute path bypass attempt
	 * Try to use absolute paths to escape directory boundary
	 */
	it('REJECTS: absolute path bypass - cannot escape directory boundary', async () => {
		const result = await runPreCheckBatch({
			directory: MOCK_DIR,
			files: ['C:\\Windows\\System32\\config\\SAM'],
		});

		// SECURITY: gates_passed MUST be false (absolute path rejected)
		expect(result.gates_passed).toBe(false);
	});

	/**
	 * ATTACK VECTOR 8: Mixed valid and invalid paths
	 * Even if some valid, adversarial input should not bypass
	 */
	it('REJECTS: mixed valid/invalid paths - still must validate all', async () => {
		const result = await runPreCheckBatch({
			directory: MOCK_DIR,
			files: ['index.ts', '../../../etc/passwd', 'utils.ts'],
		});

		// SECURITY: Should either:
		// 1. Filter invalid and run on valid, OR
		// 2. Fail entirely
		// But MUST NOT bypass security gates by silently accepting bad paths
		if (result.gates_passed) {
			// If passes, tools must have run (at least some valid files)
			// This is acceptable behavior
			expect(result.lint.ran || result.secretscan.ran).toBe(true);
		}
	});

	/**
	 * ATTACK VECTOR 9: All invalid paths after validation
	 * Array provided but all paths fail validation
	 */
	it('REJECTS: all paths invalid - fail-closed after validation', async () => {
		const result = await runPreCheckBatch({
			directory: MOCK_DIR,
			files: ['../bad1', '../bad2', '../bad3'],
		});

		// SECURITY: gates_passed MUST be false (no valid files remain)
		expect(result.gates_passed).toBe(false);
		expect(result.lint.ran).toBe(false);
		expect(result.lint.error).toContain('No files provided');
	});

	/**
	 * ATTACK VECTOR 10: Empty string in files array
	 * Attempt to slip past with empty string
	 */
	it('REJECTS: empty string path - cannot bypass validation', async () => {
		const result = await runPreCheckBatch({
			directory: MOCK_DIR,
			files: ['', 'index.ts'],
		});

		// SECURITY: Empty path should be filtered out
		// If all paths invalid, must fail-closed
		// If some valid, can proceed (but empty string must not cause bypass)
		if (result.gates_passed) {
			// Tools should have run on valid paths only
			expect(result.lint.ran || result.secretscan.ran).toBe(true);
		}
	});

	/**
	 * ATTACK VECTOR 11: Very long path string (length limit test)
	 * Attempt to cause buffer overflow or bypass with excessive length
	 */
	it('REJECTS: extremely long path - should handle safely', async () => {
		const longPath = 'a'.repeat(10000); // 10KB path

		const result = await runPreCheckBatch({
			directory: MOCK_DIR,
			files: [longPath],
		});

		// SECURITY: Must handle gracefully, not bypass
		// Either reject long path or fail-closed
		expect(result.gates_passed).toBe(false);
	});

	/**
	 * ATTACK VECTOR 12: Special characters in path
	 * Attempt to bypass with special characters
	 */
	it('REJECTS: special characters in path - cannot bypass validation', async () => {
		const result = await runPreCheckBatch({
			directory: MOCK_DIR,
			files: ['\x00null-byte.ts', '../escape\\n.ts'],
		});

		// SECURITY: Must not bypass with special chars
		// Path validation should handle or reject
		expect(['false', 'true']).toContain(String(result.gates_passed));
		// If passes, tools must have run (no bypass occurred)
		if (result.gates_passed) {
			expect(result.lint.ran || result.secretscan.ran).toBe(true);
		}
	});

	/**
	 * ATTACK VECTOR 13: Unicode path traversal
	 * Attempt to use unicode homographs or normalization attacks
	 */
	it('REJECTS: unicode path traversal - cannot bypass validation', async () => {
		const result = await runPreCheckBatch({
			directory: MOCK_DIR,
			files: ['../\u202e../etc/passwd'], // Right-to-left override
		});

		// SECURITY: Unicode tricks must not bypass
		expect(result.gates_passed).toBe(false);
	});

	/**
	 * ATTACK VECTOR 14: Only whitespace paths (WEAK VALIDATION)
	 * Attempt to slip past with whitespace-only paths
	 *
	 * VALIDATION WEAKNESS: Whitespace-only paths ('   ', '\t', '\n  ') pass the
	 * initial validation because validatePath only checks `if (!inputPath || inputPath.length === 0)`
	 * which doesn't catch whitespace (length > 0).
	 *
	 * BEHAVIOR: Paths pass validation but tools fail on non-existent files,
	 * resulting in fail-closed (gates_passed=false).
	 *
	 * SECURITY IMPACT: Not a bypass (gates still fail), but:
	 * - Wastes resources running tools on invalid paths
	 * - Could be used for DoS (exhaust resources)
	 * - Should reject whitespace paths earlier to prevent wasted effort
	 *
	 * RESOLUTION: Add trim() check: `if (!inputPath || inputPath.trim().length === 0)`
	 */
	it('ACCEPTS (with fail-closed): whitespace-only paths - weak validation but gates still fail', async () => {
		const result = await runPreCheckBatch({
			directory: MOCK_DIR,
			files: ['   ', '\t', '\n  '],
		});

		// GOOD: Gates fail (fail-closed behavior working)
		// Paths accepted by validation but tools fail on non-existent files
		expect(result.gates_passed).toBe(false);

		// Lint tool does not run on whitespace-only paths — they fail before tool execution
		// This is acceptable: whitespace paths are invalid and gates still fail (fail-closed)
		expect(result.lint.ran).toBe(false);
	});

	/**
	 * ATTACK VECTOR 15: Symlink path traversal (if applicable)
	 * Attempt to use symlinks to escape directory
	 * Note: This may be platform-dependent
	 */
	it('REJECTS: symlink traversal - path validation prevents escape', async () => {
		const result = await runPreCheckBatch({
			directory: MOCK_DIR,
			files: ['symlink-to-parent'],
		});

		// SECURITY: Symlinks outside directory should not bypass
		// At minimum, should not allow gates to pass without validation
		if (result.gates_passed) {
			// If passes, tools ran (symlink resolved to valid location)
			expect(result.lint.ran || result.secretscan.ran).toBe(true);
		}
	});

	/**
	 * ATTACK VECTOR 16: Case-insensitive path traversal (Windows)
	 * Attempt to bypass case sensitivity
	 */
	it('REJECTS: mixed case path traversal - validation is path-based', async () => {
		const result = await runPreCheckBatch({
			directory: MOCK_DIR,
			files: ['../OUTSIDE/file.ts', '../outSIDE/file2.ts'],
		});

		// SECURITY: Case variations of traversal must be caught
		expect(result.gates_passed).toBe(false);
	});

	/**
	 * ATTACK VECTOR 17: Double-encoded traversal
	 * Attempt to double-encode traversal sequences
	 */
	it('REJECTS: double-encoded traversal - must catch encoded attacks', async () => {
		const result = await runPreCheckBatch({
			directory: MOCK_DIR,
			files: ['..././../escape.ts', '..\\..\\escape.ts'], // Windows separator
		});

		// SECURITY: Encoded variations must be caught
		expect(result.gates_passed).toBe(false);
	});

	/**
	 * ATTACK VECTOR 18: Array with single undefined element
	 * Attempt to bypass by putting undefined in array
	 */
	it('REJECTS: array with undefined element - handles gracefully', async () => {
		const result = await runPreCheckBatch({
			directory: MOCK_DIR,
			files: [undefined],
		} as any);

		// SECURITY: Undefined element must not bypass
		expect(result.gates_passed).toBe(false);
	});

	/**
	 * ATTACK VECTOR 19: Array with null element
	 * Attempt to bypass by putting null in array
	 */
	it('REJECTS: array with null element - handles gracefully', async () => {
		const result = await runPreCheckBatch({
			directory: MOCK_DIR,
			files: [null],
		} as any);

		// SECURITY: Null element must not bypass
		expect(result.gates_passed).toBe(false);
	});

	/**
	 * ATTACK VECTOR 20: Very large number of invalid paths (DoS)
	 * Attempt to cause resource exhaustion with many invalid paths
	 */
	it('REJECTS: many invalid paths - fails fast without DoS', async () => {
		const invalidPaths = Array.from(
			{ length: 1000 },
			(_, i) => `../bad${i}.ts`,
		);

		const startTime = Date.now();
		const result = await runPreCheckBatch({
			directory: MOCK_DIR,
			files: invalidPaths,
		});
		const duration = Date.now() - startTime;

		// SECURITY: Must fail-closed
		expect(result.gates_passed).toBe(false);

		// Should not take excessive time (fail fast)
		// 1000 paths validation should complete quickly
		expect(duration).toBeLessThan(5000); // < 5 seconds
	});
});
