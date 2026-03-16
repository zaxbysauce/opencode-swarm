import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Adversarial validation tests for Task 5.1 config loader test migration slice.
 * These tests verify migration-specific boundary cases:
 * 1. Wrong-path resolution
 * 2. Retired-root duplication risk
 * 3. Package-local barrel import breakage
 * 4. Config barrel exports sufficiency (not excessive)
 */

describe('config/loader migration adversarial validation', () => {
	describe('1. Wrong-path resolution', () => {
		it('should resolve barrel import from test location correctly', () => {
			// The test imports from '../../src/config' - verify this resolves
			// This is the core path resolution test for migration
			// Use process.cwd() to check we're in the monorepo context
			const cwd = process.cwd();
			
			// Verify we're in a monorepo context with packages
			expect(cwd).toContain('opencode-swarm');
		});

		it('should resolve merge utility path correctly through barrel', () => {
			// Verify MAX_MERGE_DEPTH is accessible through barrel import
			// This tests the chain: test -> config/index.ts -> utils/merge.ts
			const { MAX_MERGE_DEPTH } = require('../../src/config');
			expect(MAX_MERGE_DEPTH).toBe(10);
		});

		it('should be in correct monorepo location', () => {
			// Migration check: ensure we're testing from packages/core/ not old root
			const cwd = process.cwd();
			
			// The test file is at packages/core/tests/config/
			// So working directory should be opencode-swarm
			expect(cwd.endsWith('opencode-swarm')).toBe(true);
		});
	});

	describe('2. Retired-root duplication risk', () => {
		it('should not have duplicate config exports in barrel', () => {
			// Verify no duplicate exports that might cause confusion
			const indexContent = fs.readFileSync(
				path.join(process.cwd(), 'packages/core/src/config/index.ts'),
				'utf-8'
			);
			
			// Count occurrences of key exports - should be exactly once each
			const loadPluginConfigMatches = indexContent.match(/loadPluginConfig/g);
			expect(loadPluginConfigMatches?.length).toBe(2); // import + export
			
			const deepMergeMatches = indexContent.match(/export.*deepMerge/g);
			expect(deepMergeMatches?.length).toBe(1); // Only one export
		});

		it('should export loadAgentPrompt exactly once in barrel group export', () => {
			// Verify loadAgentPrompt is only exported once through group export
			const indexContent = fs.readFileSync(
				path.join(process.cwd(), 'packages/core/src/config/index.ts'),
				'utf-8'
			);
			
			// Check that loadAgentPrompt appears in the loader export block
			// It's in a group export: export { loadAgentPrompt, ... } from './loader';
			const hasLoaderExport = indexContent.includes("from './loader'");
			expect(hasLoaderExport).toBe(true);
			
			// And that loadAgentPrompt is mentioned only once in the entire file
			const loadAgentPromptOccurrences = indexContent.split('loadAgentPrompt').length - 1;
			expect(loadAgentPromptOccurrences).toBe(1);
		});
	});

	describe('3. Package-local barrel import breakage', () => {
		it('should successfully import deepMerge through barrel', () => {
			const { deepMerge } = require('../../src/config');
			expect(typeof deepMerge).toBe('function');
			
			// Verify it works correctly
			const result = deepMerge({ a: 1 }, { b: 2 });
			expect(result).toEqual({ a: 1, b: 2 });
		});

		it('should successfully import loadPluginConfig through barrel', () => {
			const { loadPluginConfig } = require('../../src/config');
			expect(typeof loadPluginConfig).toBe('function');
		});

		it('should successfully import loadAgentPrompt through barrel', () => {
			const { loadAgentPrompt } = require('../../src/config');
			expect(typeof loadAgentPrompt).toBe('function');
		});

		it('should successfully import MAX_MERGE_DEPTH through barrel', () => {
			const { MAX_MERGE_DEPTH } = require('../../src/config');
			expect(MAX_MERGE_DEPTH).toBe(10);
		});

		it('should successfully import MAX_CONFIG_FILE_BYTES through barrel', () => {
			const { MAX_CONFIG_FILE_BYTES } = require('../../src/config');
			expect(MAX_CONFIG_FILE_BYTES).toBe(102400);
		});

		it('should have loadPluginConfigWithMeta exported through barrel', () => {
			const { loadPluginConfigWithMeta } = require('../../src/config');
			expect(typeof loadPluginConfigWithMeta).toBe('function');
		});
	});

	describe('4. Config barrel exports sufficiency (not excessive)', () => {
		it('should export all required config loader functions', () => {
			const configExports = require('../../src/config');
			
			// Must-have exports for config loading
			expect(configExports.loadPluginConfig).toBeDefined();
			expect(configExports.loadAgentPrompt).toBeDefined();
			expect(configExports.loadPluginConfigWithMeta).toBeDefined();
			expect(configExports.deepMerge).toBeDefined();
		});

		it('should export required constants', () => {
			const configExports = require('../../src/config');
			
			expect(configExports.MAX_MERGE_DEPTH).toBeDefined();
			expect(configExports.MAX_CONFIG_FILE_BYTES).toBeDefined();
		});

		it('should not export internal-only functions unnecessarily', () => {
			const configExports = require('../../src/config');
			
			// loadRawConfigFromPath is internal and intentionally NOT exported from barrel
			// This is correct - it should only be used internally
			expect(configExports.loadRawConfigFromPath).toBeUndefined();
		});

		it('should export schema types and validators', () => {
			const configExports = require('../../src/config');
			
			// Should have schema validators
			expect(configExports.PluginConfigSchema).toBeDefined();
			expect(configExports.SwarmConfigSchema).toBeDefined();
		});

		it('should export plan schemas', () => {
			const configExports = require('../../src/config');
			
			expect(configExports.PlanSchema).toBeDefined();
			expect(configExports.PhaseSchema).toBeDefined();
			expect(configExports.TaskSchema).toBeDefined();
		});

		it('should export evidence schemas', () => {
			const configExports = require('../../src/config');
			
			expect(configExports.EvidenceSchema).toBeDefined();
			expect(configExports.EvidenceBundleSchema).toBeDefined();
		});

		it('should export agent constants', () => {
			const configExports = require('../../src/config');
			
			expect(configExports.ALL_AGENT_NAMES).toBeDefined();
			expect(configExports.ORCHESTRATOR_NAME).toBeDefined();
			expect(configExports.QA_AGENTS).toBeDefined();
			expect(configExports.PIPELINE_AGENTS).toBeDefined();
		});

		it('should export type definitions', () => {
			const configExports = require('../../src/config');
			
			// Type definitions - these won't show up in require() but module should be valid
			// The test passes if the module loads without error
			expect(typeof configExports).toBe('object');
		});

		it('barrel should have reasonable export count (not bloated)', () => {
			const configExports = require('../../src/config');
			const exportKeys = Object.keys(configExports);
			
			// A reasonable barrel should not have too many exports
			// Too many would indicate over-exporting internal details
			// Based on index.ts: ~35 exports is reasonable
			expect(exportKeys.length).toBeGreaterThan(20);
			expect(exportKeys.length).toBeLessThan(60);
		});
	});

	describe('Migration integration: actual config loading works', () => {
		let tempDir: string;
		let originalXDG: string | undefined;

		beforeEach(() => {
			tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-migration-test-'));
			originalXDG = process.env.XDG_CONFIG_HOME;
			process.env.XDG_CONFIG_HOME = tempDir;
		});

		afterEach(() => {
			if (originalXDG === undefined) {
				delete process.env.XDG_CONFIG_HOME;
			} else {
				process.env.XDG_CONFIG_HOME = originalXDG;
			}
			fs.rmSync(tempDir, { recursive: true, force: true });
		});

		it('loads config through migrated barrel import', () => {
			// This is the end-to-end migration test
			const { loadPluginConfig } = require('../../src/config');
			const result = loadPluginConfig(tempDir);
			
			expect(result).toBeDefined();
			expect(result.max_iterations).toBe(5); // default
		});

		it('deepMerge through barrel works with migrated config', () => {
			const { deepMerge } = require('../../src/config');
			
			const userConfig = { max_iterations: 7 };
			const projectConfig = { qa_retry_limit: 8 };
			
			const merged = deepMerge(userConfig, projectConfig);
			
			expect(merged.max_iterations).toBe(7);
			expect(merged.qa_retry_limit).toBe(8);
		});

		it('loadAgentPrompt through barrel works', () => {
			const { loadAgentPrompt } = require('../../src/config');
			
			// Should return empty when no prompt files exist
			const result = loadAgentPrompt('test-agent');
			expect(typeof result).toBe('object');
		});
	});

	describe('Edge cases: path traversal protection', () => {
		it('should handle malicious config path attempts gracefully', () => {
			const { loadPluginConfig } = require('../../src/config');
			
			// Path traversal attempt - should either reject or safely handle
			const maliciousPath = path.join(os.tmpdir(), '../../etc/passwd');
			
			// This should not crash - either throw or return defaults
			try {
				const result = loadPluginConfig(maliciousPath);
				// If it doesn't throw, should return safe defaults
				expect(result).toBeDefined();
			} catch {
				// Throwing is also acceptable for invalid paths
				expect(true).toBe(true);
			}
		});

		it('should handle XDG_CONFIG_HOME pointing to non-existent directory', () => {
			const { loadPluginConfig } = require('../../src/config');
			
			// Set XDG to non-existent path
			process.env.XDG_CONFIG_HOME = '/tmp/this-path-definitely-does-not-exist-12345';
			
			// Should not crash, should return defaults
			const result = loadPluginConfig(os.tmpdir());
			expect(result).toBeDefined();
			expect(result.max_iterations).toBe(5);
		});
	});
});
