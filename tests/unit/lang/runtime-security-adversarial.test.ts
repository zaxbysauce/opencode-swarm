import { describe, it, expect, beforeEach } from 'bun:test';
import {
	loadGrammar,
	isGrammarAvailable,
	clearParserCache,
} from '../../../src/lang/runtime';

describe('runtime.ts - Security Adversarial Tests', () => {
	beforeEach(() => {
		clearParserCache();
	});

	describe('1. Control characters', () => {
		it('should reject tab character in java\\t (unsafe input)', async () => {
			// Control chars are rejected upfront
			const available = await isGrammarAvailable('java\t');
			expect(available).toBe(false);
		});

		it('should reject newline in java\\n (unsafe input)', async () => {
			const available = await isGrammarAvailable('java\n');
			expect(available).toBe(false);
		});

		it('should reject carriage return in java\\r (unsafe input)', async () => {
			const available = await isGrammarAvailable('java\r');
			expect(available).toBe(false);
		});

		it('should reject multiple control chars - java\\t\\n\\r', async () => {
			const available = await isGrammarAvailable('java\t\n\r');
			expect(available).toBe(false);
		});

		it('should reject null byte \\x00 (unsafe input)', async () => {
			const available = await isGrammarAvailable('java\x00');
			expect(available).toBe(false);
		});

		it('should reject DEL character \\x7f (unsafe input)', async () => {
			const available = await isGrammarAvailable('java\x7f');
			expect(available).toBe(false);
		});

		it('should reject multiple ASCII control chars \\x01\\x02\\x03', async () => {
			const available = await isGrammarAvailable('java\x01\x02\x03');
			expect(available).toBe(false);
		});

		it('should throw when loading grammar with tab in language ID', async () => {
			let threw = false;
			try {
				await loadGrammar('java\t');
			} catch (e) {
				threw = true;
				expect((e as Error).message).toMatch(/contains unsafe characters/);
			}
			expect(threw).toBe(true);
		});

		it('should throw when loading grammar with newline in language ID', async () => {
			let threw = false;
			try {
				await loadGrammar('java\n');
			} catch (e) {
				threw = true;
				expect((e as Error).message).toMatch(/contains unsafe characters/);
			}
			expect(threw).toBe(true);
		});
	});

	describe('2. Path traversal attempts', () => {
		it('should strip forward slashes - ../../etc/kotlin', async () => {
			const available = await isGrammarAvailable('../../etc/kotlin');
			// After stripping: 'etckotlin' - not a valid language
			expect(available).toBe(false);
		});

		it('should strip backslashes - ..\\..\\windows\\kotlin', async () => {
			const available = await isGrammarAvailable('..\\..\\windows\\kotlin');
			// After stripping backslashes: '......windowskotlin' - not valid
			expect(available).toBe(false);
		});

		it('should strip mixed slashes - .\\./kotlin', async () => {
			const available = await isGrammarAvailable('.\\./kotlin');
			// After stripping: '..kotlin' - not valid
			expect(available).toBe(false);
		});

		it('should strip ./ prefix - ./kotlin', async () => {
			const available = await isGrammarAvailable('./kotlin');
			// After stripping: '.kotlin' - not valid
			expect(available).toBe(false);
		});

		it('should strip ../ prefix - ../kotlin', async () => {
			const available = await isGrammarAvailable('../kotlin');
			// After stripping: '..kotlin' - not valid
			expect(available).toBe(false);
		});

		it('should strip absolute path attempt - /etc/passwd', async () => {
			const available = await isGrammarAvailable('/etc/passwd');
			// After stripping: 'etcpasswd' - not valid
			expect(available).toBe(false);
		});

		it('should strip Windows drive letter pattern - C:\\Windows', async () => {
			const available = await isGrammarAvailable('C:\\Windows');
			// After stripping: 'CWindows' - not valid (C is lowercase to 'c')
			expect(available).toBe(false);
		});

		it('should not load grammar with path traversal', async () => {
			let threw = false;
			try {
				await loadGrammar('../kotlin');
			} catch (e) {
				threw = true;
				expect((e as Error).message).toMatch(/contains unsafe characters/);
			}
			expect(threw).toBe(true);
		});

		it('should not load grammar with slashes', async () => {
			// 'java/script' is rejected because slash is an unsafe character
			let threw = false;
			try {
				await loadGrammar('java/script');
			} catch (e) {
				threw = true;
				expect((e as Error).message).toMatch(/contains unsafe characters/);
			}
			expect(threw).toBe(true);
		});
	});

	describe('3. Windows reserved characters', () => {
		it('should reject colon - java:script (unsafe character)', async () => {
			const available = await isGrammarAvailable('java:script');
			expect(available).toBe(false);
		});

		it('should reject asterisk - kotlin* (unsafe character)', async () => {
			const available = await isGrammarAvailable('kotlin*');
			expect(available).toBe(false);
		});

		it('should reject question mark - swift? (unsafe character)', async () => {
			const available = await isGrammarAvailable('swift?');
			expect(available).toBe(false);
		});

		it('should reject double quote - "python" (unsafe character)', async () => {
			const available = await isGrammarAvailable('"python"');
			expect(available).toBe(false);
		});

		it('should reject less-than - <dart> (unsafe character)', async () => {
			const available = await isGrammarAvailable('<dart>');
			expect(available).toBe(false);
		});

		it('should strip greater than - rust>lang', async () => {
			const available = await isGrammarAvailable('rust>lang');
			// After stripping: 'rustlang' - not valid
			expect(available).toBe(false);
		});

		it('should strip pipe - go|lang', async () => {
			const available = await isGrammarAvailable('go|lang');
			// After stripping: 'golang' - not valid
			expect(available).toBe(false);
		});

		it('should strip multiple reserved chars - go:|*?rust', async () => {
			const available = await isGrammarAvailable('go:|*?rust');
			// After stripping: 'gorust' - not valid
			expect(available).toBe(false);
		});

		it('should throw when loading grammar with colon (unsafe character)', async () => {
			let threw = false;
			try {
				await loadGrammar('java:script');
			} catch (e) {
				threw = true;
				expect((e as Error).message).toMatch(/contains unsafe characters/);
			}
			expect(threw).toBe(true);
		});

		it('should throw when loading grammar with asterisk (unsafe character)', async () => {
			let threw = false;
			try {
				await loadGrammar('kotlin*');
			} catch (e) {
				threw = true;
				expect((e as Error).message).toMatch(/contains unsafe characters/);
			}
			expect(threw).toBe(true);
		});
	});

	describe('4. Unicode fullwidth slash', () => {
		it('should strip fullwidth solidus U+FF0F', async () => {
			const available = await isGrammarAvailable('kotlin\uFF0Fscript');
			// After stripping: 'kotlinscript' - not valid
			expect(available).toBe(false);
		});

		it('should strip fullwidth reverse solidus U+FF3C', async () => {
			const available = await isGrammarAvailable('swift\uFF3Ctest');
			// After stripping: 'swifttest' - not valid
			expect(available).toBe(false);
		});

		it('should reject fullwidth punctuation U+FF00-U+FFEF range (non-ASCII rejected)', async () => {
			// Non-ASCII characters are rejected upfront
			const available1 = await isGrammarAvailable('java\uFF01');
			expect(available1).toBe(false);

			const available2 = await isGrammarAvailable('python\uFF20');
			expect(available2).toBe(false);

			const available3 = await isGrammarAvailable('rust\uFF3B');
			expect(available3).toBe(false);
		});

		it('should reject Unicode General Punctuation U+2000-U+206F (non-ASCII rejected)', async () => {
			// Non-ASCII characters are rejected upfront
			const available1 = await isGrammarAvailable('java\u2000script');
			expect(available1).toBe(false);

			const available2 = await isGrammarAvailable('python\u200E');
			expect(available2).toBe(false);

			// Hyphen U+2010 - also non-ASCII, also rejected
			const available3 = await isGrammarAvailable('go\u2010lang');
			expect(available3).toBe(false);
		});
	});

	describe('5. Empty after sanitization', () => {
		it('should return false for only control chars - \\x00\\x01\\x02', async () => {
			const available = await isGrammarAvailable('\x00\x01\x02');
			expect(available).toBe(false);
		});

		it('should return false for only path chars - /\\\\:', async () => {
			const available = await isGrammarAvailable('/\\:');
			expect(available).toBe(false);
		});

		it('should return false for only reserved chars - *?"<>|', async () => {
			const available = await isGrammarAvailable('*?"<>|');
			expect(available).toBe(false);
		});

		it('should return false for only fullwidth chars - \\uFF0F\\uFF3C', async () => {
			const available = await isGrammarAvailable('\uFF0F\uFF3C');
			expect(available).toBe(false);
		});

		it('should throw when loading only control chars (unsafe characters)', async () => {
			let threw = false;
			try {
				await loadGrammar('\x00\x01\x02');
			} catch (e) {
				threw = true;
				expect((e as Error).message).toMatch(/contains unsafe characters/);
			}
			expect(threw).toBe(true);
		});

		it('should throw when loading only path chars (unsafe characters)', async () => {
			let threw = false;
			try {
				await loadGrammar('/\\:');
			} catch (e) {
				threw = true;
				expect((e as Error).message).toMatch(/contains unsafe characters/);
			}
			expect(threw).toBe(true);
		});
	});

	describe('6. Prototype pollution attempts', () => {
		it('should treat __proto__ as regular language lookup', async () => {
			// __proto__ is not a valid language
			const available = await isGrammarAvailable('__proto__');
			expect(available).toBe(false);
		});

		it('should treat constructor as regular language lookup', async () => {
			const available = await isGrammarAvailable('constructor');
			expect(available).toBe(false);
		});

		it('should treat toString as regular language lookup', async () => {
			const available = await isGrammarAvailable('toString');
			expect(available).toBe(false);
		});

		it('should treat hasOwnProperty as regular language lookup', async () => {
			const available = await isGrammarAvailable('hasOwnProperty');
			expect(available).toBe(false);
		});

		it('should throw when trying to load __proto__', async () => {
			let threw = false;
			try {
				await loadGrammar('__proto__');
			} catch (e) {
				threw = true;
				expect((e as Error).message).toMatch(/Grammar file not found/);
			}
			expect(threw).toBe(true);
		});

		it('should throw when trying to load constructor', async () => {
			let threw = false;
			try {
				await loadGrammar('constructor');
			} catch (e) {
				threw = true;
				expect((e as Error).message).toMatch(/Grammar file not found/);
			}
			expect(threw).toBe(true);
		});
	});

	describe('7. Very long ID (101+ characters)', () => {
		it('isGrammarAvailable should return false for 101 chars', async () => {
			const longId = 'a'.repeat(101);
			const result = await isGrammarAvailable(longId);
			expect(result).toBe(false);
		});

		it('isGrammarAvailable should return false for 200 chars', async () => {
			const longId = 'a'.repeat(200);
			const result = await isGrammarAvailable(longId);
			expect(result).toBe(false);
		});

		it('isGrammarAvailable should return false for 1000 chars', async () => {
			const longId = 'a'.repeat(1000);
			const result = await isGrammarAvailable(longId);
			expect(result).toBe(false);
		});

		it('loadGrammar should throw for 101 chars', async () => {
			const longId = 'a'.repeat(101);
			let threw = false;
			try {
				await loadGrammar(longId);
			} catch (e) {
				threw = true;
				expect((e as Error).message).toMatch(
					/must be a string of at most 100 characters/,
				);
			}
			expect(threw).toBe(true);
		});

		it('loadGrammar should throw for 200 chars', async () => {
			const longId = 'a'.repeat(200);
			let threw = false;
			try {
				await loadGrammar(longId);
			} catch (e) {
				threw = true;
				expect((e as Error).message).toMatch(
					/must be a string of at most 100 characters/,
				);
			}
			expect(threw).toBe(true);
		});

		it('loadGrammar should throw for 1000 chars', async () => {
			const longId = 'a'.repeat(1000);
			let threw = false;
			try {
				await loadGrammar(longId);
			} catch (e) {
				threw = true;
				expect((e as Error).message).toMatch(
					/must be a string of at most 100 characters/,
				);
			}
			expect(threw).toBe(true);
		});
	});

	describe('8. Invalid types - null, undefined, number, object', () => {
		it('isGrammarAvailable(null) returns false', async () => {
			const result = await isGrammarAvailable(null as unknown as string);
			expect(result).toBe(false);
		});

		it('isGrammarAvailable(undefined) returns false', async () => {
			const result = await isGrammarAvailable(undefined as unknown as string);
			expect(result).toBe(false);
		});

		it('isGrammarAvailable(0) returns false', async () => {
			const result = await isGrammarAvailable(0 as unknown as string);
			expect(result).toBe(false);
		});

		it('isGrammarAvailable(123) returns false', async () => {
			const result = await isGrammarAvailable(123 as unknown as string);
			expect(result).toBe(false);
		});

		it('isGrammarAvailable(NaN) returns false', async () => {
			const result = await isGrammarAvailable(NaN as unknown as string);
			expect(result).toBe(false);
		});

		it('isGrammarAvailable({}) returns false', async () => {
			const result = await isGrammarAvailable({} as unknown as string);
			expect(result).toBe(false);
		});

		it('isGrammarAvailable({lang: "java"}) returns false', async () => {
			const result = await isGrammarAvailable({
				lang: 'java',
			} as unknown as string);
			expect(result).toBe(false);
		});

		it('isGrammarAvailable([]) returns false', async () => {
			const result = await isGrammarAvailable([] as unknown as string);
			expect(result).toBe(false);
		});

		it('isGrammarAvailable(["java"]) returns false', async () => {
			const result = await isGrammarAvailable([
				'java',
			] as unknown as string);
			expect(result).toBe(false);
		});

		it('isGrammarAvailable(true) returns false', async () => {
			const result = await isGrammarAvailable(true as unknown as string);
			expect(result).toBe(false);
		});

		it('isGrammarAvailable(false) returns false', async () => {
			const result = await isGrammarAvailable(false as unknown as string);
			expect(result).toBe(false);
		});

		it('isGrammarAvailable(function(){}) returns false', async () => {
			const result = await isGrammarAvailable(
				function () {} as unknown as string,
			);
			expect(result).toBe(false);
		});

		it('loadGrammar(null) throws', async () => {
			let threw = false;
			try {
				await loadGrammar(null as unknown as string);
			} catch (e) {
				threw = true;
				expect((e as Error).message).toMatch(
					/must be a string of at most 100 characters/,
				);
			}
			expect(threw).toBe(true);
		});

		it('loadGrammar(undefined) throws', async () => {
			let threw = false;
			try {
				await loadGrammar(undefined as unknown as string);
			} catch (e) {
				threw = true;
				expect((e as Error).message).toMatch(
					/must be a string of at most 100 characters/,
				);
			}
			expect(threw).toBe(true);
		});

		it('loadGrammar(123) throws', async () => {
			let threw = false;
			try {
				await loadGrammar(123 as unknown as string);
			} catch (e) {
				threw = true;
				expect((e as Error).message).toMatch(
					/must be a string of at most 100 characters/,
				);
			}
			expect(threw).toBe(true);
		});

		it('loadGrammar({}) throws', async () => {
			let threw = false;
			try {
				await loadGrammar({} as unknown as string);
			} catch (e) {
				threw = true;
				expect((e as Error).message).toMatch(
					/must be a string of at most 100 characters/,
				);
			}
			expect(threw).toBe(true);
		});

		it('loadGrammar([]) throws', async () => {
			let threw = false;
			try {
				await loadGrammar([] as unknown as string);
			} catch (e) {
				threw = true;
				expect((e as Error).message).toMatch(
					/must be a string of at most 100 characters/,
				);
			}
			expect(threw).toBe(true);
		});

		it('loadGrammar(true) throws', async () => {
			let threw = false;
			try {
				await loadGrammar(true as unknown as string);
			} catch (e) {
				threw = true;
				expect((e as Error).message).toMatch(
					/must be a string of at most 100 characters/,
				);
			}
			expect(threw).toBe(true);
		});
	});

	describe('9. Mixed adversarial inputs', () => {
		it('should handle control chars + path traversal', async () => {
			const available = await isGrammarAvailable('../\t\n\x00kotlin');
			// After stripping: '...kotlin' -> '..kotlin' - not valid
			expect(available).toBe(false);
		});

		it('should handle reserved chars + unicode', async () => {
			const available = await isGrammarAvailable('java*:?\uFF0F');
			// All chars are unsafe (asterisk, colon, question mark, non-ASCII)
			expect(available).toBe(false);
		});

		it('should handle very long string with control chars', async () => {
			const longStr = 'a'.repeat(50) + '\x00\x01\x02' + 'b'.repeat(50);
			expect(longStr.length).toBe(103); // > 100 chars
			const result = await isGrammarAvailable(longStr);
			expect(result).toBe(false); // Length check first
		});

		it('should handle null-byte injection in otherwise valid language', async () => {
			const available = await isGrammarAvailable('java\x00script');
			// Null byte is unsafe, so the entire input is rejected
			expect(available).toBe(false);
		});

		it('should throw when loading grammar with null-byte injection', async () => {
			let threw = false;
			try {
				await loadGrammar('java\x00script');
			} catch (e) {
				threw = true;
				expect((e as Error).message).toMatch(/contains unsafe characters/);
			}
			expect(threw).toBe(true);
		});
	});

	describe('10. Edge cases around length limit', () => {
		it('should accept exactly 100 characters (though will fail lookup)', async () => {
			// 'javascript' is 10 chars, need 90 more to make 100
			const id = 'javascript' + 'x'.repeat(90); // 100 total
			let threwLength = false;
			let threwNotFound = false;
			try {
				await loadGrammar(id);
			} catch (e) {
				const msg = (e as Error).message;
				if (msg.match(/must be a string of at most 100 characters/)) {
					threwLength = true;
				}
				if (msg.match(/Grammar file not found/)) {
					threwNotFound = true;
				}
			}
			expect(threwLength).toBe(false); // Should NOT throw length error
			expect(threwNotFound).toBe(true); // Should throw file not found
		});

		it('should reject 101 characters immediately', async () => {
			const id = 'javascript' + 'x'.repeat(91); // 101 total (10 + 91 = 101)
			let threw = false;
			try {
				await loadGrammar(id);
			} catch (e) {
				threw = true;
				expect((e as Error).message).toMatch(
					/must be a string of at most 100 characters/,
				);
			}
			expect(threw).toBe(true);
		});

		it('should reject 100 chars that are all control chars (unsafe)', async () => {
			// Create exactly 100 control chars using string repetition
			// \x00 repeated 100 times — passes length check but rejected as unsafe
			const id = '\x00'.repeat(100);
			expect(id.length).toBe(100);
			let threw = false;
			try {
				await loadGrammar(id);
			} catch (e) {
				threw = true;
				expect((e as Error).message).toMatch(/contains unsafe characters/);
			}
			expect(threw).toBe(true);
		});
	});
});
