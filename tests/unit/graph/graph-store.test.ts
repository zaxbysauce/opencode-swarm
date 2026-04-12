import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getImporters } from '../../../src/graph/graph-query';
import {
	buildAndSaveGraph,
	loadGraph,
	saveGraph,
	updateGraphIncremental,
} from '../../../src/graph/graph-store';

let tmp: string;

beforeEach(() => {
	tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-store-'));
	fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
});

afterEach(() => {
	fs.rmSync(tmp, { recursive: true, force: true });
});

describe('saveGraph', () => {
	it('does not leak tmpfiles into .swarm/ on success', async () => {
		fs.writeFileSync(path.join(tmp, 'src/a.ts'), 'export const a = 1;\n');
		await buildAndSaveGraph(tmp);
		const swarmEntries = fs.readdirSync(path.join(tmp, '.swarm'));
		// Only the canonical filename should remain — no `.tmp.*` orphans.
		expect(swarmEntries.filter((n) => n.includes('.tmp.'))).toEqual([]);
		expect(swarmEntries).toContain('repo-graph.json');
	});

	it('cleans up the tmpfile when rename fails', () => {
		// Make the destination a directory so renameSync fails with EISDIR.
		const swarmDir = path.join(tmp, '.swarm');
		fs.mkdirSync(swarmDir, { recursive: true });
		fs.mkdirSync(path.join(swarmDir, 'repo-graph.json'));

		expect(() =>
			saveGraph(tmp, {
				version: 1,
				buildTimestamp: new Date().toISOString(),
				rootDir: tmp,
				files: {},
			}),
		).toThrow();

		const orphans = fs.readdirSync(swarmDir).filter((n) => n.includes('.tmp.'));
		expect(orphans).toEqual([]);
	});
});

describe('updateGraphIncremental', () => {
	it('invalidates the cached reverse-edge index after in-place mutation', async () => {
		fs.writeFileSync(path.join(tmp, 'src/util.ts'), 'export const u = 1;\n');
		fs.writeFileSync(
			path.join(tmp, 'src/main.ts'),
			"import { u } from './util';\nconsole.log(u);\n",
		);
		const graph = await buildAndSaveGraph(tmp);
		// Prime the reverse-index cache.
		expect(getImporters(graph, 'src/util.ts').map((r) => r.file)).toEqual([
			'src/main.ts',
		]);

		// Add a second importer and run an incremental update — same graph
		// reference is returned, so without explicit cache invalidation the
		// reverse index would keep returning the old single-importer result.
		fs.writeFileSync(
			path.join(tmp, 'src/extra.ts'),
			"import { u } from './util';\nexport const x = u;\n",
		);
		await updateGraphIncremental(tmp, ['src/extra.ts'], graph);

		const importers = getImporters(graph, 'src/util.ts')
			.map((r) => r.file)
			.sort();
		expect(importers).toEqual(['src/extra.ts', 'src/main.ts']);
	});

	it('round-trips loadGraph after save', async () => {
		fs.writeFileSync(path.join(tmp, 'src/x.ts'), 'export const x = 1;\n');
		const built = await buildAndSaveGraph(tmp);
		const loaded = loadGraph(tmp);
		expect(loaded).not.toBeNull();
		expect(Object.keys(loaded!.files).sort()).toEqual(
			Object.keys(built.files).sort(),
		);
	});
});
