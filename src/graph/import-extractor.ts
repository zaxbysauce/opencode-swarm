import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ImportEdge, ImportType } from './types';

/**
 * Extract import edges from a source file.
 *
 * Uses regex-based parsing (the same proven approach as `src/tools/imports.ts`
 * and `src/tools/co-change-analyzer.ts`). Tree-sitter is intentionally not used
 * here because:
 *   1. The existing regex patterns are battle-tested across the codebase.
 *   2. Import statements have stable, simple syntax that regex handles reliably.
 *   3. Avoiding the per-file Tree-sitter parse keeps full-graph builds fast
 *      enough to be interactive (target: <5s for 50k LOC).
 *
 * Supported languages:
 *   - TypeScript / JavaScript (.ts/.tsx/.js/.jsx/.mjs/.cjs) — ES modules + CJS require
 *   - Python (.py) — `import x` and `from x import y`
 *   - Go (.go) — `import "path"` and `import (...)` blocks
 *   - Rust (.rs) — `use path::module`
 *
 * Only RELATIVE imports are tracked as graph edges. External package imports
 * (e.g. 'react', 'fmt', 'std::fs') are skipped — they are not part of the
 * intra-repo dependency graph.
 */

export interface ExtractImportsOptions {
	/** Absolute path to the source file (used for relative resolution). */
	absoluteFilePath: string;
	/** Absolute workspace root (used for relative path computation). */
	workspaceRoot: string;
	/** Optional pre-read content; if omitted the file is read from disk. */
	content?: string;
}

/** Source file extensions we know how to scan. */
export const SOURCE_EXTENSIONS = [
	'.ts',
	'.tsx',
	'.js',
	'.jsx',
	'.mjs',
	'.cjs',
	'.py',
	'.go',
	'.rs',
] as const;

const TS_JS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

const RESOLVE_EXTENSION_CANDIDATES = [
	'',
	'.ts',
	'.tsx',
	'.js',
	'.jsx',
	'.mjs',
	'.cjs',
	'/index.ts',
	'/index.tsx',
	'/index.js',
	'/index.jsx',
	'/index.mjs',
];

const PY_EXTENSION_CANDIDATES = ['.py', '/__init__.py'];

export function getLanguageFromExtension(ext: string): string | null {
	const lower = ext.toLowerCase();
	if (TS_JS_EXTENSIONS.includes(lower)) {
		return lower === '.ts' || lower === '.tsx' ? 'typescript' : 'javascript';
	}
	if (lower === '.py') return 'python';
	if (lower === '.go') return 'go';
	if (lower === '.rs') return 'rust';
	return null;
}

function toRelForwardSlash(absPath: string, root: string): string {
	return path.relative(root, absPath).replace(/\\/g, '/');
}

function tryResolveTSJS(
	rawModule: string,
	sourceFileAbs: string,
): string | null {
	if (!rawModule.startsWith('.') && !rawModule.startsWith('/')) {
		return null; // package import
	}
	const sourceDir = path.dirname(sourceFileAbs);
	const baseAbs = path.resolve(sourceDir, rawModule);
	for (const candidate of RESOLVE_EXTENSION_CANDIDATES) {
		const test = baseAbs + candidate;
		try {
			const stat = fs.statSync(test);
			if (stat.isFile()) return test;
		} catch {
			// continue
		}
	}
	// Strip a written .js / .ts extension and retry (common for ESM ".js" suffixes pointing at .ts)
	const stripped = baseAbs.replace(/\.(m?[jt]sx?|c[jt]s)$/i, '');
	if (stripped !== baseAbs) {
		for (const candidate of RESOLVE_EXTENSION_CANDIDATES) {
			const test = stripped + candidate;
			try {
				const stat = fs.statSync(test);
				if (stat.isFile()) return test;
			} catch {
				// continue
			}
		}
	}
	return null;
}

