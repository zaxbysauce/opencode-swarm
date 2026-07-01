import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	buildWorkspaceGraphAsync,
	clearCache,
} from '../../../src/tools/repo-graph';

describe('repo-graph async builder symbol visibility', () => {
	let tempDir: string;
	let workspacePath: string;

	beforeEach(async () => {
		tempDir = await fs.realpath(
			await fs.mkdtemp(path.join(os.tmpdir(), 'repo-graph-vis-')),
		);
		workspacePath = tempDir;
	});

	afterEach(async () => {
		clearCache(workspacePath);
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	async function write(rel: string, content: string): Promise<void> {
		const full = path.join(tempDir, rel);
		await fs.mkdir(path.dirname(full), { recursive: true });
		await fs.writeFile(full, content);
	}

	test('non-ESM public symbols reach exports, exportLines, and exportRanges', async () => {
		await write(
			'pkg/main.go',
			`package main

func PublicAPI() {}
func privateHelper() {}
`,
		);

		const graph = await buildWorkspaceGraphAsync(workspacePath);
		const node = Object.values(graph.nodes).find((n) =>
			n.filePath.endsWith(path.join('pkg', 'main.go')),
		);

		expect(node).toBeDefined();
		expect(node!.exports).toEqual(['PublicAPI']);
		expect(node!.exportLines).toEqual({ PublicAPI: 3 });
		expect(node!.exportRanges).toEqual({
			PublicAPI: { startLine: 3, endLine: 3 },
		});
		expect(node!.exports).not.toContain('privateHelper');
	});

	test('temp fixture is created inside the workspace root', () => {
		expect(fsSync.existsSync(tempDir)).toBe(true);
		expect(path.resolve(workspacePath)).toBe(tempDir);
	});
});
