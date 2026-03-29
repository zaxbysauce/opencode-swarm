import { extname } from 'node:path';
import { Query, type QueryMatch, type Tree } from 'web-tree-sitter';
import {
	getLanguageForExtension,
	type LanguageDefinition,
} from '../lang/registry.js';
import { loadGrammar } from '../lang/runtime.js';

export interface ASTChange {
	type: 'added' | 'modified' | 'removed';
	category:
		| 'function'
		| 'class'
		| 'type'
		| 'export'
		| 'import'
		| 'variable'
		| 'other';
	name: string;
	lineStart: number;
	lineEnd: number;
	signature?: string; // For functions: parameters; for types: definition
}

export interface ASTDiffResult {
	filePath: string;
	language: string | null;
	changes: ASTChange[];
	durationMs: number;
	usedAST: boolean;
	error?: string;
}

// Query patterns for different node types
const QUERIES: Record<string, string> = {
	// JavaScript/TypeScript
	javascript: `
    (function_declaration name: (identifier) @func.name) @func.def
    (class_declaration name: (type_identifier) @class.name) @class.def
    (export_statement) @export
    (import_statement) @import
    (type_alias_declaration name: (type_identifier) @type.name) @type.def
  `,
	typescript: `
    (function_declaration name: (identifier) @func.name) @func.def
    (class_declaration name: (type_identifier) @class.name) @class.def
    (export_statement) @export
    (import_statement) @import
    (type_alias_declaration name: (type_identifier) @type.name) @type.def
    (interface_declaration name: (type_identifier) @interface.name) @interface.def
  `,
	// Python
	python: `
    (function_definition name: (identifier) @func.name) @func.def
    (class_definition name: (identifier) @class.name) @class.def
    (import_statement) @import
    (expression_statement (assignment left: (identifier) @var.name)) @var.def
  `,
	// Go
	go: `
    (function_declaration name: (identifier) @func.name) @func.def
    (type_declaration (type_spec name: (type_identifier) @type.name)) @type.def
    (import_declaration) @import
  `,
	// Rust
	rust: `
    (function_item name: (identifier) @func.name) @func.def
    (struct_item name: (type_identifier) @struct.name) @struct.def
    (impl_item type: (type_identifier) @impl.name) @impl.def
    (use_declaration) @import
  `,
};

// Timeout for AST operations (prevent hanging on large files)
const AST_TIMEOUT_MS = 500;

/**
 * Compute AST-level diff between old and new file content
 */
export async function computeASTDiff(
	filePath: string,
	oldContent: string,
	newContent: string,
): Promise<ASTDiffResult> {
	const startTime = Date.now();
	const extension = extname(filePath).toLowerCase();
	const language = getLanguageForExtension(extension);

	// If no language support, fall back to raw diff
	if (!language) {
		return {
			filePath,
			language: null,
			changes: [],
			durationMs: Date.now() - startTime,
			usedAST: false,
		};
	}

	try {
		// Load parser with timeout
		let timeoutId: ReturnType<typeof setTimeout> | undefined;
		const parser = await Promise.race([
			loadGrammar(language.id),
			new Promise<never>((_, reject) => {
				timeoutId = setTimeout(
					() => reject(new Error('AST_TIMEOUT')),
					AST_TIMEOUT_MS,
				);
			}),
		]).finally(() => {
			if (timeoutId) clearTimeout(timeoutId);
		});

		// Parse both versions
		const oldTree = parser.parse(oldContent);
		const newTree = parser.parse(newContent);

		// Handle null trees (parse failure)
		if (!oldTree || !newTree) {
			return {
				filePath,
				language: language.id,
				changes: [],
				durationMs: Date.now() - startTime,
				usedAST: false,
				error: 'Failed to parse file',
			};
		}

		// Extract symbols from both trees
		const oldSymbols = extractSymbols(oldTree, language);
		const newSymbols = extractSymbols(newTree, language);

		// Compare and generate changes
		const changes = compareSymbols(oldSymbols, newSymbols);

		// Cleanup
		oldTree.delete();
		newTree.delete();

		return {
			filePath,
			language: language.id,
			changes,
			durationMs: Date.now() - startTime,
			usedAST: true,
		};
	} catch (error) {
		// On timeout or error, fall back to raw diff
		const errorMsg = error instanceof Error ? error.message : 'Unknown error';
		if (errorMsg === 'AST_TIMEOUT') {
			console.warn(
				`[ast-diff] Timeout for ${filePath}, falling back to raw diff`,
			);
		}

		return {
			filePath,
			language: language.id,
			changes: [],
			durationMs: Date.now() - startTime,
			usedAST: false,
			error: errorMsg,
		};
	}
}