function tryResolvePython(
	rawModule: string,
	sourceFileAbs: string,
	workspaceRoot: string,
): string | null {
	// Only handle relative ('.foo' / '..foo') module specifiers and dotted local modules.
	if (!rawModule.startsWith('.')) {
		return null;
	}
	// Convert "..pkg.mod" -> "../../pkg/mod"
	let leadingDots = 0;
	while (leadingDots < rawModule.length && rawModule[leadingDots] === '.') {
		leadingDots++;
	}
	const remainder = rawModule.slice(leadingDots).replace(/\./g, '/');
	const upDirs = '../'.repeat(Math.max(0, leadingDots - 1));
	const sourceDir = path.dirname(sourceFileAbs);
	const baseAbs = path.resolve(sourceDir, upDirs + remainder);
	for (const candidate of PY_EXTENSION_CANDIDATES) {
		const test = baseAbs + candidate;
		try {
			const stat = fs.statSync(test);
			if (stat.isFile()) {
				const rel = path.relative(workspaceRoot, test).replace(/\\/g, '/');
				if (rel.startsWith('..')) return null; // outside workspace
				return test;
			}
		} catch {
			// continue
		}
	}
	return null;
}

interface ParsedImport {
	rawModule: string;
	importedSymbols: string[];
	importType: ImportType;
	line: number;
}

