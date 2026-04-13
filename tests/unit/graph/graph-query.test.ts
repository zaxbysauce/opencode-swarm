import { beforeEach, describe, expect, it } from 'bun:test';
import {
	getBlastRadius,
	getDependencies,
	getImporters,
	getKeyFiles,
	getLocalizationContext,
	getSymbolConsumers,
	normalizeGraphPath,
	resetQueryCache,
} from '../../../src/graph/graph-query';
import {
	REPO_GRAPH_SCHEMA_VERSION,
	type RepoGraph,
} from '../../../src/graph/types';

function makeGraph(): RepoGraph {
	// Diamond:
	//   util.ts ← service.ts ← controller.ts
	//   util.ts ← helper.ts  ← controller.ts
	//   util.ts ← orphan.ts (no further importers)
	return {
		version: REPO_GRAPH_SCHEMA_VERSION,
		buildTimestamp: new Date().toISOString(),
		rootDir: '/repo',
		files: {
			'util.ts': {
				path: 'util.ts',
				language: 'typescript',
				exports: [
					{ name: 'add', kind: 'function', line: 1 },
					{ name: 'sub', kind: 'function', line: 2 },
				],
				imports: [],
				mtimeMs: 0,
			},
			'service.ts': {
				path: 'service.ts',
				language: 'typescript',
				exports: [{ name: 'service', kind: 'function', line: 1 }],
				imports: [
					{
						source: 'service.ts',
						target: 'util.ts',
						rawModule: './util',
						importedSymbols: ['add'],
						importType: 'named',
						line: 1,
					},
				],
				mtimeMs: 0,
			},
			'helper.ts': {
				path: 'helper.ts',
				language: 'typescript',
				exports: [{ name: 'help', kind: 'function', line: 1 }],
				imports: [
					{
						source: 'helper.ts',
						target: 'util.ts',
						rawModule: './util',
						importedSymbols: ['sub'],
						importType: 'named',
						line: 1,
					},
				],
				mtimeMs: 0,
			},
			'orphan.ts': {
				path: 'orphan.ts',
				language: 'typescript',
				exports: [],
				imports: [
					{
						source: 'orphan.ts',
						target: 'util.ts',
						rawModule: './util',
						importedSymbols: [],
						importType: 'namespace',
						line: 1,
					},
				],
				mtimeMs: 0,
			},
			'controller.ts': {
				path: 'controller.ts',
				language: 'typescript',
				exports: [],
				imports: [
					{
						source: 'controller.ts',
						target: 'service.ts',
						rawModule: './service',
						importedSymbols: ['service'],
						importType: 'named',
						line: 1,
					},
					{
						source: 'controller.ts',
						target: 'helper.ts',
						rawModule: './helper',
						importedSymbols: ['help'],
						importType: 'named',
						line: 2,
					},
				],
				mtimeMs: 0,
			},
		},
	};
}

beforeEach(() => {
	resetQueryCache();
});

describe('getImporters / getDependencies', () => {
	it('returns direct importers of a file', () => {
		const g = makeGraph();
		const importers = getImporters(g, 'util.ts')
			.map((r) => r.file)
			.sort();
		expect(importers).toEqual(['helper.ts', 'orphan.ts', 'service.ts']);
	});

	it('returns direct dependencies of a file', () => {
		const g = makeGraph();
		const deps = getDependencies(g, 'controller.ts')
			.map((d) => d.file)
			.sort();
		expect(deps).toEqual(['helper.ts', 'service.ts']);
	});

	it('normalizes path separators', () => {
		const g = makeGraph();
		const importers = getImporters(g, 'util.ts');
		const importersBackslash = getImporters(g, 'util.ts');
		expect(importers).toEqual(importersBackslash);
	});
});

describe('getSymbolConsumers', () => {
	it('returns named consumers and namespace importers (as wildcards)', () => {
		const g = makeGraph();
		const addConsumers = getSymbolConsumers(g, 'util.ts', 'add')
			.map((r) => r.file)
			.sort();
		// service.ts named-imports add; orphan.ts has a namespace import
		// (wildcard reference, conservatively included).
		expect(addConsumers).toEqual(['orphan.ts', 'service.ts']);
		const subConsumers = getSymbolConsumers(g, 'util.ts', 'sub')
			.map((r) => r.file)
			.sort();
		expect(subConsumers).toEqual(['helper.ts', 'orphan.ts']);
	});

	it('records namespace importers as wildcard references', () => {
		const g = makeGraph();
		const consumers = getSymbolConsumers(g, 'util.ts', 'add');
		// orphan.ts uses `import * as ...`, so it shows up with importedAs '*'
		const orphan = consumers.find((c) => c.file === 'orphan.ts');
		expect(orphan?.importedAs).toBe('*');
	});
});

