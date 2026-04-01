import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Read the source file to inspect pattern definitions
const sourceFilePath = join(
	__dirname,
	'../../../src/hooks/adversarial-detector.ts',
);
const sourceContent = readFileSync(sourceFilePath, 'utf-8');

describe('Task 1.2: GATE_DELEGATION_BYPASS Pattern Expansion', () => {
	describe('Requirement 1: GATE_DELEGATION_BYPASS includes both completion and edit bypass triggers', () => {
		it('comment documents both Completion bypass and Edit bypass triggers', () => {
			// Find the GATE_DELEGATION_BYPASS pattern comment section - be more specific
			const gateDelegationSection = sourceContent.match(
				/Pattern: GATE_DELEGATION_BYPASS[\s\S]*?\*\/[\s\S]*?const GATE_DELEGATION_BYPASS_PATTERNS/,
			);
			expect(gateDelegationSection).toBeTruthy();

			const section = gateDelegationSection![0];

			// Extract just the comment part (before the closing */)
			const commentMatch = section.match(
				/Pattern: GATE_DELEGATION_BYPASS[\s\S]*?\*\//,
			);
			const comment = commentMatch![0];

			// Verify both trigger types are documented
			expect(comment).toMatch(/Completion bypass:/i);
			expect(comment).toMatch(/Edit bypass:/i);
		});

		it('comment mentions specific edit bypass triggers: edit/write outside .swarm/, writeCount > 0', () => {
			const gateDelegationSection = sourceContent.match(
				/Pattern: GATE_DELEGATION_BYPASS[\s\S]*?\*\/[\s\S]*?const GATE_DELEGATION_BYPASS_PATTERNS/,
			);
			const section = gateDelegationSection![0];

			// Extract just the comment part
			const commentMatch = section.match(
				/Pattern: GATE_DELEGATION_BYPASS[\s\S]*?\*\//,
			);
			const comment = commentMatch![0];

			// Verify edit bypass trigger details are documented
			expect(comment).toMatch(/edit\/write.*outside.*\.swarm\//i);
			expect(comment).toMatch(/writeCount.*>.*0.*source/i);
		});

		it('GATE_DELEGATION_BYPASS_PATTERNS array contains completion bypass patterns', () => {
			// Find the GATE_DELEGATION_BYPASS_PATTERNS array definition
			const patternsArray = sourceContent.match(
				/const GATE_DELEGATION_BYPASS_PATTERNS = \[[\s\S]*?\];/,
			);
			expect(patternsArray).toBeTruthy();

			const arrayContent = patternsArray![0];

			// Verify completion bypass patterns are present
			expect(arrayContent).toMatch(/I verified the changes/i);
			expect(arrayContent).toMatch(/code looks correct to me/i);
			expect(arrayContent).toMatch(/task marked complete/i);
		});

		it('GATE_DELEGATION_BYPASS_PATTERNS array contains edit bypass patterns', () => {
			const patternsArray = sourceContent.match(
				/const GATE_DELEGATION_BYPASS_PATTERNS = \[[\s\S]*?\];/,
			);
			const arrayContent = patternsArray![0];

			// Verify edit bypass patterns are present
			expect(arrayContent).toMatch(/edit tool on \(src\|tests\|config\)/i);
			expect(arrayContent).toMatch(/write tool on \(src\|tests\|config\)/i);
			expect(arrayContent).toMatch(/writeCount.*\\d\+.*source/i);
		});
	});

	describe('Requirement 2: Edit bypass triggers include specific patterns', () => {
		it('includes "edit tool on (src|tests|config)" pattern', () => {
			const patternsArray = sourceContent.match(
				/const GATE_DELEGATION_BYPASS_PATTERNS = \[[\s\S]*?\];/,
			);
			expect(patternsArray).toBeTruthy();

			const arrayContent = patternsArray![0];
			expect(arrayContent).toMatch(/edit tool on \(src\|tests\|config\)/i);
		});

		it('includes "write tool on (src|tests|config)" pattern', () => {
			const patternsArray = sourceContent.match(
				/const GATE_DELEGATION_BYPASS_PATTERNS = \[[\s\S]*?\];/,
			);
			expect(patternsArray).toBeTruthy();

			const arrayContent = patternsArray![0];
			expect(arrayContent).toMatch(/write tool on \(src\|tests\|config\)/i);
		});

		it('includes "writeCount.*\\d+.*source" pattern', () => {
			const patternsArray = sourceContent.match(
				/const GATE_DELEGATION_BYPASS_PATTERNS = \[[\s\S]*?\];/,
			);
			expect(patternsArray).toBeTruthy();

			const arrayContent = patternsArray![0];
			expect(arrayContent).toMatch(/writeCount\.\*\\d\+\.\*source/i);
		});
	});

	describe('Requirement 3: Sonnet 4.6 exact pattern is named as trigger', () => {
		it('comment mentions "small fix directly" as example trigger phrase', () => {
			const gateDelegationSection = sourceContent.match(
				/Pattern: GATE_DELEGATION_BYPASS[\s\S]*?\*\/[\s\S]*?const GATE_DELEGATION_BYPASS_PATTERNS/,
			);
			expect(gateDelegationSection).toBeTruthy();

			const section = gateDelegationSection![0];
			expect(section).toMatch(/small fix directly/i);
		});

		it('GATE_DELEGATION_BYPASS_PATTERNS array includes exact phrase "I\'ll just make this small fix directly"', () => {
			const patternsArray = sourceContent.match(
				/const GATE_DELEGATION_BYPASS_PATTERNS = \[[\s\S]*?\];/,
			);
			expect(patternsArray).toBeTruthy();

			const arrayContent = patternsArray![0];
			expect(arrayContent).toMatch(/I'll just make this small fix directly/i);
		});
	});

	describe('Requirement 4: No other adversarial patterns modified', () => {
		it('PRECEDENT_MANIPULATION_PATTERNS has correct comment and patterns', () => {
			const precedentSection = sourceContent.match(
				/Pattern: PRECEDENT_MANIPULATION[\s\S]*?const PRECEDENT_MANIPULATION_PATTERNS = \[[\s\S]*?\];/,
			);
			expect(precedentSection).toBeTruthy();

			const section = precedentSection![0];

			// Verify comment
			expect(section).toMatch(
				/Trigger: Agent references a previous exception, skip, or shortcut as justification for current behavior/i,
			);
			expect(section).toMatch(/Severity: HIGHEST/i);

			// Verify patterns are unchanged (check for specific expected patterns)
			expect(section).toMatch(/we skipped .* in phase \\d\+/i);
			expect(section).toMatch(/consistent with how we handled/i);
			expect(section).toMatch(/going forward/i);
			expect(section).toMatch(/the reviewer didn't flag this pattern before/i);
		});

		it('SELF_REVIEW_PATTERNS has correct comment and patterns', () => {
			const selfReviewSection = sourceContent.match(
				/Pattern: SELF_REVIEW[\s\S]*?const SELF_REVIEW_PATTERNS = \[[\s\S]*?\];/,
			);
			expect(selfReviewSection).toBeTruthy();

			const section = selfReviewSection![0];

			// Verify comment
			expect(section).toMatch(
				/Trigger: The same agent that produced work is evaluating its quality/i,
			);
			expect(section).toMatch(/Severity: HIGH/i);

			// Verify patterns are unchanged - check for key pattern components
			expect(section).toMatch(/I.*verified.*myself/i);
			expect(section).toMatch(/I.*think.*this.*correct/i);
			expect(section).toMatch(/this.*looks.*good/i);
		});

		it('CONTENT_EXEMPTION_PATTERNS has correct comment and patterns', () => {
			const contentExemptionSection = sourceContent.match(
				/Pattern: CONTENT_EXEMPTION[\s\S]*?const CONTENT_EXEMPTION_PATTERNS = \[[\s\S]*?\];/,
			);
			expect(contentExemptionSection).toBeTruthy();

			const section = contentExemptionSection![0];

			// Verify comment
			expect(section).toMatch(
				/Trigger: Agent claims a specific type of content is exempt from the QA pipeline/i,
			);
			expect(section).toMatch(/Severity: HIGH/i);

			// Verify patterns are unchanged - check for key pattern components
			expect(section).toMatch(/documentation doesn't need/i);
			expect(section).toMatch(/config changes are trivial/i);
			expect(section).toMatch(/just a.*rename/i);
		});

		it('VELOCITY_RATIONALIZATION_PATTERNS has correct comment and patterns', () => {
			const velocitySection = sourceContent.match(
				/Pattern: VELOCITY_RATIONALIZATION[\s\S]*?const VELOCITY_RATIONALIZATION_PATTERNS = \[[\s\S]*?\];/,
			);
			expect(velocitySection).toBeTruthy();

			const section = velocitySection![0];

			// Verify comment
			expect(section).toMatch(
				/Trigger: Agent cites time pressure, efficiency, or speed as justification for skipping process/i,
			);
			expect(section).toMatch(/Severity: HIGH/i);

			// Verify patterns are unchanged
			expect(section).toMatch(/to save time/i);
			expect(section).toMatch(/since we're behind/i);
			expect(section).toMatch(/quick fix/i);
		});
	});

	describe('Pattern counting and structure', () => {
		it('GATE_DELEGATION_BYPASS_PATTERNS has expected number of patterns', () => {
			const patternsArray = sourceContent.match(
				/const GATE_DELEGATION_BYPASS_PATTERNS = \[[\s\S]*?\];/,
			);
			expect(patternsArray).toBeTruthy();

			const arrayContent = patternsArray![0];

			// Count the number of patterns (each pattern is a regex string)
			const patternMatches = arrayContent.match(/\/[^\n]+\//g);
			expect(patternMatches).toBeTruthy();

			// Verify we have at least the required patterns
			expect(patternMatches!.length).toBeGreaterThanOrEqual(10); // Minimum expected patterns
		});

		it('All pattern arrays are properly structured with const declarations', () => {
			// Verify all pattern arrays use const and are arrays of regex
			expect(sourceContent).toMatch(
				/const PRECEDENT_MANIPULATION_PATTERNS = \[/,
			);
			expect(sourceContent).toMatch(/const SELF_REVIEW_PATTERNS = \[/);
			expect(sourceContent).toMatch(/const CONTENT_EXEMPTION_PATTERNS = \[/);
			expect(sourceContent).toMatch(
				/const GATE_DELEGATION_BYPASS_PATTERNS = \[/,
			);
			expect(sourceContent).toMatch(
				/const VELOCITY_RATIONALIZATION_PATTERNS = \[/,
			);
		});
	});
});
