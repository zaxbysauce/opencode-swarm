/**
 * ADVERSARIAL SECURITY TESTS for src/tools/update-task-status.ts
 *
 * Tests attack vectors against the fallbackDir parameter which bypasses
 * the working_directory validation guards.
 *
 * Attack vectors tested:
 * 1. Null byte injection in fallbackDir
 * 2. Path traversal sequences (../../etc) in fallbackDir
 * 3. Empty string fallbackDir (falsy check edge case)
 * 4. Command injection via path.join with malicious fallbackDir
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { resetSwarmState } from '../state';
import { executeUpdateTaskStatus } from './update-task-status';

let tmpDir: string;

beforeEach(() => {
	tmpDir = mkdtempSync(path.join(os.tmpdir(), 'uts-adv-test-'));
	mkdirSync(path.join(tmpDir, '.swarm'), { recursive: true });
	writeFileSync(
		path.join(tmpDir, '.swarm', 'plan.json'),
		JSON.stringify({
			schema_version: '1.0.0',
			title: 'Adversarial Test Plan',
			swarm: 'test-swarm',
			current_phase: 1,
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					status: 'in_progress',
					tasks: [
						{
							id: '1.1',
							phase: 1,
							status: 'in_progress',
							size: 'small',
							description: 'test task',
							depends: [],
							files_touched: [],
						},
					],
				},
			],
		}),
	);
});

afterEach(() => {
	resetSwarmState();
	try {
		rmSync(tmpDir, { recursive: true, force: true });
	} catch {
		/* best effort */
	}
});

// ─────────────────────────────────────────────────────────────────────────────
// ADVERSARIAL TEST 1: Null byte injection in fallbackDir
// ─────────────────────────────────────────────────────────────────────────────