interface SymbolInfo {
	category: ASTChange['category'];
	name: string;
	lineStart: number;
	lineEnd: number;
	signature?: string;
}

function extractSymbols(
	tree: Tree,
	language: LanguageDefinition,
): SymbolInfo[] {
	const symbols: SymbolInfo[] = [];
	const queryStr = QUERIES[language.id];

	if (!queryStr) {
		return symbols;
	}

	try {
		// Get language from tree - the parser sets the language on the tree
		const lang = tree.language;
		if (!lang) {
			return symbols;
		}

		const query = new Query(lang, queryStr);
		const matches = query.matches(tree.rootNode);

		for (const match of matches) {
			const symbol = parseMatch(match, language.id);
			if (symbol) {
				symbols.push(symbol);
			}
		}
	} catch {
		// Query failed, return empty
	}

	return symbols;
}

function parseMatch(match: QueryMatch, languageId: string): SymbolInfo | null {
	// Extract symbol info from query match
	const captures = match.captures;

	// Find the definition capture (ends with .def)
	const defCapture = captures.find((c) => c.name.endsWith('.def'));
	const nameCapture = captures.find((c) => c.name.endsWith('.name'));

	if (!defCapture) return null;

	const node = defCapture.node;
	const nameNode = nameCapture?.node;

	return {
		category: inferCategory(captures[0]?.name || 'other'),
		name: nameNode?.text || 'anonymous',
		lineStart: node.startPosition.row + 1,
		lineEnd: node.endPosition.row + 1,
		signature: extractSignature(node, languageId),
	};
}

function inferCategory(captureName: string): ASTChange['category'] {
	if (captureName.includes('func')) return 'function';
	if (captureName.includes('class')) return 'class';
	if (
		captureName.includes('type') ||
		captureName.includes('interface') ||
		captureName.includes('struct')
	)
		return 'type';
	if (captureName.includes('export')) return 'export';
	if (captureName.includes('import') || captureName.includes('use'))
		return 'import';
	if (captureName.includes('var')) return 'variable';
	return 'other';
}

// Minimal interface for tree-sitter syntax node
interface SyntaxNodeRef {
	type: string;
	text: string;
	startPosition: { row: number; column: number };
	endPosition: { row: number; column: number };
	children: (SyntaxNodeRef | null)[];
}

function extractSignature(
	node: SyntaxNodeRef,
	languageId: string,
): string | undefined {
	// Extract function signature or type definition
	// Simplified implementation
	if (languageId === 'javascript' || languageId === 'typescript') {
		const paramsNode = node.children.find(
			(c): c is SyntaxNodeRef => c !== null && c.type === 'formal_parameters',
		);
		if (paramsNode) {
			return paramsNode.text;
		}
	}
	return undefined;
}

function compareSymbols(
	oldSymbols: SymbolInfo[],
	newSymbols: SymbolInfo[],
): ASTChange[] {
	const changes: ASTChange[] = [];
	const oldMap = new Map(oldSymbols.map((s) => [s.name, s]));
	const newMap = new Map(newSymbols.map((s) => [s.name, s]));

	// Find added symbols
	for (const [name, symbol] of newMap) {
		if (!oldMap.has(name)) {
			changes.push({
				type: 'added',
				category: symbol.category,
				name: symbol.name,
				lineStart: symbol.lineStart,
				lineEnd: symbol.lineEnd,
				signature: symbol.signature,
			});
		} else {
			// Check for modifications
			const oldSymbol = oldMap.get(name)!;
			if (
				oldSymbol.lineStart !== symbol.lineStart ||
				oldSymbol.lineEnd !== symbol.lineEnd ||
				oldSymbol.signature !== symbol.signature
			) {
				changes.push({
					type: 'modified',
					category: symbol.category,
					name: symbol.name,
					lineStart: symbol.lineStart,
					lineEnd: symbol.lineEnd,
					signature: symbol.signature,
				});
			}
		}
	}

	// Find removed symbols
	for (const [name, symbol] of oldMap) {
		if (!newMap.has(name)) {
			changes.push({
				type: 'removed',
				category: symbol.category,
				name: symbol.name,
				lineStart: symbol.lineStart,
				lineEnd: symbol.lineEnd,
				signature: symbol.signature,
			});
		}
	}

	return changes;
}
