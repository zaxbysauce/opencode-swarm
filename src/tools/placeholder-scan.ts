import * as fs from 'node:fs';
import * as path from 'node:path';

import type { EvidenceVerdict } from '../config/evidence-schema';
import { saveEvidence } from '../evidence/manager';
import { getParserForFile } from '../lang/registry';

// ============ Types ============

export interface PlaceholderScanInput {
	changed_files: string[];
	allow_globs?: string[];
	deny_patterns?: string[];
}

export interface PlaceholderFinding {
	path: string;
	line: number;
	kind: 'comment' | 'string' | 'function_body' | 'other';
	excerpt: string;
	rule_id: string;
}

export interface PlaceholderScanResult {
	verdict: EvidenceVerdict;
	findings: PlaceholderFinding[];
	summary: {
		files_scanned: number;
		findings_count: number;
		files_with_findings: number;
	};
}

// ============ Constants ============

const MAX_FILE_SIZE = 1024 * 1024; // 1MB

// Default deny patterns (comment patterns)
const DEFAULT_COMMENT_PATTERNS = [
	{ pattern: /\bTODO\b/i, rule_id: 'placeholder/comment-todo' },
	{ pattern: /\bFIXME\b/i, rule_id: 'placeholder/comment-fixme' },
	{ pattern: /\bTBD\b/i, rule_id: 'placeholder/comment-other' },
	{ pattern: /\bXXX\b/i, rule_id: 'placeholder/comment-other' },
	{ pattern: /\bHACK\b/i, rule_id: 'placeholder/comment-other' },
];

// Default deny patterns (text in strings)
const DEFAULT_STRING_PATTERNS = [
	{
		pattern: /"[^"]*\bplaceholder\b[^"]*"/i,
		rule_id: 'placeholder/text-placeholder',
	},
	{ pattern: /"[^"]*\bstub\b[^"]*"/i, rule_id: 'placeholder/text-placeholder' },
	{ pattern: /"[^"]*\bwip\b[^"]*"/i, rule_id: 'placeholder/text-placeholder' },
	{
		pattern: /"[^"]*\bnot implemented\b[^"]*"/i,
		rule_id: 'placeholder/text-placeholder',
	},
	{
		pattern: /'[^']*\bplaceholder\b[^']*'/i,
		rule_id: 'placeholder/text-placeholder',
	},
	{ pattern: /'[^']*\bstub\b[^']*'/i, rule_id: 'placeholder/text-placeholder' },
	{ pattern: /'[^']*\bwip\b[^']*'/i, rule_id: 'placeholder/text-placeholder' },
	{
		pattern: /`[^`]*\bplaceholder\b[^`]*`/i,
		rule_id: 'placeholder/text-placeholder',
	},
	{ pattern: /`[^`]*\bstub\b[^`]*`/i, rule_id: 'placeholder/text-placeholder' },
];

