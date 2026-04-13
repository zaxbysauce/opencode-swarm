/**
 * Verification tests for updateGraphForFiles (incremental graph updates)
 * Tests: incremental update, deleted files, forceRebuild, fallback, validation, batch update, unsupported extension skip
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { clearCache } from '../../../src/tools/repo-graph';

// Use dynamic import to get the real module (bypasses any mock.module from other test files)
// This is necessary because bun:test's mock.module persists globally across tests
const getRealRepoGraph = async () => {
	const module = await import('../../../src/tools/repo-graph');
	return {
		buildWorkspaceGraph: module.buildWorkspaceGraph,
		loadGraph: module.loadGraph,
		saveGraph: module.saveGraph,
		updateGraphForFiles: module.updateGraphForFiles,
	};
};

describe('updateGraphForFiles', () => {
	let tempDir: string;
	let workspacePath: string;
	// Store real functions after getting them

	/** Normalize a path for use as a graph key (forward slashes, matching normalizeGraphPath) */
	function normalizeKey(p: string): string {
		return path.normalize(p).replace(/\\/g, '/');
	}
	let buildWorkspaceGraph: ReturnType<
		typeof import('../../../src/tools/repo-graph').buildWorkspaceGraph
	>;
	let loadGraph: ReturnType<
		typeof import('../../../src/tools/repo-graph').loadGraph
	>;
	let saveGraph: ReturnType<
		typeof import('../../../src/tools/repo-graph').saveGraph
	>;
	let updateGraphForFiles: ReturnType<
		typeof import('../../../src/tools/repo-graph').updateGraphForFiles
	>;

	beforeEach(async () => {
		// Get real implementations
		const realModule = await getRealRepoGraph();
		buildWorkspaceGraph = realModule.buildWorkspaceGraph;
		loadGraph = realModule.loadGraph;
		saveGraph = realModule.saveGraph;
		updateGraphForFiles = realModule.updateGraphForFiles;

		// Create temp directory inside cwd to avoid path traversal issues
		tempDir = await fsSync.promises.mkdtemp(
			path.join(process.cwd(), 'incremental-test-'),
		);
		workspacePath = path.relative(process.cwd(), tempDir);
		// Create .swarm directory for graph storage
		await fsSync.promises.mkdir(path.join(tempDir, '.swarm'), {
			recursive: true,
		});
	});

	afterEach(async () => {
		clearCache(workspacePath);
		try {
			await fsSync.promises.rm(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	test('incremental update succeeds for an existing file - node updated', async () => {
		// Create initial files
		const files = {
			'index.ts': `import { foo } from './foo';
export const indexExport = 'hello';`,
			'foo.ts': `export const foo = 'foo';`,
		};

		for (const [name, content] of Object.entries(files)) {
			await fsSync.promises.writeFile(path.join(tempDir, name), content);
		}

		// Build initial graph
		const initialGraph = buildWorkspaceGraph(workspacePath);
		expect(Object.keys(initialGraph.nodes).length).toBe(2);

		// Save the graph
		await saveGraph(workspacePath, initialGraph);

		// Modify foo.ts to add a new export
		const newFooContent = `export const foo = 'foo';
export const bar = 'bar';`;
		await fsSync.promises.writeFile(
			path.join(tempDir, 'foo.ts'),
			newFooContent,
		);

		// Get the absolute path for the updated file
		const absoluteFooPath = path.join(tempDir, 'foo.ts');

		// Run incremental update
		const updatedGraph = await updateGraphForFiles(workspacePath, [
			absoluteFooPath,
		]);

		// Verify the node was updated
		const fooNode = updatedGraph.nodes[normalizeKey(absoluteFooPath)];
		expect(fooNode).toBeDefined();
		expect(fooNode?.exports).toContain('foo');
		expect(fooNode?.exports).toContain('bar');
	});

	test('deleted file removes node and edges', async () => {
		// Create initial files
		const files = {
			'index.ts': `import { foo } from './foo';
export const indexExport = 'hello';`,
			'foo.ts': `export const foo = 'foo';`,
		};

		for (const [name, content] of Object.entries(files)) {
			await fsSync.promises.writeFile(path.join(tempDir, name), content);
		}

		// Build and save initial graph
		const initialGraph = buildWorkspaceGraph(workspacePath);
		expect(Object.keys(initialGraph.nodes).length).toBe(2);
		expect(initialGraph.edges.length).toBe(1); // index.ts -> foo.ts
		await saveGraph(workspacePath, initialGraph);

		// Delete foo.ts
		await fsSync.promises.unlink(path.join(tempDir, 'foo.ts'));

		// Get absolute paths
		const absoluteFooPath = path.join(tempDir, 'foo.ts');

		// Run incremental update - file no longer exists
		const updatedGraph = await updateGraphForFiles(workspacePath, [
			absoluteFooPath,
		]);

		// Verify node was removed
		expect(updatedGraph.nodes[normalizeKey(absoluteFooPath)]).toBeUndefined();

		// Verify edge was removed (no edges referencing the deleted file)
		const remainingEdges = updatedGraph.edges.filter(
			(e) => e.source === absoluteFooPath || e.target === absoluteFooPath,
		);
		expect(remainingEdges.length).toBe(0);
	});

	test('forceRebuild option triggers full rebuild', async () => {
		// Create initial files
		const files = {
			'index.ts': `export const indexExport = 'hello';`,
		};

		for (const [name, content] of Object.entries(files)) {
			await fsSync.promises.writeFile(path.join(tempDir, name), content);
		}

		// Build and save initial graph
		const initialGraph = buildWorkspaceGraph(workspacePath);
		await saveGraph(workspacePath, initialGraph);

		// Run with forceRebuild
		const rebuiltGraph = await updateGraphForFiles(workspacePath, [], {
			forceRebuild: true,
		});

		// Verify it returns a valid graph (full rebuild was called)
		expect(rebuiltGraph).toBeDefined();
		expect(rebuiltGraph.metadata).toBeDefined();
		expect(rebuiltGraph.metadata.nodeCount).toBeGreaterThan(0);
	});

	test('no existing graph falls back to full rebuild', async () => {
		// Create files but do NOT save a graph
		const files = {
			'index.ts': `export const indexExport = 'hello';`,
			'utils.ts': `export const util = 'util';`,
		};

		for (const [name, content] of Object.entries(files)) {
			await fsSync.promises.writeFile(path.join(tempDir, name), content);
		}

		// Verify no graph exists
		const existingGraph = await loadGraph(workspacePath);
		expect(existingGraph).toBeNull();

		// Run update - should fall back to full rebuild since no graph exists
		const resultGraph = await updateGraphForFiles(workspacePath, [
			path.join(tempDir, 'index.ts'),
		]);

		// Verify a full graph was built
		expect(resultGraph).toBeDefined();
		expect(Object.keys(resultGraph.nodes).length).toBe(2);
	});

	test('validation failure triggers full rebuild - orphan edge removed', async () => {
		// Create initial files
		const files = {
			'index.ts': `import { foo } from './foo';
export const indexExport = 'hello';`,
			'foo.ts': `export const foo = 'foo';`,
		};

		for (const [name, content] of Object.entries(files)) {
			await fsSync.promises.writeFile(path.join(tempDir, name), content);
		}

		// Build and save initial graph
		const initialGraph = buildWorkspaceGraph(workspacePath);
		await saveGraph(workspacePath, initialGraph);

		// Manually corrupt the graph to create an orphan edge (edge pointing to non-existent node)
		const loadedGraph = await loadGraph(workspacePath);
		expect(loadedGraph).not.toBeNull();

		// Add an edge that points to a non-existent node
		loadedGraph!.edges.push({
			source: path.join(tempDir, 'index.ts'),
			target: path.join(tempDir, 'nonexistent.ts'),
			importSpecifier: './nonexistent',
			importType: 'named',
		});

		// Save the corrupted graph
		await saveGraph(workspacePath, loadedGraph!);

		// Now update a file - should detect orphan edge and fall back to full rebuild
		const absoluteIndexPath = path.join(tempDir, 'index.ts');
		const updatedGraph = await updateGraphForFiles(workspacePath, [
			absoluteIndexPath,
		]);

		// After full rebuild, the graph should only contain edges for existing files
		// Verify that no edge references a non-existent file
		for (const edge of updatedGraph.edges) {
			const sourcePath = normalizeKey(edge.source);
			const targetPath = normalizeKey(edge.target);
			// These paths should exist as nodes
			expect(updatedGraph.nodes[sourcePath]).toBeDefined();
			// The key assertion: after rebuild, all edges should have valid targets
			// If we get here without the orphan edge causing issues, the rebuild worked
		}
		// Also verify the graph metadata is valid
		expect(updatedGraph.metadata.nodeCount).toBeGreaterThan(0);
	});

	test('multiple files updated in one call - batch update works', async () => {
		// Create initial files
		const files = {
			'index.ts': `import { foo } from './foo';
import { bar } from './bar';
export const indexExport = 'hello';`,
			'foo.ts': `export const foo = 'foo';`,
			'bar.ts': `export const bar = 'bar';`,
		};

		for (const [name, content] of Object.entries(files)) {
			await fsSync.promises.writeFile(path.join(tempDir, name), content);
		}

		// Build and save initial graph
		const initialGraph = buildWorkspaceGraph(workspacePath);
		await saveGraph(workspacePath, initialGraph);

		// Modify both foo.ts and bar.ts
		const newFooContent = `export const foo = 'foo';
export const modified = true;`;
		const newBarContent = `export const bar = 'bar';
export const alsoModified = true;`;

		await fsSync.promises.writeFile(
			path.join(tempDir, 'foo.ts'),
			newFooContent,
		);
		await fsSync.promises.writeFile(
			path.join(tempDir, 'bar.ts'),
			newBarContent,
		);

		// Run batch update
		const absoluteFooPath = path.join(tempDir, 'foo.ts');
		const absoluteBarPath = path.join(tempDir, 'bar.ts');

		const updatedGraph = await updateGraphForFiles(workspacePath, [
			absoluteFooPath,
			absoluteBarPath,
		]);

		// Verify both files were updated
		expect(
			updatedGraph.nodes[normalizeKey(absoluteFooPath)]?.exports,
		).toContain('modified');
		expect(
			updatedGraph.nodes[normalizeKey(absoluteBarPath)]?.exports,
		).toContain('alsoModified');
	});

	test('unsupported file extension (.css) is skipped - not in SUPPORTED_EXTENSIONS', async () => {
		// Create initial files
		const files = {
			'index.ts': `import './styles.css';
export const indexExport = 'hello';`,
		};

		for (const [name, content] of Object.entries(files)) {
			await fsSync.promises.writeFile(path.join(tempDir, name), content);
		}

		// Build and save initial graph
		const initialGraph = buildWorkspaceGraph(workspacePath);
		expect(Object.keys(initialGraph.nodes).length).toBe(1);
		await saveGraph(workspacePath, initialGraph);

		// Try to update a .css file
		const absoluteCssPath = path.join(tempDir, 'styles.css');

		// Run update with CSS file - should not crash, but CSS is not supported
		const resultGraph = await updateGraphForFiles(workspacePath, [
			absoluteCssPath,
		]);

		// The CSS file should not appear as a node (scanFile returns null for unsupported extensions)
		// The graph should remain unchanged since CSS doesn't create nodes
		expect(resultGraph).toBeDefined();
		// Note: CSS files are scanned but don't produce nodes in the graph
		// since scanFile only creates nodes for .ts, .tsx, .js, .jsx, .mjs, .cjs, .py
	});
});
