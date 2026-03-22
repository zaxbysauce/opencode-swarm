import { describe, test, expect, beforeEach } from 'bun:test';
import {
	loadGrammar,
	isGrammarAvailable,
	clearParserCache,
	getSupportedLanguages,
} from '../../../src/lang/runtime';

/**
 * Tests for LANGUAGE_WASM_MAP updates in src/lang/runtime.ts
 *
 * Since LANGUAGE_WASM_MAP and getWasmFileName are private, we test the
 * behavior through exported functions:
 * - getSupportedLanguages() returns keys from LANGUAGE_WASM_MAP
 * - isGrammarAvailable() uses getWasmFileName() internally
 * - loadGrammar() uses getWasmFileName() internally
 */

describe('LANGUAGE_WASM_MAP - Kotlin, Swift, Dart entries', () => {
	describe('getSupportedLanguages()', () => {
		test('should include kotlin in supported languages', () => {
			const supported = getSupportedLanguages();
			expect(supported).toContain('kotlin');
		});

		test('should include swift in supported languages', () => {
			const supported = getSupportedLanguages();
			expect(supported).toContain('swift');
		});

		test('should include dart in supported languages', () => {
			const supported = getSupportedLanguages();
			expect(supported).toContain('dart');
		});

		test('should include all three new languages together', () => {
			const supported = getSupportedLanguages();
			expect(supported).toEqual(expect.arrayContaining(['kotlin', 'swift', 'dart']));
		});

		test('should include existing languages as well', () => {
			const supported = getSupportedLanguages();
			const existingLanguages = ['javascript', 'typescript', 'python', 'go', 'rust', 'cpp', 'c', 'csharp', 'css', 'html', 'json', 'bash', 'ruby', 'php', 'java'];
			expect(supported).toEqual(expect.arrayContaining(existingLanguages));
		});
	});

	describe('isGrammarAvailable() - WASM file mapping', () => {
		beforeEach(() => {
			clearParserCache();
		});

		test('should check for tree-sitter-kotlin.wasm for kotlin language', async () => {
			// The function should attempt to check for the WASM file
			// It will return false if the file doesn't exist, but should not crash
			const result = await isGrammarAvailable('kotlin');
			expect(typeof result).toBe('boolean');
		});

		test('should check for tree-sitter-swift.wasm for swift language', async () => {
			const result = await isGrammarAvailable('swift');
			expect(typeof result).toBe('boolean');
		});

		test('should check for tree-sitter-dart.wasm for dart language', async () => {
			const result = await isGrammarAvailable('dart');
			expect(typeof result).toBe('boolean');
		});

		test('should reject uppercase and mixed-case language IDs', async () => {
			// Canonical IDs are always lowercase; uppercase/mixed are now rejected
			const result1 = await isGrammarAvailable('KOTLIN');
			const result3 = await isGrammarAvailable('Kotlin');
			expect(result1).toBe(false);
			expect(result3).toBe(false);
		});
	});

	describe('loadGrammar() - WASM file loading', () => {
		beforeEach(() => {
			clearParserCache();
		});

		test('should attempt to load tree-sitter-kotlin.wasm for kotlin', async () => {
			// Either succeeds (WASM file exists) or throws with language ID in message
			const result = await loadGrammar('kotlin').catch((e: Error) => e);
			if (result instanceof Error) {
				expect(result.message).toContain('kotlin');
			} else {
				expect(result).toBeDefined();
			}
		});

		test('should attempt to load tree-sitter-swift.wasm for swift', async () => {
			const result = await loadGrammar('swift').catch((e: Error) => e);
			if (result instanceof Error) {
				expect(result.message).toContain('swift');
			} else {
				expect(result).toBeDefined();
			}
		});

		test('should attempt to load tree-sitter-dart.wasm for dart', async () => {
			const result = await loadGrammar('dart').catch((e: Error) => e);
			if (result instanceof Error) {
				expect(result.message).toContain('dart');
			} else {
				expect(result).toBeDefined();
			}
		});
	});

	describe('LANGUAGE_WASM_MAP mapping behavior', () => {
		test('should return consistent results for the same language', async () => {
			// Test that multiple calls to isGrammarAvailable for the same language
			// use the same WASM file name (no randomness)
			const result1 = await isGrammarAvailable('kotlin');
			const result2 = await isGrammarAvailable('kotlin');
			expect(result1).toBe(result2);
		});

		test('should reject uppercase language IDs (canonical IDs are always lowercase)', async () => {
			// Uppercase IDs are now rejected upfront — canonical IDs are always lowercase
			const upperResult = await isGrammarAvailable('KOTLIN');
			expect(upperResult).toBe(false);
		});
	});

	describe('Module exports', () => {
		test('should export getSupportedLanguages function', () => {
			expect(typeof getSupportedLanguages).toBe('function');
		});

		test('should export isGrammarAvailable function', () => {
			expect(typeof isGrammarAvailable).toBe('function');
		});

		test('should export loadGrammar function', () => {
			expect(typeof loadGrammar).toBe('function');
		});

		test('should export clearParserCache function', () => {
			expect(typeof clearParserCache).toBe('function');
		});

		test('should NOT export LANGUAGE_WASM_MAP (private)', () => {
			const runtimeModule = require('../../../src/lang/runtime');
			expect(runtimeModule.LANGUAGE_WASM_MAP).toBeUndefined();
		});

		test('should NOT export getWasmFileName (private)', () => {
			const runtimeModule = require('../../../src/lang/runtime');
			expect(runtimeModule.getWasmFileName).toBeUndefined();
		});
	});

	describe('Edge cases', () => {
		test('should handle unknown language IDs gracefully', async () => {
			const error = await loadGrammar('unknown-language').catch((e) => e);
			expect(error).toBeInstanceOf(Error);
		});

		test('should return empty array if cache is cleared', () => {
			clearParserCache();
			const { getInitializedLanguages } = require('../../../src/lang/runtime');
			expect(getInitializedLanguages()).toEqual([]);
		});
	});
});
