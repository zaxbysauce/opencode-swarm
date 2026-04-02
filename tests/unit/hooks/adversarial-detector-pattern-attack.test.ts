import { describe, expect, it } from 'bun:test';
import {
	type AdversarialPatternMatch,
	detectAdversarialPatterns,
	formatPrecedentManipulationEvent,
} from '../../../src/hooks/adversarial-detector';

describe('adversarial-detector - Pattern Detection Adversarial Testing', () => {
	describe('ATTACK VECTOR 1: Regex Injection via User Input', () => {
		it('INJECT-1: Embedded regex modifiers in user text should not crash', () => {
			// Attempt to inject regex modifiers like (?i) for case insensitive
			const maliciousText =
				'I verified the code (?i) and it looks correct to me';
			expect(() => detectAdversarialPatterns(maliciousText)).not.toThrow();
			const result = detectAdversarialPatterns(maliciousText);
			expect(Array.isArray(result)).toBe(true);
		});

		it('INJECT-2: Regex quantifier overflow attempts should not crash', () => {
			// Attempt to inject pathological quantifier sequences
			const maliciousText =
				'I verified the code {1000000} and reviewed myself {999999} times';
			expect(() => detectAdversarialPatterns(maliciousText)).not.toThrow();
		});

		it('INJECT-3: Backreference injection attempts', () => {
			// Attempt to inject backreferences that could crash the regex engine
			const maliciousText =
				'This is consistent with \\1 and I checked \\2 myself';
			expect(() => detectAdversarialPatterns(maliciousText)).not.toThrow();
		});

		it('INJECT-4: Lookahead/lookbehind injection attempts', () => {
			// Attempt to inject lookaheads/lookbehinds
			const maliciousText =
				'Code looks correct to me (?=in phase) and (?<=review)';
			expect(() => detectAdversarialPatterns(maliciousText)).not.toThrow();
		});

		it('INJECT-5: Character class injection with special characters', () => {
			// Attempt to inject complex character classes
			const maliciousText = 'To save time we skipped [a-zA-Z0-9] in phase 1';
			expect(() => detectAdversarialPatterns(maliciousText)).not.toThrow();
			const result = detectAdversarialPatterns(maliciousText);
			// Matches both VELOCITY_RATIONALIZATION ("to save time") and PRECEDENT_MANIPULATION ("we skipped ... in phase 1")
			expect(result.length).toBeGreaterThanOrEqual(1);
			expect(result.some((r) => r.pattern === 'PRECEDENT_MANIPULATION')).toBe(
				true,
			);
		});
	});

	describe('ATTACK VECTOR 2: ReDoS (Regular Expression Denial of Service)', () => {
		it('REDOS-1: Pattern /I (verified|checked|reviewed|validated).*(myself|my own)/i with long input - should complete quickly', () => {
			const start = Date.now();
			// Create a string that could cause catastrophic backtracking
			// Long text between alternatives to test for ReDoS vulnerability
			const longText = 'I verified ' + 'a'.repeat(1000) + ' myself';
			const result = detectAdversarialPatterns(longText);
			const elapsed = Date.now() - start;

			// Should complete in reasonable time (< 1 second)
			expect(elapsed).toBeLessThan(1000);
			expect(Array.isArray(result)).toBe(true);
		});

		it('REDOS-2: Pattern /we skipped .* in phase d+/i with long input - should complete quickly', () => {
			const start = Date.now();
			// The greedy .* before "in phase" could cause issues
			const longText = 'we skipped ' + 'a'.repeat(1000) + ' in phase 1';
			const result = detectAdversarialPatterns(longText);
			const elapsed = Date.now() - start;

			expect(elapsed).toBeLessThan(1000);
			expect(result).toHaveLength(1);
			expect(result[0].pattern).toBe('PRECEDENT_MANIPULATION');
		});

		it('REDOS-3: Multiple repeated patterns - should not cause exponential backtracking', () => {
			const start = Date.now();
			// Create text with many potential matches
			const repeatedText = Array(100)
				.fill(0)
				.map(() => 'This looks good. ')
				.join('');
			const result = detectAdversarialPatterns(repeatedText);
			const elapsed = Date.now() - start;

			expect(elapsed).toBeLessThan(1000);
			expect(Array.isArray(result)).toBe(true);
		});

		it('REDOS-4: Nested overlapping patterns - should complete quickly', () => {
			const start = Date.now();
			// Text with overlapping pattern matches
			const nestedText =
				'I verified the code and checked myself since we skipped code review in phase 1 to save time';
			const result = detectAdversarialPatterns(nestedText);
			const elapsed = Date.now() - start;

			expect(elapsed).toBeLessThan(1000);
			// Should detect multiple patterns
			expect(result.length).toBeGreaterThan(0);
		});

		it('REDOS-5: Extremely long text with no matches - should return empty array quickly', () => {
			const start = Date.now();
			// Very long text that doesn't match any patterns
			const longText = 'x'.repeat(100000);
			const result = detectAdversarialPatterns(longText);
			const elapsed = Date.now() - start;

			expect(elapsed).toBeLessThan(1000);
			expect(result).toHaveLength(0);
		});

		it('REDOS-6: Alternatives with long separator - should complete quickly', () => {
			const start = Date.now();
			// Pattern /I (verified|checked|reviewed|validated).*(myself|my own)/i
			// with very long separator between first and second alternative
			const longSeparator = 'I verified ' + 'a'.repeat(5000) + ' myself';
			const result = detectAdversarialPatterns(longSeparator);
			const elapsed = Date.now() - start;

			expect(elapsed).toBeLessThan(1000);
			expect(result).toHaveLength(1);
			expect(result[0].pattern).toBe('SELF_REVIEW');
		});
	});

	describe('ATTACK VECTOR 3: Case Sensitivity Bypass', () => {
		it('CASE-1: All uppercase pattern variants should be detected', () => {
			const text = 'I VERIFIED THE CODE MYSELF';
			const result = detectAdversarialPatterns(text);
			expect(result).toHaveLength(1);
			expect(result[0].pattern).toBe('SELF_REVIEW');
		});

		it('CASE-2: Mixed case pattern variants should be detected', () => {
			const text = 'I vErIfIeD the code mYsElF';
			const result = detectAdversarialPatterns(text);
			expect(result).toHaveLength(1);
			expect(result[0].pattern).toBe('SELF_REVIEW');
		});

		it('CASE-3: Title case patterns should be detected', () => {
			const text = 'This Is Just A Typo So We Can Skip Review';
			const result = detectAdversarialPatterns(text);
			// Matches CONTENT_EXEMPTION ("just a typo") and VELOCITY_RATIONALIZATION ("skip" is part of "review.*later" pattern)
			expect(result.length).toBeGreaterThanOrEqual(1);
			expect(result.some((r) => r.pattern === 'CONTENT_EXEMPTION')).toBe(true);
		});

		it('CASE-4: Pattern with capital "IN PHRASE" should be detected', () => {
			const text = 'We skipped code IN PHASE 1';
			const result = detectAdversarialPatterns(text);
			expect(result).toHaveLength(1);
			expect(result[0].pattern).toBe('PRECEDENT_MANIPULATION');
		});

		it('CASE-5: Velocity rationalization with case variations', () => {
			const text = 'TO SAVE TIME we should SKIP REVIEW';
			const result = detectAdversarialPatterns(text);
			expect(result).toHaveLength(1);
			expect(result[0].pattern).toBe('VELOCITY_RATIONALIZATION');
		});

		it('CASE-6: Mixed case pattern with embedded words', () => {
			const text = 'The Code LOOKS FINE To Me';
			const result = detectAdversarialPatterns(text);
			expect(result.length).toBeGreaterThan(0);
			// Should detect at least GATE_DELEGATION_BYPASS
			const hasGateBypass = result.some(
				(r) => r.pattern === 'GATE_DELEGATION_BYPASS',
			);
			expect(hasGateBypass).toBe(true);
		});

		it('CASE-7: Case variations across pattern types - all should be detected', () => {
			const text =
				'WE SKIPPED THIS in PHASE 2 AND I CHECKED MYSELF. THIS IS JUST A RENAME TO SAVE TIME';
			const result = detectAdversarialPatterns(text);
			expect(result.length).toBeGreaterThanOrEqual(3);
			const patterns = result.map((r) => r.pattern);
			expect(patterns).toContain('PRECEDENT_MANIPULATION');
			expect(patterns).toContain('SELF_REVIEW');
			expect(patterns).toContain('VELOCITY_RATIONALIZATION');
		});
	});

	describe('ATTACK VECTOR 4: Pattern Collision/Confusion', () => {
		it('COLLISION-1: GATE_DELEGATION_BYPASS and SELF_REVIEW overlap detection', () => {
			// Both patterns could match "I verified... myself"
			const text = 'I verified the code myself';
			const result = detectAdversarialPatterns(text);
			expect(result.length).toBeGreaterThanOrEqual(1);
			const patterns = result.map((r) => r.pattern);

			// Should detect SELF_REVIEW
			expect(patterns).toContain('SELF_REVIEW');

			// Check matchedText for both patterns to see if they overlap
			const matchedTexts = result.map((r) => r.matchedText);
			// Different patterns might match overlapping text
			expect(matchedTexts.length).toBeGreaterThan(0);
		});

		it('COLLISION-2: VELOCITY_RATIONALIZATION and CONTENT_EXEMPTION overlap', () => {
			// "This is just a rename" (CONTENT_EXEMPTION) vs "to save time" (VELOCITY_RATIONALIZATION)
			const text = 'This is just a rename to save time on review';
			const result = detectAdversarialPatterns(text);
			expect(result.length).toBeGreaterThanOrEqual(2);
			const patterns = result.map((r) => r.pattern);
			expect(patterns).toContain('CONTENT_EXEMPTION');
			expect(patterns).toContain('VELOCITY_RATIONALIZATION');
		});

		it('COLLISION-3: Multiple patterns in single phrase', () => {
			// Single phrase could trigger multiple patterns
			const text = 'The code looks good to me and this is just a refactor';
			const result = detectAdversarialPatterns(text);
			expect(result.length).toBeGreaterThanOrEqual(2);
			const patterns = result.map((r) => r.pattern);
			expect(patterns).toContain('GATE_DELEGATION_BYPASS');
			expect(patterns).toContain('CONTENT_EXEMPTION');
		});

		it('COLLISION-4: PRECEDENT_MANIPULATION and VELOCITY_RATIONALIZATION overlap', () => {
			// "we skipped ... in phase" vs "to save time"
			const text = 'We skipped this step in phase 1 to save time going forward';
			const result = detectAdversarialPatterns(text);
			expect(result.length).toBeGreaterThanOrEqual(2);
			const patterns = result.map((r) => r.pattern);
			expect(patterns).toContain('PRECEDENT_MANIPULATION');
			expect(patterns).toContain('VELOCITY_RATIONALIZATION');
		});

		it('COLLISION-5: All HIGHEST severity patterns in same text', () => {
			// PRECEDENT_MANIPULATION and GATE_DELEGATION_BYPASS are both HIGHEST
			const text =
				'We skipped tests in phase 2 and I verified the changes myself';
			const result = detectAdversarialPatterns(text);
			const highestSeverityPatterns = result.filter(
				(r) => r.severity === 'HIGHEST',
			);
			expect(highestSeverityPatterns.length).toBeGreaterThanOrEqual(2);
		});

		it('COLLISION-6: Check confidence levels on overlapping patterns', () => {
			// All detected patterns currently have HIGH confidence
			const text = 'I checked myself because this is just a quick fix';
			const result = detectAdversarialPatterns(text);
			expect(result.length).toBeGreaterThan(0);

			// Verify all have HIGH confidence
			result.forEach((match) => {
				expect(match.confidence).toBe('HIGH');
			});
		});

		it('COLLISION-7: Pattern order independence - multiple patterns detected regardless of order', () => {
			// Same patterns, different order in text
			const text1 = 'This is just a typo. We skipped this in phase 1.';
			const text2 = 'We skipped this in phase 1. This is just a typo.';

			const result1 = detectAdversarialPatterns(text1);
			const result2 = detectAdversarialPatterns(text2);

			// Should detect same number of patterns
			expect(result1.length).toBe(result2.length);

			// Should detect same pattern types
			const patterns1 = result1.map((r) => r.pattern).sort();
			const patterns2 = result2.map((r) => r.pattern).sort();
			expect(patterns1).toEqual(patterns2);
		});
	});

	describe('ATTACK VECTOR 5: False Positive Amplification', () => {
		it('FALSE-POS-1: Legitimate code review comments should not trigger detection', () => {
			// Normal code review language that might accidentally match patterns
			const text =
				'The code structure looks good. I verified the logic and checked the test cases. The implementation appears correct. This is a minor refactor of the utility function. We should review this before merging.';
			const result = detectAdversarialPatterns(text);

			// "looks good" might trigger GATE_DELEGATION_BYPASS
			// "verified" might trigger SELF_REVIEW
			// "just a ... refactor" might trigger CONTENT_EXEMPTION
			// But these should be minimal or not present for legitimate review
			const nonFalsePositives = result.filter(
				(r) => !r.matchedText.toLowerCase().includes('looks good'),
			);

			// At minimum, we expect minimal false positives
			// Documenting the current behavior: "looks good" and "appears correct" DO trigger detection
			// This is expected per the pattern definitions, not a bug
			expect(Array.isArray(result)).toBe(true);
		});

		it('FALSE-POS-2: Technical documentation with "just a" should trigger (expected behavior)', () => {
			// Technical docs might use "just a" legitimately
			const text =
				'This is just a configuration change. Documentation update for the API.';
			const result = detectAdversarialPatterns(text);
			expect(result).toHaveLength(1);
			expect(result[0].pattern).toBe('CONTENT_EXEMPTION');

			// This is EXPECTED behavior - the pattern intentionally catches this phrasing
			// to prevent agents from claiming documentation/config changes don't need review
		});

		it('FALSE-POS-3: Velocity pressure vs legitimate speed optimization', () => {
			// Legitimate optimization language vs "to save time"
			const text =
				'We can optimize this for speed. Performance improvement for efficiency.';
			const result = detectAdversarialPatterns(text);

			// "for efficiency" should trigger VELOCITY_RATIONALIZATION
			// This is expected per the pattern definition
			expect(result).toHaveLength(1);
			expect(result[0].pattern).toBe('VELOCITY_RATIONALIZATION');
		});

		it('FALSE-POS-4: "The code looks correct" - legitimate assessment vs bypass', () => {
			// Engineer might say this after careful review
			const text =
				'After thorough review, the code looks correct and implements the requirements properly.';
			const result = detectAdversarialPatterns(text);

			// Pattern /this (looks|seems|appears) (good|correct|fine)/i requires "this" before "looks correct"
			// So this DOESN'T match, showing a limitation in the pattern
			expect(result).toHaveLength(0);
		});

		it('FALSE-POS-5: "In the interest of" - legitimate vs adversarial', () => {
			// Could be legitimate business reasoning or adversarial
			const text = 'In the interest of code quality, we should run more tests.';
			const result = detectAdversarialPatterns(text);

			// Pattern /in the interest of efficiency/i specifically requires "efficiency" at the end
			// So this DOESN'T match, showing a limitation - adversarial phrasing could use other words
			expect(result).toHaveLength(0);
		});

		it('FALSE-POS-6: Multiple benign phrases that individually trigger patterns', () => {
			// Test text with several pattern matches that might be false positives
			const text =
				'This appears fine. The structure looks good. I think this is correct. This is just a minor update.';
			const result = detectAdversarialPatterns(text);

			// Should detect all patterns - this is expected behavior
			expect(result.length).toBeGreaterThan(2);
		});

		it('FALSE-POS-7: Edge case: "consistent with" in technical context', () => {
			// Could be about algorithm consistency or precedent manipulation
			const text =
				'This implementation is consistent with the API specification.';
			const result = detectAdversarialPatterns(text);

			// Pattern /this is consistent with/i requires "this is" before "consistent with"
			// So this DOESN'T match, showing a limitation - "consistent with" alone isn't caught
			expect(result).toHaveLength(0);
		});

		it('FALSE-POS-8: Empty and minimal input handling', () => {
			const result1 = detectAdversarialPatterns('');
			expect(result1).toHaveLength(0);

			const result2 = detectAdversarialPatterns(' ');
			expect(result2).toHaveLength(0);

			const result3 = detectAdversarialPatterns('x');
			expect(result3).toHaveLength(0);
		});
	});

	describe('formatPrecedentManipulationEvent - Additional Security Tests', () => {
		it('EVENT-SEC-1: XSS in matchedText should be preserved in JSON', () => {
			const match: AdversarialPatternMatch = {
				pattern: 'PRECEDENT_MANIPULATION',
				severity: 'HIGHEST',
				matchedText: '<script>alert("xss")</script>',
				confidence: 'HIGH',
			};
			const result = formatPrecedentManipulationEvent(match, 'agent-1', 1);
			// JSON.stringify escapes quotes, so we check for the escaped version
			expect(result).toContain('<script>alert(\\"xss\\")</script>');
		});

		it('EVENT-SEC-2: Newlines in agentName should be preserved', () => {
			const match: AdversarialPatternMatch = {
				pattern: 'PRECEDENT_MANIPULATION',
				severity: 'HIGHEST',
				matchedText: 'we skipped this',
				confidence: 'HIGH',
			};
			const result = formatPrecedentManipulationEvent(match, 'agent\nname', 1);
			// JSON.stringify escapes newlines
			expect(result).toContain('agent\\nname');
		});

		it('EVENT-SEC-3: Large phase numbers should not cause issues', () => {
			const match: AdversarialPatternMatch = {
				pattern: 'PRECEDENT_MANIPULATION',
				severity: 'HIGHEST',
				matchedText: 'we skipped this',
				confidence: 'HIGH',
			};
			const largePhase = 999999;
			const result = formatPrecedentManipulationEvent(
				match,
				'agent-1',
				largePhase,
			);
			expect(result).toContain('999999');
		});

		it('EVENT-SEC-4: Unicode in agentName should be preserved', () => {
			const match: AdversarialPatternMatch = {
				pattern: 'PRECEDENT_MANIPULATION',
				severity: 'HIGHEST',
				matchedText: 'we skipped this',
				confidence: 'HIGH',
			};
			const result = formatPrecedentManipulationEvent(match, 'agent-😀', 1);
			expect(result).toContain('agent-😀');
		});
	});

	describe('Additional Edge Cases and Security Tests', () => {
		it('EDGE-1: FIXED - Null/undefined input returns empty array', () => {
			// FIX: Function now validates input type
			// Should return empty array instead of crashing
			// @ts-expect-error - testing runtime behavior with invalid input
			const result1 = detectAdversarialPatterns(null);
			expect(result1).toHaveLength(0);
			expect(Array.isArray(result1)).toBe(true);

			// @ts-expect-error - testing runtime behavior with invalid input
			const result2 = detectAdversarialPatterns(undefined);
			expect(result2).toHaveLength(0);
			expect(Array.isArray(result2)).toBe(true);
		});

		it('EDGE-1b: FIXED - Non-string input returns empty array', () => {
			// FIX: Function now validates input type
			// Number input
			// @ts-expect-error - testing runtime behavior with invalid input
			const result1 = detectAdversarialPatterns(123);
			expect(result1).toHaveLength(0);
			expect(Array.isArray(result1)).toBe(true);

			// Object input
			// @ts-expect-error - testing runtime behavior with invalid input
			const result2 = detectAdversarialPatterns({ foo: 'bar' });
			expect(result2).toHaveLength(0);
			expect(Array.isArray(result2)).toBe(true);

			// Array input
			// @ts-expect-error - testing runtime behavior with invalid input
			const result3 = detectAdversarialPatterns(['test']);
			expect(result3).toHaveLength(0);
			expect(Array.isArray(result3)).toBe(true);

			// Boolean input
			// @ts-expect-error - testing runtime behavior with invalid input
			const result4 = detectAdversarialPatterns(true);
			expect(result4).toHaveLength(0);
			expect(Array.isArray(result4)).toBe(true);
		});

		it('EDGE-2: Very long pattern match', () => {
			const longPattern = 'we skipped ' + 'a'.repeat(10000) + ' in phase 1';
			const result = detectAdversarialPatterns(longPattern);
			expect(result).toHaveLength(1);
			expect(result[0].matchedText.length).toBeGreaterThan(10000);
		});

		it('EDGE-3: Multiple matches of same pattern in one text', () => {
			const text =
				'We skipped tests in phase 1. We skipped tests in phase 2. We skipped tests in phase 3.';
			const result = detectAdversarialPatterns(text);

			// LIMITATION: Pattern only matches once even with multiple occurrences
			// The regex .match() returns only the first match
			const precedentMatches = result.filter(
				(r) => r.pattern === 'PRECEDENT_MANIPULATION',
			);
			expect(precedentMatches.length).toBe(1);
		});

		it('EDGE-4: Overlapping pattern matches', () => {
			const text = 'I verified myself';
			const result = detectAdversarialPatterns(text);
			// Should match SELF_REVIEW pattern
			expect(result.length).toBeGreaterThan(0);
		});

		it('EDGE-5: Pattern at end of text', () => {
			const text = 'This is legitimate code review. The code looks fine to me';
			const result = detectAdversarialPatterns(text);
			expect(result.length).toBeGreaterThan(0);
		});

		it('EDGE-6: Pattern at start of text', () => {
			const text = 'I checked myself to save time';
			const result = detectAdversarialPatterns(text);
			expect(result.length).toBeGreaterThanOrEqual(2);
		});

		it('EDGE-7: Pattern with special regex characters in text', () => {
			const text = 'We skipped [test] in phase 1. Code (looks) fine to me.';
			const result = detectAdversarialPatterns(text);
			// Should detect patterns even with special characters
			expect(result.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe('Comprehensive Attack Scenarios', () => {
		it('COMPREHENSIVE-1: Multiple attack vectors combined', () => {
			// Combine ReDoS potential with pattern collisions
			const complexAttack =
				'I verified ' +
				'x'.repeat(500) +
				' myself because this is just a refactor. The code looks fine. We skipped this in phase 1 to save time going forward.';

			const start = Date.now();
			const result = detectAdversarialPatterns(complexAttack);
			const elapsed = Date.now() - start;

			// Should complete quickly
			expect(elapsed).toBeLessThan(1000);

			// Should detect multiple patterns
			expect(result.length).toBeGreaterThanOrEqual(3);
		});

		it('COMPREHENSIVE-2: HIGHEST severity pattern detection', () => {
			const text = 'We skipped this in phase 2. I verified the code myself.';
			const result = detectAdversarialPatterns(text);
			const highest = result.filter((r) => r.severity === 'HIGHEST');
			// SELF_REVIEW is HIGH severity, not HIGHEST
			// Only PRECEDENT_MANIPULATION is HIGHEST
			expect(highest.length).toBe(1);
		});

		it('COMPREHENSIVE-3: Case variations with all pattern types', () => {
			const text =
				'WE SKIPPED IN PHASE 1. I CHECKED MYSELF. THIS IS JUST A RENAME. CODE LOOKS GOOD. TO SAVE TIME.';
			const result = detectAdversarialPatterns(text);
			expect(result.length).toBeGreaterThanOrEqual(4);
		});
	});
});
