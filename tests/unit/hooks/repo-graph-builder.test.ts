/**
 * Verification tests for repo-graph-builder.ts hook
 * Tests: init() success, error handling, silent skip, never throws
 */

import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	test,
} from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { createRepoGraphBuilderHook } from '../../../src/hooks/repo-graph-builder';

// Create a real temp workspace directory for cross-platform compatibility
const tempWorkspace = fs.mkdtempSync(
	path.join(process.cwd(), 'repo-graph-hook-test-'),
);

// Cleanup temp workspace at end of all tests
afterAll(() => {
	try {
		fs.rmSync(tempWorkspace, { recursive: true, force: true });
	} catch {
		// Ignore cleanup errors
	}
});

// Create mock functions at top level
const mockBuildWorkspaceGraph = mock(() => ({
	metadata: { nodeCount: 42, edgeCount: 7 },
}));
const mockSaveGraph = mock(() => Promise.resolve());
const mockUpdateGraphForFiles = mock(() => Promise.resolve({}));

describe('createRepoGraphBuilderHook', () => {
	beforeEach(() => {
		// Reset mock call history
		mockBuildWorkspaceGraph.mockClear();
		mockSaveGraph.mockClear();
		mockUpdateGraphForFiles.mockClear();
		// Reset implementations to default
		mockBuildWorkspaceGraph.mockImplementation(() => ({
			metadata: { nodeCount: 42, edgeCount: 7 },
		}));
		mockSaveGraph.mockImplementation(() => Promise.resolve());
		mockUpdateGraphForFiles.mockImplementation(() => Promise.resolve({}));
	});

	test('init() succeeds when buildWorkspaceGraph returns a valid graph and saveGraph resolves', async () => {
		const workspaceRoot = tempWorkspace;
		const hook = createRepoGraphBuilderHook(workspaceRoot, {
			buildWorkspaceGraph: mockBuildWorkspaceGraph,
			saveGraph: mockSaveGraph,
			updateGraphForFiles: mockUpdateGraphForFiles,
		});

		// Should not throw
		await expect(hook.init()).resolves.toBeUndefined();

		// Verify buildWorkspaceGraph was called with workspace root
		expect(mockBuildWorkspaceGraph).toHaveBeenCalledWith(workspaceRoot);
		// Verify saveGraph was called with workspace root and graph
		expect(mockSaveGraph).toHaveBeenCalledWith(
			workspaceRoot,
			expect.objectContaining({ metadata: { nodeCount: 42, edgeCount: 7 } }),
		);
	});

	test('init() calls buildWorkspaceGraph and saveGraph with correct arguments', async () => {
		const workspaceRoot = tempWorkspace;
		const hook = createRepoGraphBuilderHook(workspaceRoot, {
			buildWorkspaceGraph: mockBuildWorkspaceGraph,
			saveGraph: mockSaveGraph,
			updateGraphForFiles: mockUpdateGraphForFiles,
		});

		await hook.init();

		expect(mockBuildWorkspaceGraph).toHaveBeenCalledTimes(1);
		expect(mockSaveGraph).toHaveBeenCalledTimes(1);
		expect(mockBuildWorkspaceGraph.mock.calls[0][0]).toBe(workspaceRoot);
	});

	test('init() handles "workspace does not exist" error silently (no error thrown)', async () => {
		// Override mock to throw "does not exist" error
		mockBuildWorkspaceGraph.mockImplementation(() => {
			throw new Error(`Workspace ${tempWorkspace} does not exist`);
		});

		const hook = createRepoGraphBuilderHook(tempWorkspace, {
			buildWorkspaceGraph: mockBuildWorkspaceGraph,
			saveGraph: mockSaveGraph,
			updateGraphForFiles: mockUpdateGraphForFiles,
		});

		// Should not throw - skips silently
		await expect(hook.init()).resolves.toBeUndefined();
		// saveGraph should NOT have been called
		expect(mockSaveGraph).not.toHaveBeenCalled();
	});

	test('init() logs error for other failures', async () => {
		// Override mock to throw a different error
		mockBuildWorkspaceGraph.mockImplementation(() => {
			throw new Error('Some other error');
		});

		const hook = createRepoGraphBuilderHook(tempWorkspace, {
			buildWorkspaceGraph: mockBuildWorkspaceGraph,
			saveGraph: mockSaveGraph,
			updateGraphForFiles: mockUpdateGraphForFiles,
		});

		// Should not throw
		await expect(hook.init()).resolves.toBeUndefined();
		// saveGraph should NOT have been called since buildWorkspaceGraph threw
		expect(mockSaveGraph).not.toHaveBeenCalled();
	});

	test('init() never throws - always catches', async () => {
		const hook = createRepoGraphBuilderHook(tempWorkspace, {
			buildWorkspaceGraph: mockBuildWorkspaceGraph,
			saveGraph: mockSaveGraph,
			updateGraphForFiles: mockUpdateGraphForFiles,
		});

		// Even with a fatal error, it should not throw
		mockBuildWorkspaceGraph.mockImplementation(() => {
			throw new Error('Fatal error');
		});

		// Verify no throw - the function should resolve instead of rejecting
		await expect(hook.init()).resolves.toBeUndefined();
	});

	test('init() skips silently when error message contains "does not exist" (different wording)', async () => {
		mockBuildWorkspaceGraph.mockImplementation(() => {
			throw new Error('The path /some/workspace does not exist on disk');
		});

		const hook = createRepoGraphBuilderHook('/some/workspace', {
			buildWorkspaceGraph: mockBuildWorkspaceGraph,
			saveGraph: mockSaveGraph,
			updateGraphForFiles: mockUpdateGraphForFiles,
		});

		await expect(hook.init()).resolves.toBeUndefined();
		expect(mockSaveGraph).not.toHaveBeenCalled();
	});

	test('init() handles saveGraph rejection gracefully', async () => {
		// Override saveGraph to reject
		mockSaveGraph.mockImplementation(() =>
			Promise.reject(new Error('Disk full')),
		);

		const hook = createRepoGraphBuilderHook(tempWorkspace, {
			buildWorkspaceGraph: mockBuildWorkspaceGraph,
			saveGraph: mockSaveGraph,
			updateGraphForFiles: mockUpdateGraphForFiles,
		});

		// Should not throw despite saveGraph failing
		await expect(hook.init()).resolves.toBeUndefined();
	});

	test('init() handles non-Error thrown values', async () => {
		mockBuildWorkspaceGraph.mockImplementation(() => {
			throw 'string error';
		});

		const hook = createRepoGraphBuilderHook(tempWorkspace, {
			buildWorkspaceGraph: mockBuildWorkspaceGraph,
			saveGraph: mockSaveGraph,
			updateGraphForFiles: mockUpdateGraphForFiles,
		});

		// Should not throw - error is caught and converted to string
		await expect(hook.init()).resolves.toBeUndefined();
	});

	test('init() returns correct graph metadata when successful', async () => {
		mockBuildWorkspaceGraph.mockImplementation(() => ({
			metadata: { nodeCount: 100, edgeCount: 50 },
		}));

		const hook = createRepoGraphBuilderHook(tempWorkspace, {
			buildWorkspaceGraph: mockBuildWorkspaceGraph,
			saveGraph: mockSaveGraph,
			updateGraphForFiles: mockUpdateGraphForFiles,
		});

		await hook.init();

		expect(mockSaveGraph).toHaveBeenCalledWith(
			tempWorkspace,
			expect.objectContaining({ metadata: { nodeCount: 100, edgeCount: 50 } }),
		);
	});

	test('init() is called from returned hook object', async () => {
		const hook = createRepoGraphBuilderHook(tempWorkspace, {
			buildWorkspaceGraph: mockBuildWorkspaceGraph,
			saveGraph: mockSaveGraph,
			updateGraphForFiles: mockUpdateGraphForFiles,
		});

		// Verify hook.init is a function
		expect(typeof hook.init).toBe('function');
	});
});

