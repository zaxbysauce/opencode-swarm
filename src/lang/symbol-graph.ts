import type { Language, Node, QueryMatch, Tree } from 'web-tree-sitter';
import {
	collectCommonJsExports,
	collectPythonAllNames,
	getSymbolVisibilityInfo,
	type SymbolVisibilityInfo,
} from './symbol-visibility';

/** Lazy cache for the Query constructor — avoids loading web-tree-sitter WASM at module-init time. */
let _QueryCtor:
	| null
	| (new (
			lang: Language,
			pattern: string,
	  ) => {
			matches: (node: Node) => QueryMatch[];
	  }) = null;

export interface FileSymbolFacts {
	defs: Array<{
		name: string;
		kind:
			| 'function'
			| 'class'
			| 'const'
			| 'type'
			| 'interface'
			| 'enum'
			| 'method';
		exported: boolean;
		visibilityInfo?: SymbolVisibilityInfo;
		startLine: number;
		endLine: number;
	}>;
	imports: Array<{
		specifier: string;
		importType: 'commonjs' | 'named' | 'namespace' | 'default';
		bindings: Array<{ imported: string; local: string }>;
	}>;
	refs: Array<{
		identifier: string;
		line: number;
		enclosingDecl: string | null;
	}>;
}

/**
 * Timeout for symbol-extraction operations. Mirrors AST_TIMEOUT_MS in ast-diff.ts.
 * Wraps BOTH grammar load (WASM) AND parser.parse() in a single race.
 */
const AST_TIMEOUT_MS = 500;

/**
 * Per-grammar query sets. Task 1.1 defines only 'typescript' as the exemplar;
 * additional grammars are added in task 1.2.
 */
const QUERIES: Record<
	string,
	{ defs: string; imports: string; refs: string; exports: string }
