import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
	extractImports,
	getLanguageFromExtension,
	SOURCE_EXTENSIONS,
} from '../../../src/graph/import-extractor';

let tmp: string;

beforeAll(() => {
	tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-import-'));
});

afterAll(() => {
	fs.rmSync(tmp, { recursive: true, force: true });
});

function write(rel: string, content: string): string {
	const abs = path.join(tmp, rel);
	fs.mkdirSync(path.dirname(abs), { recursive: true });
	fs.writeFileSync(abs, content, 'utf-8');
	return abs;
}

describe('getLanguageFromExtension', () => {
	it('maps known extensions', () => {
		expect(getLanguageFromExtension('.ts')).toBe('typescript');
		expect(getLanguageFromExtension('.tsx')).toBe('typescript');
		expect(getLanguageFromExtension('.js')).toBe('javascript');
		expect(getLanguageFromExtension('.py')).toBe('python');
		expect(getLanguageFromExtension('.go')).toBe('go');
		expect(getLanguageFromExtension('.rs')).toBe('rust');
	});
	it('returns null for unknown extensions', () => {
		expect(getLanguageFromExtension('.xyz')).toBeNull();
		expect(getLanguageFromExtension('')).toBeNull();
	});
	it('exports the source extensions array', () => {
		expect(SOURCE_EXTENSIONS).toContain('.ts');
		expect(SOURCE_EXTENSIONS).toContain('.py');
	});
});

describe('extractImports — TypeScript/JavaScript', () => {
	it('resolves a relative named import to a sibling .ts file', () => {
		write('utils.ts', 'export const x = 1;\n');
		const a = write(
			'a.ts',
			"import { x } from './utils';\nconsole.log(x);\n",
		);
		const edges = extractImports({ absoluteFilePath: a, workspaceRoot: tmp });
		expect(edges).toHaveLength(1);
		expect(edges[0].source).toBe('a.ts');
		expect(edges[0].target).toBe('utils.ts');
		expect(edges[0].importedSymbols).toEqual(['x']);
		expect(edges[0].importType).toBe('named');
	});

	it('resolves index files', () => {
		write('lib/index.ts', 'export const y = 2;\n');
		const b = write('b.ts', "import { y } from './lib';\n");
		const edges = extractImports({ absoluteFilePath: b, workspaceRoot: tmp });
		expect(edges).toHaveLength(1);
		expect(edges[0].target).toBe('lib/index.ts');
	});

	it('captures default and namespace imports', () => {
		write('mod-d.ts', 'export default 1;\n');
		write('mod-n.ts', 'export const z = 3;\n');
		const c = write(
			'c.ts',
			"import D from './mod-d';\nimport * as N from './mod-n';\n",
		);
		const edges = extractImports({ absoluteFilePath: c, workspaceRoot: tmp });
		const types = edges.map((e) => e.importType).sort();
		expect(types).toEqual(['default', 'namespace']);
	});

	it('records external package imports with empty target (no graph edge)', () => {
		const d = write('d.ts', "import { something } from 'react';\n");
		const edges = extractImports({ absoluteFilePath: d, workspaceRoot: tmp });
		// External packages still appear in the import list (rawModule preserved)
		// but have no resolved target, so they produce no reverse-graph edge.
		expect(edges.every((e) => e.target === '')).toBe(true);
	});

	it('handles ESM .js suffix pointing at a .ts source', () => {
		write('helper.ts', 'export const h = 4;\n');
		const e = write('e.ts', "import { h } from './helper.js';\n");
		const edges = extractImports({ absoluteFilePath: e, workspaceRoot: tmp });
		expect(edges).toHaveLength(1);
		expect(edges[0].target).toBe('helper.ts');
	});
});

describe('extractImports — Python', () => {
	it('resolves a relative `from x import y`', () => {
		write('pkg/__init__.py', '');
		write('pkg/util.py', 'def foo(): pass\n');
		const a = write('pkg/main.py', 'from .util import foo\n');
		const edges = extractImports({ absoluteFilePath: a, workspaceRoot: tmp });
		expect(edges.length).toBeGreaterThanOrEqual(1);
		const target = edges[0].target;
		expect(target.endsWith('util.py')).toBe(true);
	});
});

describe('extractImports — error handling', () => {
	it('returns [] for unsupported extensions', () => {
		const f = write('readme.md', '# hi\n');
		const edges = extractImports({ absoluteFilePath: f, workspaceRoot: tmp });
		expect(edges).toEqual([]);
	});

	it('returns [] for missing files', () => {
		const edges = extractImports({
			absoluteFilePath: path.join(tmp, 'does-not-exist.ts'),
			workspaceRoot: tmp,
		});
		expect(edges).toEqual([]);
	});
});