// Default deny patterns (code stubs)
const DEFAULT_CODE_PATTERNS = [
	{
		pattern: /throw\s+new\s+Error\s*\(\s*["'][^"']*\bTODO\b[^"']*["']\s*\)/i,
		rule_id: 'placeholder/code-throw-todo',
	},
	{
		pattern: /throw\s+new\s+Error\s*\(\s*["'][^"']*\bFIXME\b[^"']*["']\s*\)/i,
		rule_id: 'placeholder/code-throw-todo',
	},
	{ pattern: /return\s+null\s*;/, rule_id: 'placeholder/code-stub-return' },
	{
		pattern: /return\s+undefined\s*;/,
		rule_id: 'placeholder/code-stub-return',
	},
	{ pattern: /return\s+None\s*$/m, rule_id: 'placeholder/code-stub-return' },
	{ pattern: /return\s+0\s*;/, rule_id: 'placeholder/code-stub-return' },
	{ pattern: /return\s+false\s*;/i, rule_id: 'placeholder/code-stub-return' },
	{ pattern: /return\s+true\s*;/i, rule_id: 'placeholder/code-stub-return' },
	{ pattern: /return\s+""\s*;/, rule_id: 'placeholder/code-stub-return' },
	{ pattern: /return\s+\[\]\s*;/, rule_id: 'placeholder/code-stub-return' },
	{ pattern: /return\s+\{\}\s*;/, rule_id: 'placeholder/code-stub-return' },
	{ pattern: /return\s+nil\s*;/, rule_id: 'placeholder/code-stub-return' },
];

// Test file patterns (to skip) - based on path patterns
// Note: patterns check for the directory in the path
const TEST_PATH_PATTERNS = [
	/\.test\./, // matches: something.test.ts
	/\.spec\./, // matches: something.spec.ts
	/\btests?\//, // matches: tests/, test/ directory
	/\b__tests?__\//, // matches: __tests__/, __test__/ directory
	/\bmocks?\//, // matches: mocks/, mock/ directory
	/\b__mocks?__\//, // matches: __mocks__/, __mock__/ directory
	/\bspecs?\//, // matches: specs/, spec/ directory
	/\b__specs?__\//, // matches: __specs__/, __spec__/ directory
];

// Additional content patterns that indicate a test file (more specific - only framework calls)
const _TEST_CONTENT_PATTERNS = [
	/\bdescribe\s*\(/,
	/\bit\s*\(/,
	/\btest\s*\(\s*['"`]/,
	/\bexpect\s*\(/,
	/\bassert\s*\(/,
	/\bshould\s*\(/,
	/\bmocha\s*\(/,
	/\bjest\s*\(/,
	/\bpytest\s*\(/,
	/\bunittest\s*\(/,
	/\bjunit\s*\(/,
	/\bxunit\s*\(/,
	/\btesting\s*\(/,
];

// Supported extensions for Tree-sitter parsing
const SUPPORTED_PARSER_EXTENSIONS = new Set([
	'.js',
	'.jsx',
	'.ts',
	'.tsx',
	'.py',
	'.go',
	'.rs',
	'.java',
	'.c',
	'.cpp',
	'.h',
	'.hpp',
	'.cs',
	'.php',
	'.rb',
]);

// ============ Helper Functions ============

/**
 * Check if a file is a test file based on path patterns
 */
function isTestFile(filePath: string): boolean {
	const normalizedPath = filePath.toLowerCase().replace(/\\/g, '/');
	return TEST_PATH_PATTERNS.some((pattern) => pattern.test(normalizedPath));
}

/**
 * Check if file should be allowed based on allow_globs
 */
function isAllowedByGlobs(filePath: string, allowGlobs?: string[]): boolean {
	if (!allowGlobs || allowGlobs.length === 0) {
		return false;
	}

	const normalizedPath = filePath.toLowerCase().replace(/\\/g, '/');

	for (const glob of allowGlobs) {
		// Convert glob to regex
		// ** → match any characters including /
		// * → match any characters except /
		// (Note: in globs, . is literal, not regex special)
		const regexPattern = glob
			.replace(/\*\*/g, '<<<DBL>>>') // Save ** first
			.replace(/\*/g, '([^/]+)') // * → match non-slash chars
			.replace(/<<<DBL>>>/g, '(.*)'); // ** → match any chars including slash

		// Test if path starts with the glob pattern
		const regex = new RegExp(`^${regexPattern}`, 'i');
		if (regex.test(normalizedPath)) {
			return true;
		}

		// Also try matching just the filename
		const filename = path.basename(filePath);
		const filenameRegex = new RegExp(`^${regexPattern}$`, 'i');
		if (filenameRegex.test(filename)) {
			return true;
		}
	}

	return false;
}

/**
 * Check if file uses a supported parser language
 */
function isParserSupported(filePath: string): boolean {
	const ext = path.extname(filePath).toLowerCase();
	return SUPPORTED_PARSER_EXTENSIONS.has(ext);
}

/**
 * Regex-based scanner for comments and strings
 * Works for any language using comment markers
 */
function scanWithRegex(
	content: string,
	filePath: string,
	denyPatterns: {
		comment: typeof DEFAULT_COMMENT_PATTERNS;
		string: typeof DEFAULT_STRING_PATTERNS;
		code: typeof DEFAULT_CODE_PATTERNS;
	},
): PlaceholderFinding[] {
	const findings: PlaceholderFinding[] = [];
	const lines = content.split('\n');

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const lineNumber = i + 1;

		// Check comment patterns (various comment styles)
		// // comment, # comment, /* comment */, <!-- comment -->
		const lineCommentMatch = line.match(/(?:\/\/|#|<!--)\s*(.*)$/);
		if (lineCommentMatch) {
			const commentText = lineCommentMatch[1];
			for (const { pattern, rule_id } of denyPatterns.comment) {
				if (pattern.test(commentText)) {
					findings.push({
						path: filePath,
						line: lineNumber,
						kind: 'comment',
						excerpt: line.substring(0, 100),
						rule_id,
					});
					break; // Only report one finding per line for comments
				}
			}
		}

		// Check block comments (/* ... */) - need multi-line handling
		const blockCommentMatch = line.match(/\/\*([\s\S]*?)\*\//);
		if (blockCommentMatch) {
			const commentText = blockCommentMatch[1];
			for (const { pattern, rule_id } of denyPatterns.comment) {
				if (pattern.test(commentText)) {
					findings.push({
						path: filePath,
						line: lineNumber,
						kind: 'comment',
						excerpt: line.substring(0, 100),
						rule_id,
					});
					break;
				}
			}
		}

		// Check string patterns (double, single, template literals)
		const stringMatches = line.match(/(["'`])(?:(?!\1)[^\\]|\\.)*\1/g);
		if (stringMatches) {
			for (const stringContent of stringMatches) {
				for (const { pattern, rule_id } of denyPatterns.string) {
					if (pattern.test(stringContent)) {
						findings.push({
							path: filePath,
							line: lineNumber,
							kind: 'string',
							excerpt: line.substring(0, 100),
							rule_id,
						});
						break;
					}
				}
			}
		}

		// Check code patterns (stub returns, throw TODO)
		for (const { pattern, rule_id } of denyPatterns.code) {
			// Skip if this line looks like a test
			const isTestLike =
				line.includes('describe(') ||
				line.includes('it(') ||
				line.includes('test(') ||
				line.includes('expect(');

			if (!isTestLike && pattern.test(line)) {
				findings.push({
					path: filePath,
					line: lineNumber,
					kind: 'function_body',
					excerpt: line.substring(0, 100),
					rule_id,
				});
			}
		}
	}

	return findings;
}

/**
 * Tree-sitter-based scanner for supported languages
 * Adds parser-based findings to regex findings
 */
async function scanWithParser(
	content: string,
	filePath: string,
	denyPatterns: {
		comment: typeof DEFAULT_COMMENT_PATTERNS;
		string: typeof DEFAULT_STRING_PATTERNS;
		code: typeof DEFAULT_CODE_PATTERNS;
	},
): Promise<PlaceholderFinding[]> {
	const findings: PlaceholderFinding[] = [];

	// First do regex scan (works reliably)
	const regexFindings = scanWithRegex(content, filePath, denyPatterns);
	findings.push(...regexFindings);

	// Then try parser for additional coverage
	const parser = await getParserForFile(filePath);
	if (!parser) {
		return findings;
	}

	try {
		const tree = parser.parse(content);
		if (!tree || !tree.rootNode) {
			return findings;
		}

		// Walk the tree to find comment and string nodes
		// Using a set to avoid duplicates with regex findings
		const seenKeys = new Set<string>();
		for (const f of findings) {
			seenKeys.add(`${f.line}:${f.rule_id}`);
		}

		// biome-ignore lint/suspicious/noExplicitAny: tree-sitter node type not exported
		function walkNode(node: any) {
			const nodeType = node.type;
			const nodeText = node.text;
			const lineNum = node.startPosition.row + 1;

			// Check comment nodes (various types across languages)
			if (
				nodeType === 'comment' ||
				nodeType === 'line_comment' ||
				nodeType === 'block_comment' ||
				nodeType === 'documentation_comment' ||
				nodeType === 'doc_comment'
			) {
				for (const { pattern, rule_id } of denyPatterns.comment) {
					const key = `${lineNum}:${rule_id}`;
					if (!seenKeys.has(key) && pattern.test(nodeText)) {
						seenKeys.add(key);
						findings.push({
							path: filePath,
							line: lineNum,
							kind: 'comment',
							excerpt: nodeText.substring(0, 100),
							rule_id,
						});
					}
				}
			}

			// Check string literals
			if (
				nodeType === 'string' ||
				nodeType === 'template_string' ||
				nodeType === 'string_literal' ||
				nodeType === 'string_fragment'
			) {
				for (const { pattern, rule_id } of denyPatterns.string) {
					const key = `${lineNum}:${rule_id}`;
					if (!seenKeys.has(key) && pattern.test(nodeText)) {
						seenKeys.add(key);
						findings.push({
							path: filePath,
							line: lineNum,
							kind: 'string',
							excerpt: nodeText.substring(0, 100),
							rule_id,
						});
					}
				}
			}

			// Recursively walk children
			if (node.children) {
				for (const child of node.children) {
					walkNode(child);
				}
			}
		}

		walkNode(tree.rootNode);
		tree.delete();
	} catch {
		// Parser error - we already have regex findings
	}

	return findings;
}

// ============ Main Function ============

/**
 * Scan files for placeholder content (TODO/FIXME comments, stub implementations, etc.)
 */
export async function placeholderScan(
	input: PlaceholderScanInput,
	directory: string,
): Promise<PlaceholderScanResult> {
	const { changed_files, allow_globs, deny_patterns } = input;

	// Build deny patterns
	// If custom patterns are provided, they replace the defaults
	let commentPatterns = DEFAULT_COMMENT_PATTERNS;
	let stringPatterns = DEFAULT_STRING_PATTERNS;
	let codePatterns = DEFAULT_CODE_PATTERNS;

	if (deny_patterns && deny_patterns.length > 0) {
		// Parse custom patterns - they can be simple strings like "TODO" or regex-like
		commentPatterns = deny_patterns.map((p) => ({
			pattern: new RegExp(`\\b${p}\\b`, 'i'),
			rule_id: `placeholder/custom-${p.toLowerCase()}`,
		}));
		// With custom patterns, disable string and code patterns
		stringPatterns = [];
		codePatterns = [];
	}

	const denyPatterns = {
		comment: commentPatterns,
		string: stringPatterns,
		code: codePatterns,
	};

	const findings: PlaceholderFinding[] = [];
	let filesScanned = 0;
	const filesWithFindings = new Set<string>();

	for (const filePath of changed_files) {
		const fullPath = path.isAbsolute(filePath)
			? filePath
			: path.join(directory, filePath);

		// Skip if file doesn't exist
		if (!fs.existsSync(fullPath)) {
			continue;
		}

		// Check if allowed by globs (e.g., test files)
		if (isAllowedByGlobs(filePath, allow_globs)) {
			continue;
		}

		// Read content first to check for test patterns
		let content: string;
		try {
			const stat = fs.statSync(fullPath);
			if (stat.size > MAX_FILE_SIZE) {
				continue;
			}
			content = fs.readFileSync(fullPath, 'utf-8');
		} catch {
			continue;
		}

		// Skip binary files
		if (content.includes('\0')) {
			continue;
		}

		// Skip test files by default (based on path patterns)
		if (isTestFile(filePath)) {
			continue;
		}

		filesScanned++;

		// Use parser if supported, otherwise regex fallback
		let fileFindings: PlaceholderFinding[];
		if (isParserSupported(filePath)) {
			fileFindings = await scanWithParser(content, filePath, denyPatterns);
		} else {
			fileFindings = scanWithRegex(content, filePath, denyPatterns);
		}

		// Add findings to result
		if (fileFindings.length > 0) {
			findings.push(...fileFindings);
			filesWithFindings.add(filePath);
		}
	}

	const verdict: EvidenceVerdict = findings.length > 0 ? 'fail' : 'pass';

	// Save evidence
	await saveEvidence(directory, 'placeholder_scan', {
		task_id: 'placeholder_scan',
		type: 'placeholder',
		timestamp: new Date().toISOString(),
		agent: 'placeholder_scan',
		verdict,
		summary: `Scanned ${filesScanned} files, found ${findings.length} placeholder(s)`,
		files_scanned: filesScanned,
		findings_count: findings.length,
		files_with_findings: filesWithFindings.size,
		findings,
	});

	return {
		verdict,
		findings,
		summary: {
			files_scanned: filesScanned,
			findings_count: findings.length,
			files_with_findings: filesWithFindings.size,
		},
	};
}