> = {
	typescript: {
		defs: `
			(function_declaration name: (identifier) @func.name) @func.def
			(generator_function_declaration name: (identifier) @func.name) @func.def
			(class_declaration name: (type_identifier) @class.name) @class.def
			(lexical_declaration
				(variable_declarator name: (identifier) @const.name)
			) @const.def
			(type_alias_declaration name: (type_identifier) @type.name) @type.def
			(interface_declaration name: (type_identifier) @interface.name) @interface.def
			(enum_declaration name: (identifier) @enum.name) @enum.def
			(method_definition name: (property_identifier) @method.name) @method.def
		`,
		imports: `
			(import_statement) @import
			(call_expression
				function: (identifier) @require.name
				arguments: (arguments (string) @require.specifier)
			) @require
		`,
		refs: `
			(identifier) @ref.identifier
		`,
		exports: `
			(export_statement) @export
		`,
	},
	javascript: {
		defs: `
			(function_declaration name: (identifier) @func.name) @func.def
			(generator_function_declaration name: (identifier) @func.name) @func.def
			(class_declaration name: (identifier) @class.name) @class.def
			(lexical_declaration
				(variable_declarator name: (identifier) @const.name)
			) @const.def
		`,
		imports: `
			(import_statement) @import
			(call_expression
				function: (identifier) @require.name
				arguments: (arguments (string) @require.specifier)
			) @require
		`,
		refs: `
			(identifier) @ref.identifier
		`,
		exports: `
			(export_statement) @export
		`,
	},
	tsx: {
		defs: `
			(function_declaration name: (identifier) @func.name) @func.def
			(generator_function_declaration name: (identifier) @func.name) @func.def
			(class_declaration name: (type_identifier) @class.name) @class.def
			(lexical_declaration
				(variable_declarator name: (identifier) @const.name)
			) @const.def
			(type_alias_declaration name: (type_identifier) @type.name) @type.def
			(interface_declaration name: (type_identifier) @interface.name) @interface.def
			(enum_declaration name: (identifier) @enum.name) @enum.def
			(method_definition name: (property_identifier) @method.name) @method.def
		`,
		imports: `
			(import_statement) @import
			(call_expression
				function: (identifier) @require.name
				arguments: (arguments (string) @require.specifier)
			) @require
		`,
		refs: `
			(identifier) @ref.identifier
		`,
		exports: `
			(export_statement) @export
		`,
	},
	python: {
		defs: `
			(function_definition
				(identifier) @func.name
			) @func.def
			(class_definition
				(identifier) @class.name
			) @class.def
		`,
		imports: `
			(import_statement) @import
			(import_from_statement) @import
		`,
		refs: `
			(identifier) @ref.identifier
		`,
		exports: ``,
	},
	rust: {
		defs: `
			(function_item
				(identifier) @func.name
			) @func.def
			(struct_item
				name: (type_identifier) @struct.name
			) @struct.def
			(impl_item type: (type_identifier) @impl.name) @impl.def
		`,
		imports: `
			(use_declaration) @import
		`,
		refs: `
			(identifier) @ref.identifier
		`,
		exports: ``,
	},
	go: {
		defs: `
			(function_declaration name: (identifier) @func.name) @func.def
			(type_declaration (type_spec name: (type_identifier) @type.name)) @type.def
		`,
		imports: `
			(import_declaration) @import
		`,
		refs: `
			(identifier) @ref.identifier
		`,
		exports: ``,
	},
	java: {
		defs: `
			(method_declaration
				(identifier) @func.name
			) @func.def
			(class_declaration
				(identifier) @class.name
			) @class.def
			(interface_declaration
				(identifier) @interface.name
			) @interface.def
		`,
		imports: `
			(import_declaration) @import
		`,
		refs: `
			(identifier) @ref.identifier
			(type_identifier) @ref.identifier
		`,
		exports: ``,
	},
	kotlin: {
		defs: `
			(function_declaration
				(simple_identifier) @func.name
			) @func.def
			(class_declaration
				(type_identifier) @class.name
			) @class.def
			(object_declaration
				(type_identifier) @object.name
			) @object.def
		`,
		imports: `
			(import_header) @import
		`,
		refs: `
			(identifier) @ref.identifier
			(simple_identifier) @ref.identifier
			(type_identifier) @ref.identifier
		`,
		exports: ``,
	},
	csharp: {
		defs: `
			(method_declaration name: (identifier) @func.name) @func.def
			(class_declaration name: (identifier) @class.name) @class.def
			(interface_declaration name: (identifier) @interface.name) @interface.def
			(struct_declaration name: (identifier) @struct.name) @struct.def
		`,
		imports: `
			(using_directive) @import
		`,
		refs: `
			(identifier) @ref.identifier
		`,
		exports: ``,
	},
	cpp: {
		defs: `
			(function_definition
				(function_declarator
					declarator: (identifier) @func.name
				)
			) @func.def
			(class_specifier name: (type_identifier) @class.name) @class.def
			(struct_specifier name: (type_identifier) @struct.name) @struct.def
		`,
		imports: `
			(preproc_include) @import
			(using_declaration) @import
		`,
		refs: `
			(identifier) @ref.identifier
			(namespace_identifier) @ref.identifier
		`,
		exports: ``,
	},
	swift: {
		defs: `
			(function_declaration name: (simple_identifier) @func.name) @func.def
			(class_declaration name: (type_identifier) @class.name) @class.def
			(protocol_declaration name: (type_identifier) @protocol.name) @protocol.def
		`,
		imports: `
			(import_declaration) @import
		`,
		refs: `
			(identifier) @ref.identifier
			(simple_identifier) @ref.identifier
		`,
		exports: ``,
	},
	dart: {
		defs: `
			(function_signature
				name: (identifier) @func.name
			) @func.def
			(class_definition name: (identifier) @class.name) @class.def
		`,
		imports: `
			(library_import) @import
		`,
		refs: `
			(identifier) @ref.identifier
		`,
		exports: `
			(export_directive) @export
		`,
	},
	ruby: {
		defs: `
			(method name: (identifier) @func.name) @func.def
			(class name: (constant) @class.name) @class.def
		`,
		imports: `
			(call
				(identifier) @require.name
				(argument_list (string (string_content) @require.specifier))
			) @require
		`,
		refs: `
			(identifier) @ref.identifier
		`,
		exports: ``,
	},
	php: {
		defs: `
			(function_definition
				name: (name) @func.name
			) @func.def
			(class_declaration name: (name) @class.name) @class.def
			(interface_declaration name: (name) @interface.name) @interface.def
		`,
		imports: `
			(namespace_use_declaration) @import
		`,
		refs: `
			(name) @ref.identifier
		`,
		exports: ``,
	},
};

const CAPTURE_KIND: Record<string, FileSymbolFacts['defs'][0]['kind']> = {
	func: 'function',
	class: 'class',
	const: 'const',
	type: 'type',
	interface: 'interface',
	enum: 'enum',
	method: 'method',
	struct: 'type',
	impl: 'type',
	object: 'class',
	mixin: 'type',
	protocol: 'interface',
};

