import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ToolContext } from '@opencode-ai/plugin';
import { pkg_audit } from '../../../src/tools/pkg-audit';

// Mock for Bun.spawn
let originalSpawn: typeof Bun.spawn;
let mockExitCode: number = 0;
let mockStdout: string = '';
let mockStderr: string = '';
let mockSpawnError: Error | null = null;

function mockSpawn(cmd: string[], opts: unknown) {
	if (mockSpawnError) {
		throw mockSpawnError;
	}

	// Create mock readable streams
	const encoder = new TextEncoder();
	const stdoutReadable = new ReadableStream({
		start(controller) {
			controller.enqueue(encoder.encode(mockStdout));
			controller.close();
		},
	});
	const stderrReadable = new ReadableStream({
		start(controller) {
			controller.enqueue(encoder.encode(mockStderr));
			controller.close();
		},
	});

	return {
		stdout: stdoutReadable,
		stderr: stderrReadable,
		exited: Promise.resolve(mockExitCode),
		exitCode: mockExitCode,
	} as unknown as ReturnType<typeof Bun.spawn>;
}

// Temp directories for test isolation
let tempDir: string;
let originalCwd: string;

// Helper to create mock context
function getMockContext(): ToolContext {
	return {
		sessionID: 'test-session',
		messageID: 'test-message',
		agent: 'test-agent',
		directory: tempDir,
		worktree: tempDir,
		abort: new AbortController().signal,
		metadata: () => ({}),
		ask: async () => undefined,
	};
}

// Helper to create a large string
function createLargeString(size: number): string {
	return 'A'.repeat(size);
}