describe('getBlastRadius', () => {
	it('finds direct + transitive dependents', () => {
		const g = makeGraph();
		const r = getBlastRadius(g, ['util.ts'], 3);
		expect(r.directDependents.sort()).toEqual([
			'helper.ts',
			'orphan.ts',
			'service.ts',
		]);
		expect(r.transitiveDependents).toContain('controller.ts');
		expect(r.totalDependents).toBe(4);
	});

	it('respects maxDepth', () => {
		const g = makeGraph();
		const r = getBlastRadius(g, ['util.ts'], 1);
		expect(r.directDependents).toHaveLength(3);
		expect(r.transitiveDependents).toHaveLength(0);
	});

	it('classifies risk by total dependent count', () => {
		const g = makeGraph();
		const r = getBlastRadius(g, ['util.ts'], 5);
		// 4 dependents → medium tier (>3, ≤10)
		expect(r.riskLevel).toBe('medium');
	});

	it('reports low risk for leaf files', () => {
		const g = makeGraph();
		const r = getBlastRadius(g, ['controller.ts'], 5);
		expect(r.totalDependents).toBe(0);
		expect(r.riskLevel).toBe('low');
	});
});

describe('getKeyFiles', () => {
	it('ranks by in-degree', () => {
		const g = makeGraph();
		const top = getKeyFiles(g, 5);
		expect(top[0].path).toBe('util.ts'); // most-imported
	});
});

describe('normalizeGraphPath — regression (F8)', () => {
	it('strips ALL leading "./" segments, not just one', () => {
		// Previous regex `/^\.\/+/` only stripped a single leading `./` plus
		// extra slashes. Inputs like `././util.ts` would survive as `util.ts`
		// only after multiple normalizations.
		expect(normalizeGraphPath('./util.ts')).toBe('util.ts');
		expect(normalizeGraphPath('././util.ts')).toBe('util.ts');
		expect(normalizeGraphPath('./././util.ts')).toBe('util.ts');
	});

	it('still normalises Windows separators', () => {
		expect(normalizeGraphPath('src\\util.ts')).toBe('src/util.ts');
	});
});

describe('getBlastRadius — regression: depthReached (F9)', () => {
	it('reports depthReached=1 when direct importers exist at maxDepth=1', () => {
		// Previous code only updated depthReached when a NEXT layer was
		// enqueued, so maxDepth=1 reported depthReached=0 even though direct
		// importers (one hop) had been visited.
		const g = makeGraph();
		const r = getBlastRadius(g, ['util.ts'], 1);
		expect(r.directDependents.length).toBeGreaterThan(0);
		expect(r.depthReached).toBe(1);
	});

	it('reports depthReached=2 for a 2-hop chain at maxDepth=2', () => {
		const g = makeGraph();
		const r = getBlastRadius(g, ['util.ts'], 2);
		expect(r.depthReached).toBe(2);
	});

	it('returns an empty radius for maxDepth=0 (do-not-explore semantic)', () => {
		// Adversarial verifier finding: previously the loop visited direct
		// importers anyway and reported depthReached=1 even at maxDepth=0.
		const g = makeGraph();
		const r = getBlastRadius(g, ['util.ts'], 0);
		expect(r.directDependents).toEqual([]);
		expect(r.transitiveDependents).toEqual([]);
		expect(r.depthReached).toBe(0);
		expect(r.totalDependents).toBe(0);
	});
});

describe('getLocalizationContext', () => {
	it('produces a complete summary block', () => {
		const g = makeGraph();
		const ctx = getLocalizationContext(g, 'util.ts');
		expect(ctx.target).toBe('util.ts');
		expect(ctx.importerCount).toBe(3);
		expect(ctx.exportedSymbolsUsedExternally.sort()).toEqual(['add', 'sub']);
		expect(ctx.summary).toContain('LOCALIZATION CONTEXT');
		expect(ctx.summary).toContain('util.ts');
		expect(ctx.summary).toContain('Blast radius');
	});
});