const DEF_TYPES = new Set([
	'function_declaration',
	'class_declaration',
	'variable_declaration',
	'type_alias_declaration',
	'interface_declaration',
	'enum_declaration',
	'method_definition',
	'function_item',
	'function_signature',
	'class_specifier',
	'struct_specifier',
	'struct_item',
	'struct_declaration',
	'method_declaration',
	'type_declaration',
	'object_declaration',
	'protocol_declaration',
	'mixin_declaration',
	'function_definition',
	'generator_function_declaration',
	'class_definition',
	'lexical_declaration',
	'impl_item',
	'method',
	'class',
]);

const PARAM_TYPES = new Set([
	'formal_parameters',
	'required_parameter',
	'optional_parameter',
	'rest_parameter',
	'array_pattern',
	'object_pattern',
]);

/**
 * Extract symbol, import, and reference facts from a source string using
 * tree-sitter.
 *
 * Fail-open: returns null on grammar-load failure, timeout, or parse error.
 * The 500 ms `AST_TIMEOUT_MS` race bounds the async `loadGrammar` WASM load
 * and races the parse attempt, but cannot hard-interrupt a synchronous
 * `parser.parse()` once it begins (mirrors the `computeASTDiff` pattern in
 * `src/diff/ast-diff.ts`). The primary async risk (WASM grammar load) IS
 * bounded.
 *
 * The parsed tree is always deleted: the inner async IIFE owns tree cleanup
 * via its own `finally` block (deletes the tree after `buildFacts` regardless
 * of whether the outer race rejects on timeout). Tree cleanup is handled
 * solely by that inner `finally`; there is no outer backstop.
 *
 * @param grammarId - Tree-sitter grammar id (e.g. 'typescript')
 * @param source - Source code text
 * @returns FileSymbolFacts, or null on failure
 */
export async function extractFileSymbols(
	grammarId: string,
	source: string,
): Promise<FileSymbolFacts | null> {
	// Use a ref object so the async closure can store the parsed tree for
	// cleanup in the finally block without triggering TypeScript
	// control-flow narrowing to `never` on a captured outer local.
	const treeRef = { value: null as Tree | null };
	let timeoutId: ReturnType<typeof setTimeout> | undefined;

	try {
		const result = await Promise.race([
			(async (): Promise<FileSymbolFacts | null> => {
				// Inner IIFE owns its tree: delete it after buildFacts
				// regardless of whether buildFacts throws or returns null.
				// This prevents a WASM tree leak when the outer race rejects
				// (timeout) — the inner IIFE keeps running after the outer
				// catch, so its own finally is the only reliable cleanup.
				try {
					// Lazy-init the Query constructor on first call (off the module-init path).
					if (!_QueryCtor) {
						const wts = await import('web-tree-sitter');
						_QueryCtor = wts.Query;
					}
					const { loadGrammar: loadGrammarDynamic } = await import(
						'./runtime.js'
					);
					const parser = await loadGrammarDynamic(grammarId);
					treeRef.value = parser.parse(source);
					if (!treeRef.value) return null;

					const qs = QUERIES[grammarId];
					if (!qs) return null;

					return buildFacts(treeRef.value, qs, grammarId);
				} finally {
					if (treeRef.value) {
						treeRef.value.delete();
						treeRef.value = null;
					}
				}
			})(),
			new Promise<never>((_, reject) => {
				timeoutId = setTimeout(
					() => reject(new Error('AST_TIMEOUT')),
					AST_TIMEOUT_MS,
				);
			}),
		]).finally(() => {
			if (timeoutId) clearTimeout(timeoutId);
		});

		return result;
	} catch {
		return null;
	}
}

type TsNode = Tree['rootNode'];

function asTs(node: Tree['rootNode']): TsNode {
	return node as TsNode;
}

