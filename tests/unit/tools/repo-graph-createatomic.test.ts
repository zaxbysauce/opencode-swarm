import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	clearCache,
	loadGraph,
	type RepoGraph,
	saveGraph,
} from '../../../src/tools/repo-graph';

describe('saveGraph with createAtomic', () => {
	let tempDir: string;
	let originalCwd: string;
	const workspaceName = 'atomic-test';

	beforeEach(async () => {
		tempDir = await fsPromises.mkdtemp(
			path.join(os.tmpdir(), 'repo-graph-atomic-'),
		);
		originalCwd = process.cwd();
		process.chdir(tempDir);
		clearCache(workspaceName);
	});

	afterEach(async () => {
		process.chdir(originalCwd);
		clearCache(workspaceName);
		try {
			await fsPromises.rm(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	test('saveGraph with createAtomic fails if file exists', async () => {
		const resolvedWorkspace = path.resolve(workspaceName);
		const graph: RepoGraph = {
			schema_version: '1.0.0',
			workspaceRoot: resolvedWorkspace,
			nodes: {},
			edges: [],
			metadata: {
				generatedAt: new Date().toISOString(),
				generator: 'test',
				nodeCount: 0,
				edgeCount: 0,
			},
		};

		// Ensure the .swarm directory exists
		await fsPromises.mkdir(path.join(workspaceName, '.swarm'), {
			recursive: true,
		});

		// First save (without createAtomic)
		await saveGraph(workspaceName, graph);

		// Verify file was created
		const graphPath = path.join(workspaceName, '.swarm', 'repo-graph.json');
		const exists = await fsPromises
			.access(graphPath)
			.then(() => true)
			.catch(() => false);
		expect(exists).toBe(true);

		// Second save with createAtomic should fail because file exists
		await expect(
			saveGraph(workspaceName, graph, { createAtomic: true }),
		).rejects.toThrow('file already exists');
	});

	test('saveGraph without createAtomic overwrites existing file', async () => {
		const resolvedWorkspace = path.resolve(workspaceName);
		const graph: RepoGraph = {
			schema_version: '1.0.0',
			workspaceRoot: resolvedWorkspace,
			nodes: {},
			edges: [],
			metadata: {
				generatedAt: new Date().toISOString(),
				generator: 'test',
				nodeCount: 0,
				edgeCount: 0,
			},
		};

		// Ensure the .swarm directory exists
		await fsPromises.mkdir(path.join(workspaceName, '.swarm'), {
			recursive: true,
		});

		// First save
		await saveGraph(workspaceName, graph);

		// Modify the graph
		graph.nodes['/test.ts'] = {
			filePath: '/test.ts',
			moduleName: 'test',
			exports: ['foo'],
			imports: [],
			language: 'ts',
			mtime: '123',
		};

		// Second save without createAtomic should succeed
		await saveGraph(workspaceName, graph);

		// Verify the modified graph was saved
		const loaded = await loadGraph(workspaceName);
		expect(loaded).not.toBeNull();
		expect(loaded?.nodes['/test.ts']).toBeDefined();
	});

	test('saveGraph with createAtomic succeeds when file does not exist', async () => {
		const resolvedWorkspace = path.resolve(workspaceName);
		const graph: RepoGraph = {
			schema_version: '1.0.0',
			workspaceRoot: resolvedWorkspace,
			nodes: {},
			edges: [],
			metadata: {
				generatedAt: new Date().toISOString(),
				generator: 'test',
				nodeCount: 0,
				edgeCount: 0,
			},
		};

		// Ensure the .swarm directory exists
		await fsPromises.mkdir(path.join(workspaceName, '.swarm'), {
			recursive: true,
		});

		// saveGraph with createAtomic should succeed when file doesn't exist
		await saveGraph(workspaceName, graph, { createAtomic: true });

		// Verify file was created
		const graphPath = path.join(workspaceName, '.swarm', 'repo-graph.json');
		const exists = await fsPromises
			.access(graphPath)
			.then(() => true)
			.catch(() => false);
		expect(exists).toBe(true);
	});
});
