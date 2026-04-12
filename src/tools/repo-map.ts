/**
 * repo-map tool — Builds a structured map of the repository's source files,
 * including exports, imports, call edges, and importance scores.
 *
 * Supports three modes:
 * - build: scan the full tree and produce a RepoMap
 * - localize: get localization context for a specific file
 * - blast-radius: BFS from a set of files through the import graph
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { type ToolContext, tool } from '@opencode-ai/plugin';
import type { Node as TSNode } from 'web-tree-sitter';
import { getLanguageForExtension, getParserForFile } from '../lang/registry';
import { isGrammarAvailable } from '../lang/runtime';
import {
	containsControlChars,
	containsPathTraversal,
} from '../utils/path-security';
import { createSwarmTool } from './create-tool';

// ============ Data Structures ============

export interface SymbolDef {
	name: string;
	kind: 'function' | 'class' | 'constant' | 'interface' | 'type' | 'method';
	exported: boolean;
	signature?: string;
	line: number;
}

export interface ImportDef {
	source: string;
	symbols: string[];
	line: number;
}

export interface CallEdge {
	from: string;
	to: string;
	line: number;
}

export interface RepoMapEntry {
	filePath: string;
	language: string;
	exports: SymbolDef[];
	imports: ImportDef[];
	callEdges: CallEdge[];
	importanceScore: number;
}

export interface RepoMap {
	version: 1;
	generatedAt: string;
	rootDir: string;
	files: Record<string, RepoMapEntry>;
	stats: {
		totalFiles: number;
		totalSymbols: number;
		totalEdges: number;
		languages: Record<string, number>;
	};
}

export interface LocalizationContext {
	targetFile: string;
	importedBy: string[];
	exportsUsedExternally: string[];
	blastRadius: string[];
	parallelPatterns: string[];
}

// ============ Constants ============

const MAX_FILE_SIZE_BYTES = 1024 * 1024; // 1MB per file
const MAX_ENTRIES = 50_000; // Token budget cap
const CACHE_STALENESS_MS = 60_000; // 60 seconds
const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|:|$)/i;

const SKIP_DIRECTORIES = new Set([
	'node_modules',
	'.git',
	'dist',
	'build',
	'out',
	'coverage',
	'.next',
	'.nuxt',
	'.cache',
	'vendor',
	'.svn',
	'.hg',
	'.swarm',
	'__pycache__',
	'.gradle',
	'target',
	'.idea',
	'.vscode',
	'.venv',
	'venv',
]);

// Source file extensions we care about
const SOURCE_EXTENSIONS = new Set([
	'.ts',
	'.tsx',
	'.js',
	'.jsx',
	'.mjs',
	'.cjs',
	'.py',
	'.go',
	'.rs',
	'.php',
	'.phtml',
	'.rb',
	'.java',
	'.kt',
	'.swift',
	'.dart',
	'.c',
	'.cpp',
	'.h',
	'.hpp',
	'.cs',
	'.sh',
	'.bash',
]);

// ============ Module-level Cache ============

let cachedMap: RepoMap | null = null;
let cachedRootDir: string | null = null;
let cachedTimestamp = 0;

// ============ Validation ============

function containsWindowsAttacks(str: string): boolean {
	if (/:[^\\/]/.test(str)) return true;
	const parts = str.split(/[/\\]/);
	for (const part of parts) {
		if (WINDOWS_RESERVED_NAMES.test(part)) return true;
	}
	return false;
}

function validateDirectory(dir: string): string | null {
	if (!dir || dir.length === 0) return 'directory is required';
	if (dir.length > 500) return `directory exceeds maximum length`;
	if (containsControlChars(dir)) return 'directory contains control characters';
	if (containsPathTraversal(dir)) return 'directory contains path traversal';
	if (containsWindowsAttacks(dir))
		return 'directory contains invalid Windows sequence';
	return null;
}

// ============ Directory Scanning ============

function findSourceFiles(dir: string): string[] {
	const files: string[] = [];

	function walk(currentDir: string): void {
		let entries: string[];
		try {
			entries = fs.readdirSync(currentDir);
		} catch {
			return;
		}

		entries.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

		for (const entry of entries) {
			if (SKIP_DIRECTORIES.has(entry)) continue;

			const fullPath = path.join(currentDir, entry);
			let stat: fs.Stats;
			try {
				stat = fs.statSync(fullPath);
			} catch {
				continue;
			}

			if (stat.isDirectory()) {
				// Skip symlinks
				try {
					const lstat = fs.lstatSync(fullPath);
					if (lstat.isSymbolicLink()) continue;
				} catch {
					continue;
				}
				walk(fullPath);
			} else if (stat.isFile() && stat.size <= MAX_FILE_SIZE_BYTES) {
				const ext = path.extname(fullPath).toLowerCase();
				if (SOURCE_EXTENSIONS.has(ext)) {
					files.push(fullPath);
				}
			}
		}
	}

	walk(dir);
	return files;
}

// ============ Tree-sitter Extraction ============

/**
 * Extract symbols, imports, and call edges using Tree-sitter AST parsing.
 */