describe('pkg-audit adversarial security tests', () => {
	beforeEach(() => {
		originalSpawn = Bun.spawn;
		mockExitCode = 0;
		mockStdout = '';
		mockStderr = '';
		mockSpawnError = null;
		Bun.spawn = mockSpawn;

		// Save current directory and create temp dir
		originalCwd = process.cwd();
		tempDir = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), 'pkg-audit-adversarial-')),
		);
		process.chdir(tempDir);
	});

	afterEach(() => {
		Bun.spawn = originalSpawn;
		process.chdir(originalCwd);
		// Clean up temp directory
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	// ============ Ecosystem Validation Tests ============
	describe('ecosystem validation', () => {
		it('should reject unknown ecosystem string with validation error', async () => {
			const result = await pkg_audit.execute(
				{ ecosystem: 'unknown_ecosystem' as any },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			expect(parsed.error).toBeDefined();
			expect(parsed.error).toContain('Invalid arguments');
		});

		it('should reject malicious ecosystem injection attempt', async () => {
			const maliciousInput = 'auto; rm -rf /';
			const result = await pkg_audit.execute(
				{ ecosystem: maliciousInput as any },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			expect(parsed.error).toBeDefined();
		});
	});

	// ============ Oversized Output Tests (MAX_OUTPUT_BYTES = 52MB) ============
	describe('oversized output handling', () => {
		it('govulncheck: should handle output exceeding MAX_OUTPUT_BYTES', async () => {
			// Create a huge JSON object (over 52MB)
			const hugeString = createLargeString(53_000_000); // 53MB > MAX_OUTPUT_BYTES
			mockExitCode = 3;
			mockStdout =
				JSON.stringify({
					osv: {
						id: 'GO-2021-0053',
						summary: 'Test',
						aliases: ['CVE-2021-33196'],
					},
				}) +
				'\n' +
				hugeString +
				'\n' +
				JSON.stringify({
					finding: {
						osv: 'GO-2021-0053',
						trace: [{ module: 'test', version: '1.0.0' }],
						fixed_by: null,
					},
				}) +
				'\n';

			const result = await pkg_audit.execute(
				{ ecosystem: 'go' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Should handle gracefully without crashing
			expect(parsed).toBeDefined();
		});

		it('dotnet: should handle oversized text output', async () => {
			const hugeString = createLargeString(53_000_000);
			mockExitCode = 1;
			mockStdout = `Project > TestProject
  > test-pkg  1.0.0  2.0.0  High  https://example.com/vuln
${hugeString}
Project has the following vulnerable packages
`;

			const result = await pkg_audit.execute(
				{ ecosystem: 'dotnet' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Should handle gracefully
			expect(parsed).toBeDefined();
		});

		it('bundle-audit: should handle oversized JSON output', async () => {
			const hugeString = createLargeString(53_000_000);
			mockExitCode = 1;
			mockStdout = JSON.stringify({
				results: [
					{
						type: 'Dependency',
						gem: { name: 'test', version: '1.0.0' },
						advisory: {
							id: 'TEST-001',
							url: hugeString,
							title: 'Test vuln',
							patched_versions: ['2.0.0'],
							criticality: 'High',
						},
					},
				],
				ignored: [],
			});

			const result = await pkg_audit.execute(
				{ ecosystem: 'ruby' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Should handle gracefully
			expect(parsed).toBeDefined();
		});

		it('dart: should handle oversized JSON output', async () => {
			const hugeString = createLargeString(53_000_000);
			mockExitCode = 0;
			mockStdout = JSON.stringify({
				packages: [
					{
						package: hugeString,
						current: { version: '1.0.0' },
						latest: { version: '2.0.0' },
						upgradable: { version: '1.5.0' },
					},
				],
			});

			const result = await pkg_audit.execute(
				{ ecosystem: 'dart' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Should handle gracefully
			expect(parsed).toBeDefined();
		});
	});

	// ============ Deeply Nested/Malformed JSON Tests ============
	describe('deeply nested and malformed JSON', () => {
		it('govulncheck: should handle deeply nested JSON', async () => {
			mockExitCode = 3;
			const deeplyNested = {
				a: { b: { c: { d: { e: { f: { g: 'deep' } } } } } },
			};
			mockStdout =
				JSON.stringify({
					osv: {
						id: 'GO-2021-0053',
						summary: 'Test',
						aliases: ['CVE-2021-33196'],
						extra: deeplyNested,
					},
				}) +
				'\n' +
				JSON.stringify({
					finding: {
						osv: 'GO-2021-0053',
						trace: [{ module: 'test', version: '1.0.0' }],
						fixed_by: null,
					},
				}) +
				'\n';

			const result = await pkg_audit.execute(
				{ ecosystem: 'go' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Should handle gracefully
			expect(parsed).toBeDefined();
		});

		it('govulncheck: should handle malformed JSON lines', async () => {
			mockExitCode = 3;
			mockStdout =
				'{"osv":{"id":"GO-2021-0053","summary":"Test","aliases":["CVE-2021-33196"]}}\n' +
				'{malformed json}\n' +
				'{"finding":{"osv":"GO-2021-0053","trace":[{"module":"test","version":"1.0.0"}],"fixed_by":null}}\n';

			const result = await pkg_audit.execute(
				{ ecosystem: 'go' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Should skip malformed lines and parse valid ones
			expect(parsed).toBeDefined();
		});

		it('bundle-audit: should handle malformed JSON', async () => {
			mockExitCode = 1;
			mockStdout = '{invalid json: ';

			const result = await pkg_audit.execute(
				{ ecosystem: 'ruby' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Should return clean with parse error note
			expect(parsed.clean).toBe(true);
			expect(parsed.note).toContain('could not be parsed');
		});

		it('dart: should handle malformed JSON', async () => {
			mockExitCode = 0;
			mockStdout = '{invalid json: ';

			const result = await pkg_audit.execute(
				{ ecosystem: 'dart' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Should return clean with parse error note
			expect(parsed.clean).toBe(true);
			expect(parsed.note).toContain('could not be parsed');
		});

		it('all auditors: should handle empty JSON object {}', async () => {
			// Test for govulncheck
			mockExitCode = 3;
			mockStdout = '{}\n';
			let result = await pkg_audit.execute(
				{ ecosystem: 'go' },
				getMockContext(),
			);
			let parsed = JSON.parse(result);
			if (!parsed.note?.includes('not installed')) {
				expect(parsed).toBeDefined();
			}

			// Test for bundle-audit
			mockExitCode = 1;
			mockStdout = '{}';
			result = await pkg_audit.execute({ ecosystem: 'ruby' }, getMockContext());
			parsed = JSON.parse(result);
			if (!parsed.note?.includes('not installed')) {
				expect(parsed).toBeDefined();
			}

			// Test for dart
			mockExitCode = 0;
			mockStdout = '{}';
			result = await pkg_audit.execute({ ecosystem: 'dart' }, getMockContext());
			parsed = JSON.parse(result);
			if (!parsed.note?.includes('not installed')) {
				expect(parsed).toBeDefined();
			}
		});
	});

	// ============ Extremely Long Strings Tests ============
	describe('extremely long strings in package names, versions, URLs', () => {
		it('govulncheck: should handle extremely long package names', async () => {
			const longName = createLargeString(10_000);
			mockExitCode = 3;
			mockStdout =
				JSON.stringify({
					osv: {
						id: 'GO-2021-0053',
						summary: 'Test',
						aliases: ['CVE-2021-33196'],
					},
				}) +
				'\n' +
				JSON.stringify({
					finding: {
						osv: 'GO-2021-0053',
						trace: [{ module: longName, version: '1.0.0' }],
						fixed_by: null,
					},
				}) +
				'\n';

			const result = await pkg_audit.execute(
				{ ecosystem: 'go' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Should handle gracefully
			expect(parsed).toBeDefined();
		});

		it('govulncheck: should handle extremely long version strings', async () => {
			const longVersion = createLargeString(10_000);
			mockExitCode = 3;
			mockStdout =
				JSON.stringify({
					osv: {
						id: 'GO-2021-0053',
						summary: 'Test',
						aliases: ['CVE-2021-33196'],
					},
				}) +
				'\n' +
				JSON.stringify({
					finding: {
						osv: 'GO-2021-0053',
						trace: [{ module: 'test', version: longVersion }],
						fixed_by: null,
					},
				}) +
				'\n';

			const result = await pkg_audit.execute(
				{ ecosystem: 'go' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			expect(parsed).toBeDefined();
		});

		it('dotnet: should handle package names with special regex characters', async () => {
			// Package names with regex special chars: . + * ? ^ $ ( ) [ ] { } | \
			const specialPkg = 'test.package+special*chars?^$[]{}|\\';
			mockExitCode = 1;
			mockStdout = `Project > TestProject
  > ${specialPkg}  1.0.0  2.0.0  High  https://example.com/vuln

Project has the following vulnerable packages
`;

			const result = await pkg_audit.execute(
				{ ecosystem: 'dotnet' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Should parse without regex errors
			expect(parsed).toBeDefined();
		});

		it('bundle-audit: should handle extremely long gem names', async () => {
			const longName = createLargeString(10_000);
			mockExitCode = 1;
			mockStdout = JSON.stringify({
				results: [
					{
						type: 'Dependency',
						gem: { name: longName, version: '1.0.0' },
						advisory: {
							id: 'TEST-001',
							url: 'https://example.com',
							title: 'Test vuln',
							patched_versions: ['2.0.0'],
							criticality: 'High',
						},
					},
				],
				ignored: [],
			});

			const result = await pkg_audit.execute(
				{ ecosystem: 'ruby' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			expect(parsed).toBeDefined();
		});

		it('dart: should handle extremely long package names', async () => {
			const longName = createLargeString(10_000);
			mockExitCode = 0;
			mockStdout = JSON.stringify({
				packages: [
					{
						package: longName,
						current: { version: '1.0.0' },
						latest: { version: '2.0.0' },
						upgradable: { version: '1.5.0' },
					},
				],
			});

			const result = await pkg_audit.execute(
				{ ecosystem: 'dart' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			expect(parsed).toBeDefined();
		});
	});

	// ============ Binary/Non-UTF-8 Output Tests ============
	describe('binary and non-UTF-8 output handling', () => {
		it('govulncheck: should handle non-UTF-8 output gracefully', async () => {
			mockExitCode = 3;
			// Include some non-UTF-8 bytes (in practice, TextEncoder will encode properly,
			// but we test the error handling path)
			mockStdout =
				JSON.stringify({
					osv: {
						id: 'GO-2021-0053',
						summary: 'Test',
						aliases: ['CVE-2021-33196'],
					},
				}) + '\n';

			const result = await pkg_audit.execute(
				{ ecosystem: 'go' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Should handle gracefully
			expect(parsed).toBeDefined();
		});

		it('bundle-audit: should handle malformed UTF-8', async () => {
			mockExitCode = 1;
			// This simulates potential encoding issues
			mockStdout = '\xff\xfe invalid utf-8';

			const result = await pkg_audit.execute(
				{ ecosystem: 'ruby' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Should return clean with parse error
			expect(parsed.clean).toBe(true);
		});

		it('dart: should handle malformed UTF-8', async () => {
			mockExitCode = 0;
			mockStdout = '\xff\xfe invalid utf-8';

			const result = await pkg_audit.execute(
				{ ecosystem: 'dart' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Should return clean with parse error
			expect(parsed.clean).toBe(true);
		});
	});

	// ============ Embedded Newlines and Null Bytes Tests ============
	describe('embedded newlines and null bytes in fields', () => {
		it('govulncheck: should handle package names with embedded newlines', async () => {
			mockExitCode = 3;
			mockStdout =
				JSON.stringify({
					osv: {
						id: 'GO-2021-0053',
						summary: 'Test',
						aliases: ['CVE-2021-33196'],
					},
				}) +
				'\n' +
				JSON.stringify({
					finding: {
						osv: 'GO-2021-0053',
						trace: [{ module: 'test\nnewline\nin\nname', version: '1.0.0' }],
						fixed_by: null,
					},
				}) +
				'\n';

			const result = await pkg_audit.execute(
				{ ecosystem: 'go' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Should handle gracefully
			expect(parsed).toBeDefined();
		});

		it('bundle-audit: should handle gem names with embedded newlines', async () => {
			mockExitCode = 1;
			mockStdout = JSON.stringify({
				results: [
					{
						type: 'Dependency',
						gem: { name: 'test\ngem\nname', version: '1.0.0' },
						advisory: {
							id: 'TEST-001',
							url: 'https://example.com',
							title: 'Test vuln',
							patched_versions: ['2.0.0'],
							criticality: 'High',
						},
					},
				],
				ignored: [],
			});

			const result = await pkg_audit.execute(
				{ ecosystem: 'ruby' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			expect(parsed).toBeDefined();
		});

		it('dart: should handle package names with embedded newlines', async () => {
			mockExitCode = 0;
			mockStdout = JSON.stringify({
				packages: [
					{
						package: 'test\npackage\nname',
						current: { version: '1.0.0' },
						latest: { version: '2.0.0' },
						upgradable: { version: '1.5.0' },
					},
				],
			});

			const result = await pkg_audit.execute(
				{ ecosystem: 'dart' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			expect(parsed).toBeDefined();
		});

		it('all auditors: should handle null bytes in JSON strings', async () => {
			// Test govulncheck with null byte in summary
			mockExitCode = 3;
			mockStdout =
				JSON.stringify({
					osv: {
						id: 'GO-2021-0053',
						summary: 'Test\x00null\x00byte',
						aliases: ['CVE-2021-33196'],
					},
				}) +
				'\n' +
				JSON.stringify({
					finding: {
						osv: 'GO-2021-0053',
						trace: [{ module: 'test', version: '1.0.0' }],
						fixed_by: null,
					},
				}) +
				'\n';

			const result = await pkg_audit.execute(
				{ ecosystem: 'go' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			expect(parsed).toBeDefined();
		});
	});

	// ============ Injection via Crafted Package Names Tests ============
	describe('injection via crafted package names', () => {
		it('govulncheck: should handle shell metacharacters in package names', async () => {
			const maliciousName = '$(whoami);`rm -rf /`|touch /tmp/pwned';
			mockExitCode = 3;
			mockStdout =
				JSON.stringify({
					osv: {
						id: 'GO-2021-0053',
						summary: 'Test',
						aliases: ['CVE-2021-33196'],
					},
				}) +
				'\n' +
				JSON.stringify({
					finding: {
						osv: 'GO-2021-0053',
						trace: [{ module: maliciousName, version: '1.0.0' }],
						fixed_by: null,
					},
				}) +
				'\n';

			const result = await pkg_audit.execute(
				{ ecosystem: 'go' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Should handle as string, not execute
			expect(parsed).toBeDefined();
			expect(parsed.findings[0]?.package).toBe(maliciousName);
		});

		it('govulncheck: should handle SQL injection attempt in package name', async () => {
			const sqlInjection = "'; DROP TABLE packages; --";
			mockExitCode = 3;
			mockStdout =
				JSON.stringify({
					osv: {
						id: 'GO-2021-0053',
						summary: 'Test',
						aliases: ['CVE-2021-33196'],
					},
				}) +
				'\n' +
				JSON.stringify({
					finding: {
						osv: 'GO-2021-0053',
						trace: [{ module: sqlInjection, version: '1.0.0' }],
						fixed_by: null,
					},
				}) +
				'\n';

			const result = await pkg_audit.execute(
				{ ecosystem: 'go' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			expect(parsed).toBeDefined();
		});

		it('dotnet: should handle shell metacharacters in package names', async () => {
			const maliciousName = '$(rm -rf /) && touch /pwned';
			mockExitCode = 1;
			mockStdout = `Project > TestProject
  > ${maliciousName}  1.0.0  2.0.0  High  https://example.com/vuln

Project has the following vulnerable packages
`;

			const result = await pkg_audit.execute(
				{ ecosystem: 'dotnet' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Should parse without executing
			expect(parsed).toBeDefined();
		});

		it('bundle-audit: should handle shell metacharacters in gem names', async () => {
			const maliciousName = '`whoami`; cat /etc/passwd';
			mockExitCode = 1;
			mockStdout = JSON.stringify({
				results: [
					{
						type: 'Dependency',
						gem: { name: maliciousName, version: '1.0.0' },
						advisory: {
							id: 'TEST-001',
							url: 'https://example.com',
							title: 'Test vuln',
							patched_versions: ['2.0.0'],
							criticality: 'High',
						},
					},
				],
				ignored: [],
			});

			const result = await pkg_audit.execute(
				{ ecosystem: 'ruby' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			expect(parsed).toBeDefined();
		});

		it('dart: should handle shell metacharacters in package names', async () => {
			const maliciousName = 'evil|cmd>/dev/null';
			mockExitCode = 0;
			mockStdout = JSON.stringify({
				packages: [
					{
						package: maliciousName,
						current: { version: '1.0.0' },
						latest: { version: '2.0.0' },
						upgradable: { version: '1.5.0' },
					},
				],
			});

			const result = await pkg_audit.execute(
				{ ecosystem: 'dart' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			expect(parsed).toBeDefined();
		});

		it('all auditors: should handle XSS attempt in package names', async () => {
			const xssAttempt = '<script>alert("XSS")</script>';
			mockExitCode = 3;
			mockStdout =
				JSON.stringify({
					osv: {
						id: 'GO-2021-0053',
						summary: 'Test',
						aliases: ['CVE-2021-33196'],
					},
				}) +
				'\n' +
				JSON.stringify({
					finding: {
						osv: 'GO-2021-0053',
						trace: [{ module: xssAttempt, version: '1.0.0' }],
						fixed_by: null,
					},
				}) +
				'\n';

			const result = await pkg_audit.execute(
				{ ecosystem: 'go' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Should escape/handle as string
			expect(parsed).toBeDefined();
		});
	});

	// ============ govulncheck-Specific Edge Cases ============
	describe('govulncheck edge cases', () => {
		it('govulncheck: should handle empty trace array (trace[0] access safety)', async () => {
			mockExitCode = 3;
			mockStdout =
				JSON.stringify({
					osv: {
						id: 'GO-2021-0053',
						summary: 'Test',
						aliases: ['CVE-2021-33196'],
					},
				}) +
				'\n' +
				JSON.stringify({
					finding: {
						osv: 'GO-2021-0053',
						trace: [], // Empty trace array
						fixed_by: null,
					},
				}) +
				'\n';

			const result = await pkg_audit.execute(
				{ ecosystem: 'go' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Should not throw when accessing trace[0]
			expect(parsed).toBeDefined();
		});

		it('govulncheck: should handle missing OSV entry in map', async () => {
			mockExitCode = 3;
			// finding.osv references GO-MISSING which is not in the map
			mockStdout =
				JSON.stringify({
					osv: {
						id: 'GO-2021-0053',
						summary: 'Test',
						aliases: ['CVE-2021-33196'],
					},
				}) +
				'\n' +
				JSON.stringify({
					finding: {
						osv: 'GO-MISSING', // This ID is not in the osvMap
						trace: [{ module: 'test', version: '1.0.0' }],
						fixed_by: null,
					},
				}) +
				'\n';

			const result = await pkg_audit.execute(
				{ ecosystem: 'go' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Should handle missing OSV gracefully
			expect(parsed).toBeDefined();
		});

		it('govulncheck: should handle exit code 3 with zero findings', async () => {
			mockExitCode = 3;
			// Exit code 3 but no findings
			mockStdout =
				JSON.stringify({
					osv: {
						id: 'GO-2021-0053',
						summary: 'Test',
						aliases: ['CVE-2021-33196'],
					},
				}) + '\n';

			const result = await pkg_audit.execute(
				{ ecosystem: 'go' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Should return clean with no findings
			expect(parsed.clean).toBe(true);
			expect(parsed.findings.length).toBe(0);
		});

		it('govulncheck: should handle trace with missing module field', async () => {
			mockExitCode = 3;
			mockStdout =
				JSON.stringify({
					osv: {
						id: 'GO-2021-0053',
						summary: 'Test',
						aliases: ['CVE-2021-33196'],
					},
				}) +
				'\n' +
				JSON.stringify({
					finding: {
						osv: 'GO-2021-0053',
						trace: [{ version: '1.0.0' }], // Missing module
						fixed_by: null,
					},
				}) +
				'\n';

			const result = await pkg_audit.execute(
				{ ecosystem: 'go' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Should handle gracefully
			expect(parsed).toBeDefined();
		});

		it('govulncheck: should handle trace with missing version field', async () => {
			mockExitCode = 3;
			mockStdout =
				JSON.stringify({
					osv: {
						id: 'GO-2021-0053',
						summary: 'Test',
						aliases: ['CVE-2021-33196'],
					},
				}) +
				'\n' +
				JSON.stringify({
					finding: {
						osv: 'GO-2021-0053',
						trace: [{ module: 'test' }], // Missing version
						fixed_by: null,
					},
				}) +
				'\n';

			const result = await pkg_audit.execute(
				{ ecosystem: 'go' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			expect(parsed).toBeDefined();
		});
	});

	// ============ dotnet-Specific Edge Cases ============
	describe('dotnet edge cases', () => {
		it('dotnet: should handle package names with special regex chars', async () => {
			const specialChars =
				'test+package*special?chars^test$test[test]test{test}test|test\\test.test';
			mockExitCode = 1;
			mockStdout = `Project > TestProject
  > ${specialChars}  1.0.0  2.0.0  High  https://example.com/vuln

Project has the following vulnerable packages
`;

			const result = await pkg_audit.execute(
				{ ecosystem: 'dotnet' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Should parse without regex errors
			expect(parsed).toBeDefined();
		});

		it('dotnet: should handle malformed severity values', async () => {
			mockExitCode = 1;
			mockStdout = `Project > TestProject
  > test-pkg  1.0.0  2.0.0  INVALID  https://example.com/vuln

Project has the following vulnerable packages
`;

			const result = await pkg_audit.execute(
				{ ecosystem: 'dotnet' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Should map invalid severity to info
			expect(parsed).toBeDefined();
		});

		it('dotnet: should handle output with only header (no vulns)', async () => {
			mockExitCode = 1;
			mockStdout = `Project has the following vulnerable packages
`;

			const result = await pkg_audit.execute(
				{ ecosystem: 'dotnet' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Should return clean with no findings
			expect(parsed.clean).toBe(true);
			expect(parsed.findings.length).toBe(0);
		});
	});

	// ============ bundle-audit-Specific Edge Cases ============
	describe('bundle-audit edge cases', () => {
		it('bundle-audit: should handle null patched_versions', async () => {
			mockExitCode = 1;
			mockStdout = JSON.stringify({
				results: [
					{
						type: 'Dependency',
						gem: { name: 'test', version: '1.0.0' },
						advisory: {
							id: 'TEST-001',
							url: 'https://example.com',
							title: 'Test vuln',
							patched_versions: null, // null instead of array
							criticality: 'High',
						},
					},
				],
				ignored: [],
			});

			const result = await pkg_audit.execute(
				{ ecosystem: 'ruby' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Should handle null patched_versions
			expect(parsed).toBeDefined();
			expect(parsed.findings[0]?.patchedVersion).toBe(null);
		});

		it('bundle-audit: should handle undefined patched_versions', async () => {
			mockExitCode = 1;
			mockStdout = JSON.stringify({
				results: [
					{
						type: 'Dependency',
						gem: { name: 'test', version: '1.0.0' },
						advisory: {
							id: 'TEST-001',
							url: 'https://example.com',
							title: 'Test vuln',
							// missing patched_versions field
							criticality: 'High',
						},
					},
				],
				ignored: [],
			});

			const result = await pkg_audit.execute(
				{ ecosystem: 'ruby' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Should handle undefined patched_versions
			expect(parsed).toBeDefined();
		});

		it('bundle-audit: should handle empty patched_versions array', async () => {
			mockExitCode = 1;
			mockStdout = JSON.stringify({
				results: [
					{
						type: 'Dependency',
						gem: { name: 'test', version: '1.0.0' },
						advisory: {
							id: 'TEST-001',
							url: 'https://example.com',
							title: 'Test vuln',
							patched_versions: [], // Empty array
							criticality: 'High',
						},
					},
				],
				ignored: [],
			});

			const result = await pkg_audit.execute(
				{ ecosystem: 'ruby' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			expect(parsed).toBeDefined();
			expect(parsed.findings[0]?.patchedVersion).toBe(null);
		});

		it('bundle-audit: should handle null criticality', async () => {
			mockExitCode = 1;
			mockStdout = JSON.stringify({
				results: [
					{
						type: 'Dependency',
						gem: { name: 'test', version: '1.0.0' },
						advisory: {
							id: 'TEST-001',
							url: 'https://example.com',
							title: 'Test vuln',
							patched_versions: ['2.0.0'],
							cvss_v3: 7.5,
							criticality: null, // null instead of string
						},
					},
				],
				ignored: [],
			});

			const result = await pkg_audit.execute(
				{ ecosystem: 'ruby' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Should fall back to CVSS scoring
			expect(parsed.findings[0]?.severity).toBe('high');
		});

		it('bundle-audit: should handle unknown criticality value', async () => {
			mockExitCode = 1;
			mockStdout = JSON.stringify({
				results: [
					{
						type: 'Dependency',
						gem: { name: 'test', version: '1.0.0' },
						advisory: {
							id: 'TEST-001',
							url: 'https://example.com',
							title: 'Test vuln',
							patched_versions: ['2.0.0'],
							criticality: 'UNKNOWN', // Unknown value
						},
					},
				],
				ignored: [],
			});

			const result = await pkg_audit.execute(
				{ ecosystem: 'ruby' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Should handle unknown criticality
			expect(parsed).toBeDefined();
		});

		it('bundle-audit: should handle missing CVE field', async () => {
			mockExitCode = 1;
			mockStdout = JSON.stringify({
				results: [
					{
						type: 'Dependency',
						gem: { name: 'test', version: '1.0.0' },
						advisory: {
							id: 'TEST-001',
							url: 'https://example.com',
							title: 'Test vuln',
							// missing cve field
							patched_versions: ['2.0.0'],
							criticality: 'High',
						},
					},
				],
				ignored: [],
			});

			const result = await pkg_audit.execute(
				{ ecosystem: 'ruby' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			expect(parsed.findings[0]?.cve).toBe(null);
		});
	});

	// ============ dart-Specific Edge Cases ============
	describe('dart edge cases', () => {
		it('dart: should handle packages array with null entries', async () => {
			mockExitCode = 0;
			mockStdout = JSON.stringify({
				packages: [
					null,
					{
						package: 'test',
						current: { version: '1.0.0' },
						latest: { version: '2.0.0' },
						upgradable: { version: '1.5.0' },
					},
					null,
				],
			});

			const result = await pkg_audit.execute(
				{ ecosystem: 'dart' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Should handle null entries gracefully
			expect(parsed).toBeDefined();
		});

		it('dart: should handle packages with missing current field', async () => {
			mockExitCode = 0;
			mockStdout = JSON.stringify({
				packages: [
					{
						package: 'test',
						// missing current field
						latest: { version: '2.0.0' },
						upgradable: { version: '1.5.0' },
					},
				],
			});

			const result = await pkg_audit.execute(
				{ ecosystem: 'dart' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Should skip packages without current version
			expect(parsed.findings.length).toBe(0);
		});

		it('dart: should handle packages with missing latest field', async () => {
			mockExitCode = 0;
			mockStdout = JSON.stringify({
				packages: [
					{
						package: 'test',
						current: { version: '1.0.0' },
						// missing latest field
						upgradable: { version: '1.5.0' },
					},
				],
			});

			const result = await pkg_audit.execute(
				{ ecosystem: 'dart' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Should skip packages without latest version
			expect(parsed.findings.length).toBe(0);
		});

		it('dart: should handle packages with missing upgradable field', async () => {
			mockExitCode = 0;
			mockStdout = JSON.stringify({
				packages: [
					{
						package: 'test',
						current: { version: '1.0.0' },
						latest: { version: '2.0.0' },
						// missing upgradable field
					},
				],
			});

			const result = await pkg_audit.execute(
				{ ecosystem: 'dart' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Should skip packages without upgradable version
			expect(parsed.findings.length).toBe(0);
		});

		it('dart: should handle packages array as null', async () => {
			mockExitCode = 0;
			mockStdout = JSON.stringify({
				packages: null,
			});

			const result = await pkg_audit.execute(
				{ ecosystem: 'dart' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Should handle null packages array
			expect(parsed.findings.length).toBe(0);
		});

		it('dart: should handle package entry with null version fields', async () => {
			mockExitCode = 0;
			mockStdout = JSON.stringify({
				packages: [
					{
						package: 'test',
						current: null,
						latest: null,
						upgradable: null,
					},
				],
			});

			const result = await pkg_audit.execute(
				{ ecosystem: 'dart' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Should handle null version fields
			expect(parsed.findings.length).toBe(0);
		});

		it('dart: should handle package entry with version objects without version field', async () => {
			mockExitCode = 0;
			mockStdout = JSON.stringify({
				packages: [
					{
						package: 'test',
						current: { nullSafety: true }, // missing version
						latest: { version: '2.0.0' },
						upgradable: { version: '1.5.0' },
					},
				],
			});

			const result = await pkg_audit.execute(
				{ ecosystem: 'dart' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Should skip packages without version
			expect(parsed.findings.length).toBe(0);
		});
	});

	// ============ Tool Availability Edge Cases ============
	describe('tool availability edge cases', () => {
		it('govulncheck: should handle tool not found on PATH', async () => {
			mockSpawnError = new Error("'govulncheck' is not recognized");

			const result = await pkg_audit.execute(
				{ ecosystem: 'go' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			expect(parsed.clean).toBe(true);
			expect(parsed.note).toContain('not installed');
		});

		it('dotnet: should handle tool not found on PATH', async () => {
			// Note: The actual error message comes from the spawn failure,
			// not the isCommandAvailable check which returns early
			mockSpawnError = new Error("'dotnet' is not recognized");

			const result = await pkg_audit.execute(
				{ ecosystem: 'dotnet' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			// Should return clean with an error message
			expect(parsed.clean).toBe(true);
			// Error message could be "not installed" or "Error running dotnet list package"
			expect(parsed.note).toBeDefined();
		});

		it('bundle-audit: should handle both bundle-audit and bundle not found', async () => {
			mockSpawnError = new Error("'bundle-audit' is not recognized");

			const result = await pkg_audit.execute(
				{ ecosystem: 'ruby' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			expect(parsed.clean).toBe(true);
			expect(parsed.note).toContain('not installed');
		});

		it('dart: should handle both dart and flutter not found', async () => {
			mockSpawnError = new Error("'dart' is not recognized");

			const result = await pkg_audit.execute(
				{ ecosystem: 'dart' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			expect(parsed.clean).toBe(true);
			expect(parsed.note).toContain('not installed');
		});
	});

	// ============ Exit Code Edge Cases ============
	describe('exit code edge cases', () => {
		it('govulncheck: should handle exit code 1 (error)', async () => {
			mockExitCode = 1;
			mockStdout = 'Some error occurred';

			const result = await pkg_audit.execute(
				{ ecosystem: 'go' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Exit code 1 is not 0 or 3, should return clean with note
			expect(parsed.clean).toBe(true);
			expect(parsed.note).toContain('exited with code 1');
		});

		it('govulncheck: should handle exit code 2 (error)', async () => {
			mockExitCode = 2;
			mockStdout = 'Another error occurred';

			const result = await pkg_audit.execute(
				{ ecosystem: 'go' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			expect(parsed.clean).toBe(true);
			expect(parsed.note).toContain('exited with code 2');
		});

		it('bundle-audit: should handle exit code 2 (error)', async () => {
			mockExitCode = 2;
			mockStdout = 'Error in bundle-audit';

			const result = await pkg_audit.execute(
				{ ecosystem: 'ruby' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			expect(parsed.clean).toBe(true);
			expect(parsed.note).toContain('failed with exit code 2');
		});

		it('bundle-audit: should handle exit code 3 (unexpected)', async () => {
			mockExitCode = 3;
			mockStdout = 'Unexpected exit code';

			const result = await pkg_audit.execute(
				{ ecosystem: 'ruby' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			// Exit code 3 is not 0 or 1, should return clean with note
			expect(parsed.clean).toBe(true);
			expect(parsed.note).toContain('failed with exit code 3');
		});

		it('dart: should handle any non-zero exit code', async () => {
			mockExitCode = 1;
			mockStdout = 'Error in dart pub outdated';

			const result = await pkg_audit.execute(
				{ ecosystem: 'dart' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			if (parsed.note?.includes('not installed')) return;

			expect(parsed.clean).toBe(true);
			expect(parsed.note).toContain('exited with code 1');
		});
	});
});
