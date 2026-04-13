/**
 * Tests for dynamic import() patterns in repo-graph.ts
 * Verifies that parseFileImports correctly captures dynamic import() expressions.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fsSync from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { buildWorkspaceGraph } from '../../../src/tools/repo-graph';

describe('dynamic import() patterns', () => {
	let tempDir: string;
	let workspacePath: string;

	beforeEach(async () => {
		// Create temp directory inside cwd to avoid path traversal issues
		tempDir = await fsSync.promises.mkdtemp(
			path.join(process.cwd(), 'repo-graph-dyn-import-'),
		);
		workspacePath = path.relative(process.cwd(), tempDir);
	});

	afterEach(async () => {
		try {
			await fsSync.promises.rm(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	test('import(./module) with single quotes is captured as sideeffect', async () => {
		await fsSync.promises.writeFile(
			path.join(tempDir, 'main.ts'),
			`const m = await import('./module');`,
		);
		await fsSync.promises.writeFile(
			path.join(tempDir, 'module.ts'),
			`export const value = 42;`,
		);

		const graph = buildWorkspaceGraph(workspacePath);

		const mainNode = Object.values(graph.nodes).find(
			(n) => n.moduleName === 'main.ts',
		);
		expect(mainNode).toBeDefined();

		const edgesFromMain = graph.edges.filter(
			(e) => e.source === mainNode?.filePath,
		);

		expect(edgesFromMain.length).toBe(1);
		expect(edgesFromMain[0].importSpecifier).toBe('./module');
		expect(edgesFromMain[0].importType).toBe('sideeffect');
	});

	test('import("./module") with double quotes is captured as sideeffect', async () => {
		await fsSync.promises.writeFile(
			path.join(tempDir, 'main.ts'),
			`const m = await import("./module");`,
		);
		await fsSync.promises.writeFile(
			path.join(tempDir, 'module.ts'),
			`export const value = 42;`,
		);

		const graph = buildWorkspaceGraph(workspacePath);

		const mainNode = Object.values(graph.nodes).find(
			(n) => n.moduleName === 'main.ts',
		);
		expect(mainNode).toBeDefined();

		const edgesFromMain = graph.edges.filter(
			(e) => e.source === mainNode?.filePath,
		);

		expect(edgesFromMain.length).toBe(1);
		expect(edgesFromMain[0].importSpecifier).toBe('./module');
		expect(edgesFromMain[0].importType).toBe('sideeffect');
	});

	test('import(`./module`) with backticks is captured as sideeffect', async () => {
		await fsSync.promises.writeFile(
			path.join(tempDir, 'main.ts'),
			`const m = await import(\`./module\`);`,
		);
		await fsSync.promises.writeFile(
			path.join(tempDir, 'module.ts'),
			`export const value = 42;`,
		);

		const graph = buildWorkspaceGraph(workspacePath);

		const mainNode = Object.values(graph.nodes).find(
			(n) => n.moduleName === 'main.ts',
		);
		expect(mainNode).toBeDefined();

		const edgesFromMain = graph.edges.filter(
			(e) => e.source === mainNode?.filePath,
		);

		expect(edgesFromMain.length).toBe(1);
		expect(edgesFromMain[0].importSpecifier).toBe('./module');
		expect(edgesFromMain[0].importType).toBe('sideeffect');
	});

	test('dynamic import with whitespace is captured', async () => {
		await fsSync.promises.writeFile(
			path.join(tempDir, 'main.ts'),
			`const m = await import( './module' );`,
		);
		await fsSync.promises.writeFile(
			path.join(tempDir, 'module.ts'),
			`export const value = 42;`,
		);

		const graph = buildWorkspaceGraph(workspacePath);

		const mainNode = Object.values(graph.nodes).find(
			(n) => n.moduleName === 'main.ts',
		);
		expect(mainNode).toBeDefined();

		const edgesFromMain = graph.edges.filter(
			(e) => e.source === mainNode?.filePath,
		);

		expect(edgesFromMain.length).toBe(1);
		expect(edgesFromMain[0].importSpecifier).toBe('./module');
		expect(edgesFromMain[0].importType).toBe('sideeffect');
	});

	test('import(variable) is NOT captured - variable args', async () => {
		await fsSync.promises.writeFile(
			path.join(tempDir, 'main.ts'),
			`const path = './module';
const m = await import(path);`,
		);
		await fsSync.promises.writeFile(
			path.join(tempDir, 'module.ts'),
			`export const value = 42;`,
		);

		const graph = buildWorkspaceGraph(workspacePath);

		const mainNode = Object.values(graph.nodes).find(
			(n) => n.moduleName === 'main.ts',
		);
		expect(mainNode).toBeDefined();

		// No edges should be created because import(path) uses a variable, not a string literal
		const edgesFromMain = graph.edges.filter(
			(e) => e.source === mainNode?.filePath,
		);

		expect(edgesFromMain.length).toBe(0);
	});

	test('named import { Foo } from ./bar still works', async () => {
		await fsSync.promises.writeFile(
			path.join(tempDir, 'main.ts'),
			`import { Foo } from './bar';
console.log(Foo);`,
		);
		await fsSync.promises.writeFile(
			path.join(tempDir, 'bar.ts'),
			`export const Foo = 'foo';`,
		);

		const graph = buildWorkspaceGraph(workspacePath);

		const mainNode = Object.values(graph.nodes).find(
			(n) => n.moduleName === 'main.ts',
		);
		expect(mainNode).toBeDefined();

		const edgesFromMain = graph.edges.filter(
			(e) => e.source === mainNode?.filePath,
		);

		expect(edgesFromMain.length).toBe(1);
		expect(edgesFromMain[0].importSpecifier).toBe('./bar');
		expect(edgesFromMain[0].importType).toBe('named');
	});

	test('require(./bar) still works as require type', async () => {
		await fsSync.promises.writeFile(
			path.join(tempDir, 'main.ts'),
			`const m = require('./bar');`,
		);
		await fsSync.promises.writeFile(
			path.join(tempDir, 'bar.ts'),
			`module.exports = 'bar';`,
		);

		const graph = buildWorkspaceGraph(workspacePath);

		const mainNode = Object.values(graph.nodes).find(
			(n) => n.moduleName === 'main.ts',
		);
		expect(mainNode).toBeDefined();

		const edgesFromMain = graph.edges.filter(
			(e) => e.source === mainNode?.filePath,
		);

		expect(edgesFromMain.length).toBe(1);
		expect(edgesFromMain[0].importSpecifier).toBe('./bar');
		expect(edgesFromMain[0].importType).toBe('require');
	});

	test('mixed static and dynamic imports are all captured', async () => {
		await fsSync.promises.writeFile(
			path.join(tempDir, 'main.ts'),
			`import { named } from './named';
import * as ns from './namespace';
import defaultExport from './default';
import './sideeffect';
const dynamic = await import('./dynamic');`,
		);
		await fsSync.promises.writeFile(
			path.join(tempDir, 'named.ts'),
			`export const named = 'n';`,
		);
		await fsSync.promises.writeFile(
			path.join(tempDir, 'namespace.ts'),
			`export const ns = 'ns';`,
		);
		await fsSync.promises.writeFile(
			path.join(tempDir, 'default.ts'),
			`export default 'd';`,
		);
		await fsSync.promises.writeFile(
			path.join(tempDir, 'sideeffect.ts'),
			`console.log('effect');`,
		);
		await fsSync.promises.writeFile(
			path.join(tempDir, 'dynamic.ts'),
			`export const dynamic = 'dyn';`,
		);

		const graph = buildWorkspaceGraph(workspacePath);

		const mainNode = Object.values(graph.nodes).find(
			(n) => n.moduleName === 'main.ts',
		);
		expect(mainNode).toBeDefined();

		const edgesFromMain = graph.edges.filter(
			(e) => e.source === mainNode?.filePath,
		);

		// Should have edges for: named, namespace, default, sideeffect, dynamic
		expect(edgesFromMain.length).toBe(5);

		const edgeMap = new Map(
			edgesFromMain.map((e) => [e.importSpecifier, e.importType]),
		);
		expect(edgeMap.get('./named')).toBe('named');
		expect(edgeMap.get('./namespace')).toBe('namespace');
		expect(edgeMap.get('./default')).toBe('default');
		expect(edgeMap.get('./sideeffect')).toBe('sideeffect');
		expect(edgeMap.get('./dynamic')).toBe('sideeffect');
	});

	test('dynamic import without await is still captured', async () => {
		await fsSync.promises.writeFile(
			path.join(tempDir, 'main.ts'),
			`import('./module').then(m => console.log(m));`,
		);
		await fsSync.promises.writeFile(
			path.join(tempDir, 'module.ts'),
			`export const value = 42;`,
		);

		const graph = buildWorkspaceGraph(workspacePath);

		const mainNode = Object.values(graph.nodes).find(
			(n) => n.moduleName === 'main.ts',
		);
		expect(mainNode).toBeDefined();

		const edgesFromMain = graph.edges.filter(
			(e) => e.source === mainNode?.filePath,
		);

		expect(edgesFromMain.length).toBe(1);
		expect(edgesFromMain[0].importSpecifier).toBe('./module');
		expect(edgesFromMain[0].importType).toBe('sideeffect');
	});

	test('multiple dynamic imports in same file', async () => {
		await fsSync.promises.writeFile(
			path.join(tempDir, 'main.ts'),
			`const a = await import('./a');
const b = await import('./b');
const c = await import('./c');`,
		);
		await fsSync.promises.writeFile(
			path.join(tempDir, 'a.ts'),
			`export const a = 1;`,
		);
		await fsSync.promises.writeFile(
			path.join(tempDir, 'b.ts'),
			`export const b = 2;`,
		);
		await fsSync.promises.writeFile(
			path.join(tempDir, 'c.ts'),
			`export const c = 3;`,
		);

		const graph = buildWorkspaceGraph(workspacePath);

		const mainNode = Object.values(graph.nodes).find(
			(n) => n.moduleName === 'main.ts',
		);
		expect(mainNode).toBeDefined();

		const edgesFromMain = graph.edges.filter(
			(e) => e.source === mainNode?.filePath,
		);

		expect(edgesFromMain.length).toBe(3);

		const specifiers = edgesFromMain.map((e) => e.importSpecifier).sort();
		expect(specifiers).toEqual(['./a', './b', './c']);

		// All should be sideeffect type
		for (const edge of edgesFromMain) {
			expect(edge.importType).toBe('sideeffect');
		}
	});
});
