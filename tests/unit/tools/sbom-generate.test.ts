import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ToolContext } from '@opencode-ai/plugin';
import { sbom_generate } from '../../../src/tools/sbom-generate';

// Mock saveEvidence
vi.mock('../../../src/evidence/manager', () => ({
	saveEvidence: vi.fn().mockResolvedValue(undefined),
}));

// Temp directories
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

describe('sbom_generate tool', () => {
	beforeEach(() => {
		// Save current directory and create temp dir
		originalCwd = process.cwd();
		tempDir = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), 'sbom-generate-test-')),
		);
		process.chdir(tempDir);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		// Clean up temp directory
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	// ============ Validation Tests ============
	describe('validation', () => {
		it('should return error for missing scope', async () => {
			const result = await sbom_generate.execute({}, getMockContext());
			const parsed = JSON.parse(result);
			expect(parsed.error).toContain('Invalid arguments');
		});

		it('should return error for invalid scope value', async () => {
			const result = await sbom_generate.execute(
				{ scope: 'invalid' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);
			expect(parsed.error).toContain('Invalid arguments');
		});

		it('should return error when scope is changed but changed_files is missing', async () => {
			const result = await sbom_generate.execute(
				{ scope: 'changed' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);
			expect(parsed.error).toContain('Invalid arguments');
		});

		it('should return error when scope is changed but changed_files is empty', async () => {
			const result = await sbom_generate.execute(
				{ scope: 'changed', changed_files: [] },
				getMockContext(),
			);
			const parsed = JSON.parse(result);
			expect(parsed.error).toContain('Invalid arguments');
		});

		it('should accept valid arguments with scope=all', async () => {
			const result = await sbom_generate.execute(
				{ scope: 'all' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);
			// Should not have error, may be skip since no manifests
			expect(parsed).toHaveProperty('verdict');
		});

		it('should accept valid arguments with scope=changed and changed_files', async () => {
			const result = await sbom_generate.execute(
				{ scope: 'changed', changed_files: ['src/index.ts'] },
				getMockContext(),
			);
			const parsed = JSON.parse(result);
			// Should not have error, may be skip since no manifests
			expect(parsed).toHaveProperty('verdict');
		});
	});

	// ============ Scope 'all' Tests ============
	describe('scope=all', () => {
		it('should return skip verdict when no manifest files found', async () => {
			// Create a simple source file but no manifests
			fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
			fs.writeFileSync(
				path.join(tempDir, 'src', 'index.ts'),
				'console.log("hello");',
			);

			const result = await sbom_generate.execute(
				{ scope: 'all' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			expect(parsed.verdict).toBe('skip');
			expect(parsed.files).toEqual([]);
			expect(parsed.components_count).toBe(0);
			expect(parsed.output_path).toBe('');
		});

		it('should detect package.json and generate SBOM', async () => {
			// Create package.json with dependencies
			const packageJson = {
				name: 'test-project',
				version: '1.0.0',
				dependencies: {
					express: '^4.18.0',
					lodash: '^4.17.21',
				},
				devDependencies: {
					typescript: '^5.0.0',
				},
			};
			fs.writeFileSync(
				path.join(tempDir, 'package.json'),
				JSON.stringify(packageJson, null, 2),
			);

			const result = await sbom_generate.execute(
				{ scope: 'all' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			expect(parsed.verdict).toBe('pass');
			expect(parsed.files).toContain('package.json');
			expect(parsed.components_count).toBeGreaterThan(0);
			expect(parsed.output_path).toContain('sbom-');
		});

		it('should detect package-lock.json and generate SBOM', async () => {
			// Create package-lock.json
			const packageLock = {
				name: 'test-project',
				version: '1.0.0',
				lockfileVersion: 2,
				packages: {
					'': { version: '1.0.0' },
					'node_modules/express': {
						version: '4.18.2',
						resolved: 'https://registry.npmjs.org/express/-/express-4.18.2.tgz',
						license: 'MIT',
					},
					'node_modules/lodash': {
						version: '4.17.21',
						resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz',
						license: 'MIT',
					},
				},
			};
			fs.writeFileSync(
				path.join(tempDir, 'package-lock.json'),
				JSON.stringify(packageLock, null, 2),
			);

			const result = await sbom_generate.execute(
				{ scope: 'all' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			expect(parsed.verdict).toBe('pass');
			expect(parsed.files).toContain('package-lock.json');
			expect(parsed.components_count).toBe(2);
		});

		it('should detect requirements.txt and generate SBOM', async () => {
			// Create requirements.txt
			fs.writeFileSync(
				path.join(tempDir, 'requirements.txt'),
				'requests>=2.0\nflask>=2.0\nnumpy>=1.21',
			);

			const result = await sbom_generate.execute(
				{ scope: 'all' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			expect(parsed.verdict).toBe('pass');
			expect(parsed.files).toContain('requirements.txt');
			expect(parsed.components_count).toBe(3);
		});

		it('should detect Cargo.toml and generate SBOM', async () => {
			// Create Cargo.toml
			fs.writeFileSync(
				path.join(tempDir, 'Cargo.toml'),
				`[package]
name = "test-crate"
version = "0.1.0"

[dependencies]
serde = "1.0"
tokio = "1.0"`,
			);

			const result = await sbom_generate.execute(
				{ scope: 'all' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			expect(parsed.verdict).toBe('pass');
			expect(parsed.files).toContain('Cargo.toml');
		});

		it('should detect go.mod and generate SBOM', async () => {
			// Create go.mod
			fs.writeFileSync(
				path.join(tempDir, 'go.mod'),
				`module github.com/test/project

go 1.21

require (
	github.com/gin-gonic/gin v1.9.0
	golang.org/x/crypto v0.14.0
)`,
			);

			const result = await sbom_generate.execute(
				{ scope: 'all' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			expect(parsed.verdict).toBe('pass');
			expect(parsed.files).toContain('go.mod');
		});

		it('should find manifests in nested directories', async () => {
			// Create nested package.json
			fs.mkdirSync(path.join(tempDir, 'packages', 'sub-package'), {
				recursive: true,
			});
			fs.writeFileSync(
				path.join(tempDir, 'packages', 'sub-package', 'package.json'),
				JSON.stringify({
					name: 'sub-package',
					version: '1.0.0',
					dependencies: { chalk: '^5.0.0' },
				}),
			);

			const result = await sbom_generate.execute(
				{ scope: 'all' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			expect(parsed.verdict).toBe('pass');
			expect(parsed.files).toContain(
				path.join('packages', 'sub-package', 'package.json'),
			);
		});

		it('should skip node_modules, dist, build directories', async () => {
			// Create package.json in root
			fs.writeFileSync(
				path.join(tempDir, 'package.json'),
				JSON.stringify({ name: 'test', version: '1.0.0' }),
			);

			// Create package.json in node_modules (should be ignored)
			fs.mkdirSync(path.join(tempDir, 'node_modules', 'some-package'), {
				recursive: true,
			});
			fs.writeFileSync(
				path.join(tempDir, 'node_modules', 'some-package', 'package.json'),
				JSON.stringify({ name: 'some-package', version: '1.0.0' }),
			);

			// Create package.json in dist (should be ignored)
			fs.mkdirSync(path.join(tempDir, 'dist'), { recursive: true });
			fs.writeFileSync(
				path.join(tempDir, 'dist', 'package.json'),
				JSON.stringify({ name: 'dist-package', version: '1.0.0' }),
			);

			const result = await sbom_generate.execute(
				{ scope: 'all' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			expect(parsed.verdict).toBe('pass');
			expect(parsed.files).toContain('package.json');
			expect(parsed.files).not.toContain(
				'node_modules/some-package/package.json',
			);
			expect(parsed.files).not.toContain('dist/package.json');
		});
	});

	// ============ Scope 'changed' Tests ============
	describe('scope=changed', () => {
		it('should return skip verdict when changed_files contains no manifests', async () => {
			const result = await sbom_generate.execute(
				{
					scope: 'changed',
					changed_files: ['src/index.ts', 'README.md'],
				},
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			expect(parsed.verdict).toBe('skip');
			expect(parsed.files).toEqual([]);
			expect(parsed.components_count).toBe(0);
		});

		it('should only scan directories containing changed files', async () => {
			// Create manifests in different directories
			fs.mkdirSync(path.join(tempDir, 'frontend'), { recursive: true });
			fs.mkdirSync(path.join(tempDir, 'backend'), { recursive: true });

			// Frontend has package.json
			fs.writeFileSync(
				path.join(tempDir, 'frontend', 'package.json'),
				JSON.stringify({
					name: 'frontend',
					dependencies: { react: '^18.0.0' },
				}),
			);

			// Backend has requirements.txt
			fs.writeFileSync(
				path.join(tempDir, 'backend', 'requirements.txt'),
				'flask>=2.0',
			);

			// Changed files only in frontend
			const result = await sbom_generate.execute(
				{
					scope: 'changed',
					changed_files: ['frontend/src/App.tsx'],
				},
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			expect(parsed.verdict).toBe('pass');
			expect(parsed.files).toContain(path.join('frontend', 'package.json'));
			// Backend should NOT be included
			expect(parsed.files).not.toContain(
				path.join('backend', 'requirements.txt'),
			);
		});

		it('should handle changed_files with directories', async () => {
			// Create package.json
			fs.writeFileSync(
				path.join(tempDir, 'package.json'),
				JSON.stringify({ name: 'test', dependencies: { lodash: '^4.0.0' } }),
			);

			// Changed file at root
			const result = await sbom_generate.execute(
				{
					scope: 'changed',
					changed_files: ['package.json'],
				},
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			expect(parsed.verdict).toBe('pass');
			expect(parsed.files).toContain('package.json');
		});
	});

	// ============ Output Tests ============
	describe('output', () => {
		it('should create output directory if it does not exist', async () => {
			fs.writeFileSync(
				path.join(tempDir, 'package.json'),
				JSON.stringify({ name: 'test', version: '1.0.0' }),
			);

			const customOutputDir = path.join(
				tempDir,
				'.swarm',
				'evidence',
				'custom-sbom',
			);

			const result = await sbom_generate.execute(
				{
					scope: 'all',
					output_dir: customOutputDir,
				},
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			expect(fs.existsSync(customOutputDir)).toBe(true);
			expect(parsed.output_path).toContain('custom-sbom');
		});

		it('should generate valid CycloneDX JSON output', async () => {
			fs.writeFileSync(
				path.join(tempDir, 'package.json'),
				JSON.stringify({
					name: 'test',
					dependencies: { express: '^4.18.0' },
				}),
			);

			const result = await sbom_generate.execute(
				{ scope: 'all' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			// Read the generated SBOM file
			const sbomContent = fs.readFileSync(parsed.output_path, 'utf-8');
			const sbom = JSON.parse(sbomContent);

			// Verify CycloneDX structure
			expect(sbom.bomFormat).toBe('CycloneDX');
			expect(sbom.specVersion).toBe('1.5');
			expect(sbom.metadata).toBeDefined();
			expect(sbom.metadata.tools).toBeDefined();
			expect(sbom.metadata.tools[0].name).toBe('sbom_generate');
			expect(sbom.components).toBeDefined();
		});

		it('should include components with PURLs', async () => {
			fs.writeFileSync(
				path.join(tempDir, 'package.json'),
				JSON.stringify({
					name: 'test',
					dependencies: { lodash: '4.17.21' },
				}),
			);

			const result = await sbom_generate.execute(
				{ scope: 'all' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			const sbomContent = fs.readFileSync(parsed.output_path, 'utf-8');
			const sbom = JSON.parse(sbomContent);

			// Should have at least one component with PURL
			const lodashComponent = sbom.components.find(
				(c: { name: string }) => c.name === 'lodash',
			);
			expect(lodashComponent).toBeDefined();
			expect(lodashComponent.purl).toContain('pkg:npm/lodash@');
		});

		it('should use custom output_dir when provided', async () => {
			fs.writeFileSync(
				path.join(tempDir, 'package.json'),
				JSON.stringify({ name: 'test', version: '1.0.0' }),
			);

			const customDir = '.swarm/evidence/my-sbom';

			const result = await sbom_generate.execute(
				{
					scope: 'all',
					output_dir: customDir,
				},
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			expect(parsed.output_path).toContain('my-sbom');
			expect(parsed.output_path).toContain('sbom-');
		});
	});

	// ============ Multiple Manifests Tests ============
	describe('multiple ecosystems', () => {
		it('should combine components from multiple manifest types', async () => {
			// Create package.json
			fs.writeFileSync(
				path.join(tempDir, 'package.json'),
				JSON.stringify({ name: 'test', dependencies: { express: '^4.0.0' } }),
			);

			// Create requirements.txt
			fs.writeFileSync(
				path.join(tempDir, 'requirements.txt'),
				'flask>=2.0\ndjango>=4.0',
			);

			// Create Cargo.toml
			fs.writeFileSync(
				path.join(tempDir, 'Cargo.toml'),
				`[package]
name = "test"
version = "0.1.0"

[dependencies]
serde = "1.0"`,
			);

			const result = await sbom_generate.execute(
				{ scope: 'all' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			expect(parsed.verdict).toBe('pass');
			expect(parsed.files.length).toBeGreaterThanOrEqual(3);
			// Total components: express(1) + flask + django (2) + serde (1) = 4+
			expect(parsed.components_count).toBeGreaterThanOrEqual(4);
		});
	});

	// ============ Edge Cases ============
	describe('edge cases', () => {
		it('should handle empty dependencies in package.json', async () => {
			fs.writeFileSync(
				path.join(tempDir, 'package.json'),
				JSON.stringify({ name: 'test', version: '1.0.0', dependencies: {} }),
			);

			const result = await sbom_generate.execute(
				{ scope: 'all' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			expect(parsed.verdict).toBe('pass');
			expect(parsed.components_count).toBe(0);
		});

		it('should handle invalid JSON in manifest files gracefully', async () => {
			// Create an invalid package.json
			fs.writeFileSync(path.join(tempDir, 'package.json'), '{ invalid json }');

			// Should still return pass but with 0 components from that file
			const result = await sbom_generate.execute(
				{ scope: 'all' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			expect(parsed).toHaveProperty('verdict');
		});

		it('should use default output directory when output_dir is not provided', async () => {
			fs.writeFileSync(
				path.join(tempDir, 'package.json'),
				JSON.stringify({ name: 'test', version: '1.0.0' }),
			);

			const result = await sbom_generate.execute(
				{ scope: 'all' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			expect(parsed.output_path).toContain('.swarm');
			expect(parsed.output_path).toContain('evidence');
			expect(parsed.output_path).toContain('sbom');
		});

		it('should create .swarm in project root even when process.cwd() is a subdirectory', async () => {
			// Create a subdirectory that simulates an agent working in src/export
			const subDir = path.join(tempDir, 'src', 'export');
			fs.mkdirSync(subDir, { recursive: true });

			// Place package.json in the project root
			fs.writeFileSync(
				path.join(tempDir, 'package.json'),
				JSON.stringify({
					name: 'test',
					version: '1.0.0',
					dependencies: { lodash: '4.17.21' },
				}),
			);

			// Change CWD to the subdirectory (simulating agent working in src/export)
			process.chdir(subDir);

			// ctx.directory should still point to the project root (tempDir)
			const result = await sbom_generate.execute(
				{ scope: 'all' },
				getMockContext(),
			);
			const parsed = JSON.parse(result);

			// .swarm output should be under project root (tempDir), NOT under src/export
			expect(parsed.output_path).toContain(tempDir);
			expect(parsed.output_path).not.toContain(subDir);
			// The .swarm folder must NOT appear inside src/export
			expect(fs.existsSync(path.join(subDir, '.swarm'))).toBe(false);
			// The .swarm folder MUST appear at the project root
			expect(fs.existsSync(path.join(tempDir, '.swarm'))).toBe(true);
		});
	});
});
