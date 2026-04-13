/**
 * Verification tests for updateGraphForFiles scanFile path normalization fix.
 *
 * Fix: Line 1387 changed from scanFile(normalizedPath, ...) to scanFile(rawFilePath, ...)
 *
 * This fix ensures scanFile receives real OS paths for filesystem operations
 * instead of forward-slash normalized keys.
 *
 * Tests verify:
 * 1. updateGraphForFiles stores nodes under normalized keys (forward slashes)
 * 2. Nodes store the raw OS path in filePath (not normalized)
 * 3. The raw path is preserved for filesystem operations
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fsSync from 'node:fs';
import * as path from 'node:path';

// Use dynamic import to get the real module (bypasses any mock.module from other test files)
const getRealRepoGraph = async () => {
	const module = await import('../../../src/tools/repo-graph');
	return {
		buildWorkspaceGraph: module.buildWorkspaceGraph,
		loadGraph: module.loadGraph,
		saveGraph: module.saveGraph,
		updateGraphForFiles: module.updateGraphForFiles,
	};
};

/** Normalize a path for use as a graph key (forward slashes, matching normalizeGraphPath) */
function normalizeKey(p: string): string {
	return path.normalize(p).replace(/\\/g, '/');
}

describe('updateGraphForFiles scanFile path normalization fix', () => {
	let tempDir: string;
	let workspacePath: string;
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
			path.join(process.cwd(), 'scanfile-path-test-'),
		);
		workspacePath = path.relative(process.cwd(), tempDir);
		// Create .swarm directory for graph storage
		await fsSync.promises.mkdir(path.join(tempDir, '.swarm'), {
			recursive: true,
		});
	});

	afterEach(async () => {
		try {
			await fsSync.promises.rm(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	test('node stored under normalized key has raw OS path preserved in filePath', async () => {
		// Create a file with imports
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
		await saveGraph(workspacePath, initialGraph);

		// Get the absolute path for foo.ts (contains backslashes on Windows)
		const absoluteFooPath = path.join(tempDir, 'foo.ts');

		// Verify the path contains backslashes on Windows
		const pathContainsBackslash = absoluteFooPath.includes('\\');

		// Run incremental update
		const updatedGraph = await updateGraphForFiles(workspacePath, [
			absoluteFooPath,
		]);

		// The node should be stored under a NORMALIZED key (forward slashes)
		const normalizedKey = normalizeKey(absoluteFooPath);
		const storedNode = updatedGraph.nodes[normalizedKey];

		expect(storedNode).toBeDefined();
		expect(storedNode?.exports).toContain('foo');

		// Verify the node's filePath is preserved as the raw OS path
		// This is the key invariant: node.filePath = raw OS path (with backslashes on Windows)
		expect(storedNode?.filePath).toBe(absoluteFooPath);

		// Log for debugging when running on Windows
		if (pathContainsBackslash) {
			console.log(
				`Windows path normalization: raw=${absoluteFooPath}, key=${normalizedKey}`,
			);
		}
	});

	test('single file update stores node with correct filePath', async () => {
		// Create a simple file
		const files = {
			'module.ts': `export const value = 42;`,
		};

		for (const [name, content] of Object.entries(files)) {
			await fsSync.promises.writeFile(path.join(tempDir, name), content);
		}

		// Build and save initial graph
		const initialGraph = buildWorkspaceGraph(workspacePath);
		await saveGraph(workspacePath, initialGraph);

		// Get the absolute path
		const absoluteModulePath = path.join(tempDir, 'module.ts');

		// Run incremental update
		const updatedGraph = await updateGraphForFiles(workspacePath, [
			absoluteModulePath,
		]);

		// Verify node is stored under normalized key
		const normalizedKey = normalizeKey(absoluteModulePath);
		expect(updatedGraph.nodes[normalizedKey]).toBeDefined();

		// Verify the node's filePath is the raw OS path (not normalized)
		const storedNode = updatedGraph.nodes[normalizedKey];
		expect(storedNode?.filePath).toBe(absoluteModulePath);

		// Verify the stored filePath can be normalized back to the same key
		const storedPathNormalized = normalizeKey(storedNode!.filePath);
		expect(storedPathNormalized).toBe(normalizedKey);
	});

	test('multiple files updated together - each has correct filePath', async () => {
		// Create files
		const files = {
			'index.ts': `import { a } from './a';
import { b } from './b';
export const main = true;`,
			'a.ts': `export const a = 1;`,
			'b.ts': `export const b = 2;`,
		};

		for (const [name, content] of Object.entries(files)) {
			await fsSync.promises.writeFile(path.join(tempDir, name), content);
		}

		// Build and save initial graph
		const initialGraph = buildWorkspaceGraph(workspacePath);
		await saveGraph(workspacePath, initialGraph);

		// Get absolute paths
		const absoluteAPath = path.join(tempDir, 'a.ts');
		const absoluteBPath = path.join(tempDir, 'b.ts');

		// Run incremental updates for both files
		const updatedGraph = await updateGraphForFiles(workspacePath, [
			absoluteAPath,
			absoluteBPath,
		]);

		// Both nodes should be stored under normalized keys
		const normalizedA = normalizeKey(absoluteAPath);
		const normalizedB = normalizeKey(absoluteBPath);

		expect(updatedGraph.nodes[normalizedA]).toBeDefined();
		expect(updatedGraph.nodes[normalizedB]).toBeDefined();

		// Both should have their raw OS paths preserved
		expect(updatedGraph.nodes[normalizedA]?.filePath).toBe(absoluteAPath);
		expect(updatedGraph.nodes[normalizedB]?.filePath).toBe(absoluteBPath);

		// Keys should be different (not the same normalized key)
		expect(normalizedA).not.toBe(normalizedB);
	});

	test('filePath invariant - normalizeKey(filePath) equals graph key', async () => {
		// Create a simple file
		const files = {
			'test.ts': `export const value = 'test';`,
		};

		for (const [name, content] of Object.entries(files)) {
			await fsSync.promises.writeFile(path.join(tempDir, name), content);
		}

		// Build and save initial graph
		const initialGraph = buildWorkspaceGraph(workspacePath);
		await saveGraph(workspacePath, initialGraph);

		// Get the absolute path
		const absoluteTestPath = path.join(tempDir, 'test.ts');

		// Run incremental update
		const updatedGraph = await updateGraphForFiles(workspacePath, [
			absoluteTestPath,
		]);

		// Get the stored node
		const storedNode = updatedGraph.nodes[normalizeKey(absoluteTestPath)];
		expect(storedNode).toBeDefined();

		// The key invariant: normalizeKey(storedNode.filePath) should equal the key we looked up with
		// This ensures that node.filePath (raw OS path) normalizes to the graph key
		expect(normalizeKey(storedNode!.filePath)).toBe(
			normalizeKey(absoluteTestPath),
		);

		// And the raw filePath should equal the input path
		expect(storedNode!.filePath).toBe(absoluteTestPath);
	});

	test('repeated updates preserve filePath invariant', async () => {
		// Create files
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

		// Get absolute path
		const absoluteFooPath = path.join(tempDir, 'foo.ts');

		// First update
		const updatedGraph1 = await updateGraphForFiles(workspacePath, [
			absoluteFooPath,
		]);

		const node1 = updatedGraph1.nodes[normalizeKey(absoluteFooPath)];
		expect(node1).toBeDefined();
		expect(node1?.filePath).toBe(absoluteFooPath);

		// Modify the file
		const newFooContent = `export const foo = 'foo';
export const bar = 'bar';`;
		await fsSync.promises.writeFile(
			path.join(tempDir, 'foo.ts'),
			newFooContent,
		);

		// Second update
		const updatedGraph2 = await updateGraphForFiles(workspacePath, [
			absoluteFooPath,
		]);

		// Verify node still has correct filePath after re-scan
		const node2 = updatedGraph2.nodes[normalizeKey(absoluteFooPath)];
		expect(node2).toBeDefined();
		expect(node2?.filePath).toBe(absoluteFooPath);
		expect(node2?.exports).toContain('bar'); // New export should be present
	});
});
