import { beforeAll, describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ARCHITECT_PATH = join(__dirname, '../../../src/agents/architect.ts');

describe('SPEC-WRITING DISCIPLINE Verification (Task 2.3)', () => {
	let architectContent: string;
	let specWritingSection: string;

	beforeAll(async () => {
		architectContent = await readFile(ARCHITECT_PATH, 'utf-8');
		// Extract the SPEC-WRITING DISCIPLINE section
		const match = architectContent.match(
			/SPEC-WRITING DISCIPLINE[\s\S]*?(?=\n\s{0,4}\d+\.|\n\s{0,4}[A-Z])/,
		);
		if (match) {
			specWritingSection = match[0];
		} else {
			specWritingSection = architectContent;
		}
	});

	describe('Requirement 1: Three mandatory fields (a), (b), (c)', () => {
		test('Field (a) exists with Error strategy definition', () => {
			const hasFieldA = architectContent.includes('(a) Error strategy:');
			expect(hasFieldA).toBe(true);
		});

		test('Field (b) exists with Message accuracy definition', () => {
			const hasFieldB = architectContent.includes('(b) Message accuracy:');
			expect(hasFieldB).toBe(true);
		});

		test('Field (c) exists with Platform compatibility definition', () => {
			const hasFieldC = architectContent.includes(
				'(c) Platform compatibility:',
			);
			expect(hasFieldC).toBe(true);
		});

		test('All three fields are present in SPEC-WRITING DISCIPLINE section', () => {
			expect(specWritingSection).toContain('(a) Error strategy:');
			expect(specWritingSection).toContain('(b) Message accuracy:');
			expect(specWritingSection).toContain('(c) Platform compatibility:');
		});
	});

	describe('Requirement 2: Error strategy FAIL_FAST or BEST_EFFORT', () => {
		test('FAIL_FAST is mentioned as a valid strategy', () => {
			const hasFailFast = /FAIL_FAST/.test(architectContent);
			expect(hasFailFast).toBe(true);
		});

		test('BEST_EFFORT is mentioned as a valid strategy', () => {
			const hasBestEffort = /BEST_EFFORT/.test(architectContent);
			expect(hasBestEffort).toBe(true);
		});

		test('Both strategies are defined in Error strategy field', () => {
			// Find the error strategy field
			const lines = architectContent.split('\n');
			let inFieldA = false;
			let fieldContent = '';

			for (const line of lines) {
				if (line.includes('(a) Error strategy:')) {
					inFieldA = true;
				}
				if (inFieldA) {
					fieldContent += line + '\n';
					// Stop at next field or major section
					if (
						(line.trim().startsWith('(b)') ||
							line.trim().startsWith('(c)') ||
							line.match(/^\d+\./)) &&
						!line.includes('(a)')
					) {
						break;
					}
				}
			}

			expect(fieldContent).toContain('FAIL_FAST');
			expect(fieldContent).toContain('BEST_EFFORT');
		});
	});

	describe('Requirement 3: State-accurate messages', () => {
		test('Mentions "state-accurate" explicitly', () => {
			const hasStateAccurate = /state-accurate/.test(architectContent);
			expect(hasStateAccurate).toBe(true);
		});

		test('Mentions "No changes made" example message', () => {
			const hasNoChangesMessage = /No changes made/.test(architectContent);
			expect(hasNoChangesMessage).toBe(true);
		});

		test('State-accurate requirement is in field (b)', () => {
			const lines = architectContent.split('\n');
			let inFieldB = false;
			let fieldContent = '';

			for (const line of lines) {
				if (line.includes('(b) Message accuracy:')) {
					inFieldB = true;
				}
				if (inFieldB) {
					fieldContent += line + '\n';
					if (
						(line.trim().startsWith('(c)') || line.match(/^\d+\./)) &&
						!line.includes('(b)')
					) {
						break;
					}
				}
			}

			expect(fieldContent).toContain('state-accurate');
			expect(fieldContent).toContain('No changes made');
		});
	});

	describe('Requirement 4: Platform compatibility with Windows notes', () => {
		test('Mentions all three platforms: Windows, macOS, Linux', () => {
			const lines = architectContent.split('\n');
			let inFieldC = false;
			let fieldContent = '';

			for (const line of lines) {
				if (line.includes('(c) Platform compatibility:')) {
					inFieldC = true;
				}
				if (inFieldC) {
					fieldContent += line + '\n';
					if (line.match(/^\d+\./) && !line.includes('(c)')) {
						break;
					}
				}
			}

			expect(fieldContent).toContain('Windows');
			expect(fieldContent).toContain('macOS');
			expect(fieldContent).toContain('Linux');
		});

		test('Includes Windows-specific API difference note', () => {
			const lines = architectContent.split('\n');
			let inFieldC = false;
			let fieldContent = '';

			for (const line of lines) {
				if (line.includes('(c) Platform compatibility:')) {
					inFieldC = true;
				}
				if (inFieldC) {
					fieldContent += line + '\n';
					if (line.match(/^\d+\./) && !line.includes('(c)')) {
						break;
					}
				}
			}

			expect(fieldContent).toContain('Windows');
			// Should mention fs.renameSync or similar API difference
			const hasWindowsApiNote =
				/(fs\.renameSync|API differences|cannot overwrite)/i.test(fieldContent);
			expect(hasWindowsApiNote).toBe(true);
		});

		test('Specifically mentions fs.renameSync cannot overwrite on Windows', () => {
			const hasRenameSyncNote = /fs\.renameSync.*Windows/i.test(
				architectContent,
			);
			expect(hasRenameSyncNote).toBe(true);
		});
	});

	describe('Requirement 5: Token budget <= 100', () => {
		test('SPEC-WRITING DISCIPLINE section is concise', () => {
			// Count words in the section (rough estimate of token budget)
			const wordCount = specWritingSection
				.split(/\s+/)
				.filter((w) => w.length > 0).length;

			// The section should be reasonably concise
			expect(wordCount).toBeLessThan(200);
		});

		test('Field (a) is concise', () => {
			// Extract just the field (a) line content
			const match = architectContent.match(/\(a\) Error strategy:[^\n]*/);
			expect(match).toBeDefined();
			const fieldContent = match![0];

			const wordCount = fieldContent
				.split(/\s+/)
				.filter((w) => w.length > 0).length;
			expect(wordCount).toBeLessThan(50);
		});

		test('Field (b) is concise', () => {
			// Extract just the field (b) line content
			const match = architectContent.match(/\(b\) Message accuracy:[^\n]*/);
			expect(match).toBeDefined();
			const fieldContent = match![0];

			const wordCount = fieldContent
				.split(/\s+/)
				.filter((w) => w.length > 0).length;
			expect(wordCount).toBeLessThan(50);
		});

		test('Field (c) is concise', () => {
			// Extract just the field (c) line content
			const match = architectContent.match(
				/\(c\) Platform compatibility:[^\n]*/,
			);
			expect(match).toBeDefined();
			const fieldContent = match![0];

			const wordCount = fieldContent
				.split(/\s+/)
				.filter((w) => w.length > 0).length;
			expect(wordCount).toBeLessThan(50);
		});
	});

	describe('Overall compliance check', () => {
		test('All 5 requirements are satisfied', () => {
			// Requirement 1: Three mandatory fields
			const hasAllFields =
				specWritingSection.includes('(a)') &&
				specWritingSection.includes('(b)') &&
				specWritingSection.includes('(c)');
			expect(hasAllFields).toBe(true);

			// Requirement 2: Error strategy FAIL_FAST and BEST_EFFORT
			const hasBothStrategies =
				specWritingSection.includes('FAIL_FAST') &&
				specWritingSection.includes('BEST_EFFORT');
			expect(hasBothStrategies).toBe(true);

			// Requirement 3: State-accurate messages
			const hasStateAccurate =
				specWritingSection.includes('state-accurate') &&
				specWritingSection.includes('No changes made');
			expect(hasStateAccurate).toBe(true);

			// Requirement 4: Platform compatibility with Windows
			const hasPlatformCompatibility =
				specWritingSection.includes('Windows') &&
				specWritingSection.includes('macOS') &&
				specWritingSection.includes('Linux');
			expect(hasPlatformCompatibility).toBe(true);
			const hasWindowsApiNote = /fs\.renameSync.*Windows/i.test(
				specWritingSection,
			);
			expect(hasWindowsApiNote).toBe(true);

			// Requirement 5: Conciseness (token budget) - check each field is under 50 words
			const fieldAMatch = architectContent.match(/\(a\) Error strategy:[^\n]*/);
			const fieldBMatch = architectContent.match(
				/\(b\) Message accuracy:[^\n]*/,
			);
			const fieldCMatch = architectContent.match(
				/\(c\) Platform compatibility:[^\n]*/,
			);

			expect(fieldAMatch).toBeDefined();
			expect(fieldBMatch).toBeDefined();
			expect(fieldCMatch).toBeDefined();

			const wordCountA = fieldAMatch![0]
				.split(/\s+/)
				.filter((w) => w.length > 0).length;
			const wordCountB = fieldBMatch![0]
				.split(/\s+/)
				.filter((w) => w.length > 0).length;
			const wordCountC = fieldCMatch![0]
				.split(/\s+/)
				.filter((w) => w.length > 0).length;

			expect(wordCountA).toBeLessThan(50);
			expect(wordCountB).toBeLessThan(50);
			expect(wordCountC).toBeLessThan(50);
		});
	});
});