describe('toolAfter hook', () => {
	beforeEach(() => {
		// Reset mock call history
		mockBuildWorkspaceGraph.mockClear();
		mockSaveGraph.mockClear();
		mockUpdateGraphForFiles.mockClear();
		// Reset implementations to default
		mockBuildWorkspaceGraph.mockImplementation(() => ({
			metadata: { nodeCount: 42, edgeCount: 7 },
		}));
		mockSaveGraph.mockImplementation(() => Promise.resolve());
		mockUpdateGraphForFiles.mockImplementation(() => Promise.resolve({}));
	});

	test('toolAfter triggers updateGraphForFiles for write tool + .ts file', async () => {
		const workspaceRoot = tempWorkspace;
		const hook = createRepoGraphBuilderHook(workspaceRoot, {
			buildWorkspaceGraph: mockBuildWorkspaceGraph,
			saveGraph: mockSaveGraph,
			updateGraphForFiles: mockUpdateGraphForFiles,
		});

		// Call toolAfter with edit tool and .ts file
		await hook.toolAfter(
			{
				tool: 'edit',
				sessionID: 'test-session',
				args: { file_path: 'foo.ts' },
			},
			{ output: undefined },
		);

		// Verify updateGraphForFiles was called
		expect(mockUpdateGraphForFiles).toHaveBeenCalledTimes(1);
		// The path should be resolved to absolute
		expect(mockUpdateGraphForFiles.mock.calls[0][1]).toEqual(
			expect.arrayContaining([expect.stringContaining('foo.ts')]),
		);
	});

	test('toolAfter skips non-write tools (read tool)', async () => {
		const workspaceRoot = tempWorkspace;
		const hook = createRepoGraphBuilderHook(workspaceRoot, {
			buildWorkspaceGraph: mockBuildWorkspaceGraph,
			saveGraph: mockSaveGraph,
			updateGraphForFiles: mockUpdateGraphForFiles,
		});

		// Call toolAfter with read tool
		await hook.toolAfter(
			{
				tool: 'read',
				sessionID: 'test-session',
				args: { file_path: 'foo.ts' },
			},
			{ output: undefined },
		);

		// Verify updateGraphForFiles was NOT called
		expect(mockUpdateGraphForFiles).not.toHaveBeenCalled();
	});

	test('toolAfter skips unsupported extensions (.css)', async () => {
		const workspaceRoot = tempWorkspace;
		const hook = createRepoGraphBuilderHook(workspaceRoot, {
			buildWorkspaceGraph: mockBuildWorkspaceGraph,
			saveGraph: mockSaveGraph,
			updateGraphForFiles: mockUpdateGraphForFiles,
		});

		// Call toolAfter with edit tool but .css file
		await hook.toolAfter(
			{
				tool: 'edit',
				sessionID: 'test-session',
				args: { file_path: 'style.css' },
			},
			{ output: undefined },
		);

		// Verify updateGraphForFiles was NOT called
		expect(mockUpdateGraphForFiles).not.toHaveBeenCalled();
	});

	test('toolAfter handles missing file_path gracefully', async () => {
		const workspaceRoot = tempWorkspace;
		const hook = createRepoGraphBuilderHook(workspaceRoot, {
			buildWorkspaceGraph: mockBuildWorkspaceGraph,
			saveGraph: mockSaveGraph,
			updateGraphForFiles: mockUpdateGraphForFiles,
		});

		// Call toolAfter with edit tool but no file_path
		await hook.toolAfter(
			{ tool: 'edit', sessionID: 'test-session', args: {} },
			{ output: undefined },
		);

		// Verify updateGraphForFiles was NOT called
		expect(mockUpdateGraphForFiles).not.toHaveBeenCalled();
	});

	test('toolAfter catches and logs errors from updateGraphForFiles', async () => {
		const workspaceRoot = tempWorkspace;
		const hook = createRepoGraphBuilderHook(workspaceRoot, {
			buildWorkspaceGraph: mockBuildWorkspaceGraph,
			saveGraph: mockSaveGraph,
			updateGraphForFiles: mockUpdateGraphForFiles,
		});

		// Make updateGraphForFiles throw an error
		mockUpdateGraphForFiles.mockImplementation(() => {
			throw new Error('Update failed');
		});

		// Capture console.error
		const consoleErrorSpy = mock(() => {});
		const originalConsoleError = console.error;
		console.error = consoleErrorSpy;

		try {
			// Call toolAfter - should not throw despite error
			await hook.toolAfter(
				{
					tool: 'edit',
					sessionID: 'test-session',
					args: { file_path: 'foo.ts' },
				},
				{ output: undefined },
			);

			// Verify updateGraphForFiles was called
			expect(mockUpdateGraphForFiles).toHaveBeenCalledTimes(1);
			// Verify console.error was called with the error message
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Update failed'),
			);
		} finally {
			console.error = originalConsoleError;
		}
	});

	test('toolAfter accepts alternative path field names (path, filePath)', async () => {
		const workspaceRoot = tempWorkspace;
		const hook = createRepoGraphBuilderHook(workspaceRoot, {
			buildWorkspaceGraph: mockBuildWorkspaceGraph,
			saveGraph: mockSaveGraph,
			updateGraphForFiles: mockUpdateGraphForFiles,
		});

		// Test with 'path' field
		await hook.toolAfter(
			{ tool: 'edit', sessionID: 'test-session', args: { path: 'bar.ts' } },
			{ output: undefined },
		);

		expect(mockUpdateGraphForFiles).toHaveBeenCalledTimes(1);
		expect(mockUpdateGraphForFiles.mock.calls[0][1]).toEqual(
			expect.arrayContaining([expect.stringContaining('bar.ts')]),
		);

		mockUpdateGraphForFiles.mockClear();

		// Test with 'filePath' field (camelCase)
		await hook.toolAfter(
			{ tool: 'edit', sessionID: 'test-session', args: { filePath: 'baz.ts' } },
			{ output: undefined },
		);

		expect(mockUpdateGraphForFiles).toHaveBeenCalledTimes(1);
		expect(mockUpdateGraphForFiles.mock.calls[0][1]).toEqual(
			expect.arrayContaining([expect.stringContaining('baz.ts')]),
		);
	});
});

