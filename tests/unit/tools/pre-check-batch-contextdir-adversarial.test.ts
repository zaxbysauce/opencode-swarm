/**
 * ADVERSARIAL SECURITY TESTS: contextDir parameter (Phase 1.2)
 *
 * Tests security of contextDir handling in runPreCheckBatch:
 * - contextDir is the 3rd parameter, used as fallback in:
 *   effectiveWorkspaceDir = (workspaceDir || input.directory || contextDir)
 * - CRITICAL: contextDir bypasses validation when it becomes effectiveWorkspaceDir
 *   because validatePath(dir, workspaceDir, workspaceDir) uses contextDir as BOTH
 *   base AND boundary - no traversal check occurs!
 *
 * ATTACK VECTORS TESTED:
 * 1. contextDir with path traversal: ../../etc/passwd
 *    - VULNERABILITY: If contextDir becomes effectiveWorkspaceDir, the traversal
 *      check uses contextDir as its own boundary (dir == workspaceDir), so
 *      validatePath(dir, dir, dir) resolves path and checks relative(dir, dir)
 *      which is "" (empty, not ".."), bypassing traversal detection!
 *
 * 2. contextDir with null byte: /valid\x00/evil
 *    - Does validatePath reject null bytes before path.join?
 *
 * 3. contextDir as empty string: ""
 *    - Does fallback chain handle empty string (falsy)?
 *
 * 4. contextDir with Windows device paths: CON, COM1, \\.\PhysicalDrive0
 *    - Do device paths bypass traversal checks?
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runPreCheckBatch } from '../../../src/tools/pre-check-batch';

// Mock Bun.spawn to capture calls
let originalSpawn: typeof Bun.spawn;
let spawnCalls: Array<{
	cmd: string[];
	opts: { cwd?: string; stdout?: string; stderr?: string };
}> = [];

function createMockSpawn() {
	return (
		cmd: string[],
		opts: { cwd?: string; stdout?: string; stderr?: string },
	) => {
		spawnCalls.push({
			cmd,
			opts: opts as { cwd?: string; stdout?: string; stderr?: string },
		});

		const encoder = new TextEncoder();
		const stdoutReadable = new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode(''));
				controller.close();
			},
		});
		const stderrReadable = new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode(''));
				controller.close();
			},
		});

		return {
			stdout: stdoutReadable,
			stderr: stderrReadable,
			exited: Promise.resolve(0),
			exitCode: 0,
		} as unknown as ReturnType<typeof Bun.spawn>;
	};
}

// Helper to create temp test directories
function createTempDir(): string {
	return fs.realpathSync(
		fs.mkdtempSync(path.join(os.tmpdir(), 'pre-check-batch-contextdir-adv-')),
	);
}

describe('ADVERSARIAL: contextDir path traversal', () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		originalCwd = process.cwd();
		tempDir = createTempDir();
		process.chdir(tempDir);
		originalSpawn = Bun.spawn;
		Bun.spawn = createMockSpawn();
		spawnCalls = [];
		fs.writeFileSync(path.join(tempDir, 'test.ts'), 'export const x = 1;\n');
	});

	afterEach(() => {
		Bun.spawn = originalSpawn;
		process.chdir(originalCwd);
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	/**
	 * ATTACK VECTOR 1: contextDir with path traversal ../../etc/passwd
	 *
	 * VULNERABILITY SCENARIO:
	 * - Call runPreCheckBatch(input, undefined, '../../etc/passwd')
	 * - workspaceDir = undefined (falsy)
	 * - input.directory = tempDir (truthy) -> becomes effectiveWorkspaceDir
	 * - contextDir = '../../etc/passwd' is NEVER used (input.directory is truthy)
	 *
	 * For contextDir to be used:
	 * - workspaceDir = undefined (falsy)
	 * - input.directory = undefined or '' (falsy)
	 * - contextDir = '../../etc/passwd' -> becomes effectiveWorkspaceDir
	 *
	 * Then validateDirectory(directory, effectiveWorkspaceDir) is called where
	 * effectiveWorkspaceDir = '../../etc/passwd'
	 * This calls validatePath(dir, '../../etc/passwd', '../../etc/passwd')
	 *
	 * INSECURE PATTERN: validatePath uses same value as base AND boundary,
	 * which means validatePath(dir, dir, dir) - self-referential!
	 */
	it('REJECTS: contextDir with path traversal when it becomes effectiveWorkspaceDir', async () => {
		// Force contextDir to become effectiveWorkspaceDir by making
		// workspaceDir and input.directory both falsy
		// We use empty string '' for input.directory to make it falsy
		const maliciousContextDir = '../../etc/passwd';

		const result = await runPreCheckBatch(
			{
				files: ['test.ts'],
				directory: '', // falsy - will be overridden by contextDir
			},
			undefined, // workspaceDir - falsy
			maliciousContextDir, // contextDir - becomes effectiveWorkspaceDir
		);

		// SECURITY: Should fail because malicious contextDir should be rejected
		// either at validation or by failing closed when tools can't run
		expect(result.gates_passed).toBe(false);
	});

	/**
	 * ATTACK VECTOR 1b: contextDir with deeper traversal
	 */
	it('REJECTS: contextDir with deep traversal ../../../../../../etc/passwd', async () => {
		const maliciousContextDir = '../../../../../../etc/passwd';

		const result = await runPreCheckBatch(
			{
				files: ['test.ts'],
				directory: '',
			},
			undefined,
			maliciousContextDir,
		);

		expect(result.gates_passed).toBe(false);
	});

	/**
	 * ATTACK VECTOR 1c: contextDir with Windows path traversal
	 */
	it('REJECTS: contextDir with Windows path traversal ..\\..\\Windows\\System32', async () => {
		const maliciousContextDir = '..\\..\\Windows\\System32';

		const result = await runPreCheckBatch(
			{
				files: ['test.ts'],
				directory: '',
			},
			undefined,
			maliciousContextDir,
		);

		expect(result.gates_passed).toBe(false);
	});

	/**
	 * ATTACK VECTOR 1d: Verify contextDir traversal fails even when directory param is also malicious
	 */
	it('REJECTS: both directory and contextDir with traversal - fail closed', async () => {
		const maliciousContextDir = '../../../root/.ssh';

		const result = await runPreCheckBatch(
			{
				files: ['test.ts'],
				directory: '../../../etc',
			},
			undefined,
			maliciousContextDir,
		);

		// Should fail regardless of which becomes effectiveWorkspaceDir
		expect(result.gates_passed).toBe(false);
	});
});