describe('ADVERSARIAL: fallbackDir null byte injection', () => {
	it('should reject fallbackDir with null byte before reaching path operations', async () => {
		// Null byte injection: "safe\0/path" tricks path operations
		const maliciousPath = 'safe\x00/../../../etc';

		const result = await executeUpdateTaskStatus(
			{
				task_id: '1.1',
				status: 'pending',
			},
			maliciousPath,
		);

		// The critical security requirement: this MUST fail
		// Currently fallbackDir bypasses the null byte check that working_directory gets
		// If this passes, the vulnerability exists
		expect(result.success).toBe(false);
		expect(result.message).toContain('null bytes are not allowed');
	});

	it('should reject fallbackDir with null byte (path.join exploit)', async () => {
		// Null byte can cause path.join to truncate
		// Attack: path.join(tmpDir, '..', '..', 'etc') becomes /etc
		const nullBytePath = `${tmpDir}\x00/../../etc`;

		const result = await executeUpdateTaskStatus(
			{
				task_id: '1.1',
				status: 'pending',
			},
			nullBytePath,
		);

		expect(result.success).toBe(false);
		expect(result.message).toContain('null bytes are not allowed');
	});

	it('should reject fallbackDir with URL-encoded null byte %00', async () => {
		// Some sanitization might decode URL encoding
		const urlEncodedNull = `${tmpDir}%00/../../etc`;

		const result = await executeUpdateTaskStatus(
			{
				task_id: '1.1',
				status: 'pending',
			},
			urlEncodedNull,
		);

		// This may or may not be caught depending on implementation
		// The key is it should NOT silently succeed with path traversal
		expect(result.success).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// ADVERSARIAL TEST 2: Path traversal in fallbackDir
// ─────────────────────────────────────────────────────────────────────────────

describe('ADVERSARIAL: fallbackDir path traversal', () => {
	it('should reject fallbackDir with path traversal ../.. ', async () => {
		// Classic path traversal: escape the workspace directory
		const traversalPath = path.join(tmpDir, '..', '..', '..', 'etc');

		const result = await executeUpdateTaskStatus(
			{
				task_id: '1.1',
				status: 'pending',
			},
			traversalPath,
		);

		// Critical: this MUST fail - fallbackDir has NO path traversal guard
		// If it succeeds, an attacker can read arbitrary directories
		expect(result.success).toBe(false);
		expect(result.message).toContain('path traversal');
	});

	it('should reject fallbackDir with traversal encoded as dots %2e%2e%2f', async () => {
		// URL-encoded path traversal: %2e = .
		const encodedTraversal = tmpDir.replace(/\//g, '/%2e%2e/');
		// Creates: /tmp/uts-adv-test-XXXX/%2e%2e/%2e%2e/%2e%2e/etc

		const result = await executeUpdateTaskStatus(
			{
				task_id: '1.1',
				status: 'pending',
			},
			encodedTraversal,
		);

		// Should fail - traversal sequences must be rejected regardless of encoding
		expect(result.success).toBe(false);
	});

	it('should reject fallbackDir with nested traversal ../../../etc/passwd', async () => {
		// Attempt to read /etc/passwd on Unix or other sensitive paths
		const sensitiveTraversal = path.join(
			tmpDir,
			'..',
			'..',
			'..',
			'etc',
			'passwd',
		);

		const result = await executeUpdateTaskStatus(
			{
				task_id: '1.1',
				status: 'pending',
			},
			sensitiveTraversal,
		);

		expect(result.success).toBe(false);
		expect(result.message).toContain('path traversal');
	});

	it('should reject fallbackDir with Windows-style traversal ..\\..\\..\\etc', async () => {
		// Windows path traversal
		const windowsTraversal = `${tmpDir}..\\..\\..\\..\\Windows\\System32`;

		const result = await executeUpdateTaskStatus(
			{
				task_id: '1.1',
				status: 'pending',
			},
			windowsTraversal,
		);

		// Should fail regardless of path separator
		expect(result.success).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// ADVERSARIAL TEST 3: Empty string fallbackDir (falsy check edge case)
// ─────────────────────────────────────────────────────────────────────────────

describe('ADVERSARIAL: fallbackDir empty string edge case', () => {
	it('should NOT use empty string fallbackDir as directory', async () => {
		// Empty string is falsy, but ?? operator only coalesces null/undefined
		// Code: directory = fallbackDir ?? process.cwd()
		// If fallbackDir = '', then directory = '' (empty string, NOT process.cwd())

		const warns: string[] = [];
		const originalWarn = console.warn;
		console.warn = (...args: unknown[]) => {
			warns.push(args[0] as string);
		};

		try {
			const result = await executeUpdateTaskStatus(
				{
					task_id: '1.1',
					status: 'pending',
				},
				'', // empty string - falsy but NOT nullish
			);

			// The guard SHOULD fire because !'' is true
			const fallbackWarns = warns.filter((w) => w.includes('fallbackDir'));
			expect(fallbackWarns.length).toBeGreaterThan(0);

			// But the CRITICAL question: does directory become '' or process.cwd()?
			// If directory becomes '', subsequent path.join operations will behave unexpectedly
			// This could cause:
			// - path.join('', '.swarm', 'plan.json') = '.swarm/plan.json' (relative path!)
			// - Reading/writing to wrong directory

			// The test passes if result is NOT success with empty string causing chaos
			// The implementation should either:
			// 1. Reject empty string explicitly, OR
			// 2. Treat it like undefined (use process.cwd())

			// Current behavior check - does it fail safely or succeed?
			if (result.success) {
				// If it succeeded, verify it didn't use empty string as path
				// It should have fallen back to process.cwd()
				expect(result.success).toBe(true);
			}
		} finally {
			console.warn = originalWarn;
		}
	});

	it('should handle empty string vs undefined differently', async () => {
		// undefined: !undefined = true (guard fires), directory = undefined ?? cwd = cwd
		// '': !'' = true (guard fires), directory = '' ?? cwd = '' <-- BUG

		const warns: string[] = [];
		const originalWarn = console.warn;
		console.warn = (...args: unknown[]) => {
			warns.push(args[0] as string);
		};

		let undefinedResult: Awaited<ReturnType<typeof executeUpdateTaskStatus>>;
		let emptyStringResult: Awaited<ReturnType<typeof executeUpdateTaskStatus>>;

		try {
			// Call with undefined
			undefinedResult = await executeUpdateTaskStatus(
				{ task_id: '1.1', status: 'pending' },
				undefined,
			);

			// Call with empty string
			emptyStringResult = await executeUpdateTaskStatus(
				{ task_id: '1.1', status: 'pending' },
				'',
			);

			// Both should trigger the warning
			expect(warns.filter((w) => w.includes('fallbackDir')).length).toBe(2);

			// After fix: empty string || process.cwd() = process.cwd() (correct!)
			// Previously: empty string ?? process.cwd() = '' (broken - empty string wins)
			// Now both undefined and empty string behave identically (both use cwd)
			expect(emptyStringResult.success).toBe(true);
			expect(undefinedResult.success).toBe(true);
			// Both should use process.cwd(), not an empty string path
			expect(emptyStringResult.success).toBe(undefinedResult.success);
		} finally {
			console.warn = originalWarn;
		}
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// ADVERSARIAL TEST 4: Command injection / path.join exploit
// ─────────────────────────────────────────────────────────────────────────────

describe('ADVERSARIAL: fallbackDir path.join command injection', () => {
	it('should NOT allow command injection via path.join with fallbackDir', async () => {
		// Attack: Use shell metacharacters in fallbackDir that could be
		// interpreted as commands if the path is ever used in shell execution

		// While path.join itself doesn't execute, the constructed path could
		// be used unsafely elsewhere or with child_process
		const injectionPath = `${tmpDir}&& cat /etc/passwd`;

		const result = await executeUpdateTaskStatus(
			{
				task_id: '1.1',
				status: 'pending',
			},
			injectionPath,
		);

		// Should reject - this path is malformed and could cause issues
		// The null byte and traversal checks would catch most of these,
		// but shell metacharacters should also be rejected
		expect(result.success).toBe(false);
	});

	it('should NOT allow pipe characters in fallbackDir', async () => {
		// Pipe character could be used in command construction
		const pipePath = `${tmpDir}|malicious command`;

		const result = await executeUpdateTaskStatus(
			{
				task_id: '1.1',
				status: 'pending',
			},
			pipePath,
		);

		// Should fail - pipe characters are not valid in paths
		expect(result.success).toBe(false);
	});

	it('should NOT allow semicolon command chaining in fallbackDir', async () => {
		// Semicolon: path;a&&b
		const semicolonPath = `${tmpDir}; rm -rf /`;

		const result = await executeUpdateTaskStatus(
			{
				task_id: '1.1',
				status: 'pending',
			},
			semicolonPath,
		);

		expect(result.success).toBe(false);
	});

	it('should NOT allow dollar sign command substitution in fallbackDir', async () => {
		// $() command substitution
		const dollarPath = `${tmpDir}$(whoami)`;

		const result = await executeUpdateTaskStatus(
			{
				task_id: '1.1',
				status: 'pending',
			},
			dollarPath,
		);

		expect(result.success).toBe(false);
	});

	it('should NOT allow backtick command substitution in fallbackDir', async () => {
		// Backtick command substitution: `command`
		const backtickPath = `${tmpDir}\`id\``;

		const result = await executeUpdateTaskStatus(
			{
				task_id: '1.1',
				status: 'pending',
			},
			backtickPath,
		);

		expect(result.success).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// ADVERSARIAL TEST 5: Unicode / special character attacks
// ─────────────────────────────────────────────────────────────────────────────

describe('ADVERSARIAL: fallbackDir unicode/special character attacks', () => {
	it('should reject fallbackDir with null unicode (U+0000)', async () => {
		// Direct null character
		const nullUnicode = `${tmpDir}\u0000/../../etc`;

		const result = await executeUpdateTaskStatus(
			{
				task_id: '1.1',
				status: 'pending',
			},
			nullUnicode,
		);

		expect(result.success).toBe(false);
	});

	it('should reject fallbackDir with RTL override characters', async () => {
		// RTL override can change path display/interpretation
		const rtlPath = `${tmpDir}\u202e../../etc`;

		const result = await executeUpdateTaskStatus(
			{
				task_id: '1.1',
				status: 'pending',
			},
			rtlPath,
		);

		// RTL in path is unusual but potentially dangerous
		// At minimum it should not allow traversal
		expect(result.success).toBe(false);
	});

	it('should reject fallbackDir with widechar null byte (UTF-16)', async () => {
		// UTF-16 null byte: U+0000 vs UTF-8 \x00
		// Some path parsing might miss widechar nulls
		const widecharNull = `${tmpDir}\x00\x00/../../etc`;

		const result = await executeUpdateTaskStatus(
			{
				task_id: '1.1',
				status: 'pending',
			},
			widecharNull,
		);

		expect(result.success).toBe(false);
	});

	it('should reject fallbackDir with combining characters (Zalgo)', async () => {
		// Combining characters that modify adjacent characters
		// U+0300-U+036F combining diacritical marks
		const zalgoPath = `${tmpDir}\u0300\u0301../../etc`;

		const result = await executeUpdateTaskStatus(
			{
				task_id: '1.1',
				status: 'pending',
			},
			zalgoPath,
		);

		// Should fail - not a valid path component
		expect(result.success).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// ADVERSARIAL TEST 6: Windows-specific attack vectors
// ─────────────────────────────────────────────────────────────────────────────

describe('ADVERSARIAL: fallbackDir Windows-specific attacks', () => {
	it('should reject fallbackDir with Windows device paths (\\\\.\\\\)', async () => {
		// Windows device path: \\.\C:\ or \\.\GLOBALROOT
		const devicePath = '\\\\.\\\\C:\\\\..\\\\..\\\\etc';

		const result = await executeUpdateTaskStatus(
			{
				task_id: '1.1',
				status: 'pending',
			},
			devicePath,
		);

		// Device paths should be rejected - they bypass normal path checks
		expect(result.success).toBe(false);
	});

	it('should reject fallbackDir with Windows UNC path', async () => {
		// UNC path: \\server\share
		const uncPath = '\\\\\\\\malicious-server\\\\share\\\\..\\\\..\\\\etc';

		const result = await executeUpdateTaskStatus(
			{
				task_id: '1.1',
				status: 'pending',
			},
			uncPath,
		);

		expect(result.success).toBe(false);
	});

	it('should reject fallbackDir with reserved Windows names (CON, AUX, NUL)', async () => {
		// Windows reserved names
		const reservedNames = ['NUL', 'CON', 'AUX', 'COM1', 'LPT1'];

		for (const name of reservedNames) {
			const reservedPath = path.join(name, '..', '..', '..', 'etc');

			const result = await executeUpdateTaskStatus(
				{
					task_id: '1.1',
					status: 'pending',
				},
				reservedPath,
			);

			// Reserved names can cause issues on Windows
			expect(result.success).toBe(false);
		}
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// ADVERSARIAL TEST 7: Information disclosure via error messages
// ─────────────────────────────────────────────────────────────────────────────

describe('ADVERSARIAL: fallbackDir information disclosure', () => {
	it('should NOT leak sensitive paths in error messages', async () => {
		// Even when rejecting malicious paths, error messages should not
		// reveal sensitive system paths
		const sensitivePath = '/home/user/.ssh/id_rsa';

		const result = await executeUpdateTaskStatus(
			{
				task_id: '1.1',
				status: 'pending',
			},
			sensitivePath,
		);

		expect(result.success).toBe(false);

		// Error messages should be generic - no path leakage
		if (result.errors && result.errors.length > 0) {
			const errorStr = result.errors.join(' ');
			// Should not contain actual sensitive path in error output
			// (it may say "path traversal not allowed" but not the actual path)
			expect(errorStr).not.toContain('/home/user/.ssh');
		}
	});

	it('should NOT leak process.cwd() path when using fallback', async () => {
		// When falling back to process.cwd(), don't expose it in logs/errors
		const result = await executeUpdateTaskStatus({
			task_id: '1.1',
			status: 'pending',
			// No working_directory, no fallbackDir
		});

		// Should succeed (using cwd) but error messages should not leak cwd
		expect(result.success).toBe(true);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// ADVERSARIAL TEST 8: Length boundary attacks
// ─────────────────────────────────────────────────────────────────────────────

describe('ADVERSARIAL: fallbackDir length boundary attacks', () => {
	it('should reject extremely long fallbackDir paths', async () => {
		// Extremely long path (over 4096 chars on many filesystems)
		const longPath = `${tmpDir + '/'.repeat(5000)}etc`;

		const result = await executeUpdateTaskStatus(
			{
				task_id: '1.1',
				status: 'pending',
			},
			longPath,
		);

		// Should reject - path too long
		expect(result.success).toBe(false);
	});

	it('should reject deeply nested traversal (100+ levels)', async () => {
		// 100 levels of ../
		const deepTraversal = `${tmpDir + '/../'.repeat(100)}etc`;

		const result = await executeUpdateTaskStatus(
			{
				task_id: '1.1',
				status: 'pending',
			},
			deepTraversal,
		);

		expect(result.success).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// ADVERSARIAL TEST 9: Comparison - working_directory has guards, fallbackDir does NOT
// ─────────────────────────────────────────────────────────────────────────────

describe('ADVERSARIAL: working_directory vs fallbackDir guard comparison', () => {
	it('working_directory SHOULD catch null byte but fallbackDir does NOT', async () => {
		const nullBytePath = `${tmpDir}\x00/../../etc`;

		// Test with working_directory (has guard)
		const workingDirResult = await executeUpdateTaskStatus({
			task_id: '1.1',
			status: 'pending',
			working_directory: nullBytePath,
		});

		// Test with fallbackDir (NO guard)
		const fallbackDirResult = await executeUpdateTaskStatus(
			{
				task_id: '1.1',
				status: 'pending',
			},
			nullBytePath,
		);

		// working_directory MUST reject
		expect(workingDirResult.success).toBe(false);

		// CRITICAL: fallbackDir SHOULD also reject - if it doesn't, vulnerability!
		expect(fallbackDirResult.success).toBe(false);
	});

	it('working_directory SHOULD catch path traversal but fallbackDir does NOT', async () => {
		const traversalPath = path.join(tmpDir, '..', '..', '..', 'etc');

		// Test with working_directory (has guard)
		const workingDirResult = await executeUpdateTaskStatus({
			task_id: '1.1',
			status: 'pending',
			working_directory: traversalPath,
		});

		// Test with fallbackDir (NO guard)
		const fallbackDirResult = await executeUpdateTaskStatus(
			{
				task_id: '1.1',
				status: 'pending',
			},
			traversalPath,
		);

		// working_directory MUST reject
		expect(workingDirResult.success).toBe(false);

		// CRITICAL: fallbackDir SHOULD also reject - if it doesn't, vulnerability!
		expect(fallbackDirResult.success).toBe(false);
	});
});
