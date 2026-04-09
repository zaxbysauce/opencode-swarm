import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';

// Read the explorer.ts file content directly since EXPLORER_PROMPT is not exported
const explorerSource = readFileSync('src/agents/explorer.ts', 'utf-8');

// Extract EXPLORER_PROMPT value from the source
const promptMatch = explorerSource.match(
	/const EXPLORER_PROMPT = `([\s\S]*?)`;/,
);
const EXPLORER_PROMPT = promptMatch ? promptMatch[1] : '';

describe('Explorer OUTPUT FORMAT examples', () => {
	describe('1. STRUCTURE section has Example: showing directory entries', () => {
		test('STRUCTURE section contains Example: with directory entries', () => {
			const structureExampleMatch = EXPLORER_PROMPT.match(
				/STRUCTURE:\s*\n\s*\[[\s\S]*?\]\s*\nExample:\s*\n(src\/[^\n]+\/+) +— /,
			);
			expect(structureExampleMatch).not.toBeNull();
		});

		test('STRUCTURE Example: shows real directory paths with descriptions', () => {
			// Verify Example: shows entries like "src/agents/ — description"
			const hasRealEntries =
				EXPLORER_PROMPT.includes('src/agents/') &&
				EXPLORER_PROMPT.includes('src/tools/') &&
				EXPLORER_PROMPT.includes('src/config/');
			expect(hasRealEntries).toBe(true);
		});
	});

	describe('2. KEY FILES section has Example: showing file entries with purposes', () => {
		test('KEY FILES section contains Example: with file entries', () => {
			const keyFilesExampleMatch = EXPLORER_PROMPT.match(
				/KEY FILES:\s*\n-\s+\[path\]:\s+\[purpose\]\s*\nExample:\s*\n(src\/[^\n]+) +— /,
			);
			expect(keyFilesExampleMatch).not.toBeNull();
		});

		test('KEY FILES Example: shows real file paths with purposes', () => {
			// Verify Example: shows entries like "src/agents/explorer.ts — purpose"
			const hasRealFiles =
				EXPLORER_PROMPT.includes('src/agents/explorer.ts') &&
				EXPLORER_PROMPT.includes('src/agents/architect.ts');
			expect(hasRealFiles).toBe(true);
		});
	});

	describe('3. PATTERNS section has Example: showing pattern observations', () => {
		test('PATTERNS section contains Example: with pattern observations', () => {
			const patternsExampleMatch = EXPLORER_PROMPT.match(
				/PATTERNS:\s*\[observations\]\s*\nExample:\s*.+/,
			);
			expect(patternsExampleMatch).not.toBeNull();
		});

		test('PATTERNS Example: shows actual pattern examples', () => {
			// Verify Example: shows actual patterns like "Factory pattern for agent creation"
			const hasRealPatterns =
				EXPLORER_PROMPT.includes('Factory pattern') &&
				EXPLORER_PROMPT.includes('Result type');
			expect(hasRealPatterns).toBe(true);
		});
	});

	describe('4. COMPLEXITY INDICATORS section has Example: showing structural complexity', () => {
		test('COMPLEXITY INDICATORS section contains Example: with complexity info', () => {
			const complexityExampleMatch = EXPLORER_PROMPT.match(
				/COMPLEXITY INDICATORS:\s*\n\s*\[[\s\S]+?\]\s*\nExample:\s*.+/,
			);
			expect(complexityExampleMatch).not.toBeNull();
		});

		test('COMPLEXITY INDICATORS Example: shows real file examples', () => {
			// Verify Example: shows real files with line counts
			const hasRealExamples =
				EXPLORER_PROMPT.includes('explorer.ts') &&
				EXPLORER_PROMPT.includes('architect.ts');
			expect(hasRealExamples).toBe(true);
		});
	});

	describe('5. RELEVANT CONSTRAINTS section has Example: showing architectural patterns', () => {
		test('RELEVANT CONSTRAINTS section contains Example: with architectural patterns', () => {
			const constraintsExampleMatch = EXPLORER_PROMPT.match(
				/RELEVANT CONSTRAINTS:\s*\n\s*\[[\s\S]+?\]\s*\nExample:\s*.+/,
			);
			expect(constraintsExampleMatch).not.toBeNull();
		});

		test('RELEVANT CONSTRAINTS Example: shows real architectural patterns', () => {
			// Verify Example: shows actual architectural patterns
			const hasRealPatterns =
				EXPLORER_PROMPT.includes('Layered architecture') &&
				EXPLORER_PROMPT.includes('Bun-native');
			expect(hasRealPatterns).toBe(true);
		});
	});

	describe('6. FOLLOW-UP CANDIDATE AREAS section has Example: showing observable conditions', () => {
		test('FOLLOW-UP CANDIDATE AREAS section contains Example: with observable conditions', () => {
			const followUpExampleMatch = EXPLORER_PROMPT.match(
				/FOLLOW-UP CANDIDATE AREAS:\s*\n-\s+\[path\]:\s+\[observable condition[\s\S]*?\]\s*\nExample:\s*\n(src\/[^\n]+)/,
			);
			expect(followUpExampleMatch).not.toBeNull();
		});

		test('FOLLOW-UP CANDIDATE AREAS Example: shows real file with real condition', () => {
			// Verify Example: shows a real file with a specific observable condition
			const hasRealExample =
				EXPLORER_PROMPT.includes('src/tools/declare-scope.ts') &&
				EXPLORER_PROMPT.includes('12 parameters');
			expect(hasRealExample).toBe(true);
		});
	});

	describe('7. INTEGRATION IMPACT output has Example: for all change types', () => {
		test('BREAKING_CHANGES has Example:', () => {
			const breakingExampleMatch = EXPLORER_PROMPT.match(
				/BREAKING_CHANGES:\s*\[list with affected consumer files[\s\S]*?\]\s*\nExample:\s*.+/,
			);
			expect(breakingExampleMatch).not.toBeNull();
		});

		test('COMPATIBLE_CHANGES has Example:', () => {
			const compatibleExampleMatch = EXPLORER_PROMPT.match(
				/COMPATIBLE_CHANGES:\s*\[list[\s\S]*?\]\s*\nExample:\s*.+/,
			);
			expect(compatibleExampleMatch).not.toBeNull();
		});

		test('CONSUMERS_AFFECTED has Example:', () => {
			const consumersExampleMatch = EXPLORER_PROMPT.match(
				/CONSUMERS_AFFECTED:\s*\[list of files[\s\S]*?\]\s*\nExample:\s*.+/,
			);
			expect(consumersExampleMatch).not.toBeNull();
		});

		test('COMPATIBILITY SIGNALS has Example:', () => {
			const signalsExampleMatch = EXPLORER_PROMPT.match(
				/COMPATIBILITY SIGNALS:\s*\[COMPATIBLE \| INCOMPATIBLE[\s\S]*?\]\s*\nExample:\s*.+/,
			);
			expect(signalsExampleMatch).not.toBeNull();
		});

		test('MIGRATION_SURFACE has Example:', () => {
			const migrationExampleMatch = EXPLORER_PROMPT.match(
				/MIGRATION_SURFACE:\s*\[yes[\s\S]*?\]\s*\nExample:\s*.+/,
			);
			expect(migrationExampleMatch).not.toBeNull();
		});

		test('All INTEGRATION IMPACT examples show real code', () => {
			// Verify examples contain real file paths and real changes
			expect(EXPLORER_PROMPT.includes('src/agents/explorer.ts')).toBe(true);
			expect(EXPLORER_PROMPT.includes('removeExport')).toBe(true);
			expect(EXPLORER_PROMPT.includes('createExplorerAgent')).toBe(true);
		});
	});

	describe('8. DOMAINS section has Example: showing domain tags', () => {
		test('DOMAINS section contains Example: with domain tags', () => {
			const domainsExampleMatch = EXPLORER_PROMPT.match(
				/DOMAINS:\s*\[relevant SME domains[\s\S]*?\]\s*\nExample:\s*.+/,
			);
			expect(domainsExampleMatch).not.toBeNull();
		});

		test('DOMAINS Example: shows real domain tags', () => {
			// Verify Example: shows actual domain tags
			const hasRealDomains =
				EXPLORER_PROMPT.includes('typescript') &&
				EXPLORER_PROMPT.includes('nodejs');
			expect(hasRealDomains).toBe(true);
		});
	});

	describe('9. COMPLEXITY INDICATORS guidance uses "describe what is OBSERVED"', () => {
		test('COMPLEXITY INDICATORS guidance says "describe what is OBSERVED"', () => {
			// The guidance should say "describe what is OBSERVED" not "do not label as 'dead' or 'missing'"
			const complexitySection = EXPLORER_PROMPT.match(
				/COMPLEXITY INDICATORS:\s*\n\s*\[[\s\S]+?\]\s*\nExample:/,
			);
			expect(complexitySection).not.toBeNull();

			// Should contain "describe what is OBSERVED"
			expect(EXPLORER_PROMPT.includes('describe what is OBSERVED')).toBe(true);

			// Should NOT contain the anti-pattern "do not label as 'dead' or 'missing'"
			expect(
				EXPLORER_PROMPT.includes("do not label as 'dead' or 'missing'"),
			).toBe(false);
		});
	});
});