function buildFacts(
	tree: Tree,
	qs: { defs: string; imports: string; refs: string; exports: string },
	grammarId: string,
): FileSymbolFacts {
	const root = asTs(tree.rootNode);
	const lang = tree.language;
	if (!lang) return { defs: [], imports: [], refs: [] };

	const defMatches = safeMatches(lang, qs.defs, root);
	const importMatches = safeMatches(lang, qs.imports, root);
	const refMatches = safeMatches(lang, qs.refs, root);
	const exportMatches = safeMatches(lang, qs.exports, root);

	const exportNodes: TsNode[] = [];
	for (const m of exportMatches) {
		const cap = m.captures.find((c) => c.name === 'export');
		if (cap) exportNodes.push(asTs(cap.node));
	}
	const commonJsExports = isEsMGrammar(grammarId)
		? collectCommonJsExports(root.text)
		: new Map();
	const pythonAllNames =
		grammarId === 'python' ? collectPythonAllNames(root.text) : null;

	const defs: FileSymbolFacts['defs'] = [];
	const defNodes: Array<{ node: TsNode; name: string }> = [];
	const defNameKeys = new Set<string>();

	for (const m of defMatches) {
		const defCap = m.captures.find((c) => c.name.endsWith('.def'));
		const nameCaps = m.captures.filter((c) => c.name.endsWith('.name'));
		if (!defCap || nameCaps.length === 0) continue;

		const kindKey = defCap.name.replace(/\.def$/, '');
		const kind = CAPTURE_KIND[kindKey] ?? 'function';
		const originalDefNode = asTs(defCap.node);
		let defNode = originalDefNode;
		const explicitExported = exportNodes.some((en) =>
			isNodeInside(en, defNode),
		);

		// For ESM default exports, normalize the exported name to 'default'
		// so it matches the 'default' sentinel used by parseEsmImport and
		// the sync builder's export naming.
		let isDefaultExport = false;
		if (explicitExported && isEsMGrammar(grammarId)) {
			isDefaultExport = exportNodes.some(
				(en) => isNodeInside(en, defNode) && isDefaultExportStatement(en),
			);
		}

		// Dart: function_body is a sibling of function_signature under program.
		// Extend the def span to include the body so enclosingDecl resolution
		// covers the function body region.
		if (grammarId === 'dart' && defNode.type === 'function_signature') {
			const rawBody = defNode.nextSibling;
			if (rawBody) {
				const bodyNode = asTs(rawBody);
				if (bodyNode.type === 'function_body') {
					defNode = asTs({
						...defNode,
						endIndex: bodyNode.endIndex,
						endPosition: bodyNode.endPosition,
					} as TsNode);
				}
			}
		}

		for (const nc of nameCaps) {
			const nameNode = asTs(nc.node);
			const localName = nameNode.text;
			const commonJsExport = commonJsExports.get(localName);
			const visibilityInfo = getSymbolVisibilityInfo({
				grammarId,
				localName,
				kind,
				defNode: originalDefNode,
				rootNode: root,
				isTopLevel: isTopLevelDef(originalDefNode, root),
				explicitExported,
				commonJsExport,
				pythonAllNames,
			});
			const exportedName = isDefaultExport
				? 'default'
				: (commonJsExport?.exportedName ?? localName);

			defs.push({
				name: exportedName,
				kind,
				exported: visibilityInfo.exported,
				visibilityInfo,
				startLine: defNode.startPosition.row + 1,
				endLine: defNode.endPosition.row + 1,
			});
			defNodes.push({ node: defNode, name: localName });
			defNameKeys.add(nodeKey(nameNode));
		}
	}

	const imports: FileSymbolFacts['imports'] = [];
	for (const m of importMatches) {
		const importCap = m.captures.find((c) => c.name === 'import');
		if (importCap) {
			const rawText = importCap.node.text.trim();
			// Go block import: `import ( "fmt" "os" )` — find the
			// import_spec_list child, then iterate its import_spec children.
			if (grammarId === 'go' && rawText.startsWith('import (')) {
				const importNode = asTs(importCap.node);
				const specListNode = importNode.children.find(
					(c): c is TsNode => c !== null && c.type === 'import_spec_list',
				);
				if (specListNode) {
					for (const spec of asTs(specListNode).children) {
						if (spec && spec.type === 'import_spec') {
							const parsed = parseGoImport(spec.text.trim());
							if (parsed) imports.push(parsed);
						}
					}
				}
			} else {
				const parsed = parseImport(grammarId, rawText);
				if (parsed) imports.push(parsed);
			}
		}
		// Ruby require/require_relative fallback
		if (grammarId === 'ruby') {
			const reqName = m.captures.find((c) => c.name === 'require.name');
			const reqSpec = m.captures.find((c) => c.name === 'require.specifier');
			if (reqName && reqSpec) {
				const fnText = asTs(reqName.node).text;
				if (fnText === 'require' || fnText === 'require_relative') {
					// Pass the full call text (e.g. "require 'json'") so parseRubyRequire
					// can strip the require keyword; fall back to bare specifier.
					const callNode = asTs(reqName.node).parent;
					const rawText = callNode ? callNode.text : asTs(reqSpec.node).text;
					const parsed = parseRubyRequire(rawText);
					if (parsed) imports.push(parsed);
				}
			}
		}
		// CommonJS require() fallback for TS/JS/TSX
		if (isEsMGrammar(grammarId)) {
			const reqName = m.captures.find((c) => c.name === 'require.name');
			const reqSpec = m.captures.find((c) => c.name === 'require.specifier');
			if (reqName && reqSpec) {
				const fnText = asTs(reqName.node).text;
				if (fnText === 'require') {
					const specText = asTs(reqSpec.node).text.replace(/['"]/g, '');
					imports.push({
						specifier: specText,
						importType: 'commonjs',
						bindings: [],
					});
				}
			}
		}
	}

	const topLevelDefs = defNodes
		.filter((d) => isTopLevelDef(d.node, root))
		.map((d) => ({ name: d.name, node: d.node }));

	const refs: FileSymbolFacts['refs'] = [];
	for (const m of refMatches) {
		const cap = m.captures.find((c) => c.name === 'ref.identifier');
		if (!cap) continue;
		const refNode = asTs(cap.node);

		if (defNameKeys.has(nodeKey(refNode))) continue;
		if (hasAncestorOfType(refNode, 'import_statement')) continue;
		if (isInsideImportStatement(refNode)) continue;
		if (hasAncestorOfType(refNode, PARAM_TYPES)) continue;
		if (refNode.text === 'require' && isInsideRequireCall(refNode)) continue;

		refs.push({
			identifier: refNode.text,
			line: refNode.startPosition.row + 1,
			enclosingDecl: findEnclosingDecl(refNode, topLevelDefs),
		});
	}

	return { defs, imports, refs };
}

function safeMatches(
	lang: Language,
	pattern: string,
	root: Tree['rootNode'],
): QueryMatch[] {
	// Fail-open if called before the lazy cache is initialised.
	if (!_QueryCtor) return [];
	try {
		const q = new _QueryCtor(lang, pattern);
		return q.matches(root);
	} catch {
		return [];
	}
}

function parseEsmImport(text: string): FileSymbolFacts['imports'][0] | null {
	const t = text.trim();

	// Strip optional `type` qualifier: "import type { ... }" → "import { ... }"
	// Track whether it was a type-only import (all bindings are type-only).
	const isTypeOnlyImport = /^import\s+type\s/.test(t);
	const withoutTypeQualifier = t.replace(/^import\s+type\s+/, 'import ');

	// Named imports: handles `import { foo }`, `import type { foo }`,
	// and mixed `import { type Foo, bar }` (inline type modifier per binding).
	const named = withoutTypeQualifier.match(
		/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/,
	);
	if (named) {
		// `import type { Foo }` → all bindings are type-only → empty bindings
		if (isTypeOnlyImport) {
			return { specifier: named[2], importType: 'named', bindings: [] };
		}

		const bindings: Array<{ imported: string; local: string }> = [];
		for (const part of named[1].split(',')) {
			const p = part.trim();
			if (!p) continue;
			// Strip inline `type` modifier: "type Foo" → "Foo"
			const stripped = p.replace(/^type\s+/, '');
			// If the entire binding is just `type` keyword (degenerate), skip it
			if (!stripped) continue;
			const alias = stripped.match(/^(\w+)\s+as\s+(\w+)$/);
			if (alias) {
				bindings.push({ imported: alias[1], local: alias[2] });
			} else {
				bindings.push({ imported: stripped, local: stripped });
			}
		}
		return { specifier: named[2], importType: 'named', bindings };
	}

	// Combined ESM imports: `import <Default>, { <named> } from '<spec>'`
	// or `import <Default>, * as <ns> from '<spec>'`.
	// Must be checked before the default-only and namespace-only branches.
	const combined = withoutTypeQualifier.match(
		/^import\s+(\w+)\s*,\s*\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/,
	);
	if (combined) {
		return {
			specifier: combined[3],
			importType: 'named',
			bindings: [
				{ imported: 'default', local: combined[1] },
				{ imported: '*', local: combined[2] },
			],
		};
	}

	const combinedNamed = withoutTypeQualifier.match(
		/^import\s+(\w+)\s*,\s*\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/,
	);
	if (combinedNamed) {
		if (isTypeOnlyImport) {
			return {
				specifier: combinedNamed[3],
				importType: 'named',
				bindings: [],
			};
		}
		const bindings: Array<{ imported: string; local: string }> = [
			{ imported: 'default', local: combinedNamed[1] },
		];
		for (const part of combinedNamed[2].split(',')) {
			const p = part.trim();
			if (!p) continue;
			const stripped = p.replace(/^type\s+/, '');
			if (!stripped) continue;
			const alias = stripped.match(/^(\w+)\s+as\s+(\w+)$/);
			if (alias) {
				bindings.push({ imported: alias[1], local: alias[2] });
			} else {
				bindings.push({ imported: stripped, local: stripped });
			}
		}
		return { specifier: combinedNamed[3], importType: 'named', bindings };
	}

	const ns = t.match(/^import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/);
	if (ns) {
		return {
			specifier: ns[2],
			importType: 'namespace',
			bindings: [{ imported: '*', local: ns[1] }],
		};
	}

	const def = t.match(/^import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/);
	if (def) {
		return {
			specifier: def[2],
			importType: 'default',
			bindings: [{ imported: 'default', local: def[1] }],
		};
	}

	return null;
}

/**
 * Dispatch table: tree-sitter grammar id → language-specific import parser.
 * Each parser receives the raw captured node text and returns a normalized
 * FileSymbolFacts.imports entry, or null if the text does not match.
 */
function parseImport(
	grammarId: string,
	text: string,
): FileSymbolFacts['imports'][0] | null {
	switch (grammarId) {
		case 'python':
			return parsePythonImport(text);
		case 'rust':
			return parseRustUse(text);
		case 'go':
			return parseGoImport(text);
		case 'java':
			return parseJavaImport(text);
		case 'kotlin':
			return parseKotlinImport(text);
		case 'csharp':
			return parseCSharpUsing(text);
		case 'cpp':
			return parseCppInclude(text);
		case 'swift':
			return parseSwiftImport(text);
		case 'dart':
			return parseDartImport(text);
		case 'ruby':
			return parseRubyRequire(text);
		case 'php':
			return parsePhpUse(text);
		case 'typescript':
		case 'tsx':
		case 'javascript':
			return parseEsmImport(text);
		default:
			return null;
	}
}

function parsePythonImport(text: string): FileSymbolFacts['imports'][0] | null {
	const t = text.trim();
	// import foo            → specifier: 'foo',  bindings: []
	// import foo as bar     → specifier: 'foo',  bindings: [{imported:'foo', local:'bar'}]
	// from foo import bar   → specifier: 'foo',  bindings: [{imported:'bar', local:'bar'}]
	// from foo import bar as baz → specifier: 'foo', bindings: [{imported:'bar', local:'baz'}]
	const fullImport = t.match(/^import\s+(.+)$/);
	if (fullImport) {
		const rest = fullImport[1].trim();
		const alias = rest.match(/^(\w+)\s+as\s+(\w+)$/);
		if (alias) {
			return {
				specifier: alias[1],
				importType: 'named',
				bindings: [{ imported: alias[1], local: alias[2] }],
			};
		}
		// bare module import — no bindings to track
		return { specifier: rest, importType: 'namespace', bindings: [] };
	}
	const fromImport = t.match(/^from\s+(\S+)\s+import\s+(.+)$/);
	if (fromImport) {
		const bindings: Array<{ imported: string; local: string }> = [];
		for (const part of fromImport[2].split(',')) {
			const p = part.trim();
			if (!p) continue;
			const alias = p.match(/^(\w+)\s+as\s+(\w+)$/);
			if (alias) {
				bindings.push({ imported: alias[1], local: alias[2] });
			} else {
				bindings.push({ imported: p, local: p });
			}
		}
		return { specifier: fromImport[1], importType: 'named', bindings };
	}
	return null;
}

function parseRustUse(text: string): FileSymbolFacts['imports'][0] | null {
	const t = text.trim();
	// use foo::bar::baz;
	// use foo::bar::baz as alias;
	// use foo::{Bar, Baz};
	const m = t.match(/^use\s+(.+?)\s*as\s+(\w+)\s*;?\s*$/);
	if (m) {
		return {
			specifier: m[1].trim(),
			importType: 'named',
			bindings: [{ imported: m[1].trim(), local: m[2] }],
		};
	}
	const simple = t.match(/^use\s+(.+?)\s*;?\s*$/);
	if (simple) {
		return {
			specifier: simple[1].trim(),
			importType: 'namespace',
			bindings: [],
		};
	}
	return null;
}

function parseGoImport(text: string): FileSymbolFacts['imports'][0] | null {
	const t = text.trim();
	// Block import: `import ( "fmt" "os" )` — return null here; buildFacts
	// detects block imports via the raw text starting with 'import (' and
	// iterates each import_spec child via its own capture walk.
	if (t.startsWith('import (')) return null;

	// Bare aliased spec from a block-import child: `f "fmt"`
	const bareAliased = t.match(/^(\w+)\s+"([^"]+)"$/);
	if (bareAliased) {
		return {
			specifier: bareAliased[2],
			importType: 'named',
			bindings: [{ imported: bareAliased[2], local: bareAliased[1] }],
		};
	}

	// Single-line `import foo "bar"` (aliased)
	const aliased = t.match(/^import\s+(\w+)\s+"([^"]+)"/);
	if (aliased) {
		return {
			specifier: aliased[2],
			importType: 'named',
			bindings: [{ imported: aliased[2], local: aliased[1] }],
		};
	}
	// Single-line `import "bar"` or bare quoted specifier `"bar"` (from a
	// block-import child that buildFacts feeds directly)
	const simple = t.match(/^import\s+"([^"]+)"|^"([^"]+)"$/);
	if (simple) {
		return {
			specifier: simple[1] ?? simple[2],
			importType: 'namespace',
			bindings: [],
		};
	}
	return null;
}

