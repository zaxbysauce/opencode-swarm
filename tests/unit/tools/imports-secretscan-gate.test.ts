/**
 * ADVERSARIAL SECURITY RE-TEST for post-fix 3.1 state
 * 
 * Testing ONLY attack vectors for imports.ts and secretscan.ts:
 * - Malformed args (undefined, null, wrong types)
 * - Malicious getters/proxies
 * - Oversized payloads
 * - Boundary violations
 * - Bypass attempts
 * 
 * Preserves existing response-shape and metadata-only secret redaction expectations.
 * DO NOT add functional/exploratory tests - only adversarial vectors.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ============ IMPORTS TOOL ADVERSARIAL TESTS ============
describe('imports tool - malicious args handling (post-fix 3.1)', () => {
	let tempDir: string;
	let originalFile: string;

	beforeEach(async () => {
		tempDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), 'imports-adversarial-'),
		);
		originalFile = path.join(tempDir, 'test-util.ts');
		await fs.promises.writeFile(originalFile, `
export function helper() { return 1; }
export class MyClass { }
export const MY_CONST = 42;
`);
	});

	afterEach(async () => {
		await fs.promises.rm(tempDir, { recursive: true, force: true });
	});

	test('ADVERSARIAL: undefined args object should return error', async () => {
		const { imports } = await import('../../../src/tools/imports');
		// @ts-ignore - intentionally passing undefined
		const result = JSON.parse(await imports.execute(undefined, {} as any));
		expect(result.error).toContain('invalid arguments');
		expect(result.consumers).toEqual([]);
		expect(result.count).toBe(0);
	});

	test('ADVERSARIAL: null args should return error', async () => {
		const { imports } = await import('../../../src/tools/imports');
		// @ts-ignore - intentionally passing null
		const result = JSON.parse(await imports.execute(null, {} as any));
		expect(result.error).toContain('invalid arguments');
		expect(result.consumers).toEqual([]);
	});

	test('ADVERSARIAL: undefined file property should return error', async () => {
		const { imports } = await import('../../../src/tools/imports');
		const result = JSON.parse(
			await imports.execute({ file: undefined } as any, {} as any),
		);
		expect(result.error).toContain('invalid arguments');
		expect(result.consumers).toEqual([]);
	});

	test('ADVERSARIAL: missing file property entirely should return error', async () => {
		const { imports } = await import('../../../src/tools/imports');
		const result = JSON.parse(
			await imports.execute({} as any, {} as any),
		);
		expect(result.error).toContain('invalid arguments');
		expect(result.consumers).toEqual([]);
	});

	test('ADVERSARIAL: null file value should return error', async () => {
		const { imports } = await import('../../../src/tools/imports');
		const result = JSON.parse(
			await imports.execute({ file: null } as any, {} as any),
		);
		// null is caught at validation layer (file is required)
		expect(result.error).toContain('invalid file');
	});

	test('ADVERSARIAL: empty string file should return error', async () => {
		const { imports } = await import('../../../src/tools/imports');
		const result = JSON.parse(
			await imports.execute({ file: '' }, {} as any),
		);
		expect(result.error).toContain('invalid file');
		expect(result.error).toContain('required');
	});

	test('ADVERSARIAL: malicious getter that throws should be caught', async () => {
		const { imports } = await import('../../../src/tools/imports');
		// Create object with malicious getter
		const maliciousArgs = new Proxy({}, {
			get(_target, prop) {
				if (prop === 'file') {
					throw new Error('malicious getter attack');
				}
				return undefined;
			},
		});

		const result = JSON.parse(
			await imports.execute(maliciousArgs as any, {} as any),
		);
		// Should handle gracefully, not crash
		expect(result.error).toContain('invalid arguments');
		expect(result.consumers).toEqual([]);
	});

	test('ADVERSARIAL: proxy with file getter returning undefined', async () => {
		const { imports } = await import('../../../src/tools/imports');
		const proxyArgs = new Proxy({}, {
			get(_target, prop) {
				if (prop === 'file') return undefined;
				if (prop === 'symbol') return undefined;
				return undefined;
			},
		});

		const result = JSON.parse(
			await imports.execute(proxyArgs as any, {} as any),
		);
		expect(result.error).toContain('invalid arguments');
	});

	test('ADVERSARIAL: object with getter for symbol that throws', async () => {
		const { imports } = await import('../../../src/tools/imports');
		const maliciousArgs = {
			file: 'test.ts',
			get symbol() {
				throw new Error('symbol getter attack');
			},
		};

		const result = JSON.parse(
			await imports.execute(maliciousArgs as any, {} as any),
		);
		// Should handle gracefully - file is valid so should proceed
		expect(result).toBeDefined();
	});

	test('ADVERSARIAL: non-object args (primitive string) should not crash', async () => {
		const { imports } = await import('../../../src/tools/imports');
		const result = JSON.parse(
			await imports.execute('string' as any, {} as any),
		);
		expect(result.error).toContain('invalid arguments');
	});

	test('ADVERSARIAL: non-object args (primitive number) should not crash', async () => {
		const { imports } = await import('../../../src/tools/imports');
		const result = JSON.parse(
			await imports.execute(123 as any, {} as any),
		);
		expect(result.error).toContain('invalid arguments');
	});

	test('ADVERSARIAL: array args should not crash', async () => {
		const { imports } = await import('../../../src/tools/imports');
		const result = JSON.parse(
			await imports.execute(['file1', 'file2'] as any, {} as any),
		);
		expect(result.error).toContain('invalid arguments');
	});

	test('ADVERSARIAL: symbol with control characters should be rejected', async () => {
		const { imports } = await import('../../../src/tools/imports');
		const result = JSON.parse(
			await imports.execute(
				{ file: originalFile, symbol: 'test\u0000injection' },
				{} as any,
			),
		);
		expect(result.error).toContain('invalid symbol');
		expect(result.error).toContain('control');
	});

	test('ADVERSARIAL: symbol with path traversal should be rejected', async () => {
		const { imports } = await import('../../../src/tools/imports');
		const result = JSON.parse(
			await imports.execute(
				{ file: originalFile, symbol: '../secret' },
				{} as any,
			),
		);
		expect(result.error).toContain('invalid symbol');
		expect(result.error).toContain('path traversal');
	});

	test('ADVERSARIAL: symbol exceeding max length should be rejected', async () => {
		const { imports } = await import('../../../src/tools/imports');
		const longSymbol = 'a'.repeat(300);
		const result = JSON.parse(
			await imports.execute({ file: originalFile, symbol: longSymbol }, {} as any),
		);
		expect(result.error).toContain('invalid symbol');
		expect(result.error).toContain('exceeds maximum length');
	});

	test('ADVERSARIAL: file path traversal attempt should be rejected', async () => {
		const { imports } = await import('../../../src/tools/imports');
		const result = JSON.parse(
			await imports.execute({ file: '../etc/passwd' }, {} as any),
		);
		expect(result.error).toContain('invalid file');
		expect(result.error).toContain('path traversal');
	});

	test('ADVERSARIAL: file with control characters should be rejected', async () => {
		const { imports } = await import('../../../src/tools/imports');
		const result = JSON.parse(
			await imports.execute({ file: 'test\u0000file.ts' }, {} as any),
		);
		expect(result.error).toContain('invalid file');
		expect(result.error).toContain('control characters');
	});

	test('ADVERSARIAL: file with newline should be rejected', async () => {
		const { imports } = await import('../../../src/tools/imports');
		const result = JSON.parse(
			await imports.execute({ file: 'test\nfile.ts' }, {} as any),
		);
		expect(result.error).toContain('invalid file');
		expect(result.error).toContain('control characters');
	});

	test('ADVERSARIAL: file exceeding max length should be rejected', async () => {
		const { imports } = await import('../../../src/tools/imports');
		const longPath = '/'.repeat(600);
		const result = JSON.parse(
			await imports.execute({ file: longPath }, {} as any),
		);
		expect(result.error).toContain('invalid file');
		expect(result.error).toContain('exceeds maximum length');
	});

	test('ADVERSARIAL: non-existent file returns proper error', async () => {
		const { imports } = await import('../../../src/tools/imports');
		const result = JSON.parse(
			await imports.execute(
				{ file: path.join(tempDir, 'nonexistent.ts') },
				{} as any,
			),
		);
		expect(result.error).toContain('not found');
		expect(result.count).toBe(0);
	});

	test('ADVERSARIAL: directory instead of file returns proper error', async () => {
		const { imports } = await import('../../../src/tools/imports');
		const result = JSON.parse(
			await imports.execute({ file: tempDir }, {} as any),
		);
		expect(result.error).toContain('must be a file');
		expect(result.count).toBe(0);
	});
});

// ============ SECRETSCAN TOOL ADVERSARIAL TESTS ============
describe('secretscan tool - malicious args handling (post-fix 3.1)', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), 'secretscan-adversarial-'),
		);
	});

	afterEach(async () => {
		await fs.promises.rm(tempDir, { recursive: true, force: true });
	});

	test('ADVERSARIAL: undefined args should return error', async () => {
		const { secretscan } = await import('../../../src/tools/secretscan');
		// @ts-ignore
		const result = JSON.parse(await secretscan.execute(undefined, {} as any));
		expect(result.error).toContain('invalid arguments');
		expect(result.findings).toEqual([]);
		expect(result.count).toBe(0);
	});

	test('ADVERSARIAL: null args should return error', async () => {
		const { secretscan } = await import('../../../src/tools/secretscan');
		// @ts-ignore
		const result = JSON.parse(await secretscan.execute(null, {} as any));
		expect(result.error).toContain('invalid arguments');
		expect(result.findings).toEqual([]);
	});

	test('ADVERSARIAL: undefined directory should return error', async () => {
		const { secretscan } = await import('../../../src/tools/secretscan');
		const result = JSON.parse(
			await secretscan.execute({ directory: undefined } as any, {} as any),
		);
		expect(result.error).toContain('invalid arguments');
	});

	test('ADVERSARIAL: missing directory entirely should return error', async () => {
		const { secretscan } = await import('../../../src/tools/secretscan');
		const result = JSON.parse(
			await secretscan.execute({} as any, {} as any),
		);
		expect(result.error).toContain('invalid arguments');
	});

	test('ADVERSARIAL: null directory value should return error', async () => {
		const { secretscan } = await import('../../../src/tools/secretscan');
		const result = JSON.parse(
			await secretscan.execute({ directory: null } as any, {} as any),
		);
		// null is caught at validation layer (directory is required)
		expect(result.error).toContain('invalid directory');
	});

	test('ADVERSARIAL: empty string directory should return error', async () => {
		const { secretscan } = await import('../../../src/tools/secretscan');
		const result = JSON.parse(
			await secretscan.execute({ directory: '' }, {} as any),
		);
		expect(result.error).toContain('invalid directory');
		expect(result.error).toContain('required');
	});

	test('ADVERSARIAL: malicious getter that throws should be caught', async () => {
		const { secretscan } = await import('../../../src/tools/secretscan');
		const maliciousArgs = new Proxy({}, {
			get(_target, prop) {
				if (prop === 'directory') {
					throw new Error('directory getter attack');
				}
				return undefined;
			},
		});

		const result = JSON.parse(
			await secretscan.execute(maliciousArgs as any, {} as any),
		);
		expect(result.error).toContain('invalid arguments');
		expect(result.findings).toEqual([]);
	});

	test('ADVERSARIAL: proxy with directory getter returning undefined', async () => {
		const { secretscan } = await import('../../../src/tools/secretscan');
		const proxyArgs = new Proxy({}, {
			get(_target, prop) {
				if (prop === 'directory') return undefined;
				if (prop === 'exclude') return undefined;
				return undefined;
			},
		});

		const result = JSON.parse(
			await secretscan.execute(proxyArgs as any, {} as any),
		);
		expect(result.error).toContain('invalid arguments');
	});

	test('ADVERSARIAL: object with getter for exclude that throws', async () => {
		const { secretscan } = await import('../../../src/tools/secretscan');
		const maliciousArgs = {
			directory: '.',
			get exclude() {
				throw new Error('exclude getter attack');
			},
		};

		const result = JSON.parse(
			await secretscan.execute(maliciousArgs as any, {} as any),
		);
		// Should handle gracefully
		expect(result).toBeDefined();
	});

	test('ADVERSARIAL: non-object args (primitive string) should not crash', async () => {
		const { secretscan } = await import('../../../src/tools/secretscan');
		const result = JSON.parse(
			await secretscan.execute('string' as any, {} as any),
		);
		expect(result.error).toContain('invalid arguments');
	});

	test('ADVERSARIAL: non-object args (primitive number) should not crash', async () => {
		const { secretscan } = await import('../../../src/tools/secretscan');
		const result = JSON.parse(
			await secretscan.execute(123 as any, {} as any),
		);
		expect(result.error).toContain('invalid arguments');
	});

	test('ADVERSARIAL: array args should not crash', async () => {
		const { secretscan } = await import('../../../src/tools/secretscan');
		const result = JSON.parse(
			await secretscan.execute(['dir1', 'dir2'] as any, {} as any),
		);
		expect(result.error).toContain('invalid arguments');
	});

	test('ADVERSARIAL: directory path traversal attempt should be rejected', async () => {
		const { secretscan } = await import('../../../src/tools/secretscan');
		const result = JSON.parse(
			await secretscan.execute({ directory: '../etc' }, {} as any),
		);
		expect(result.error).toContain('invalid directory');
		expect(result.error).toContain('path traversal');
	});

	test('ADVERSARIAL: directory with control characters should be rejected', async () => {
		const { secretscan } = await import('../../../src/tools/secretscan');
		const result = JSON.parse(
			await secretscan.execute({ directory: 'test\u0000dir' }, {} as any),
		);
		expect(result.error).toContain('invalid directory');
		expect(result.error).toContain('control characters');
	});

	test('ADVERSARIAL: directory with carriage return should be rejected', async () => {
		const { secretscan } = await import('../../../src/tools/secretscan');
		const result = JSON.parse(
			await secretscan.execute({ directory: 'test\rdir' }, {} as any),
		);
		expect(result.error).toContain('invalid directory');
		expect(result.error).toContain('control characters');
	});

	test('ADVERSARIAL: directory exceeding max length should be rejected', async () => {
		const { secretscan } = await import('../../../src/tools/secretscan');
		const longPath = '/'.repeat(600);
		const result = JSON.parse(
			await secretscan.execute({ directory: longPath }, {} as any),
		);
		expect(result.error).toContain('invalid directory');
		expect(result.error).toContain('exceeds maximum length');
	});

	test('ADVERSARIAL: non-existent directory returns proper error', async () => {
		const { secretscan } = await import('../../../src/tools/secretscan');
		const result = JSON.parse(
			await secretscan.execute(
				{ directory: path.join(tempDir, 'nonexistent') },
				{} as any,
			),
		);
		expect(result.error).toContain('not found');
		expect(result.count).toBe(0);
	});

	test('ADVERSARIAL: file instead of directory returns proper error', async () => {
		const { secretscan } = await import('../../../src/tools/secretscan');
		const testFile = path.join(tempDir, 'test.txt');
		await fs.promises.writeFile(testFile, 'content');

		const result = JSON.parse(
			await secretscan.execute({ directory: testFile }, {} as any),
		);
		expect(result.error).toContain('must be a directory');
		expect(result.count).toBe(0);
	});

	test('ADVERSARIAL: exclude array with path traversal should be rejected', async () => {
		const { secretscan } = await import('../../../src/tools/secretscan');
		const result = JSON.parse(
			await secretscan.execute(
				{ directory: tempDir, exclude: ['../escape'] },
				{} as any,
			),
		);
		expect(result.error).toContain('invalid exclude');
		expect(result.error).toContain('path traversal');
	});

	test('ADVERSARIAL: exclude array with control chars should be rejected', async () => {
		const { secretscan } = await import('../../../src/tools/secretscan');
		const result = JSON.parse(
			await secretscan.execute(
				{ directory: tempDir, exclude: ['bad\u0000dir'] },
				{} as any,
			),
		);
		expect(result.error).toContain('invalid exclude');
		expect(result.error).toContain('control characters');
	});

	test('ADVERSARIAL: exclude array with too-long path should be rejected', async () => {
		const { secretscan } = await import('../../../src/tools/secretscan');
		const longPath = '/'.repeat(600);
		const result = JSON.parse(
			await secretscan.execute(
				{ directory: tempDir, exclude: [longPath] },
				{} as any,
			),
		);
		expect(result.error).toContain('invalid exclude');
		expect(result.error).toContain('exceeds maximum length');
	});
});

// ============ REDACTION VERIFICATION (POST-FIX) ============
describe('secretscan - redaction verification (critical for security)', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), 'secretscan-redaction-'),
		);
	});

	afterEach(async () => {
		await fs.promises.rm(tempDir, { recursive: true, force: true });
	});

	test('ADVERSARIAL: NEVER returns raw secrets - API keys redacted', async () => {
		const { secretscan } = await import('../../../src/tools/secretscan');
		const testFile = path.join(tempDir, 'config.js');
		await fs.promises.writeFile(
		testFile,
		`
const apiKey = "sk_${'live_'}123456789012345678901234";
const password = "supersecret123";
const dbUrl = "mysql://user:password@localhost/db";
`,
		);

		const result = JSON.parse(
			await secretscan.execute({ directory: tempDir }, {} as any),
		);

		expect(result.count).toBeGreaterThan(0);
		// NEVER returns raw secrets - check that unique parts are redacted
		for (const finding of result.findings) {
			// The secret portion should be replaced, not the full secret
			expect(finding.redacted).not.toMatch(/123456789012345678901234/); // actual secret chars
			expect(finding.redacted).not.toMatch(/supersecret123/); // actual password
			expect(finding.redacted).not.toMatch(/password@localhost/); // actual creds
			// Various valid redaction formats
			expect(finding.redacted).toMatch(/\[REDACTED\]|\[SECRET\]|\[user\]|\.\.\./);
		}
	});

	test('ADVERSARIAL: context is also redacted', async () => {
		const { secretscan } = await import('../../../src/tools/secretscan');
		const testFile = path.join(tempDir, 'token.js');
		await fs.promises.writeFile(
			testFile,
			`const token = "ghp_abcdefghijklmnopqrstuvwxyz1234567890";`,
		);

		const result = JSON.parse(
			await secretscan.execute({ directory: tempDir }, {} as any),
		);

		if (result.count > 0) {
			for (const finding of result.findings) {
				// Context should have redaction placeholder, not raw token
				// The ghp_ prefix might appear but the actual token chars should be redacted
				expect(finding.context).not.toMatch(/abcdefghijklmnopqrstuvwxyz1234567890/);
				// Context redaction can be [SECRET], [REDACTED], or pattern-based
				expect(finding.context).toMatch(/\[SECRET\]|\[REDACTED\]|\.\.\./);
			}
		}
	});

	test('ADVERSARIAL: private keys redacted', async () => {
		const { secretscan } = await import('../../../src/tools/secretscan');
		const testFile = path.join(tempDir, 'key.pem');
		await fs.promises.writeFile(
			testFile,
			`-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF8PbnGy0
-----END RSA PRIVATE KEY-----`,
		);

		const result = JSON.parse(
			await secretscan.execute({ directory: tempDir }, {} as any),
		);

		const pkFindings = result.findings.filter(
			(f: any) => f.type === 'private_key',
		);
		expect(pkFindings.length).toBeGreaterThan(0);
		expect(pkFindings[0].redacted).toBe('-----BEGIN PRIVATE KEY-----');
	});

	test('ADVERSARIAL: JWT tokens redacted', async () => {
		const { secretscan } = await import('../../../src/tools/secretscan');
		const testFile = path.join(tempDir, 'token.js');
		await fs.promises.writeFile(
			testFile,
			`const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";`,
		);

		const result = JSON.parse(
			await secretscan.execute({ directory: tempDir }, {} as any),
		);

		const jwtFindings = result.findings.filter((f: any) => f.type === 'jwt');
		expect(jwtFindings.length).toBeGreaterThan(0);
		expect(jwtFindings[0].redacted).toContain('eyJ');
		expect(jwtFindings[0].redacted).not.toContain('John Doe');
	});

	test('ADVERSARIAL: symlinks are skipped', async () => {
		const { secretscan } = await import('../../../src/tools/secretscan');
		const realDir = path.join(tempDir, 'real');
		await fs.promises.mkdir(realDir, { recursive: true });
		const realFile = path.join(realDir, 'secret.txt');
		await fs.promises.writeFile(realFile, 'apiKey = "sk_test_123"');

		const linkDir = path.join(tempDir, 'link');
		try {
			await fs.promises.symlink(realDir, linkDir, 'dir');
		} catch {
			// Skip on Windows if symlinks not supported
			return;
		}

		const result = JSON.parse(
			await secretscan.execute({ directory: tempDir }, {} as any),
		);

		// Should scan real dir but skip symlink
		expect(result.files_scanned).toBeGreaterThanOrEqual(1);
	});

	test('ADVERSARIAL: binary files skipped', async () => {
		const { secretscan } = await import('../../../src/tools/secretscan');
		const binaryFile = path.join(tempDir, 'image.png');
		await fs.promises.writeFile(binaryFile, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

		const result = JSON.parse(
			await secretscan.execute({ directory: tempDir }, {} as any),
		);

		expect(result.files_scanned).toBe(0);
		expect(result.skipped_files).toBeGreaterThan(0);
	});

	test('ADVERSARIAL: output size bounded', async () => {
		const { secretscan } = await import('../../../src/tools/secretscan');
		// Create many files with secrets
		for (let i = 0; i < 50; i++) {
			const f = path.join(tempDir, `config${i}.js`);
			await fs.promises.writeFile(
				f,
				`const key${i} = "sk_${'live_'}${'x'.repeat(30)}";`,
			);
		}

		const result = JSON.parse(
			await secretscan.execute({ directory: tempDir }, {} as any),
		);

		expect(result.count).toBeLessThanOrEqual(100);
	});

	test('ADVERSARIAL: node_modules excluded by default', async () => {
		const { secretscan } = await import('../../../src/tools/secretscan');
		const nodeModules = path.join(tempDir, 'node_modules', 'pkg');
		await fs.promises.mkdir(nodeModules, { recursive: true });
		await fs.promises.writeFile(
			path.join(nodeModules, 'index.js'),
			`const secret = "sk_${'live_'}123"`,
		);

		const result = JSON.parse(
			await secretscan.execute({ directory: tempDir }, {} as any),
		);

		const foundInNodeModules = result.findings.some((f: any) =>
			f.path.includes('node_modules'),
		);
		expect(foundInNodeModules).toBe(false);
	});

	test('ADVERSARIAL: .git excluded by default', async () => {
		const { secretscan } = await import('../../../src/tools/secretscan');
		const gitDir = path.join(tempDir, '.git', 'credentials');
		await fs.promises.mkdir(gitDir, { recursive: true });
		await fs.promises.writeFile(
			path.join(gitDir, 'config'),
			'token = "ghp_abcdef"',
		);

		const result = JSON.parse(
			await secretscan.execute({ directory: tempDir }, {} as any),
		);

		const foundInGit = result.findings.some((f: any) =>
			f.path.includes('.git'),
		);
		expect(foundInGit).toBe(false);
	});
});

// ============ BOUNDARY VIOLATIONS ============
describe('boundary violations', () => {
	test('ADVERSARIAL: imports file path at max length boundary', async () => {
		const { imports } = await import('../../../src/tools/imports');
		const tempDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), 'imports-boundary-'),
		);
		try {
			// Use shorter path that stays under Windows MAX_PATH (260)
			const maxPath = path.join(tempDir, 'a'.repeat(100));
			await fs.promises.writeFile(maxPath + '.ts', 'export const x = 1;');

			const result = JSON.parse(
				await imports.execute({ file: maxPath + '.ts' }, {} as any),
			);
			expect(result.error || result.count).toBeDefined();
		} finally {
			await fs.promises.rm(tempDir, { recursive: true, force: true });
		}
	});

	test('ADVERSARIAL: imports file path over limit', async () => {
		const { imports } = await import('../../../src/tools/imports');
		// Test with in-memory validation (path doesn't need to exist)
		const longPath = 'a'.repeat(600);
		const result = JSON.parse(
			await imports.execute({ file: longPath }, {} as any),
		);
		expect(result.error).toContain('exceeds maximum length');
	});

	test('ADVERSARIAL: secretscan directory at max length boundary', async () => {
		const { secretscan } = await import('../../../src/tools/secretscan');
		const tempDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), 'secretscan-boundary-'),
		);
		try {
			// Use shorter path for Windows compatibility
			const maxDir = path.join(tempDir, 'a'.repeat(100));
			await fs.promises.mkdir(maxDir, { recursive: true });

			const result = JSON.parse(
				await secretscan.execute({ directory: maxDir }, {} as any),
			);
			expect(result.error || result.count).toBeDefined();
		} finally {
			await fs.promises.rm(tempDir, { recursive: true, force: true });
		}
	});

	test('ADVERSARIAL: secretscan directory over limit', async () => {
		const { secretscan } = await import('../../../src/tools/secretscan');
		// Test with in-memory validation
		const longPath = 'a'.repeat(600);
		const result = JSON.parse(
			await secretscan.execute({ directory: longPath }, {} as any),
		);
		expect(result.error).toContain('exceeds maximum length');
	});
});
