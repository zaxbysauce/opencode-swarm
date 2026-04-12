/**
 * Verification tests for repo-graph.ts bug fixes
 * FIX 1: validateWorkspace now accepts absolute paths (previously rejected them)
 * FIX 2: resolveModuleSpecifier now resolves extensionless imports by trying file extensions
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
	resolveModuleSpecifier,
	validateWorkspace,
} from '../../../src/tools/repo-graph';

describe('FIX 1: validateWorkspace accepts absolute paths', () => {
	// Happy path: absolute paths should NOT throw
	test('accepts Unix absolute path /absolute/path without throwing', () => {
		expect(() => validateWorkspace('/absolute/path')).not.toThrow();
	});

	test('accepts Windows absolute path C:\\Windows\\path without throwing', () => {
		expect(() => validateWorkspace('C:\\Windows\\path')).not.toThrow();
	});

	test('accepts Windows drive-letter path D:/other/drive without throwing', () => {
		expect(() => validateWorkspace('D:/other/drive')).not.toThrow();
	});

	// Error path: path traversal still throws
	test('rejects path traversal ../escape with specific error', () => {
		expect(() => validateWorkspace('../escape')).toThrow(
			'Invalid workspace: path traversal detected',
		);
	});

	test('rejects nested path traversal foo/../../bar with specific error', () => {
		expect(() => validateWorkspace('foo/../../bar')).toThrow(
			'Invalid workspace: path traversal detected',
		);
	});

	// Error path: control characters still throw
	test('rejects control character \\x00 with specific error', () => {
		expect(() => validateWorkspace('work\x00space')).toThrow(
			'Invalid workspace: control characters detected',
		);
	});

	test('rejects newline control character with specific error', () => {
		expect(() => validateWorkspace('work\nspace')).toThrow(
			'Invalid workspace: control characters detected',
		);
	});

	// Error path: empty string still throws
	test('rejects empty string with specific error', () => {
		expect(() => validateWorkspace('')).toThrow(
			'Invalid workspace: must be a non-empty string',
		);
	});
});

describe('FIX 2: resolveModuleSpecifier resolves extensionless imports', () => {
	let tempDir: string;
	let workspaceRoot: string;

	beforeEach(() => {
		// Create a real temp directory for filesystem-based tests
		tempDir = fs.mkdtempSync(path.join(process.cwd(), 'repo-graph-test-'));
		workspaceRoot = tempDir;
	});

	afterEach(() => {
		// Clean up temp directory
		try {
			fs.rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	test('resolves ./utils to utils.ts when utils.ts exists', () => {
		// Create source file
		const sourceDir = path.join(tempDir, 'src');
		fs.mkdirSync(sourceDir, { recursive: true });
		const sourceFile = path.join(sourceDir, 'index.ts');
		fs.writeFileSync(sourceFile, '');

		// Create utils.ts in same directory
		fs.writeFileSync(path.join(sourceDir, 'utils.ts'), '');

		const result = resolveModuleSpecifier(workspaceRoot, sourceFile, './utils');

		expect(result).not.toBeNull();
		expect(result!.endsWith('.ts')).toBe(true);
		expect(result!.replace(/\\/g, '/')).toContain('/utils.ts');
	});

	test('resolves ./utils to utils.js when only utils.js exists', () => {
		// Create source file
		const sourceDir = path.join(tempDir, 'src');
		fs.mkdirSync(sourceDir, { recursive: true });
		const sourceFile = path.join(sourceDir, 'index.ts');
		fs.writeFileSync(sourceFile, '');

		// Create ONLY utils.js (no utils.ts)
		fs.writeFileSync(path.join(sourceDir, 'utils.js'), '');

		const result = resolveModuleSpecifier(workspaceRoot, sourceFile, './utils');

		expect(result).not.toBeNull();
		expect(result!.endsWith('.js')).toBe(true);
		expect(result!.replace(/\\/g, '/')).toContain('/utils.js');
	});

	test('returns null when no extension variant exists', () => {
		// Create source file
		const sourceDir = path.join(tempDir, 'src');
		fs.mkdirSync(sourceDir, { recursive: true });
		const sourceFile = path.join(sourceDir, 'index.ts');
		fs.writeFileSync(sourceFile, '');

		// Do NOT create any utils file
		const result = resolveModuleSpecifier(workspaceRoot, sourceFile, './utils');

		expect(result).toBeNull();
	});

	test('resolved path passes boundary check correctly', () => {
		// Create source file in workspace
		const sourceDir = path.join(tempDir, 'src');
		fs.mkdirSync(sourceDir, { recursive: true });
		const sourceFile = path.join(sourceDir, 'index.ts');
		fs.writeFileSync(sourceFile, '');

		// Create utils.ts in same directory (within workspace)
		fs.writeFileSync(path.join(sourceDir, 'utils.ts'), '');

		const result = resolveModuleSpecifier(workspaceRoot, sourceFile, './utils');

		expect(result).not.toBeNull();
		// The resolved path should be within the workspace boundary
		expect(result!.replace(/\\/g, '/')).toContain('/src/utils.ts');
	});

	test('extension resolution order is deterministic: .ts before .js when both exist', () => {
		// Create source file
		const sourceDir = path.join(tempDir, 'src');
		fs.mkdirSync(sourceDir, { recursive: true });
		const sourceFile = path.join(sourceDir, 'index.ts');
		fs.writeFileSync(sourceFile, '');

		// Create BOTH utils.ts AND utils.js
		fs.writeFileSync(path.join(sourceDir, 'utils.ts'), '// typescript');
		fs.writeFileSync(path.join(sourceDir, 'utils.js'), '// javascript');

		const result = resolveModuleSpecifier(workspaceRoot, sourceFile, './utils');

		expect(result).not.toBeNull();
		// Should resolve to .ts, not .js, because .ts comes first in EXTENSIONS array
		expect(result!.endsWith('.ts')).toBe(true);
		expect(result!.replace(/\\/g, '/')).toContain('/utils.ts');
	});

	test('resolves extensionless import in nested directory', () => {
		// Create nested directory structure
		const nestedDir = path.join(tempDir, 'packages', 'core', 'src');
		fs.mkdirSync(nestedDir, { recursive: true });
		const sourceFile = path.join(nestedDir, 'index.ts');
		fs.writeFileSync(sourceFile, '');

		// Create helper.ts in same nested directory
		fs.writeFileSync(path.join(nestedDir, 'helper.ts'), '');

		const result = resolveModuleSpecifier(
			workspaceRoot,
			sourceFile,
			'./helper',
		);

		expect(result).not.toBeNull();
		expect(result!.endsWith('.ts')).toBe(true);
	});

	test('returns null for bare specifier (no resolution needed)', () => {
		const sourceFile = path.join(tempDir, 'index.ts');
		fs.writeFileSync(sourceFile, '');

		// Bare specifiers cannot be resolved without node_modules
		const result = resolveModuleSpecifier(workspaceRoot, sourceFile, 'lodash');

		expect(result).toBeNull();
	});

	test('returns null for control characters in specifier', () => {
		const sourceFile = path.join(tempDir, 'index.ts');
		fs.writeFileSync(sourceFile, '');

		const result = resolveModuleSpecifier(
			workspaceRoot,
			sourceFile,
			'./uti\x00ls',
		);

		expect(result).toBeNull();
	});
});
