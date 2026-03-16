import { extname } from 'node:path';
import { loadGrammar, type Parser } from './runtime';

export interface LanguageDefinition {
	id: string;
	extensions: string[];
	commentNodes: string[];
}

export const languageDefinitions: LanguageDefinition[] = [
	{
		id: 'javascript',
		extensions: ['.js', '.jsx'],
		commentNodes: ['comment', 'line_comment', 'block_comment'],
	},
	{
		id: 'typescript',
		extensions: ['.ts', '.tsx'],
		commentNodes: ['comment', 'line_comment', 'block_comment'],
	},
	{
		id: 'python',
		extensions: ['.py'],
		commentNodes: ['comment'],
	},
	{
		id: 'go',
		extensions: ['.go'],
		commentNodes: ['comment'],
	},
	{
		id: 'rust',
		extensions: ['.rs'],
		commentNodes: ['line_comment', 'block_comment'],
	},
];

const extensionMap = new Map<string, LanguageDefinition>();
for (const definition of languageDefinitions) {
	for (const extension of definition.extensions) {
		extensionMap.set(extension, definition);
	}
}

export function getLanguageForExtension(
	extension: string,
): LanguageDefinition | undefined {
	return extensionMap.get(extension.toLowerCase());
}

export function listSupportedLanguages(): readonly LanguageDefinition[] {
	return languageDefinitions;
}

/**
 * Get a parser for a specific file path
 * Determines language from file extension, loads grammar, returns configured parser
 *
 * @param filePath - Absolute or relative path to the file
 * @returns Parser instance or null if language not supported
 */
export async function getParserForFile(
	filePath: string,
): Promise<Parser | null> {
	const extension = extname(filePath).toLowerCase();
	const language = getLanguageForExtension(extension);

	if (!language) {
		return null;
	}

	try {
		return await loadGrammar(language.id);
	} catch {
		return null;
	}
}

/**
 * Check if a file path has a supported language extension
 *
 * @param filePath - Path to check
 * @returns true if extension is supported
 */
export function isSupportedFile(filePath: string): boolean {
	const extension = extname(filePath).toLowerCase();
	return extensionMap.has(extension);
}
