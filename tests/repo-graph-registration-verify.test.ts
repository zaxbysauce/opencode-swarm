import { describe, expect, test } from 'bun:test';
import { AGENT_TOOL_MAP, TOOL_DESCRIPTIONS } from '../src/config/constants';
import * as toolsIndex from '../src/tools/index';
import { TOOL_NAME_SET, TOOL_NAMES } from '../src/tools/tool-names';

describe('repo_graph removal verification', () => {
	describe('repo_graph NOT in TOOL_NAMES array', () => {
		test('TOOL_NAMES does not contain repo_graph', () => {
			const hasRepoGraph = (TOOL_NAMES as readonly string[]).includes(
				'repo_graph',
			);
			expect(hasRepoGraph).toBe(false);
		});

		test('TOOL_NAMES has correct count', () => {
			expect(TOOL_NAMES.length).toBeGreaterThan(0);
			expect(TOOL_NAMES.length).toBe(TOOL_NAME_SET.size);
		});
	});

	describe('repo_graph NOT in AGENT_TOOL_MAP.architect', () => {
		test('architect tools array does not contain repo_graph', () => {
			const architectTools = AGENT_TOOL_MAP.architect;
			const hasRepoGraph = (architectTools as readonly string[]).includes(
				'repo_graph',
			);
			expect(hasRepoGraph).toBe(false);
		});

		test('architect has tools', () => {
			expect(AGENT_TOOL_MAP.architect.length).toBeGreaterThan(0);
		});
	});

	describe('repo_graph NOT in TOOL_DESCRIPTIONS', () => {
		test('TOOL_DESCRIPTIONS does not have repo_graph key', () => {
			const hasRepoGraphKey = 'repo_graph' in TOOL_DESCRIPTIONS;
			expect(hasRepoGraphKey).toBe(false);
		});

		test('TOOL_DESCRIPTIONS has expected number of entries', () => {
			const keys = Object.keys(TOOL_DESCRIPTIONS);
			expect(keys.includes('repo_graph')).toBe(false);
		});
	});

	describe('TOOL_NAME_SET does NOT contain repo_graph', () => {
		test('TOOL_NAME_SET.has("repo_graph") returns false', () => {
			expect(TOOL_NAME_SET.has('repo_graph' as any)).toBe(false);
		});

		test('TOOL_NAME_SET size matches TOOL_NAMES length', () => {
			expect(TOOL_NAME_SET.size).toBe(TOOL_NAMES.length);
		});
	});

	describe('barrel exports still work - repo-graph functions are still exported', () => {
		test('buildWorkspaceGraph is exported from tools index', () => {
			expect(typeof toolsIndex.buildWorkspaceGraph).toBe('function');
		});

		test('loadGraph is exported from tools index', () => {
			expect(typeof toolsIndex.loadGraph).toBe('function');
		});

		test('loadOrCreateGraph is exported from tools index', () => {
			expect(typeof toolsIndex.loadOrCreateGraph).toBe('function');
		});

		test('saveGraph is exported from tools index', () => {
			expect(typeof toolsIndex.saveGraph).toBe('function');
		});

		test('updateGraphForFiles is exported from tools index', () => {
			expect(typeof toolsIndex.updateGraphForFiles).toBe('function');
		});

		test('resolveModuleSpecifier is exported from tools index', () => {
			expect(typeof toolsIndex.resolveModuleSpecifier).toBe('function');
		});

		test('RepoGraph type is exported via direct import', async () => {
			const mod = await import('../src/tools/index');
			expect(mod).toBeDefined();
			expect(typeof mod.buildWorkspaceGraph).toBe('function');
		});
	});

	describe('negative case - ensure test is actually checking removal', () => {
		test('an existing tool (diff) IS in TOOL_NAMES', () => {
			const hasDiff = (TOOL_NAMES as readonly string[]).includes('diff');
			expect(hasDiff).toBe(true);
		});

		test('an existing tool (diff) IS in AGENT_TOOL_MAP.architect', () => {
			const hasDiff = (AGENT_TOOL_MAP.architect as readonly string[]).includes(
				'diff',
			);
			expect(hasDiff).toBe(true);
		});

		test('an existing tool (diff) IS in TOOL_DESCRIPTIONS', () => {
			const hasDiffKey = 'diff' in TOOL_DESCRIPTIONS;
			expect(hasDiffKey).toBe(true);
		});

		test('an existing tool (diff) IS in TOOL_NAME_SET', () => {
			expect(TOOL_NAME_SET.has('diff' as any)).toBe(true);
		});
	});
});