async function extractWithAST(
	filePath: string,
	content: string,
	languageId: string,
): Promise<{
	symbols: SymbolDef[];
	imports: ImportDef[];
	callEdges: CallEdge[];
}> {
	const symbols: SymbolDef[] = [];
	const imports: ImportDef[] = [];
	const callEdges: CallEdge[] = [];

	try {
		const parser = await getParserForFile(filePath);
		if (!parser) {
			return { symbols, imports, callEdges };
		}

		const tree = parser.parse(content);
		if (!tree) {
			return { symbols, imports, callEdges };
		}

		try {
			const root = tree.rootNode;
			const lines = content.split('\n');

			// Walk the tree to extract declarations, imports, and calls
			walkNode(
				root as unknown as TSNode,
				lines,
				languageId,
				symbols,
				imports,
				callEdges,
			);
		} finally {
			tree.delete();
		}
	} catch {
		// Graceful degradation on parse failure
	}

	return { symbols, imports, callEdges };
}

function walkNode(
	node: TSNode,
	lines: string[],
	languageId: string,
	symbols: SymbolDef[],
	imports: ImportDef[],
	callEdges: CallEdge[],
): void {
	const nodeType = node.type;

	// Extract declarations based on node type
	if (
		nodeType === 'function_declaration' ||
		nodeType === 'function_definition' ||
		nodeType === 'function_item'
	) {
		const nameNode = node.childForFieldName('name');
		if (nameNode) {
			const line = node.startPosition.row + 1;
			const sig = lines[line - 1]?.trim().substring(0, 200) || '';
			symbols.push({
				name: nameNode.text,
				kind: 'function',
				exported: isExported(node),
				signature: sig,
				line,
			});
		}
	} else if (
		nodeType === 'class_declaration' ||
		nodeType === 'class_definition' ||
		nodeType === 'struct_item' ||
		nodeType === 'impl_item'
	) {
		const nameNode = node.childForFieldName('name');
		if (nameNode) {
			const line = node.startPosition.row + 1;
			symbols.push({
				name: nameNode.text,
				kind: 'class',
				exported: isExported(node),
				signature: lines[line - 1]?.trim().substring(0, 200) || '',
				line,
			});
		}
	} else if (
		nodeType === 'interface_declaration' ||
		nodeType === 'type_alias_declaration'
	) {
		const nameNode = node.childForFieldName('name');
		if (nameNode) {
			const line = node.startPosition.row + 1;
			symbols.push({
				name: nameNode.text,
				kind: nodeType === 'interface_declaration' ? 'interface' : 'type',
				exported: isExported(node),
				signature: lines[line - 1]?.trim().substring(0, 200) || '',
				line,
			});
		}
	} else if (
		nodeType === 'method_definition' ||
		nodeType === 'method_declaration' ||
		nodeType === 'function_signature' ||
		nodeType === 'public_field_definition'
	) {
		const nameNode = node.childForFieldName('name');
		if (nameNode) {
			const line = node.startPosition.row + 1;
			symbols.push({
				name: nameNode.text,
				kind: 'method',
				exported: true,
				signature: lines[line - 1]?.trim().substring(0, 200) || '',
				line,
			});
		}
	}
	// Extract imports
	else if (
		nodeType === 'import_statement' ||
		nodeType === 'import_declaration' ||
		nodeType === 'use_declaration' ||
		nodeType === 'require_statement' ||
		nodeType === 'import_from_statement'
	) {
		const imp = parseImportNode(node, lines);
		if (imp) imports.push(imp);
	}
	// Extract call expressions
	else if (nodeType === 'call_expression') {
		const funcNode = node.childForFieldName('function');
		if (funcNode) {
			const line = node.startPosition.row + 1;
			callEdges.push({
				from: '<anonymous>',
				to: funcNode.text,
				line,
			});
		}
	}

	// Recurse into children
	for (let i = 0; i < node.childCount; i++) {
		const child = node.child(i);
		if (child) {
			walkNode(child, lines, languageId, symbols, imports, callEdges);
		}
	}
}

// Re-export TSNode for internal use (avoid redefining tree-sitter types)

function isExported(node: TSNode): boolean {
	let current: TSNode | null = node;
	while (current) {
		const t = current.type;
		if (
			t === 'export_statement' ||
			t === 'export_default_declaration' ||
			t === 'export_clause'
		)
			return true;
		current = current.parent;
	}
	const parent = node.parent;
	if (parent && parent.type === 'export_statement') return true;
	return false;
}

