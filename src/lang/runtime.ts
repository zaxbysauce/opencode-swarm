import { fileURLToPath } from 'node:url';
import type { Parser as ParserType } from 'web-tree-sitter';
// Note: Language must be imported as both type and value for runtime loading
// TreeSitterParser is imported to use Language.load()
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Language, Parser as TreeSitterParser } from 'web-tree-sitter';

// Re-export Parser type for consumers
export type Parser = ParserType;

/**
 * Parser cache to avoid reloading grammars multiple times per session
 */
export const parserCache = new Map<string, ParserType>();

/**
 * Track which languages have been initialized to avoid re-init
 */
const initializedLanguages = new Set<string>();

/**
 * Track if tree-sitter has been initialized
 */
let treeSitterInitialized = false;

/**
 * Initialize the tree-sitter WASM runtime
 * Must be called before creating any parsers
 */
async function initTreeSitter(): Promise<void> {
	if (treeSitterInitialized) {
		return;
	}

	await TreeSitterParser.init();
	treeSitterInitialized = true;
}

/**
 * Map of language IDs to WASM file names. Entries from @vscode/tree-sitter-wasm are copied by copy-grammars.ts; kotlin/swift/dart entries are vendored directly in src/lang/grammars/.
 */
const LANGUAGE_WASM_MAP: Record<string, string> = {
	javascript: 'tree-sitter-javascript.wasm',
	typescript: 'tree-sitter-typescript.wasm',
	python: 'tree-sitter-python.wasm',
	go: 'tree-sitter-go.wasm',
	rust: 'tree-sitter-rust.wasm',
	cpp: 'tree-sitter-cpp.wasm',
	c: 'tree-sitter-cpp.wasm',
	csharp: 'tree-sitter-c-sharp.wasm',
	css: 'tree-sitter-css.wasm',
	html: 'tree-sitter-html.wasm',
	json: 'tree-sitter-json.wasm',
	bash: 'tree-sitter-bash.wasm',
	ruby: 'tree-sitter-ruby.wasm',
	php: 'tree-sitter-php.wasm',
	java: 'tree-sitter-java.wasm',
	kotlin: 'tree-sitter-kotlin.wasm',
	swift: 'tree-sitter-swift.wasm',
	dart: 'tree-sitter-dart.wasm',
};

/**
 * Sanitize a language ID to prevent path traversal and control character injection.
 * Strips control characters (ASCII 0-31, 127), path-separator characters,
 * Windows-reserved chars, and Unicode fullwidth/punctuation ranges.
 */
function sanitizeLanguageId(languageId: string): string {
	// Strip control chars (ASCII 0-31, 127), path separators (/, \),
	// Windows-reserved chars (:, *, ?, ", <, >, |), and Unicode fullwidth/punctuation ranges
	// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional sanitization
	return languageId
		.replace(/[\x00-\x1f\x7f/\\:?*"<>|]/g, '')
		.replace(/[\u2000-\u206f\uff00-\uffef]/g, '');
}

function getWasmFileName(languageId: string): string {
	const sanitized = sanitizeLanguageId(languageId).toLowerCase();
	// Check if there's a direct mapping
	if (LANGUAGE_WASM_MAP[sanitized]) {
		return LANGUAGE_WASM_MAP[sanitized];
	}

	// Fallback: try tree-sitter-{languageId}.wasm
	return `tree-sitter-${sanitized}.wasm`;
}

/**
 * Get the path to the grammars directory
 * Works in both development and production (bundled) environments
 */
function getGrammarsPath(): string {
	// In production (bundled), files are in dist/lang/grammars/
	// The runtime.ts is in dist/lang/, so we use ./grammars/
	// In development, import.meta.url points to the source file
	const isProduction =
		process.env.NODE_ENV === 'production' || !import.meta.url.includes('src/');

	if (isProduction) {
		return './lang/grammars/';
	}

	// Development: relative to src/lang/runtime.ts
	return '../../dist/lang/grammars/';
}

/**
 * Initialize a parser for the given language
 * Loads WASM from dist/lang/grammars/ (copied during build)
 *
 * @param languageId - Language identifier (e.g., 'javascript', 'python')
 * @returns Configured Parser instance
 * @throws Error if WASM file not found or failed to load
 */
export async function loadGrammar(languageId: string): Promise<ParserType> {
	if (typeof languageId !== 'string' || languageId.length > 100) {
		throw new Error(
			`Invalid languageId: must be a string of at most 100 characters`,
		);
	}
	const normalizedId = sanitizeLanguageId(languageId).toLowerCase();
	if (normalizedId.length === 0) {
		throw new Error(`Invalid languageId: empty after sanitization`);
	}

	// Return cached parser if available
	if (parserCache.has(normalizedId)) {
		return parserCache.get(normalizedId)!;
	}

	// Initialize tree-sitter WASM runtime
	await initTreeSitter();

	// Initialize parser
	const parser = new TreeSitterParser();

	// Get WASM file name and construct path
	const wasmFileName = getWasmFileName(normalizedId);
	const grammarsPath = getGrammarsPath();
	const wasmPath = fileURLToPath(
		new URL(`${grammarsPath}${wasmFileName}`, import.meta.url),
	);

	// Check if file exists before attempting to load
	const { existsSync } = await import('node:fs');
	if (!existsSync(wasmPath)) {
		throw new Error(
			`Grammar file not found for ${languageId}: ${wasmPath}\n` +
				`Make sure to run 'bun run build' to copy grammar files to dist/lang/grammars/`,
		);
	}

	try {
		const language = await Language.load(wasmPath);
		parser.setLanguage(language);
	} catch (error) {
		throw new Error(
			`Failed to load grammar for ${languageId}: ${error instanceof Error ? error.message : String(error)}\n` +
				`WASM path: ${wasmPath}`,
		);
	}

	// Cache and return
	parserCache.set(normalizedId, parser);
	initializedLanguages.add(normalizedId);

	return parser;
}

/**
 * Check if a language grammar is available (WASM file exists)
 * Does not load the grammar, just checks existence
 *
 * @param languageId - Language identifier
 * @returns true if grammar is available
 */
export async function isGrammarAvailable(languageId: string): Promise<boolean> {
	if (typeof languageId !== 'string' || languageId.length > 100) {
		return false;
	}
	const normalizedId = sanitizeLanguageId(languageId).toLowerCase();
	if (normalizedId.length === 0) {
		return false;
	}

	// If already cached, it's available
	if (parserCache.has(normalizedId)) {
		return true;
	}

	// Try to check if WASM file exists
	try {
		const wasmFileName = getWasmFileName(normalizedId);
		const grammarsPath = getGrammarsPath();
		const wasmPath = fileURLToPath(
			new URL(`${grammarsPath}${wasmFileName}`, import.meta.url),
		);

		const { statSync } = await import('node:fs');
		statSync(wasmPath);
		return true;
	} catch {
		return false;
	}
}

/**
 * Clear the parser cache (useful for testing)
 */
export function clearParserCache(): void {
	parserCache.clear();
	initializedLanguages.clear();
}

/**
 * Get list of initialized languages
 */
export function getInitializedLanguages(): string[] {
	return Array.from(initializedLanguages);
}

/**
 * Get list of supported language IDs
 */
export function getSupportedLanguages(): string[] {
	return Object.keys(LANGUAGE_WASM_MAP);
}