describe('workspace boundary validation', () => {
	let tempDir: string;
	let workspaceRoot: string;

	beforeEach(() => {
		mockUpdateGraphForFiles.mockClear();
		mockBuildWorkspaceGraph.mockClear();
		mockSaveGraph.mockClear();
		// Create a real temp workspace directory
		tempDir = fs.mkdtempSync(
			path.join(os.tmpdir(), 'repo-graph-boundary-test-'),
		);
		workspaceRoot = tempDir;
	});

	afterEach(() => {
		// Clean up temp directory
		try {
			fs.rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	afterEach(() => {
		// Clean up temp directory
		try {
			fs.rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	test('file inside workspace triggers updateGraphForFiles', async () => {
		const hook = createRepoGraphBuilderHook(workspaceRoot, {
			buildWorkspaceGraph: mockBuildWorkspaceGraph,
			saveGraph: mockSaveGraph,
			updateGraphForFiles: mockUpdateGraphForFiles,
		});

		// Create a file inside workspace
		const filePath = path.join(workspaceRoot, 'src', 'index.ts');
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, 'export const x = 1;');

		await hook.toolAfter(
			{ tool: 'write', sessionID: 'test', args: { file_path: filePath } },
			{ output: undefined },
		);

		expect(mockUpdateGraphForFiles).toHaveBeenCalledTimes(1);
		expect(mockUpdateGraphForFiles).toHaveBeenCalledWith(workspaceRoot, [
			filePath,
		]);
	});

	test('relative file path inside workspace triggers updateGraphForFiles', async () => {
		const hook = createRepoGraphBuilderHook(workspaceRoot, {
			buildWorkspaceGraph: mockBuildWorkspaceGraph,
			saveGraph: mockSaveGraph,
			updateGraphForFiles: mockUpdateGraphForFiles,
		});

		// Create a file inside workspace
		const filePath = path.join(workspaceRoot, 'src', 'index.ts');
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, 'export const x = 1;');

		// Pass relative path
		await hook.toolAfter(
			{ tool: 'write', sessionID: 'test', args: { file_path: 'src/index.ts' } },
			{ output: undefined },
		);

		expect(mockUpdateGraphForFiles).toHaveBeenCalledTimes(1);
		expect(mockUpdateGraphForFiles).toHaveBeenCalledWith(workspaceRoot, [
			filePath,
		]);
	});

	test('absolute file outside workspace is rejected', async () => {
		const hook = createRepoGraphBuilderHook(workspaceRoot, {
			buildWorkspaceGraph: mockBuildWorkspaceGraph,
			saveGraph: mockSaveGraph,
			updateGraphForFiles: mockUpdateGraphForFiles,
		});

		// Create a file OUTSIDE workspace
		const outsideFile = path.join(os.tmpdir(), 'outside-workspace.txt');
		fs.writeFileSync(outsideFile, 'secret');

		await hook.toolAfter(
			{ tool: 'write', sessionID: 'test', args: { file_path: outsideFile } },
			{ output: undefined },
		);

		expect(mockUpdateGraphForFiles).not.toHaveBeenCalled();
	});

	test('relative path resolving outside workspace is rejected', async () => {
		const hook = createRepoGraphBuilderHook(workspaceRoot, {
			buildWorkspaceGraph: mockBuildWorkspaceGraph,
			saveGraph: mockSaveGraph,
			updateGraphForFiles: mockUpdateGraphForFiles,
		});

		// Create a sibling directory
		const siblingDir = path.join(workspaceRoot, '..', 'sibling-workspace');
		fs.mkdirSync(siblingDir, { recursive: true });

		// Pass a relative path that resolves outside workspace
		await hook.toolAfter(
			{
				tool: 'write',
				sessionID: 'test',
				args: { file_path: '../sibling-workspace/file.txt' },
			},
			{ output: undefined },
		);

		expect(mockUpdateGraphForFiles).not.toHaveBeenCalled();
	});

	test('path traversal attempt ../../../etc/passwd is rejected after resolution', async () => {
		const hook = createRepoGraphBuilderHook(workspaceRoot, {
			buildWorkspaceGraph: mockBuildWorkspaceGraph,
			saveGraph: mockSaveGraph,
			updateGraphForFiles: mockUpdateGraphForFiles,
		});

		// Attempt path traversal to escape workspace
		await hook.toolAfter(
			{
				tool: 'write',
				sessionID: 'test',
				args: { file_path: '../../../etc/passwd' },
			},
			{ output: undefined },
		);

		expect(mockUpdateGraphForFiles).not.toHaveBeenCalled();
	});

	test('absolute path traversal attempt is rejected', async () => {
		const hook = createRepoGraphBuilderHook(workspaceRoot, {
			buildWorkspaceGraph: mockBuildWorkspaceGraph,
			saveGraph: mockSaveGraph,
			updateGraphForFiles: mockUpdateGraphForFiles,
		});

		// Create a sibling directory for the traversal target
		const siblingDir = path.join(workspaceRoot, '..', 'target');
		fs.mkdirSync(siblingDir, { recursive: true });

		// Path that resolves to workspace root's parent or beyond
		const traversalPath = path.join(
			workspaceRoot,
			'..',
			'..',
			'..',
			'target',
			'file.ts',
		);
		await hook.toolAfter(
			{ tool: 'write', sessionID: 'test', args: { file_path: traversalPath } },
			{ output: undefined },
		);

		expect(mockUpdateGraphForFiles).not.toHaveBeenCalled();
	});

	test('workspace root itself is allowed (edge case)', async () => {
		const hook = createRepoGraphBuilderHook(workspaceRoot, {
			buildWorkspaceGraph: mockBuildWorkspaceGraph,
			saveGraph: mockSaveGraph,
			updateGraphForFiles: mockUpdateGraphForFiles,
		});

		// The boundary check allows: startsWith(workspaceRoot + path.sep) OR equals workspaceRoot
		// A file at workspace root level should be allowed
		const rootLevelFile = path.join(workspaceRoot, 'root.ts');
		fs.writeFileSync(rootLevelFile, '// marker');

		await hook.toolAfter(
			{ tool: 'write', sessionID: 'test', args: { file_path: 'root.ts' } },
			{ output: undefined },
		);

		expect(mockUpdateGraphForFiles).toHaveBeenCalledTimes(1);
	});

	test('similar-name directory outside workspace is rejected', async () => {
		const hook = createRepoGraphBuilderHook(workspaceRoot, {
			buildWorkspaceGraph: mockBuildWorkspaceGraph,
			saveGraph: mockSaveGraph,
			updateGraphForFiles: mockUpdateGraphForFiles,
		});

		// Create a "similar" directory name that shares prefix but is NOT the workspace
		const similarRoot = path.join(
			os.tmpdir(),
			'repo-graph-boundary-test-similar',
		);
		fs.mkdirSync(similarRoot, { recursive: true });
		const similarFile = path.join(similarRoot, 'file.ts');
		fs.writeFileSync(similarFile, 'similar');

		await hook.toolAfter(
			{ tool: 'write', sessionID: 'test', args: { file_path: similarFile } },
			{ output: undefined },
		);

		expect(mockUpdateGraphForFiles).not.toHaveBeenCalled();
	});

	test('file in parent directory of workspace is rejected', async () => {
		const hook = createRepoGraphBuilderHook(workspaceRoot, {
			buildWorkspaceGraph: mockBuildWorkspaceGraph,
			saveGraph: mockSaveGraph,
			updateGraphForFiles: mockUpdateGraphForFiles,
		});

		// Create a file in the parent of workspace
		const parentFile = path.join(workspaceRoot, '..', 'parent-file.ts');
		fs.writeFileSync(parentFile, 'parent');

		await hook.toolAfter(
			{ tool: 'write', sessionID: 'test', args: { file_path: parentFile } },
			{ output: undefined },
		);

		expect(mockUpdateGraphForFiles).not.toHaveBeenCalled();
	});

	test('unsupported extension is filtered before boundary check', async () => {
		const hook = createRepoGraphBuilderHook(workspaceRoot, {
			buildWorkspaceGraph: mockBuildWorkspaceGraph,
			saveGraph: mockSaveGraph,
			updateGraphForFiles: mockUpdateGraphForFiles,
		});

		// Even a file inside workspace with unsupported extension should not trigger update
		const filePath = path.join(workspaceRoot, 'data.json');
		fs.writeFileSync(filePath, '{}');

		await hook.toolAfter(
			{ tool: 'write', sessionID: 'test', args: { file_path: filePath } },
			{ output: undefined },
		);

		// Should be filtered by isSupportedSourceFile before boundary check
		expect(mockUpdateGraphForFiles).not.toHaveBeenCalled();
	});

	test('non-write tool is filtered before boundary check', async () => {
		const hook = createRepoGraphBuilderHook(workspaceRoot, {
			buildWorkspaceGraph: mockBuildWorkspaceGraph,
			saveGraph: mockSaveGraph,
			updateGraphForFiles: mockUpdateGraphForFiles,
		});

		const filePath = path.join(workspaceRoot, 'file.ts');
		fs.writeFileSync(filePath, 'content');

		// Send a read tool
		await hook.toolAfter(
			{ tool: 'Read', sessionID: 'test', args: { file_path: filePath } },
			{ output: undefined },
		);

		expect(mockUpdateGraphForFiles).not.toHaveBeenCalled();
	});

	test('missing file_path arg is filtered before boundary check', async () => {
		const hook = createRepoGraphBuilderHook(workspaceRoot, {
			buildWorkspaceGraph: mockBuildWorkspaceGraph,
			saveGraph: mockSaveGraph,
			updateGraphForFiles: mockUpdateGraphForFiles,
		});

		await hook.toolAfter(
			{ tool: 'write', sessionID: 'test', args: {} },
			{ output: undefined },
		);

		expect(mockUpdateGraphForFiles).not.toHaveBeenCalled();
	});
});