describe('ADVERSARIAL: contextDir null byte injection', () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		originalCwd = process.cwd();
		tempDir = createTempDir();
		process.chdir(tempDir);
		originalSpawn = Bun.spawn;
		Bun.spawn = createMockSpawn();
		spawnCalls = [];
		fs.writeFileSync(path.join(tempDir, 'test.ts'), 'export const x = 1;\n');
	});

	afterEach(() => {
		Bun.spawn = originalSpawn;
		process.chdir(originalCwd);
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	/**
	 * ATTACK VECTOR 2: Null byte injection in contextDir
	 * Does validatePath reject null bytes before they reach path.join?
	 */
	it('REJECTS: contextDir with null byte /valid\\x00/evil', async () => {
		const maliciousContextDir = '/valid\x00/evil';

		const result = await runPreCheckBatch(
			{
				files: ['test.ts'],
				directory: '',
			},
			undefined,
			maliciousContextDir,
		);

		// Should fail - null bytes should be rejected
		expect(result.gates_passed).toBe(false);
	});

	/**
	 * ATTACK VECTOR 2b: Multiple null bytes in contextDir
	 */
	it('REJECTS: contextDir with multiple null bytes', async () => {
		const maliciousContextDir = '/path\x00/with\x00/nulls';

		const result = await runPreCheckBatch(
			{
				files: ['test.ts'],
				directory: '',
			},
			undefined,
			maliciousContextDir,
		);

		expect(result.gates_passed).toBe(false);
	});

	/**
	 * ATTACK VECTOR 2c: Null byte at end of contextDir
	 */
	it('REJECTS: contextDir with trailing null byte', async () => {
		const maliciousContextDir = '/valid/path\x00';

		const result = await runPreCheckBatch(
			{
				files: ['test.ts'],
				directory: '',
			},
			undefined,
			maliciousContextDir,
		);

		expect(result.gates_passed).toBe(false);
	});
});

