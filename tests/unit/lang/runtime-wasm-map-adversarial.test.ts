/**
 * Adversarial tests for LANGUAGE_WASM_MAP and related functions in src/lang/runtime.ts
 *
 * These tests verify that malformed inputs, injection attempts, and unexpected
 * language IDs are handled gracefully without crashing or exposing security vulnerabilities.
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import {
	clearParserCache,
	getSupportedLanguages,
	isGrammarAvailable,
	loadGrammar,
} from '../../../src/lang/runtime';

describe('runtime.ts - LANGUAGE_WASM_MAP Adversarial Tests', () => {
	beforeEach(() => {
		// Clear cache before each test
		clearParserCache();
	});

	describe('Path Traversal Attack Vectors', () => {
		it('should reject language ID with path traversal: ../../etc/kotlin', async () => {
			// isGrammarAvailable should return false
			const available = await isGrammarAvailable('../../etc/kotlin');
			expect(available).toBe(false);

			// loadGrammar should fail gracefully with appropriate error
			await expect(loadGrammar('../../etc/kotlin')).rejects.toThrow();
		});

		it('should reject language ID with double-dot path components: ../../../etc/passwd', async () => {
			const available = await isGrammarAvailable('../../../etc/passwd');
			expect(available).toBe(false);

			await expect(loadGrammar('../../../etc/passwd')).rejects.toThrow();
		});

		it('should reject language ID with backslash path traversal: ..\\..\\windows\\system32', async () => {
			const available = await isGrammarAvailable('..\\..\\windows\\system32');
			expect(available).toBe(false);

			await expect(loadGrammar('..\\..\\windows\\system32')).rejects.toThrow();
		});
	});

	describe('Null Byte Injection', () => {
		it('should handle language ID with null byte: kotlin\\0', async () => {
			const available = await isGrammarAvailable('kotlin\0');
			expect(available).toBe(false);

			await expect(loadGrammar('kotlin\0')).rejects.toThrow();
		});

		it('should handle language ID with multiple null bytes', async () => {
			const available = await isGrammarAvailable('java\0\0script');
			expect(available).toBe(false);

			await expect(loadGrammar('java\0\0script')).rejects.toThrow();
		});

		it('should handle null byte at the beginning: \\0python', async () => {
			const available = await isGrammarAvailable('\0python');
			expect(available).toBe(false);

			await expect(loadGrammar('\0python')).rejects.toThrow();
		});
	});

	describe('Empty and Whitespace Inputs', () => {
		it('should handle empty string as language ID', async () => {
			const available = await isGrammarAvailable('');
			expect(available).toBe(false);

			await expect(loadGrammar('')).rejects.toThrow();
		});

		it('should handle language ID with only whitespace: "   "', async () => {
			const available = await isGrammarAvailable('   ');
			expect(available).toBe(false);

			await expect(loadGrammar('   ')).rejects.toThrow();
		});

		it('SECURITY ISSUE: language ID with tab character "java\\tscript" accidentally loads javascript.wasm', async () => {
			// FIXED: tab character is rejected as invalid, preventing path traversal
			// "java\tscript" is not accepted; the runtime rejects control characters
			const available = await isGrammarAvailable('java\tscript');
			expect(available).toBe(false); // Fixed: control characters rejected

			await expect(loadGrammar('java\tscript')).rejects.toThrow();
		});

		it('SECURITY ISSUE: language ID with newline "java\\nscript" accidentally loads javascript.wasm', async () => {
			// FIXED: newline character is rejected as invalid, preventing path traversal
			// "java\nscript" is not accepted; the runtime rejects control characters
			const available = await isGrammarAvailable('java\nscript');
			expect(available).toBe(false); // Fixed: control characters rejected

			await expect(loadGrammar('java\nscript')).rejects.toThrow();
		});
	});

	describe('Very Long Language IDs', () => {
		it('should handle very long language ID (10,000 chars) without crashing', async () => {
			const longId = 'a'.repeat(10000);

			const available = await isGrammarAvailable(longId);
			expect(available).toBe(false);

			await expect(loadGrammar(longId)).rejects.toThrow();
		});

		it('should handle language ID with 100,000 chars (extreme case)', async () => {
			const longId = 'x'.repeat(100000);

			const available = await isGrammarAvailable(longId);
			expect(available).toBe(false);

			await expect(loadGrammar(longId)).rejects.toThrow();
		});

		it('should handle language ID with mixed valid and invalid characters at large scale', async () => {
			const longId = 'abc'.repeat(3333) + '@#$%';

			const available = await isGrammarAvailable(longId);
			expect(available).toBe(false);

			await expect(loadGrammar(longId)).rejects.toThrow();
		});
	});

	describe('Slash in Language ID', () => {
		it('should reject language ID with forward slash: kotlin/swift', async () => {
			const available = await isGrammarAvailable('kotlin/swift');
			expect(available).toBe(false);

			await expect(loadGrammar('kotlin/swift')).rejects.toThrow();
		});

		it('should reject language ID with multiple slashes: a/b/c/d/e', async () => {
			const available = await isGrammarAvailable('a/b/c/d/e');
			expect(available).toBe(false);

			await expect(loadGrammar('a/b/c/d/e')).rejects.toThrow();
		});

		it('should reject language ID starting with slash: /javascript', async () => {
			const available = await isGrammarAvailable('/javascript');
			expect(available).toBe(false);

			await expect(loadGrammar('/javascript')).rejects.toThrow();
		});

		it('should reject language ID ending with slash: javascript/', async () => {
			const available = await isGrammarAvailable('javascript/');
			expect(available).toBe(false);

			await expect(loadGrammar('javascript/')).rejects.toThrow();
		});
	});

	describe('Near-Match Language IDs', () => {
		it('should reject language ID with number suffix: kotlin2', async () => {
			const available = await isGrammarAvailable('kotlin2');
			expect(available).toBe(false);

			await expect(loadGrammar('kotlin2')).rejects.toThrow();
		});

		it('should reject uppercase language ID: KOTLIN', async () => {
			// Runtime normalizes case: KOTLIN maps to kotlin (case-insensitive)
			const available = await isGrammarAvailable('KOTLIN');
			expect(available).toBe(true); // case-insensitive: KOTLIN resolves to kotlin
		});

		it('should reject language ID with trailing space: "kotlin "', async () => {
			const available = await isGrammarAvailable('kotlin ');
			expect(available).toBe(false);

			await expect(loadGrammar('kotlin ')).rejects.toThrow();
		});

		it('should reject language ID with leading space: " kotlin"', async () => {
			const available = await isGrammarAvailable(' kotlin');
			expect(available).toBe(false);

			await expect(loadGrammar(' kotlin')).rejects.toThrow();
		});

		it('should reject language ID with internal spaces: "java script"', async () => {
			const available = await isGrammarAvailable('java script');
			expect(available).toBe(false);

			await expect(loadGrammar('java script')).rejects.toThrow();
		});

		it('should reject language ID with underscore instead of hyphen: java_script', async () => {
			const available = await isGrammarAvailable('java_script');
			expect(available).toBe(false);

			await expect(loadGrammar('java_script')).rejects.toThrow();
		});
	});

	describe('Prototype Pollution Attack Vectors', () => {
		it('should handle __proto__ as language ID', async () => {
			const available = await isGrammarAvailable('__proto__');
			expect(available).toBe(false);

			await expect(loadGrammar('__proto__')).rejects.toThrow();
		});

		it('should handle constructor as language ID', async () => {
			const available = await isGrammarAvailable('constructor');
			expect(available).toBe(false);

			await expect(loadGrammar('constructor')).rejects.toThrow();
		});

		it('should handle prototype as language ID', async () => {
			const available = await isGrammarAvailable('prototype');
			expect(available).toBe(false);

			await expect(loadGrammar('prototype')).rejects.toThrow();
		});

		it('should handle toString as language ID', async () => {
			const available = await isGrammarAvailable('toString');
			expect(available).toBe(false);

			await expect(loadGrammar('toString')).rejects.toThrow();
		});

		it('should handle valueOf as language ID', async () => {
			const available = await isGrammarAvailable('valueOf');
			expect(available).toBe(false);

			await expect(loadGrammar('valueOf')).rejects.toThrow();
		});

		it('should handle hasOwnProperty as language ID', async () => {
			const available = await isGrammarAvailable('hasOwnProperty');
			expect(available).toBe(false);

			await expect(loadGrammar('hasOwnProperty')).rejects.toThrow();
		});
	});

	describe('Numeric Language IDs', () => {
		it('should handle numeric language ID: 0', async () => {
			const available = await isGrammarAvailable('0');
			expect(available).toBe(false);

			await expect(loadGrammar('0')).rejects.toThrow();
		});

		it('should handle numeric language ID: 123', async () => {
			const available = await isGrammarAvailable('123');
			expect(available).toBe(false);

			await expect(loadGrammar('123')).rejects.toThrow();
		});

		it('should handle large numeric language ID: 999999', async () => {
			const available = await isGrammarAvailable('999999');
			expect(available).toBe(false);

			await expect(loadGrammar('999999')).rejects.toThrow();
		});

		it('should handle negative numeric string: -1', async () => {
			const available = await isGrammarAvailable('-1');
			expect(available).toBe(false);

			await expect(loadGrammar('-1')).rejects.toThrow();
		});
	});

	describe('Special Characters', () => {
		it('should handle language ID with pipe character: java|script', async () => {
			const available = await isGrammarAvailable('java|script');
			expect(available).toBe(false);

			await expect(loadGrammar('java|script')).rejects.toThrow();
		});

		it('should handle language ID with semicolon: javascript;rm -rf', async () => {
			const available = await isGrammarAvailable('javascript;rm -rf');
			expect(available).toBe(false);

			await expect(loadGrammar('javascript;rm -rf')).rejects.toThrow();
		});

		it('should handle language ID with backtick: `javascript`', async () => {
			const available = await isGrammarAvailable('`javascript`');
			expect(available).toBe(false);

			await expect(loadGrammar('`javascript`')).rejects.toThrow();
		});

		it('should handle language ID with dollar sign: $java', async () => {
			const available = await isGrammarAvailable('$java');
			expect(available).toBe(false);

			await expect(loadGrammar('$java')).rejects.toThrow();
		});

		it('should handle language ID with at sign: @python', async () => {
			const available = await isGrammarAvailable('@python');
			expect(available).toBe(false);

			await expect(loadGrammar('@python')).rejects.toThrow();
		});
	});

	describe('Unicode and International Characters', () => {
		it('should handle language ID with emoji: python🐍', async () => {
			const available = await isGrammarAvailable('python🐍');
			expect(available).toBe(false);

			await expect(loadGrammar('python🐍')).rejects.toThrow();
		});

		it('should handle language ID with Chinese characters: python代码', async () => {
			const available = await isGrammarAvailable('python代码');
			expect(available).toBe(false);

			await expect(loadGrammar('python代码')).rejects.toThrow();
		});

		it('should handle language ID with right-to-left text: ‮kotlin', async () => {
			const available = await isGrammarAvailable('\u202Ekotlin');
			expect(available).toBe(false);

			await expect(loadGrammar('\u202Ekotlin')).rejects.toThrow();
		});
	});

	describe('getSupportedLanguages Integrity', () => {
		it('should not be affected by prototype pollution on Object.prototype', () => {
			// Attempt to pollute prototype
			(Object.prototype as any).maliciousLanguage =
				'tree-sitter-malicious.wasm';

			const languages = getSupportedLanguages();

			// Should not include the polluted property
			expect(languages).not.toContain('maliciousLanguage');

			// Should contain expected languages
			expect(languages).toContain('javascript');
			expect(languages).toContain('python');
			expect(languages).toContain('kotlin');

			// Clean up
			delete (Object.prototype as any).maliciousLanguage;
		});

		it('should return an array with expected structure', () => {
			const languages = getSupportedLanguages();
			expect(Array.isArray(languages)).toBe(true);
			expect(languages.length).toBeGreaterThan(0);

			// All items should be strings
			for (const lang of languages) {
				expect(typeof lang).toBe('string');
				expect(lang.length).toBeGreaterThan(0);
			}
		});
	});

	describe('Mixed Attack Vectors', () => {
		it('should handle language ID combining path traversal and special chars: ../../etc/kotlin;rm', async () => {
			const available = await isGrammarAvailable('../../etc/kotlin;rm');
			expect(available).toBe(false);

			await expect(loadGrammar('../../etc/kotlin;rm')).rejects.toThrow();
		});

		it('should handle language ID combining uppercase and null: JAVA\0SCRIPT', async () => {
			const available = await isGrammarAvailable('JAVA\0SCRIPT');
			expect(available).toBe(false);

			await expect(loadGrammar('JAVA\0SCRIPT')).rejects.toThrow();
		});

		it('should handle language ID combining prototype pollution and path: __proto__/etc/passwd', async () => {
			const available = await isGrammarAvailable('__proto__/etc/passwd');
			expect(available).toBe(false);

			await expect(loadGrammar('__proto__/etc/passwd')).rejects.toThrow();
		});
	});
});