function parseImportNode(node: TSNode, _lines: string[]): ImportDef | null {
	const text = node.text;
	const line = node.startPosition.row + 1;

	// TS/JS: import { a, b } from 'source' or import x from 'source'
	const esModuleMatch = text.match(
		/import\s+(?:\{([^}]*)\}|(\w+)\s*,\s*\{([^}]*)\}|(\w+)|\*\s+as\s+(\w+))\s+from\s+['"`]([^'"`]+)['"`]/,
	);
	if (esModuleMatch) {
		const namedSymbols = esModuleMatch[1] || esModuleMatch[3] || '';
		const defaultSymbol = esModuleMatch[2] || esModuleMatch[4] || '';
		const namespaceSymbol = esModuleMatch[5] || '';
		const source = esModuleMatch[6];
		const symbols: string[] = [];
		if (defaultSymbol) symbols.push(defaultSymbol);
		if (namespaceSymbol) symbols.push(namespaceSymbol);
		if (namedSymbols) {
			for (const s of namedSymbols.split(',')) {
				const trimmed = s.trim();
				if (trimmed) {
					// Handle "foo as bar" — take the original name
					const parts = trimmed.split(/\s+as\s+/i);
					symbols.push(parts[0].trim());
				}
			}
		}
		return { source, symbols, line };
	}

	// Side-effect import: import 'source'
	const sideEffectMatch = text.match(/^import\s+['"`]([^'"`]+)['"`]/);
	if (sideEffectMatch) {
		return { source: sideEffectMatch[1], symbols: [], line };
	}

	// Python: from source import a, b
	const pythonFromMatch = text.match(/from\s+([^\s]+)\s+import\s+(.+)/);
	if (pythonFromMatch) {
		const source = pythonFromMatch[1];
		const symbols = pythonFromMatch[2]
			.split(',')
			.map((s) => s.trim().split(/\s+as\s+/i)[0])
			.filter(Boolean);
		return { source, symbols, line };
	}

	// Python: import source
	const pythonImportMatch = text.match(/^import\s+([^\s]+)/);
	if (pythonImportMatch) {
		return {
			source: pythonImportMatch[1],
			symbols: [pythonImportMatch[1]],
			line,
		};
	}

	// Go: import "source" or import ( "source" )
	const goMatch = text.match(/import\s+(?:\([^)]*\)\s*|["'`])([^"'`\s]+)/);
	if (goMatch) {
		return { source: goMatch[1], symbols: [], line };
	}

	// Rust: use source;
	const rustMatch = text.match(/use\s+([^;]+)/);
	if (rustMatch) {
		const source = rustMatch[1].trim();
		const lastSegment = source.split('::').pop() || source;
		return { source, symbols: [lastSegment], line };
	}

	// C/C++ #include
	const includeMatch = text.match(/#include\s+[<"]([^>"]+)[>"]/);
	if (includeMatch) {
		return { source: includeMatch[1], symbols: [], line };
	}

	// require('source')
	const requireMatch = text.match(/require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/);
	if (requireMatch) {
		// Try to extract the variable name from surrounding context
		const symbols: string[] = [];
		const assignMatch = node.parent?.text?.match(
			/(?:const|let|var)\s+(\w+)\s*=\s*require/,
		);
		if (assignMatch) symbols.push(assignMatch[1]);
		return { source: requireMatch[1], symbols, line };
	}

	return null;
}

// ============ Regex Fallback Extraction ============

/**
 * Regex-based extraction for languages without grammar support.
 * Reuses patterns from symbols.ts.
 */
function extractWithRegex(
	filePath: string,
	content: string,
): { symbols: SymbolDef[]; imports: ImportDef[]; callEdges: CallEdge[] } {
	const ext = path.extname(filePath).toLowerCase();
	const lines = content.split('\n');
	const symbols: SymbolDef[] = [];
	const imports: ImportDef[] = [];

	if (
		ext === '.ts' ||
		ext === '.tsx' ||
		ext === '.js' ||
		ext === '.jsx' ||
		ext === '.mjs' ||
		ext === '.cjs'
	) {
		extractTSRegex(lines, symbols, imports);
	} else if (ext === '.py') {
		extractPythonRegex(lines, symbols, imports);
	} else {
		// Generic import extraction
		extractGenericImports(lines, imports);
	}

	return { symbols, imports, callEdges: [] };
}

function extractTSRegex(
	lines: string[],
	symbols: SymbolDef[],
	imports: ImportDef[],
): void {
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const lineNum = i + 1;

		// Import extraction
		const importMatch = line.match(
			/import\s+(?:\{([^}]*)\}|(\w+)\s*,\s*\{([^}]*)\}|(\w+)|\*\s+as\s+(\w+))\s+from\s+['"`]([^'"`]+)['"`]/,
		);
		if (importMatch) {
			const namedSymbols = importMatch[1] || importMatch[3] || '';
			const defaultSymbol = importMatch[2] || importMatch[4] || '';
			const namespaceSymbol = importMatch[5] || '';
			const source = importMatch[6];
			const symbols: string[] = [];
			if (defaultSymbol) symbols.push(defaultSymbol);
			if (namespaceSymbol) symbols.push(namespaceSymbol);
			if (namedSymbols) {
				for (const s of namedSymbols.split(',')) {
					const trimmed = s.trim();
					if (trimmed) {
						const parts = trimmed.split(/\s+as\s+/i);
						symbols.push(parts[0].trim());
					}
				}
			}
			imports.push({ source, symbols, line: lineNum });
			continue;
		}

		// Side-effect import
		const sideEffectMatch = line.match(/^import\s+['"`]([^'"`]+)['"`]/);
		if (sideEffectMatch) {
			imports.push({ source: sideEffectMatch[1], symbols: [], line: lineNum });
			continue;
		}

		// Require
		const requireMatch = line.match(
			/(?:const|let|var)\s+(\w+)\s*=\s*require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/,
		);
		if (requireMatch) {
			imports.push({
				source: requireMatch[2],
				symbols: [requireMatch[1]],
				line: lineNum,
			});
			continue;
		}

		// Export function
		const fnMatch = line.match(
			/^export\s+(?:async\s+)?function\s+(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)/,
		);
		if (fnMatch) {
			symbols.push({
				name: fnMatch[1],
				kind: 'function',
				exported: true,
				signature: `function ${fnMatch[1]}(${fnMatch[2].trim()})`,
				line: lineNum,
			});
			continue;
		}

		// Export class
		const classMatch = line.match(/^export\s+(?:abstract\s+)?class\s+(\w+)/);
		if (classMatch) {
			symbols.push({
				name: classMatch[1],
				kind: 'class',
				exported: true,
				signature: `class ${classMatch[1]}`,
				line: lineNum,
			});
			continue;
		}

		// Export interface
		const ifaceMatch = line.match(/^export\s+interface\s+(\w+)/);
		if (ifaceMatch) {
			symbols.push({
				name: ifaceMatch[1],
				kind: 'interface',
				exported: true,
				signature: `interface ${ifaceMatch[1]}`,
				line: lineNum,
			});
			continue;
		}

		// Export type
		const typeMatch = line.match(/^export\s+type\s+(\w+)/);
		if (typeMatch) {
			symbols.push({
				name: typeMatch[1],
				kind: 'type',
				exported: true,
				signature: `type ${typeMatch[1]}`,
				line: lineNum,
			});
			continue;
		}

		// Export const (possibly arrow function)
		const constMatch = line.match(/^export\s+const\s+(\w+)/);
		if (constMatch) {
			const restOfLine = line.substring(line.indexOf('=') + 1).trim();
			const isArrow =
				restOfLine.startsWith('(') ||
				restOfLine.startsWith('async (') ||
				/^\w+\s*=>/.test(restOfLine);
			symbols.push({
				name: constMatch[1],
				kind: isArrow ? 'function' : 'constant',
				exported: true,
				signature: line.trim().substring(0, 200),
				line: lineNum,
			});
		}
	}
}

function extractPythonRegex(
	lines: string[],
	symbols: SymbolDef[],
	imports: ImportDef[],
): void {
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const lineNum = i + 1;

		if (line.startsWith(' ') || line.startsWith('\t')) continue;

		// From import
		const fromImportMatch = line.match(/from\s+([^\s]+)\s+import\s+(.+)/);
		if (fromImportMatch) {
			const source = fromImportMatch[1];
			const importedSymbols = fromImportMatch[2]
				.split(',')
				.map((s) => s.trim().split(/\s+as\s+/i)[0])
				.filter(Boolean);
			imports.push({ source, symbols: importedSymbols, line: lineNum });
			continue;
		}

		// Plain import
		const importMatch = line.match(/^import\s+([^\s]+)/);
		if (importMatch) {
			imports.push({
				source: importMatch[1],
				symbols: [importMatch[1]],
				line: lineNum,
			});
			continue;
		}

		// Function
		const fnMatch = line.match(/^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/);
		if (fnMatch) {
			symbols.push({
				name: fnMatch[1],
				kind: 'function',
				exported: !fnMatch[1].startsWith('_'),
				signature: `def ${fnMatch[1]}(${fnMatch[2].trim()})`,
				line: lineNum,
			});
			continue;
		}

		// Class
		const classMatch = line.match(/^class\s+(\w+)/);
		if (classMatch) {
			symbols.push({
				name: classMatch[1],
				kind: 'class',
				exported: !classMatch[1].startsWith('_'),
				signature: `class ${classMatch[1]}`,
				line: lineNum,
			});
		}
	}
}

function extractGenericImports(lines: string[], imports: ImportDef[]): void {
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const lineNum = i + 1;

		// C/C++ include
		const includeMatch = line.match(/#include\s+[<"]([^>"]+)[>"]/);
		if (includeMatch) {
			imports.push({
				source: includeMatch[1],
				symbols: [],
				line: lineNum,
			});
			continue;
		}

		// Go import
		const goMatch = line.match(/import\s+"([^"]+)"/);
		if (goMatch) {
			imports.push({
				source: goMatch[1],
				symbols: [],
				line: lineNum,
			});
			continue;
		}

		// Java/Kotlin import
		const javaMatch = line.match(/import\s+([\w.]+)/);
		if (javaMatch) {
			imports.push({
				source: javaMatch[1],
				symbols: [],
				line: lineNum,
			});
			continue;
		}

		// Rust use
		const rustMatch = line.match(/use\s+([^;]+)/);
		if (rustMatch) {
			imports.push({
				source: rustMatch[1].trim(),
				symbols: [],
				line: lineNum,
			});
		}
	}
}

// ============ Path Resolution ============

/**
 * Resolve a relative import source path to an actual file on disk.
 */
function resolveImportPath(
	sourcePath: string,
	fromFile: string,
	rootDir: string,
): string | null {
	// Skip non-relative imports (node_modules, bare specifiers)
	if (!sourcePath.startsWith('.')) return null;

	try {
		const fromDir = path.dirname(fromFile);
		const resolved = path.resolve(fromDir, sourcePath);

		// Try exact path
		try {
			const stat = fs.statSync(resolved);
			if (stat.isFile()) return resolved;
		} catch {
			// Continue to extensions
		}

		// Try with extensions
		const extensions = [
			'.ts',
			'.tsx',
			'.js',
			'.jsx',
			'.mjs',
			'.cjs',
			'.py',
			'.go',
			'.rs',
			'/index.ts',
			'/index.js',
		];
		for (const ext of extensions) {
			try {
				const stat = fs.statSync(resolved + ext);
				if (stat.isFile()) return resolved + ext;
			} catch {
				// Continue
			}
		}
	} catch {
		// Resolution failed
	}

	return null;
}

// ============ Core Functions ============

/**
 * Build a repo map for the given directory.
 * Walks the source tree, extracts symbols/imports/call-edges per file,
 * calculates importance scores, and optionally writes to .swarm/repo-map.json.
 */
export async function buildRepoMap(directory: string): Promise<RepoMap> {
	const resolvedDir = path.resolve(directory);

	// Check cache
	if (
		cachedMap &&
		cachedRootDir === resolvedDir &&
		Date.now() - cachedTimestamp < CACHE_STALENESS_MS
	) {
		return cachedMap;
	}

	// Find all source files
	const sourceFiles = findSourceFiles(resolvedDir);
	const files: Record<string, RepoMapEntry> = {};
	const languageCounts: Record<string, number> = {};
	let totalSymbols = 0;
	let totalEdges = 0;

	// Build import graph for importance scoring
	// Maps resolved target path -> array of file paths that import it
	const inDegreeMap = new Map<string, number>();

	// Phase 1: Parse all files and collect import data
	const fileImportSources = new Map<string, string[]>(); // file -> [resolvedImportPaths]

	for (const filePath of sourceFiles) {
		const ext = path.extname(filePath).toLowerCase();
		const langDef = getLanguageForExtension(ext);
		const languageId = langDef?.id ?? 'unknown';

		// Read file content
		let content: string;
		try {
			content = fs.readFileSync(filePath, 'utf-8');
		} catch {
			continue;
		}

		// Skip binary files (simple null-byte check on first 8KB)
		const checkSlice = content.substring(0, 8192);
		if (checkSlice.includes('\0')) continue;

		// Extract symbols, imports, call edges
		let extracted: {
			symbols: SymbolDef[];
			imports: ImportDef[];
			callEdges: CallEdge[];
		};

		let grammarAvail = false;
		if (langDef) {
			try {
				grammarAvail = await isGrammarAvailable(langDef.id);
			} catch {
				grammarAvail = false;
			}
		}

		if (grammarAvail) {
			extracted = await extractWithAST(filePath, content, languageId);
		} else {
			extracted = extractWithRegex(filePath, content);
		}

		const relPath = path.relative(resolvedDir, filePath).replace(/\\/g, '/');

		// Resolve import sources to actual files
		const resolvedImports: string[] = [];
		for (const imp of extracted.imports) {
			const resolved = resolveImportPath(imp.source, filePath, resolvedDir);
			if (resolved) {
				resolvedImports.push(resolved);
			}
		}

		fileImportSources.set(filePath, resolvedImports);

		// Accumulate in-degree counts
		for (const resolved of resolvedImports) {
			inDegreeMap.set(resolved, (inDegreeMap.get(resolved) || 0) + 1);
		}

		// Accumulate stats
		languageCounts[languageId] = (languageCounts[languageId] || 0) + 1;
		totalSymbols += extracted.symbols.length;
		totalEdges += extracted.callEdges.length;

		files[relPath] = {
			filePath: relPath,
			language: languageId,
			exports: extracted.symbols,
			imports: extracted.imports,
			callEdges: extracted.callEdges,
			importanceScore: 0, // Set in phase 2
		};

		// Token budget check
		if (Object.keys(files).length >= MAX_ENTRIES) break;
	}

	// Phase 2: Calculate importance scores
	for (const [relPath, entry] of Object.entries(files)) {
		const absPath = path.join(resolvedDir, relPath);
		entry.importanceScore = inDegreeMap.get(absPath) || 0;
	}

	// Truncate if over budget, keeping top-K by importanceScore
	let fileEntries = Object.entries(files);
	if (fileEntries.length > MAX_ENTRIES) {
		fileEntries.sort((a, b) => b[1].importanceScore - a[1].importanceScore);
		fileEntries = fileEntries.slice(0, MAX_ENTRIES);
	}

	const finalFiles: Record<string, RepoMapEntry> = {};
	for (const [key, value] of fileEntries) {
		finalFiles[key] = value;
	}

	const repoMap: RepoMap = {
		version: 1,
		generatedAt: new Date().toISOString(),
		rootDir: resolvedDir,
		files: finalFiles,
		stats: {
			totalFiles: Object.keys(finalFiles).length,
			totalSymbols,
			totalEdges,
			languages: languageCounts,
		},
	};

	// Persist to .swarm/repo-map.json
	try {
		const swarmDir = path.join(resolvedDir, '.swarm');
		if (!fs.existsSync(swarmDir)) {
			fs.mkdirSync(swarmDir, { recursive: true });
		}
		fs.writeFileSync(
			path.join(swarmDir, 'repo-map.json'),
			JSON.stringify(repoMap, null, 2),
			'utf-8',
		);
	} catch {
		// Best effort — don't fail the build if we can't persist
	}

	// Update cache
	cachedMap = repoMap;
	cachedRootDir = resolvedDir;
	cachedTimestamp = Date.now();

	return repoMap;
}

/**
 * Get localization context for a specific target file.
 */
export async function getLocalizationContext(
	map: RepoMap,
	targetFile: string,
	directory: string,
): Promise<LocalizationContext> {
	const resolvedDir = path.resolve(directory);
	const normalizedTarget = path
		.resolve(resolvedDir, targetFile)
		.replace(/\\/g, '/');

	// Make sure targetFile matches the map key format
	const relTarget = path
		.relative(resolvedDir, normalizedTarget)
		.replace(/\\/g, '/');

	const importedBy: string[] = [];
	const exportsUsedExternally: string[] = [];
	const exportNames = new Set<string>();

	// Collect all exported names from the target file
	const targetEntry = map.files[relTarget];
	if (targetEntry) {
		for (const sym of targetEntry.exports) {
			if (sym.exported) exportNames.add(sym.name);
		}
	}

	// Scan all other files to find who imports the target
	for (const [filePath, entry] of Object.entries(map.files)) {
		if (filePath === relTarget) continue;

		for (const imp of entry.imports) {
			const resolved = resolveImportPath(
				imp.source,
				path.join(resolvedDir, filePath),
				resolvedDir,
			);
			if (resolved) {
				const relResolved = path
					.relative(resolvedDir, resolved)
					.replace(/\\/g, '/');
				if (relResolved === relTarget) {
					importedBy.push(filePath);
					// Check which symbols from the import match target exports
					for (const sym of imp.symbols) {
						if (exportNames.has(sym)) {
							exportsUsedExternally.push(sym);
						}
					}
				}
			}
		}
	}

	// Deduplicate
	const uniqueImportedBy = [...new Set(importedBy)];
	const uniqueExportsUsed = [...new Set(exportsUsedExternally)];

	// Blast radius: BFS 2 levels out
	const blastRadius = getBlastRadius(map, [relTarget], 2);

	// Parallel patterns: files with similar import/export patterns
	const parallelPatterns = findParallelPatterns(map, relTarget, resolvedDir);

	return {
		targetFile: relTarget,
		importedBy: uniqueImportedBy,
		exportsUsedExternally: uniqueExportsUsed,
		blastRadius,
		parallelPatterns,
	};
}

/**
 * BFS from given files through the import graph.
 * Returns deduplicated list of affected files.
 */
export function getBlastRadius(
	map: RepoMap,
	files: string[],
	maxDepth: number = 2,
): string[] {
	const visited = new Set<string>();
	const queue: Array<{ file: string; depth: number }> = [];

	// Build reverse dependency index: target -> [files that import it]
	// O(n) upfront cost avoids O(n^2) per BFS step
	const reverseDeps = new Map<string, string[]>();
	for (const [filePath, entry] of Object.entries(map.files)) {
		for (const imp of entry.imports) {
			const candidates = findMapKeyForImport(map, imp.source, filePath);
			for (const candidate of candidates) {
				const existing = reverseDeps.get(candidate);
				if (existing) {
					existing.push(filePath);
				} else {
					reverseDeps.set(candidate, [filePath]);
				}
			}
		}
	}

	for (const f of files) {
		if (map.files[f]) {
			queue.push({ file: f, depth: 0 });
			visited.add(f);
		}
	}

	const result: string[] = [];

	while (queue.length > 0) {
		const { file, depth } = queue.shift()!;
		result.push(file);

		if (depth >= maxDepth) continue;

		const entry = map.files[file];
		if (!entry) continue;

		// Follow imports outward (files this file depends on)
		for (const imp of entry.imports) {
			const candidates = findMapKeyForImport(map, imp.source, file);
			for (const candidate of candidates) {
				if (!visited.has(candidate)) {
					visited.add(candidate);
					queue.push({ file: candidate, depth: depth + 1 });
				}
			}
		}

		// Follow reverse dependencies using pre-built index (O(1) lookup)
		const dependents = reverseDeps.get(file);
		if (dependents) {
			for (const dep of dependents) {
				if (!visited.has(dep)) {
					visited.add(dep);
					queue.push({ file: dep, depth: depth + 1 });
				}
			}
		}
	}

	return result;
}

/**
 * Find map keys that correspond to an import source path.
 */
function findMapKeyForImport(
	map: RepoMap,
	source: string,
	fromFile: string,
): string[] {
	if (!source.startsWith('.')) return [];

	// Try direct relative resolution
	const keys: string[] = [];
	const fromDir = path.dirname(fromFile);

	// Try the source as-is relative to the fromFile's directory
	const possiblePaths = [
		source,
		source + '.ts',
		source + '.tsx',
		source + '.js',
		source + '.jsx',
		source + '/index.ts',
		source + '/index.js',
	];

	for (const p of possiblePaths) {
		const resolved = path.join(fromDir, p).replace(/\\/g, '/');
		if (map.files[resolved]) {
			keys.push(resolved);
		}
	}

	// Also try matching just the basename
	const sourceBasename = path.basename(source, path.extname(source));
	for (const mapKey of Object.keys(map.files)) {
		const keyBasename = path.basename(mapKey, path.extname(mapKey));
		const keyDir = path.dirname(mapKey);
		if (
			keyBasename === sourceBasename &&
			(fromDir === keyDir || keyDir.endsWith(path.dirname(source)))
		) {
			if (!keys.includes(mapKey)) {
				keys.push(mapKey);
			}
		}
	}

	return keys;
}

/**
 * Find files with similar import/export patterns to the target file.
 * Returns files that share >= 50% of imports or exports.
 */
function findParallelPatterns(
	map: RepoMap,
	targetFile: string,
	_directory: string,
): string[] {
	const targetEntry = map.files[targetFile];
	if (!targetEntry) return [];

	const targetImportSources = new Set(
		targetEntry.imports.map((imp) => imp.source),
	);
	const targetExportNames = new Set(
		targetEntry.exports.filter((s) => s.exported).map((s) => s.name),
	);
	const targetKinds = new Set(targetEntry.exports.map((s) => s.kind));

	const parallels: Array<{ file: string; score: number }> = [];

	for (const [filePath, entry] of Object.entries(map.files)) {
		if (filePath === targetFile) continue;

		let score = 0;

		// Similar imports
		const entryImportSources = new Set(entry.imports.map((imp) => imp.source));
		const commonImports = [...targetImportSources].filter((s) =>
			entryImportSources.has(s),
		).length;
		const importOverlap =
			targetImportSources.size > 0
				? commonImports / targetImportSources.size
				: 0;
		score += importOverlap;

		// Similar exports (by kind)
		const entryKinds = new Set(entry.exports.map((s) => s.kind));
		const commonKinds = [...targetKinds].filter((k) =>
			entryKinds.has(k),
		).length;
		const kindOverlap =
			targetKinds.size > 0 ? commonKinds / targetKinds.size : 0;
		score += kindOverlap;

		// Same language bonus
		if (entry.language === targetEntry.language) score += 0.3;

		// Same directory bonus
		if (path.dirname(filePath) === path.dirname(targetFile)) score += 0.2;

		if (score >= 1.0) {
			parallels.push({ file: filePath, score });
		}
	}

	// Sort by score descending, return top 10
	parallels.sort((a, b) => b.score - a.score);
	return parallels.slice(0, 10).map((p) => p.file);
}

// ============ Tool Definition ============

export const repo_map: ReturnType<typeof createSwarmTool> = createSwarmTool({
	description:
		'Build a structured map of the repository including file exports, imports, call edges, and importance scores. ' +
		'Supports three modes: "build" (full scan), "localize" (localization context for a file), and "blast-radius" (BFS from files through import graph). ' +
		'Results are cached and written to .swarm/repo-map.json.',
	args: {
		directory: tool.schema.string().describe('Project root directory to scan'),
		targetFile: tool.schema
			.string()
			.optional()
			.describe(
				'Target file for localization context (required when mode is "localize")',
			),
		mode: tool.schema
			.string()
			.default('build')
			.describe(
				'Operation mode: "build" (full scan), "localize" (file context), or "blast-radius" (dependency graph)',
			),
		files: tool.schema
			.array(tool.schema.string())
			.optional()
			.describe(
				'List of files for blast-radius mode (relative or absolute paths)',
			),
		maxDepth: tool.schema
			.number()
			.optional()
			.default(2)
			.describe('BFS depth for blast-radius mode (default: 2)'),
	},
	async execute(
		args: unknown,
		directory: string,
		_ctx?: ToolContext,
	): Promise<string> {
		// Safe args extraction
		let dir: string | undefined;
		let targetFile: string | undefined;
		let mode: string | undefined;
		let files: string[] | undefined;
		let maxDepth: number | undefined;
		try {
			if (args && typeof args === 'object') {
				const obj = args as Record<string, unknown>;
				dir = typeof obj.directory === 'string' ? obj.directory : undefined;
				targetFile =
					typeof obj.targetFile === 'string' ? obj.targetFile : undefined;
				mode = typeof obj.mode === 'string' ? obj.mode : 'build';
				files = Array.isArray(obj.files)
					? obj.files.map((f) => String(f))
					: undefined;
				maxDepth = typeof obj.maxDepth === 'number' ? obj.maxDepth : undefined;
			}
		} catch {
			// Malicious getter
		}

		if (!dir) {
			return JSON.stringify(
				{
					success: false,
					error: 'directory is required',
				},
				null,
				2,
			);
		}

		const dirError = validateDirectory(dir);
		if (dirError) {
			return JSON.stringify(
				{
					success: false,
					error: dirError,
				},
				null,
				2,
			);
		}

		// Validate targetFile if provided
		if (targetFile) {
			if (
				containsControlChars(targetFile) ||
				containsPathTraversal(targetFile)
			) {
				return JSON.stringify(
					{
						success: false,
						error: 'targetFile contains invalid characters',
					},
					null,
					2,
				);
			}
			if (containsWindowsAttacks(targetFile)) {
				return JSON.stringify(
					{
						success: false,
						error: 'targetFile contains invalid Windows sequence',
					},
					null,
					2,
				);
			}
		}

		const resolvedDir = path.resolve(dir);

		// Verify directory exists
		try {
			const stat = fs.statSync(resolvedDir);
			if (!stat.isDirectory()) {
				return JSON.stringify(
					{
						success: false,
						error: 'path is not a directory',
					},
					null,
					2,
				);
			}
		} catch {
			return JSON.stringify(
				{
					success: false,
					error: 'directory not found',
				},
				null,
				2,
			);
		}

		try {
			// Build or retrieve the map
			const map = await buildRepoMap(resolvedDir);

			switch (mode) {
				case 'localize': {
					if (!targetFile) {
						return JSON.stringify(
							{
								success: false,
								error: 'targetFile is required for localize mode',
							},
							null,
							2,
						);
					}

					// Resolve targetFile against directory
					const resolvedTarget = path
						.resolve(resolvedDir, targetFile)
						.replace(/\\/g, '/');
					const relTarget = path
						.relative(resolvedDir, resolvedTarget)
						.replace(/\\/g, '/');

					if (!map.files[relTarget]) {
						return JSON.stringify(
							{
								success: false,
								error: `file not found in repo map: ${relTarget}`,
								suggestion:
									'Run mode "build" first, then retry with the exact relative path',
							},
							null,
							2,
						);
					}

					const context = await getLocalizationContext(
						map,
						relTarget,
						resolvedDir,
					);
					return JSON.stringify(
						{
							success: true,
							mode: 'localize',
							context,
						},
						null,
						2,
					);
				}

				case 'blast-radius': {
					if (!files || files.length === 0) {
						return JSON.stringify(
							{
								success: false,
								error: 'files array is required for blast-radius mode',
							},
							null,
							2,
						);
					}

					// Resolve file paths
					const resolvedFiles = files.map((f) => {
						const resolved = path.resolve(resolvedDir, f);
						return path.relative(resolvedDir, resolved).replace(/\\/g, '/');
					});

					const depth =
						typeof maxDepth === 'number' && maxDepth > 0 ? maxDepth : 2;
					const affected = getBlastRadius(map, resolvedFiles, depth);

					return JSON.stringify(
						{
							success: true,
							mode: 'blast-radius',
							maxDepth: depth,
							seedFiles: resolvedFiles,
							affectedFiles: affected,
							totalAffected: affected.length,
						},
						null,
						2,
					);
				}

				case 'build':
				default: {
					return JSON.stringify(
						{
							success: true,
							mode: 'build',
							stats: map.stats,
							fileCount: Object.keys(map.files).length,
							topFiles: Object.values(map.files)
								.sort((a, b) => b.importanceScore - a.importanceScore)
								.slice(0, 50)
								.map((f) => ({
									filePath: f.filePath,
									language: f.language,
									exports: f.exports.length,
									imports: f.imports.length,
									importanceScore: f.importanceScore,
								})),
						},
						null,
						2,
					);
				}
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return JSON.stringify(
				{
					success: false,
					error: `repo-map failed: ${message}`,
				},
				null,
				2,
			);
		}
	},
});