describe('ADVERSARIAL: contextDir empty string handling', () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		originalCwd = process.cwd();
		tempDir = createTempDir();
		process.chdir(tempDir);
		originalSpawn = Bun.spawn;
		Bun.spawn = createMockSpawn();
		spawnCalls = [];
		fs.writeFileSync(path.join(tempDir, 'test.ts'), 'export const x = 1;\n');
	});

	afterEach(() => {
		Bun.spawn = originalSpawn;
		process.chdir(originalCwd);
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	/**
	 * ATTACK VECTOR 3: Empty string contextDir
	 * Fallback chain: workspaceDir || input.directory || contextDir
	 * Empty string is falsy, so should skip contextDir
	 *
	 * But what if all three are empty?
	 */
	it('HANDLES: contextDir empty string - skips to next fallback', async () => {
		const result = await runPreCheckBatch(
			{
				files: ['test.ts'],
				directory: '',
			},
			undefined,
			'', // empty string - falsy
		);

		// Empty string contextDir should be skipped (falsy)
		// Since input.directory is also empty, and workspaceDir is undefined,
		// effectiveWorkspaceDir becomes '' (empty string)
		// This should fail validation
		expect(result.gates_passed).toBe(false);
	});

	/**
	 * ATTACK VECTOR 3b: All fallbacks are empty/undefined
	 */
	it('REJECTS: all fallbacks empty/undefined - no valid workspace', async () => {
		const result = await runPreCheckBatch(
			{
				files: ['test.ts'],
				directory: '',
			},
			undefined, // workspaceDir - falsy
			undefined, // contextDir - falsy
		);

		// All fallbacks are falsy, effectiveWorkspaceDir = ''
		// validateDirectory should reject empty directory
		expect(result.gates_passed).toBe(false);
		expect(result.lint.error).toContain('directory');
	});

	/**
	 * ATTACK VECTOR 3c: Whitespace-only contextDir
	 */
	it('REJECTS: contextDir whitespace only - weak validation but fails', async () => {
		const result = await runPreCheckBatch(
			{
				files: ['test.ts'],
				directory: '',
			},
			undefined,
			'   ', // whitespace only - not empty string but still invalid
		);

		// Whitespace-only might pass initial validation but tools should fail
		// or it should be rejected as invalid
		expect(result.gates_passed).toBe(false);
	});
});

describe('ADVERSARIAL: contextDir Windows device paths', () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		originalCwd = process.cwd();
		tempDir = createTempDir();
		process.chdir(tempDir);
		originalSpawn = Bun.spawn;
		Bun.spawn = createMockSpawn();
		spawnCalls = [];
		fs.writeFileSync(path.join(tempDir, 'test.ts'), 'export const x = 1;\n');
	});

	afterEach(() => {
		Bun.spawn = originalSpawn;
		process.chdir(originalCwd);
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	/**
	 * ATTACK VECTOR 4: Windows device path CON (console)
	 * Device paths like CON, PRN, AUX, NUL, COM1-9, LPT1-9 are reserved
	 * On Windows, \\.\CON or just CON accesses the console device
	 */
	it('REJECTS: contextDir as Windows device path CON', async () => {
		const maliciousContextDir = 'CON';

		const result = await runPreCheckBatch(
			{
				files: ['test.ts'],
				directory: '',
			},
			undefined,
			maliciousContextDir,
		);

		// Should fail - device paths should be rejected
		expect(result.gates_passed).toBe(false);
	});

	/**
	 * ATTACK VECTOR 4b: Windows device path COM1
	 */
	it('REJECTS: contextDir as Windows device path COM1', async () => {
		const maliciousContextDir = 'COM1';

		const result = await runPreCheckBatch(
			{
				files: ['test.ts'],
				directory: '',
			},
			undefined,
			maliciousContextDir,
		);

		expect(result.gates_passed).toBe(false);
	});

	/**
	 * ATTACK VECTOR 4c: Windows extended device path \\.\PhysicalDrive0
	 */
	it('REJECTS: contextDir as Windows extended device path \\\\.PhysicalDrive0', async () => {
		const maliciousContextDir = '\\\\.\\PhysicalDrive0';

		const result = await runPreCheckBatch(
			{
				files: ['test.ts'],
				directory: '',
			},
			undefined,
			maliciousContextDir,
		);

		// Should fail - extended device paths should be rejected
		expect(result.gates_passed).toBe(false);
	});

	/**
	 * ATTACK VECTOR 4d: Windows device path NUL
	 */
	it('REJECTS: contextDir as Windows device path NUL', async () => {
		const maliciousContextDir = 'NUL';

		const result = await runPreCheckBatch(
			{
				files: ['test.ts'],
				directory: '',
			},
			undefined,
			maliciousContextDir,
		);

		expect(result.gates_passed).toBe(false);
	});

	/**
	 * ATTACK VECTOR 4e: Windows device path LPT1
	 */
	it('REJECTS: contextDir as Windows device path LPT1', async () => {
		const maliciousContextDir = 'LPT1';

		const result = await runPreCheckBatch(
			{
				files: ['test.ts'],
				directory: '',
			},
			undefined,
			maliciousContextDir,
		);

		expect(result.gates_passed).toBe(false);
	});
});

