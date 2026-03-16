import * as fs from 'node:fs';
import * as path from 'node:path';

// Language to extension mapping
const EXT_MAP: Record<string, string> = {
	python: '.py',
	py: '.py',
	powershell: '.ps1',
	ps1: '.ps1',
	pwsh: '.ps1',
	javascript: '.js',
	js: '.js',
	typescript: '.ts',
	ts: '.ts',
	bash: '.sh',
	sh: '.sh',
	json: '.json',
	yaml: '.yaml',
	yml: '.yaml',
	xml: '.xml',
	html: '.html',
	css: '.css',
	sql: '.sql',
	pester: '.Tests.ps1',
	test: '.Tests.ps1',
	'': '.txt',
};

/**
 * Extract filename from code content or context
 */
export function extractFilename(
	code: string,
	language: string,
	index: number,
): string {
	const lines = code.trim().split('\n');
	const ext = EXT_MAP[language.toLowerCase()] ?? '.txt';

	// Check first line for filename comment
	if (lines.length > 0) {
		const firstLine = lines[0].trim();

		// # filename: example.ps1 or // filename: example.js
		const filenameMatch = firstLine.match(/^[#/]+\s*filename[:\s]+(\S+\.\w+)/i);
		if (filenameMatch) {
			return filenameMatch[1];
		}

		// # example.ps1 (bare filename)
		const bareMatch = firstLine.match(/^[#/]+\s*(\w+\.\w+)\s*$/);
		if (bareMatch) {
			return bareMatch[1];
		}
	}

	// Check for function/class definitions
	for (const line of lines.slice(0, 5)) {
		// def function_name( or class ClassName(
		const defMatch = line.match(/^(?:def\s+|class\s+)(\w+)/);
		if (defMatch && !defMatch[1].startsWith('_')) {
			return `${defMatch[1]}${ext}`;
		}

		// function FunctionName or Function-Name
		const psMatch = line.match(/^function\s+([\w-]+)/i);
		if (psMatch) {
			return `${psMatch[1]}${ext}`;
		}
	}

	// Fallback to timestamp-based name
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
	return `output_${index + 1}_${timestamp}${ext}`;
}

/**
 * Extract code blocks from content and save to files
 */
export interface ExtractCodeBlocksResult {
	savedFiles: string[];
	errors: string[];
}

export function extractCodeBlocks(
	content: string,
	outputDir: string,
	prefix?: string,
): ExtractCodeBlocksResult {
	// Ensure output directory exists
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	// Extract code blocks
	const pattern = /```(\w*)\n([\s\S]*?)```/g;
	const matches = [...content.matchAll(pattern)];

	if (matches.length === 0) {
		return { savedFiles: [], errors: ['No code blocks found in content.'] };
	}

	const savedFiles: string[] = [];
	const errors: string[] = [];

	for (let i = 0; i < matches.length; i++) {
		const [, language, code] = matches[i];
		let filename = extractFilename(code, language, i);

		// Apply prefix if provided
		if (prefix) {
			filename = `${prefix}_${filename}`;
		}

		let filepath = path.join(outputDir, filename);

		// Avoid overwriting - add counter if exists
		const base = path.basename(filepath, path.extname(filepath));
		const ext = path.extname(filepath);
		let counter = 1;
		while (fs.existsSync(filepath)) {
			filepath = path.join(outputDir, `${base}_${counter}${ext}`);
			counter++;
		}

		try {
			fs.writeFileSync(filepath, code.trim(), 'utf-8');
			savedFiles.push(filepath);
		} catch (error) {
			errors.push(
				`Failed to save ${filename}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	return { savedFiles, errors };
}