const TS_IMPORT_RE =
	/(?:^|[\n;])\s*import\s+(?:type\s+)?(?:(\*\s+as\s+(\w+))|(\{[\s\S]*?\})|(\w+))?(?:\s*,\s*(?:(\*\s+as\s+\w+)|(\{[\s\S]*?\})|(\w+)))?\s*(?:from\s+)?['"`]([^'"`]+)['"`]/g;
const TS_SIDEEFFECT_RE = /(?:^|[\n;])\s*import\s+['"`]([^'"`]+)['"`]/g;
const TS_REQUIRE_RE = /\brequire\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
const TS_DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;

function lineNumberFor(content: string, index: number): number {
	let line = 1;
	for (let i = 0; i < index && i < content.length; i++) {
		if (content.charCodeAt(i) === 10 /* \n */) line++;
	}
	return line;
}

function parseNamedSpecifiers(braceText: string): string[] {
	// braceText includes "{ ... }"
	const inner = braceText.replace(/^\{|\}$/g, '');
	const names: string[] = [];
	for (const piece of inner.split(',')) {
		const trimmed = piece.trim();
		if (!trimmed) continue;
		// "Foo" or "Foo as Bar" or "type Foo" or "type Foo as Bar"
		const stripped = trimmed.replace(/^type\s+/, '');
		const aliasMatch = stripped.match(/^(\w+)\s+as\s+(\w+)$/);
		if (aliasMatch) {
			// Record the ORIGINAL exported name (aliasMatch[1]), not the local
			// binding (aliasMatch[2]). Symbol-consumer queries match against
			// exported names, so storing the alias would under-report usage of
			// `import { add as sum }` when callers ask "who imports add?".
			names.push(aliasMatch[1]);
		} else {
			const nameMatch = stripped.match(/^(\w+)/);
			if (nameMatch) names.push(nameMatch[1]);
		}
	}
	return names;
}

function parseTSJSImports(content: string): ParsedImport[] {
	const out: ParsedImport[] = [];
	const seen = new Set<string>();

	const stripped = stripTSJSComments(content);
	// String-literal content ranges (excluding the source-string of legitimate
	// import / require / dynamic-import statements). Used to filter out false
	// positives where the regex matches `import ... from ...` text that lives
	// inside an unrelated string literal (codegen templates, docs, examples).
	const stringRanges = findNonImportStringRanges(stripped);

	const isInString = (pos: number): boolean => isInsideRange(pos, stringRanges);

	for (
		let m = TS_IMPORT_RE.exec(stripped);
		m !== null;
		m = TS_IMPORT_RE.exec(stripped)
	) {
		const rawModule = m[8];
		if (!rawModule) continue;
		// The `import` keyword sits after the leading "(?:^|[\n;])\s*". If
		// that keyword is inside a string literal, this is a false positive.
		const importKw = m.index + m[0].search(/\bimport\b/);
		if (isInString(importKw)) continue;
		const line = lineNumberFor(stripped, m.index);
		const namespaceA = m[1];
		const bracesA = m[3];
		const defaultA = m[4];
		const namespaceB = m[5];
		const bracesB = m[6];
		const defaultB = m[7];

		const importedSymbols: string[] = [];
		let importType: ImportType = 'named';
		let any = false;
		if (defaultA) {
			importedSymbols.push(defaultA);
			importType = 'default';
			any = true;
		}
		if (defaultB) {
			importedSymbols.push(defaultB);
			importType = importType === 'named' ? 'default' : importType;
			any = true;
		}
		if (bracesA) {
			importedSymbols.push(...parseNamedSpecifiers(bracesA));
			importType = any ? importType : 'named';
			any = true;
		}
		if (bracesB) {
			importedSymbols.push(...parseNamedSpecifiers(bracesB));
			any = true;
		}
		if (namespaceA || namespaceB) {
			importType = 'namespace';
			any = true;
		}
		if (!any) {
			// no clause matched: this can't actually happen because the leading group is optional;
			// fall through and treat as side-effect via the side-effect pass.
			continue;
		}
		const key = `${rawModule}::${line}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({ rawModule, importedSymbols, importType, line });
	}

	for (
		let m = TS_SIDEEFFECT_RE.exec(stripped);
		m !== null;
		m = TS_SIDEEFFECT_RE.exec(stripped)
	) {
		const importKw = m.index + m[0].search(/\bimport\b/);
		if (isInString(importKw)) continue;
		const rawModule = m[1];
		const line = lineNumberFor(stripped, m.index);
		const key = `${rawModule}::${line}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({
			rawModule,
			importedSymbols: [],
			importType: 'sideeffect',
			line,
		});
	}

	for (
		let m = TS_REQUIRE_RE.exec(stripped);
		m !== null;
		m = TS_REQUIRE_RE.exec(stripped)
	) {
		// `\brequire\s*\(` — the `require` keyword is at m.index.
		if (isInString(m.index)) continue;
		const rawModule = m[1];
		const line = lineNumberFor(stripped, m.index);
		const key = `require:${rawModule}::${line}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({
			rawModule,
			importedSymbols: [],
			importType: 'require',
			line,
		});
	}

	for (
		let m = TS_DYNAMIC_IMPORT_RE.exec(stripped);
		m !== null;
		m = TS_DYNAMIC_IMPORT_RE.exec(stripped)
	) {
		// `\bimport\s*\(` — the `import` keyword is at m.index.
		if (isInString(m.index)) continue;
		const rawModule = m[1];
		const line = lineNumberFor(stripped, m.index);
		const key = `dyn:${rawModule}::${line}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({
			rawModule,
			importedSymbols: [],
			importType: 'require',
			line,
		});
	}

	return out;
}

/**
 * Replace comment bodies with spaces of equal length so regex matches stay
 * aligned to original line numbers. String literal contents are preserved
 * because the import regex needs the source-string content (the path inside
 * `from '...'`); false-positive matches inside unrelated string literals are
 * filtered out separately via {@link findNonImportStringRanges}.
 */
function stripTSJSComments(content: string): string {
	let out = '';
	let i = 0;
	const len = content.length;
	while (i < len) {
		const ch = content[i];
		const next = content[i + 1];
		// line comment
		if (ch === '/' && next === '/') {
			while (i < len && content[i] !== '\n') {
				out += content[i] === '\n' ? '\n' : ' ';
				i++;
			}
			continue;
		}
		// block comment
		if (ch === '/' && next === '*') {
			out += '  ';
			i += 2;
			while (i < len) {
				if (content[i] === '*' && content[i + 1] === '/') {
					out += '  ';
					i += 2;
					break;
				}
				out += content[i] === '\n' ? '\n' : ' ';
				i++;
			}
			continue;
		}
		// string literals — preserve verbatim (including the quote chars)
		if (ch === '"' || ch === "'" || ch === '`') {
			const quote = ch;
			out += ch;
			i++;
			while (i < len) {
				if (content[i] === '\\' && i + 1 < len) {
					out += content[i];
					out += content[i + 1];
					i += 2;
					continue;
				}
				if (content[i] === quote) {
					out += content[i];
					i++;
					break;
				}
				out += content[i];
				i++;
			}
			continue;
		}
		out += ch;
		i++;
	}
	return out;
}

/**
 * Walk comment-stripped content and return the [startInclusive, endExclusive]
 * positions of every string-literal *content* range (the chars between the
 * quote markers, exclusive of the quotes).
 *
 * Source-strings of legitimate `from '…'`, `require('…')`, and `import('…')`
 * statements are *excluded* — they must remain visible to the import regexes.
 *
 * Used to suppress false-positive import matches that appear inside unrelated
 * string literals (codegen templates, prose, examples).
 */
function findNonImportStringRanges(content: string): Array<[number, number]> {
	const ranges: Array<[number, number]> = [];
	let i = 0;
	const len = content.length;
	while (i < len) {
		const ch = content[i];
		if (ch === '"' || ch === "'" || ch === '`') {
			const quote = ch;
			const contentStart = i + 1;
			i++;
			let endExclusive = -1;
			while (i < len) {
				if (content[i] === '\\' && i + 1 < len) {
					i += 2;
					continue;
				}
				if (content[i] === quote) {
					endExclusive = i;
					i++;
					break;
				}
				i++;
			}
			if (endExclusive === -1) continue; // unterminated; nothing to record
			// Look back for an `import-source` context: `from `, `require(`,
			// `import(`. If matched, this string is a real import source — skip.
			let j = contentStart - 2; // char before the opening quote
			while (j >= 0 && (content[j] === ' ' || content[j] === '\t')) j--;
			const isImportSource =
				(j >= 3 && content.slice(j - 3, j + 1) === 'from') ||
				(j >= 0 && content[j] === '(');
			if (!isImportSource) {
				ranges.push([contentStart, endExclusive]);
			}
			continue;
		}
		i++;
	}
	return ranges;
}

/** Linear-scan range membership check (ranges are emitted in source order). */
function isInsideRange(
	pos: number,
	ranges: ReadonlyArray<readonly [number, number]>,
): boolean {
	for (const [start, end] of ranges) {
		if (pos < start) return false;
		if (pos < end) return true;
	}
	return false;
}

const PY_FROM_IMPORT_RE = /^(\s*)from\s+([.\w]+)\s+import\s+([^\n#]+)/gm;
const PY_IMPORT_RE = /^(\s*)import\s+([.\w][.\w,\s]*)/gm;

function parsePythonImports(content: string): ParsedImport[] {
	const out: ParsedImport[] = [];
	for (
		let m = PY_FROM_IMPORT_RE.exec(content);
		m !== null;
		m = PY_FROM_IMPORT_RE.exec(content)
	) {
		const rawModule = m[2];
		const namesPart = m[3].trim();
		const importedSymbols =
			namesPart === '*'
				? []
				: namesPart
						.replace(/[()]/g, '')
						.split(',')
						.map((s) => {
							const t = s.trim();
							const aliasMatch = t.match(/^(\w+)\s+as\s+(\w+)$/);
							// Record the original exported name, not the local alias —
							// symbol-consumer queries match against exported names.
							if (aliasMatch) return aliasMatch[1];
							const nameMatch = t.match(/^(\w+)/);
							return nameMatch ? nameMatch[1] : '';
						})
						.filter(Boolean);
		out.push({
			rawModule,
			importedSymbols,
			importType: namesPart === '*' ? 'namespace' : 'named',
			line: lineNumberFor(content, m.index),
		});
	}
	for (
		let m = PY_IMPORT_RE.exec(content);
		m !== null;
		m = PY_IMPORT_RE.exec(content)
	) {
		const namesPart = m[2].trim();
		for (const piece of namesPart.split(',')) {
			const trimmed = piece.trim();
			if (!trimmed) continue;
			const aliasMatch = trimmed.match(/^([.\w]+)\s+as\s+(\w+)$/);
			const rawModule = aliasMatch ? aliasMatch[1] : trimmed.split(/\s/)[0];
			out.push({
				rawModule,
				importedSymbols: [],
				importType: 'namespace',
				line: lineNumberFor(content, m.index),
			});
		}
	}
	return out;
}

const GO_SINGLE_IMPORT_RE = /^\s*import\s+(?:[\w.]+\s+)?["`]([^"`]+)["`]/gm;
const GO_BLOCK_IMPORT_RE = /^\s*import\s*\(([\s\S]*?)\)/gm;
const GO_BLOCK_LINE_RE = /(?:[\w.]+\s+)?["`]([^"`]+)["`]/g;

function parseGoImports(content: string): ParsedImport[] {
	const out: ParsedImport[] = [];
	for (
		let m = GO_SINGLE_IMPORT_RE.exec(content);
		m !== null;
		m = GO_SINGLE_IMPORT_RE.exec(content)
	) {
		out.push({
			rawModule: m[1],
			importedSymbols: [],
			importType: 'namespace',
			line: lineNumberFor(content, m.index),
		});
	}
	for (
		let m = GO_BLOCK_IMPORT_RE.exec(content);
		m !== null;
		m = GO_BLOCK_IMPORT_RE.exec(content)
	) {
		const block = m[1];
		const blockStart = m.index;
		for (
			let inner = GO_BLOCK_LINE_RE.exec(block);
			inner !== null;
			inner = GO_BLOCK_LINE_RE.exec(block)
		) {
			out.push({
				rawModule: inner[1],
				importedSymbols: [],
				importType: 'namespace',
				line: lineNumberFor(content, blockStart + inner.index),
			});
		}
		GO_BLOCK_LINE_RE.lastIndex = 0;
	}
	return out;
}

const RUST_USE_RE = /^\s*use\s+([\w:]+(?:\s*::\s*\{[^}]*\})?)\s*;/gm;

function parseRustUses(content: string): ParsedImport[] {
	const out: ParsedImport[] = [];
	for (
		let m = RUST_USE_RE.exec(content);
		m !== null;
		m = RUST_USE_RE.exec(content)
	) {
		out.push({
			rawModule: m[1].trim(),
			importedSymbols: [],
			importType: 'namespace',
			line: lineNumberFor(content, m.index),
		});
	}
	return out;
}

/**
 * Extract import edges for a single file. Returns an empty array when the
 * language is unsupported or the file cannot be parsed.
 *
 * Resolution strategy for edge.target:
 *   - TS/JS: probe extensions (.ts, .tsx, .js, .jsx, .mjs, .cjs, /index.*).
 *   - Python: probe .py and /__init__.py for relative imports only.
 *   - Go/Rust: target left empty (intra-repo resolution requires module/crate
 *     metadata that is out of scope for Phase 1). The raw module is preserved.
 */
export function extractImports(opts: ExtractImportsOptions): ImportEdge[] {
	const { absoluteFilePath, workspaceRoot } = opts;
	const ext = path.extname(absoluteFilePath).toLowerCase();
	const language = getLanguageFromExtension(ext);
	if (!language) return [];

	let content = opts.content;
	if (content === undefined) {
		try {
			content = fs.readFileSync(absoluteFilePath, 'utf-8');
		} catch {
			return [];
		}
	}

	let parsed: ParsedImport[];
	if (language === 'typescript' || language === 'javascript') {
		parsed = parseTSJSImports(content);
	} else if (language === 'python') {
		parsed = parsePythonImports(content);
	} else if (language === 'go') {
		parsed = parseGoImports(content);
	} else if (language === 'rust') {
		parsed = parseRustUses(content);
	} else {
		return [];
	}

	const sourceRel = toRelForwardSlash(absoluteFilePath, workspaceRoot);
	const edges: ImportEdge[] = [];

	for (const p of parsed) {
		let resolvedAbs: string | null = null;
		if (language === 'typescript' || language === 'javascript') {
			resolvedAbs = tryResolveTSJS(p.rawModule, absoluteFilePath);
		} else if (language === 'python') {
			resolvedAbs = tryResolvePython(
				p.rawModule,
				absoluteFilePath,
				workspaceRoot,
			);
		}

		const target = resolvedAbs
			? toRelForwardSlash(resolvedAbs, workspaceRoot)
			: '';

		// Skip imports that resolve outside the workspace
		if (target.startsWith('..')) continue;

		edges.push({
			source: sourceRel,
			target,
			rawModule: p.rawModule,
			importedSymbols: p.importedSymbols,
			importType: p.importType,
			line: p.line,
		});
	}

	return edges;
}