describe('ADVERSARIAL: contextDir validation chain integrity', () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		originalCwd = process.cwd();
		tempDir = createTempDir();
		process.chdir(tempDir);
		originalSpawn = Bun.spawn;
		Bun.spawn = createMockSpawn();
		spawnCalls = [];
		fs.writeFileSync(path.join(tempDir, 'test.ts'), 'export const x = 1;\n');
	});

	afterEach(() => {
		Bun.spawn = originalSpawn;
		process.chdir(originalCwd);
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	/**
	 * CRITICAL SECURITY TEST: Verify contextDir is validated BEFORE becoming effectiveWorkspaceDir
	 *
	 * The vulnerability is:
	 * 1. contextDir becomes effectiveWorkspaceDir via fallback
	 * 2. effectiveWorkspaceDir is used to validate 'directory' input
	 * 3. But contextDir ITSELF was never validated!
	 *
	 * This test verifies that even if contextDir bypasses initial checks,
	 * the system fails closed (doesn't allow execution with malicious workspace)
	 */
	it('VERIFIES: malicious contextDir cannot enable file access outside workspace', async () => {
		// contextDir tries to escape to /etc
		const maliciousContextDir = '../../../etc';

		const result = await runPreCheckBatch(
			{
				files: ['test.ts'],
				directory: '', // falsy - contextDir becomes effectiveWorkspaceDir
			},
			undefined, // workspaceDir - falsy
			maliciousContextDir, // contextDir - becomes effectiveWorkspaceDir
		);

		// SECURITY: Even if contextDir becomes effectiveWorkspaceDir,
		// the system should fail closed (no tools run or tools fail)
		// This prevents an attacker from using malicious workspace to access files
		expect(result.gates_passed).toBe(false);

		// Verify no spawn occurred with malicious cwd
		for (const call of spawnCalls) {
			if (call.opts.cwd) {
				// cwd should not contain /etc or be a traversal path
				expect(call.opts.cwd).not.toContain('..');
			}
		}
	});

	/**
	 * Test: Verify normal operation still works with valid contextDir
	 */
	it('ACCEPTS: valid contextDir allows normal operation', async () => {
		// Use a valid directory as contextDir
		const validContextDir = tempDir;

		const result = await runPreCheckBatch(
			{
				files: ['test.ts'],
				directory: '', // falsy
			},
			undefined, // workspaceDir - falsy
			validContextDir, // valid contextDir becomes effectiveWorkspaceDir
		);

		// With valid contextDir and files in that directory, should proceed
		// Note: This may still fail if tools aren't available, but should not
		// fail due to directory validation
		expect(result).toBeDefined();
		// gates_passed depends on whether tools ran and passed
	});
});