function parseJavaImport(text: string): FileSymbolFacts['imports'][0] | null {
	const t = text.trim();
	// import foo.Bar;
	// import static foo.Bar.baz;
	const m = t.match(/^import\s+(?:static\s+)?([^;\s]+)\s*;?\s*$/);
	if (m) {
		return { specifier: m[1], importType: 'namespace', bindings: [] };
	}
	return null;
}

function parseKotlinImport(text: string): FileSymbolFacts['imports'][0] | null {
	// import foo.Bar
	// import foo.Bar as baz
	// Multiple per import_header — each line is captured
	const t = text.trim();
	const aliased = t.match(/^import\s+([^;\s]+)\s+as\s+(\w+)/);
	if (aliased) {
		return {
			specifier: aliased[1],
			importType: 'named',
			bindings: [{ imported: aliased[1], local: aliased[2] }],
		};
	}
	const simple = t.match(/^import\s+([^;\s]+)/);
	if (simple) {
		return { specifier: simple[1], importType: 'namespace', bindings: [] };
	}
	return null;
}

function parseCSharpUsing(text: string): FileSymbolFacts['imports'][0] | null {
	const t = text.trim();
	// using foo;
	// using foo = foo.Bar;
	// using static foo.Bar;
	const m = t.match(
		/^using\s+(?:static\s+)?([^=;\s]+)\s*(?:=\s*(.+?))?\s*;?\s*$/,
	);
	if (m) {
		const specifier = m[2] ? m[2].trim() : m[1].trim();
		if (m[2]) {
			return {
				specifier,
				importType: 'named',
				bindings: [{ imported: specifier, local: m[1].trim() }],
			};
		}
		return { specifier: m[1].trim(), importType: 'namespace', bindings: [] };
	}
	return null;
}

