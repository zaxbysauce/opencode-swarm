#!/usr/bin/env bun
/**
 * Copy grammar WASM files from @vscode/tree-sitter-wasm to src/lang/grammars/
 * Run during build (bun run build)
 *
 * Usage:
 *   bun run copy-grammars              # Copy from node_modules to src/lang/grammars
 *   bun run copy-grammars --to-dist    # Copy from src/lang/grammars to dist/lang/grammars
 */

import { existsSync, mkdirSync, copyFileSync, readdirSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';

const SOURCE_DIR = join(
	process.cwd(),
	'node_modules',
	'@vscode',
	'tree-sitter-wasm',
	'wasm',
);
const TARGET_DIR = join(process.cwd(), 'src', 'lang', 'grammars');
const DIST_TARGET_DIR = join(process.cwd(), 'dist', 'lang', 'grammars');

function copyGrammars(): void {
	// Ensure target directory exists
	if (!existsSync(TARGET_DIR)) {
		mkdirSync(TARGET_DIR, { recursive: true });
		console.log(`Created directory: ${TARGET_DIR}`);
	}

	// Check source directory exists
	if (!existsSync(SOURCE_DIR)) {
		console.error('Error: @vscode/tree-sitter-wasm not installed');
		console.error('Expected at:', SOURCE_DIR);
		console.error('Run: bun install');
		process.exit(1);
	}

	// Copy core tree-sitter.wasm
	const coreSource = join(SOURCE_DIR, 'tree-sitter.wasm');
	const coreTarget = join(TARGET_DIR, 'tree-sitter.wasm');

	if (!existsSync(coreSource)) {
		console.error('Error: tree-sitter.wasm not found in @vscode/tree-sitter-wasm');
		console.error('Expected at:', coreSource);
		process.exit(1);
	}

	copyFileSync(coreSource, coreTarget);
	console.log(`Copied: tree-sitter.wasm`);

	// Copy all language grammar WASM files from source directory
	let copied = 0;
	let skipped = 0;

	const files = readdirSync(SOURCE_DIR);
	for (const file of files) {
		// Skip tree-sitter.wasm (already copied) and non-wasm files
		if (file === 'tree-sitter.wasm' || !file.endsWith('.wasm') || file === 'tree-sitter.js') {
			continue;
		}

		const sourceFile = join(SOURCE_DIR, file);
		const targetFile = join(TARGET_DIR, file);

		if (existsSync(sourceFile)) {
			copyFileSync(sourceFile, targetFile);
			console.log(`Copied: ${file}`);
			copied++;
		} else {
			skipped++;
		}
	}

	console.log(
		`\nGrammar copy complete: ${copied + 1} files copied, ${skipped} skipped`,
	);
}

/**
 * Copy grammars from src/lang/grammars to dist/lang/grammars
 * Used during build process
 */
function copyGrammarsToDist(): void {
	const sourceDir = TARGET_DIR;
	const targetDir = DIST_TARGET_DIR;

	// Ensure source directory exists
	if (!existsSync(sourceDir)) {
		console.error('Error: Source grammars not found');
		console.error('Run: bun run copy-grammars first');
		process.exit(1);
	}

	// Ensure target parent directory exists
	if (!existsSync(join(process.cwd(), 'dist', 'lang'))) {
		mkdirSync(join(process.cwd(), 'dist', 'lang'), { recursive: true });
	}

	// Copy all files
	cpSync(sourceDir, targetDir, { recursive: true });
	console.log(`Copied grammars to dist/lang/grammars/`);

	// Count files
	const files = readdirSync(targetDir);
	console.log(`Total grammar files: ${files.length}`);
}

// Run if executed directly
if (import.meta.main) {
	try {
		const args = process.argv.slice(2);
		if (args.includes('--to-dist')) {
			copyGrammarsToDist();
		} else {
			copyGrammars();
		}
	} catch (error) {
		console.error('Failed to copy grammars:', error);
		process.exit(1);
	}
}

export { copyGrammars, copyGrammarsToDist };
