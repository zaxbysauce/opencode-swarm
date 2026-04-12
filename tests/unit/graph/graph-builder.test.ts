import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	buildRepoGraph,
	findSourceFiles,
	processFile,
} from '../../../src/graph/graph-builder';

let tmp: string;

beforeAll(() => {
	tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-builder-'));
	// Lay out a small repo:
	//   src/util.ts        — exports `add`
	//   src/main.ts        — imports `add` from './util'
	//   src/internal/x.ts  — imports `add` from '../util'
	//   node_modules/dep/  — must be skipped
	//   .git/              — must be skipped
	fs.mkdirSync(path.join(tmp, 'src/internal'), { recursive: true });
	fs.mkdirSync(path.join(tmp, 'node_modules/dep'), { recursive: true });
	fs.mkdirSync(path.join(tmp, '.git'), { recursive: true });

	fs.writeFileSync(
		path.join(tmp, 'src/util.ts'),
		'export function add(a: number, b: number) { return a + b; }\n',
	);
	fs.writeFileSync(
		path.join(tmp, 'src/main.ts'),
		"import { add } from './util';\nconsole.log(add(1, 2));\n",
	);
	fs.writeFileSync(
		path.join(tmp, 'src/internal/x.ts'),
		"import { add } from '../util';\nexport const r = add(2, 3);\n",
	);
	fs.writeFileSync(
		path.join(tmp, 'node_modules/dep/index.ts'),
		'export const skip = 1;\n',
	);
	fs.writeFileSync(path.join(tmp, '.git/config'), '[core]\nbare = false\n');
});

afterAll(() => {
	fs.rmSync(tmp, { recursive: true, force: true });
});

describe('findSourceFiles', () => {
	it('skips node_modules and .git', () => {
		const files = findSourceFiles(tmp);
		const rels = files
			.map((f) => path.relative(tmp, f).replace(/\\/g, '/'))
			.sort();
		expect(rels).toEqual(['src/internal/x.ts', 'src/main.ts', 'src/util.ts']);
	});
});

describe('processFile', () => {
	it('returns a FileNode with imports and forward-slash path', async () => {
		const node = await processFile(path.join(tmp, 'src/main.ts'), tmp);
		expect(node).not.toBeNull();
		expect(node!.path).toBe('src/main.ts');
		expect(node!.language).toBe('typescript');
		expect(node!.imports).toHaveLength(1);
		expect(node!.imports[0].target).toBe('src/util.ts');
		expect(node!.imports[0].importedSymbols).toEqual(['add']);
	});

	it('returns null for unsupported files', async () => {
		const f = path.join(tmp, 'README.md');
		fs.writeFileSync(f, '# hi\n');
		const node = await processFile(f, tmp);
		expect(node).toBeNull();
	});
});

describe('buildRepoGraph', () => {
	it('builds a complete graph for the fixture repo', async () => {
		const graph = await buildRepoGraph(tmp);
		expect(graph.version).toBe(1);
		expect(graph.rootDir).toBe(tmp);
		expect(Object.keys(graph.files).sort()).toEqual([
			'src/internal/x.ts',
			'src/main.ts',
			'src/util.ts',
		]);
		// util.ts has 0 imports (it's a leaf)
		expect(graph.files['src/util.ts'].imports).toHaveLength(0);
		// main.ts and x.ts each import util
		expect(graph.files['src/main.ts'].imports[0].target).toBe('src/util.ts');
		expect(graph.files['src/internal/x.ts'].imports[0].target).toBe(
			'src/util.ts',
		);
	});

	it('respects maxFiles cap', async () => {
		const graph = await buildRepoGraph(tmp, { maxFiles: 1 });
		expect(Object.keys(graph.files).length).toBeLessThanOrEqual(1);
	});
});
