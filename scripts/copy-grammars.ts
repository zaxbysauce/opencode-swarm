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
import { join } from 'node:path';

/**
 * Locate the `@vscode/tree-sitter-wasm/wasm` directory from the current
 * workspace, its parent, or its grandparent directory. This supports monorepo
 * package builds where Bun hoists dependencies to the repository root.
 *
 * @returns The resolved wasm directory, or null if it cannot be found
 */
function resolveSourceDir(): string | null {
	const cwd = process.cwd();
	const candidates = [
		join(cwd, 'node_modules', '@vscode', 'tree-sitter-wasm', 'wasm'),
		join(cwd, '..', 'node_modules', '@vscode', 'tree-sitter-wasm', 'wasm'),
		join(cwd, '..', '..', 'node_modules', '@vscode', 'tree-sitter-wasm', 'wasm'),
	];

	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	return null;
}

const TARGET_DIR = join(process.cwd(), 'src', 'lang', 'grammars');
const DIST_TARGET_DIR = join(process.cwd(), 'dist', 'lang', 'grammars');

/**
 * Vendored grammar WASM files committed directly to src/lang/grammars/.
 * These grammars are NOT from @vscode/tree-sitter-wasm and must be rebuilt manually.
 *
 * To rebuild (requires emscripten or Docker):
 *   bun add -d tree-sitter-kotlin@0.3.8 tree-sitter-swift@0.7.1 tree-sitter-dart@1.0.0
 *   bunx tree-sitter build --wasm node_modules/tree-sitter-kotlin
 *   bunx tree-sitter build --wasm node_modules/tree-sitter-swift
 *   bunx tree-sitter build --wasm node_modules/tree-sitter-dart
 *   mv tree-sitter-kotlin.wasm tree-sitter-swift.wasm tree-sitter-dart.wasm src/lang/grammars/
 *
 * Alternatively, download prebuilt WASM from each grammar's GitHub releases:
 *   - tree-sitter-kotlin.wasm: https://github.com/fwcd/tree-sitter-kotlin/releases/tag/0.3.8
 *   - tree-sitter-swift.wasm:  https://github.com/alex-pinkus/tree-sitter-swift/releases/tag/0.7.1
 *   - tree-sitter-dart.wasm:   copied from node_modules/tree-sitter-dart/tree-sitter-dart.wasm
 */
const VENDORED_GRAMMARS = [
	'tree-sitter-kotlin.wasm',
	'tree-sitter-swift.wasm',
	'tree-sitter-dart.wasm',
] as const;

function copyGrammars(): void {
	const sourceDir = resolveSourceDir();

	// Ensure target directory exists
	if (!existsSync(TARGET_DIR)) {
		mkdirSync(TARGET_DIR, { recursive: true });
		console.log(`Created directory: ${TARGET_DIR}`);
	}

	// Check source directory exists
	if (sourceDir == null) {
		console.error('Error: @vscode/tree-sitter-wasm not installed');
		console.error(
			'Could not locate @vscode/tree-sitter-wasm/wasm in the current workspace or ancestor workspaces',
		);
		console.error('Run: bun install');
		process.exit(1);
	}

	// Copy core tree-sitter.wasm
	const coreSource = join(sourceDir, 'tree-sitter.wasm');
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

	const files = readdirSync(sourceDir);
	for (const file of files) {
		// Skip tree-sitter.wasm (already copied) and non-wasm files
		if (file === 'tree-sitter.wasm' || !file.endsWith('.wasm') || file === 'tree-sitter.js') {
			continue;
		}

		const sourceFile = join(sourceDir, file);
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

	// Verify vendored grammars are present in target directory
	let vendoredMissing = 0;
	for (const vendored of VENDORED_GRAMMARS) {
		const vendoredPath = join(TARGET_DIR, vendored);
		if (!existsSync(vendoredPath)) {
			console.warn(`Warning: Vendored grammar missing: ${vendored}`);
			console.warn('  See comment above VENDORED_GRAMMARS for rebuild instructions.');
			vendoredMissing++;
		} else {
			console.log(`Vendored: ${vendored} (present)`);
		}
	}
	if (vendoredMissing > 0) {
		console.warn(`\n${vendoredMissing} vendored grammar(s) missing — syntax-check will skip these languages.`);
	}
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
