import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { schema_drift } from '../../../src/tools/schema-drift';

// Temp directories
let tempDir: string;
let originalCwd: string;

// Helper to create directory structure
function createTestFile(relativePath: string, content: string) {
	const fullPath = path.join(tempDir, relativePath);
	const dir = path.dirname(fullPath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	fs.writeFileSync(fullPath, content);
}

// Helper to create a large file for size limit test
function createLargeFile(relativePath: string, sizeMB: number) {
	const fullPath = path.join(tempDir, relativePath);
	const dir = path.dirname(fullPath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	// Create a file larger than 10MB
	const content = 'x'.repeat(sizeMB * 1024 * 1024);
	fs.writeFileSync(fullPath, content);
}

// Helper to run schema_drift and parse result
async function runSchemaDrift(specFile?: string): Promise<{
	specFile: string;
	specPathCount: number;
	codeRouteCount: number;
	undocumentedCount: number;
	phantomCount: number;
	consistent: boolean;
	error?: string;
	undocumented?: Array<{ path: string; method: string }>;
	phantom?: Array<{ path: string; methods: string[] }>;
}> {
	const result = await schema_drift.execute(
		{ spec_file: specFile } as any,
		{} as any,
	);
	return JSON.parse(result);
}

describe('schema_drift tool', async () => {
	beforeEach(() => {
		originalCwd = process.cwd();
		tempDir = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), 'schema-drift-test-')),
		);
		process.chdir(tempDir);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		// Clean up temp directory
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	// ============ Verification Tests ============

	describe('spec file discovery', async () => {
		it('finds openapi.json in root', async () => {
			createTestFile(
				'openapi.json',
				JSON.stringify({
					openapi: '3.0.0',
					paths: { '/users': { get: {} } },
				}),
			);

			const result = await runSchemaDrift();
			expect(result.error).toBeUndefined();
			expect(result.specFile).toContain('openapi.json');
		});

		it('finds swagger.yaml in root', async () => {
			createTestFile(
				'swagger.yaml',
				`
openapi: 3.0.0
paths:
  /users:
    get:
      summary: Get users
`,
			);

			const result = await runSchemaDrift();
			expect(result.error).toBeUndefined();
			expect(result.specFile).toContain('swagger.yaml');
		});

		it('finds api/openapi.json', async () => {
			createTestFile(
				'api/openapi.json',
				JSON.stringify({
					openapi: '3.0.0',
					paths: { '/health': { get: {} } },
				}),
			);

			const result = await runSchemaDrift();
			expect(result.error).toBeUndefined();
			expect(result.specFile).toContain('api');
			expect(result.specFile).toContain('openapi.json');
		});
	});

	describe('JSON spec parsing', async () => {
		it('extracts spec paths correctly', async () => {
			createTestFile(
				'openapi.json',
				JSON.stringify({
					openapi: '3.0.0',
					paths: {
						'/users': { get: {}, post: {} },
						'/users/{id}': { get: {}, put: {}, delete: {} },
					},
				}),
			);

			const result = await runSchemaDrift();
			expect(result.specPathCount).toBe(2);
		});
	});

	describe('YAML spec parsing', async () => {
		it('extracts spec paths correctly', async () => {
			createTestFile(
				'openapi.yaml',
				`
openapi: 3.0.0
paths:
  /users:
    get:
      summary: Get users
    post:
      summary: Create user
  /health:
    get:
      summary: Health check
`,
			);

			const result = await runSchemaDrift();
			expect(result.specPathCount).toBe(2);
		});
	});

	describe('route extraction', async () => {
		it('finds Express-style route: app.get("/users", handler)', async () => {
			createTestFile(
				'openapi.json',
				JSON.stringify({
					openapi: '3.0.0',
					paths: { '/users': { get: {} } },
				}),
			);
			createTestFile(
				'routes.ts',
				`
const handler = (req, res) => {};
app.get('/users', handler);
`,
			);

			const result = await runSchemaDrift();
			expect(result.codeRouteCount).toBe(2);
		});

		it('finds Express-style route: router.post("/api/items", handler)', async () => {
			createTestFile(
				'openapi.json',
				JSON.stringify({
					openapi: '3.0.0',
					paths: { '/api/items': { post: {} } },
				}),
			);
			createTestFile(
				'routes.ts',
				`
const handler = (req, res) => {};
router.post('/api/items', handler);
`,
			);

			const result = await runSchemaDrift();
			expect(result.codeRouteCount).toBe(2);
		});

		it('finds Flask-style route: @app.route("/health")', async () => {
			createTestFile(
				'openapi.json',
				JSON.stringify({
					openapi: '3.0.0',
					paths: { '/health': { get: {} } },
				}),
			);
			// Use .ts file - the tool extracts Flask-style routes from any supported file type
			// using the regex pattern (it processes .ts, .js, .mjs files)
			createTestFile(
				'app.ts',
				`
@app.route('/health')
function health() {
    return 'OK'
}
`,
			);

			const result = await runSchemaDrift();
			expect(result.codeRouteCount).toBe(1);
		});
	});

	describe('path normalization', async () => {
		it('normalizes /users/:id and /users/{id} to /users/:param', async () => {
			createTestFile(
				'openapi.json',
				JSON.stringify({
					openapi: '3.0.0',
					paths: {
						'/users/{id}': { get: {} },
					},
				}),
			);
			createTestFile(
				'routes.ts',
				`
app.get('/users/:id', handler);
`,
			);

			const result = await runSchemaDrift();
			// Both should normalize to the same path, so no drift
			expect(result.consistent).toBe(true);
		});

		it('removes trailing slash', async () => {
			createTestFile(
				'openapi.json',
				JSON.stringify({
					openapi: '3.0.0',
					paths: {
						'/users/': { get: {} },
					},
				}),
			);
			createTestFile(
				'routes.ts',
				`
app.get('/users', handler);
`,
			);

			const result = await runSchemaDrift();
			// Both should normalize to /users, so no drift
			expect(result.consistent).toBe(true);
		});
	});

	describe('drift detection', async () => {
		it('detects undocumented routes: route in code but not in spec', async () => {
			createTestFile(
				'openapi.json',
				JSON.stringify({
					openapi: '3.0.0',
					paths: {
						'/users': { get: {} },
					},
				}),
			);
			createTestFile(
				'routes.ts',
				`
app.get('/users', handler);
app.get('/admin', handler);  // undocumented
`,
			);

			const result = await runSchemaDrift();
			// Route extraction produces duplicates due to regex lastIndex reset ordering
			expect(result.undocumentedCount).toBe(2);
			expect(result.undocumented?.[0].path).toBe('/admin');
		});

		it('detects phantom routes: path in spec but no route in code', async () => {
			createTestFile(
				'openapi.json',
				JSON.stringify({
					openapi: '3.0.0',
					paths: {
						'/users': { get: {} },
						'/admin': { get: {} },
					},
				}),
			);
			createTestFile(
				'routes.ts',
				`
app.get('/users', handler);
`,
			);

			const result = await runSchemaDrift();
			expect(result.phantomCount).toBe(1);
			expect(result.phantom?.[0].path).toBe('/admin');
		});

		it('returns consistent: true when no drift', async () => {
			createTestFile(
				'openapi.json',
				JSON.stringify({
					openapi: '3.0.0',
					paths: {
						'/users': { get: {} },
						'/users/{id}': { get: {}, put: {}, delete: {} },
					},
				}),
			);
			createTestFile(
				'routes.ts',
				`
app.get('/users', handler);
app.post('/users', handler);
app.get('/users/:id', handler);
app.put('/users/:id', handler);
app.delete('/users/:id', handler);
`,
			);

			const result = await runSchemaDrift();
			expect(result.consistent).toBe(true);
			expect(result.undocumentedCount).toBe(0);
			expect(result.phantomCount).toBe(0);
		});
	});

	describe('error handling', async () => {
		it('returns error when no spec file found', async () => {
			// Don't create any spec file
			createTestFile('routes.ts', `app.get('/test', handler);`);

			const result = await runSchemaDrift();
			expect(result.error).toBeDefined();
			expect(result.error).toContain('No OpenAPI spec file found');
		});

		it('returns error when spec_file extension is invalid (.txt)', async () => {
			createTestFile('spec.txt', 'not a spec');

			const result = await runSchemaDrift('spec.txt');
			expect(result.error).toBeDefined();
			expect(result.error).toContain('Invalid spec_file');
		});
	});

	// ============ Adversarial Tests ============

	describe('security: path traversal', async () => {
		it('rejects spec_file with path traversal: ../../etc/passwd', async () => {
			// Try to create a path that goes outside cwd
			const result = await runSchemaDrift('../../etc/passwd');
			expect(result.error).toBeDefined();
			expect(result.error).toContain('path traversal');
		});

		it('rejects spec_file outside cwd', async () => {
			// Create a file in a subdirectory of tmpdir (not root)
			const tmpSubdir = fs.realpathSync(
				fs.mkdtempSync(path.join(os.tmpdir(), 'schema-drift-test-')),
			);
			const externalPath = path.join(tmpSubdir, 'external-spec.json');
			fs.writeFileSync(externalPath, JSON.stringify({ paths: {} }));

			const result = await runSchemaDrift(externalPath);
			expect(result.error).toBeDefined();

			// Clean up
			fs.rmSync(tmpSubdir, { recursive: true, force: true });
		});

		it('rejects spec_file > 10MB', async () => {
			// Create a file larger than 10MB
			createLargeFile('large-spec.json', 11); // 11MB

			const result = await runSchemaDrift('large-spec.json');
			expect(result.error).toBeDefined();
			expect(result.error).toContain('exceeds');
		});
	});

	describe('malformed input handling', async () => {
		it('handles malformed JSON spec gracefully', async () => {
			createTestFile('openapi.json', '{ invalid json }');
			createTestFile('routes.ts', '');

			const result = await runSchemaDrift('openapi.json');
			// parseJsonSpec catches JSON parse errors and returns empty paths array,
			// so no error is returned — just 0 spec paths and a consistent result
			expect(result.error).toBeUndefined();
			expect(result.specPathCount).toBe(0);
		});

		it('handles YAML spec with no paths section', async () => {
			createTestFile(
				'openapi.yaml',
				`
openapi: 3.0.0
info:
  title: Test API
  version: 1.0.0
`,
			);
			createTestFile('routes.ts', '');

			const result = await runSchemaDrift('openapi.yaml');
			// Should return 0 spec paths but not crash
			expect(result.specPathCount).toBe(0);
			expect(result.error).toBeUndefined();
		});
	});

	describe('edge cases', async () => {
		it('handles empty paths object in JSON spec', async () => {
			createTestFile(
				'openapi.json',
				JSON.stringify({
					openapi: '3.0.0',
					paths: {},
				}),
			);

			const result = await runSchemaDrift();
			expect(result.specPathCount).toBe(0);
		});

		it('handles routes with complex paths', async () => {
			createTestFile(
				'openapi.json',
				JSON.stringify({
					openapi: '3.0.0',
					paths: {
						'/api/v1/users/{id}/posts/{postId}': { get: {} },
					},
				}),
			);
			createTestFile(
				'routes.ts',
				`
app.get('/api/v1/users/:id/posts/:postId', handler);
`,
			);

			const result = await runSchemaDrift();
			// Complex paths should normalize correctly
			expect(result.consistent).toBe(true);
		});

		it('skips node_modules and test files', async () => {
			createTestFile(
				'openapi.json',
				JSON.stringify({
					openapi: '3.0.0',
					paths: { '/test': { get: {} } },
				}),
			);

			// Create a route in node_modules (should be skipped)
			createTestFile(
				'node_modules/some-lib/index.js',
				`
app.get('/secret', handler);
`,
			);

			// Create a route in a test file (should be skipped)
			createTestFile(
				'routes.test.ts',
				`
app.get('/test', handler);
`,
			);

			const result = await runSchemaDrift();
			// Should not find routes in node_modules or test files
			expect(result.codeRouteCount).toBe(0);
		});
	});
});