function parseCppInclude(text: string): FileSymbolFacts['imports'][0] | null {
	const t = text.trim();
	// #include <foo>
	// #include "foo"
	// using foo::bar;
	const include = t.match(/^#\s*include\s+[<"]([^>"]+)[>"]/);
	if (include) {
		return { specifier: include[1], importType: 'namespace', bindings: [] };
	}
	const using = t.match(/^using\s+(?:namespace\s+)?(.+?)\s*;?\s*$/);
	if (using) {
		return {
			specifier: using[1].trim(),
			importType: 'namespace',
			bindings: [],
		};
	}
	return null;
}

function parseSwiftImport(text: string): FileSymbolFacts['imports'][0] | null {
	const t = text.trim();
	// import foo
	// import class foo.Bar
	const m = t.match(/^import\s+(?:class\s+)?([^;\s]+)/);
	if (m) {
		return { specifier: m[1], importType: 'namespace', bindings: [] };
	}
	return null;
}

function parseDartImport(text: string): FileSymbolFacts['imports'][0] | null {
	const t = text.trim();
	// import 'foo';
	// import 'foo' as bar;
	// import 'foo' show A, B;
	// import 'foo' hide A;
	const m = t.match(/^import\s+['"]([^'"]+)['"]\s+as\s+(\w+)/);
	if (m) {
		return {
			specifier: m[1],
			importType: 'named',
			bindings: [{ imported: m[1], local: m[2] }],
		};
	}
	const simple = t.match(/^import\s+['"]([^'"]+)['"]/);
	if (simple) {
		return { specifier: simple[1], importType: 'namespace', bindings: [] };
	}
	return null;
}

function parseRubyRequire(text: string): FileSymbolFacts['imports'][0] | null {
	const t = text.trim();
	// Input is the string_content node text (no surrounding quotes).
	// e.g. "json" for require 'json'
	// e.g. "./foo" for require_relative './foo'
	// When the require keyword is included (full call text), strip it.
	const stripped = t
		.replace(/^(?:require(?:_relative)?)\s+['"]?/, '')
		.replace(/['"]$/, '');
	if (!stripped || stripped === t) return null;
	const isRelative = stripped.startsWith('./') || stripped.startsWith('../');
	return {
		specifier: stripped,
		importType: isRelative ? 'default' : 'namespace',
		bindings: [],
	};
}

function parsePhpUse(text: string): FileSymbolFacts['imports'][0] | null {
	const t = text.trim();
	// use foo\Bar;
	// use foo\Bar as Baz;
	// use function foo\baz;
	// use const foo\BAZ;
	const m = t.match(
		/^use\s+(?:(?:function|const)\s+)?([^;\s]+)\s+as\s+(\w+)\s*;?\s*$/i,
	);
	if (m) {
		return {
			specifier: m[1],
			importType: 'named',
			bindings: [{ imported: m[1], local: m[2] }],
		};
	}
	const simple = t.match(
		/^use\s+(?:(?:function|const)\s+)?([^;\s]+)\s*;?\s*$/i,
	);
	if (simple) {
		return { specifier: simple[1], importType: 'namespace', bindings: [] };
	}
	return null;
}

function isTopLevelDef(defNode: TsNode, root: TsNode): boolean {
	let parent: TsNode | null = defNode.parent;
	while (parent && parent !== root) {
		if (DEF_TYPES.has(parent.type)) return false;
		parent = parent.parent;
	}
	return true;
}

function findEnclosingDecl(
	refNode: TsNode,
	topLevelDefs: Array<{ name: string; node: TsNode }>,
): string | null {
	let best: { name: string; node: TsNode } | null = null;
	let bestDist = Infinity;

	for (const def of topLevelDefs) {
		if (isNodeInside(def.node, refNode)) {
			const dist = refNode.startPosition.row - def.node.startPosition.row;
			if (dist < bestDist) {
				bestDist = dist;
				best = def;
			}
		}
	}

	return best?.name ?? '<module>';
}

function isNodeInside(outer: TsNode, inner: TsNode): boolean {
	return (
		inner.startIndex >= outer.startIndex && inner.endIndex <= outer.endIndex
	);
}

function hasAncestorOfType(node: TsNode, types: Set<string> | string): boolean {
	const typeSet = typeof types === 'string' ? new Set([types]) : types;
	let current: TsNode | null = node.parent;
	while (current) {
		if (typeSet.has(current.type)) return true;
		current = current.parent;
	}
	return false;
}

function isInsideRequireCall(node: TsNode): boolean {
	let current: TsNode | null = node.parent;
	while (current) {
		if (current.type === 'call_expression') {
			const fn = current.children.find((c) => c && c.type === 'identifier');
			if (fn && fn.text === 'require') return true;
		}
		if (DEF_TYPES.has(current.type)) return false;
		current = current.parent;
	}
	return false;
}

/**
 * Returns true if the node is nested inside an import/use/using declaration
 * (i.e. the identifier is part of an import statement itself, not a usage).
 * This prevents import-line identifiers (e.g. 'p' in `import X as p`,
 * 'Map' in `use ... as Map`, 'List' in `import java.util.List`) from
 * appearing in the refs list before the body refs.
 */
const IMPORT_ANCESTOR_TYPES = new Set([
	'import_statement',
	'import_from_statement',
	'import_declaration',
	'import_header',
	'use_declaration',
	'using_directive',
	'namespace_use_declaration',
	'library_import', // dart
]);

function isInsideImportStatement(node: TsNode): boolean {
	return hasAncestorOfType(node, IMPORT_ANCESTOR_TYPES);
}

function nodeKey(node: TsNode): string {
	return `${node.startPosition.row},${node.startPosition.column}-${node.endPosition.row},${node.endPosition.column}`;
}

function isDefaultExportStatement(en: TsNode): boolean {
	// Structural check: export_statement has a 'default' keyword child
	if (en.children.some((c) => c !== null && c.type === 'default')) {
		return true;
	}
	// Fallback: text-based check for robustness
	return /^export\s+default\b/.test(en.text);
}

function isEsMGrammar(grammarId: string): boolean {
	return (
		grammarId === 'typescript' ||
		grammarId === 'tsx' ||
		grammarId === 'javascript'
	);
}
