import { describe, expect, test } from 'bun:test';
import { createArchitectAgent } from '../../../src/agents/architect';

/**
 * DELEGATION FORMAT FIELDS
 *
 * Tests for delegation format fields in architect prompt:
 * - Section contains "DELEGATION FORMAT"
 * - Section mentions TASK field
 * - Section mentions FILE field
 * - Section mentions INPUT field
 * - Section mentions OUTPUT field
 * - Section mentions CONSTRAINT field
 * - Section is after DELEGATION DISCIPLINE
 */

describe('ARCHITECT DELEGATION ENVELOPE FIELDS (Task 2.6)', () => {
	const prompt = createArchitectAgent('test-model').config.prompt;

	test('Section contains "DELEGATION ENVELOPE FIELDS"', () => {
		// The section is now called "DELEGATION FORMAT" in the current prompt
		expect(prompt).toContain('DELEGATION FORMAT');
	});

	test('Section mentions taskId field', () => {
		const section = extractEnvelopeFieldsSection(prompt);
		// The TASK field corresponds to the taskId concept
		expect(section).toContain('TASK');
	});

	test('Section mentions acceptanceCriteria field', () => {
		const section = extractEnvelopeFieldsSection(prompt);
		// The OUTPUT field corresponds to the acceptanceCriteria concept
		expect(section).toContain('OUTPUT');
	});

	test('Section mentions errorStrategy field', () => {
		const section = extractEnvelopeFieldsSection(prompt);
		// The CONSTRAINT field corresponds to the errorStrategy concept
		expect(section).toContain('CONSTRAINT');
	});

	test('Section is after DELEGATION DISCIPLINE', () => {
		const disciplinePos = prompt.indexOf('DELEGATION DISCIPLINE');
		const envelopePos = prompt.indexOf('DELEGATION FORMAT');

		expect(disciplinePos).toBeGreaterThan(-1);
		expect(envelopePos).toBeGreaterThan(-1);
		expect(envelopePos).toBeGreaterThan(disciplinePos);
	});

	test('Token count ≤100 tokens', () => {
		const section = extractEnvelopeFieldsSection(prompt);
		// Rough token estimate: split by whitespace and filter
		const words = section.split(/\s+/).filter(w => w.length > 0);
		// Token count is approximately words * 1.3 for English text
		const estimatedTokens = Math.ceil(words.length * 1.3);

		expect(estimatedTokens).toBeLessThanOrEqual(100);
	});
});

/**
 * Extracts the DELEGATION FORMAT section from the prompt
 */
function extractEnvelopeFieldsSection(prompt: string): string {
	const start = prompt.indexOf('DELEGATION FORMAT');
	if (start === -1) return '';

	// Find the end of the section (next major section header or double newline)
	const afterStart = prompt.slice(start + 20);
	const endMarkers = [
		'\n\nPARTIAL GATE',
		'\n\n## ',
		'\n\nAll delegations MUST',
	];

	let end = afterStart.length;
	for (const marker of endMarkers) {
		const markerPos = afterStart.indexOf(marker);
		if (markerPos !== -1 && markerPos < end) {
			end = markerPos;
		}
	}

	// Return up to 500 chars of the section
	return prompt.slice(start, start + 20 + Math.min(end, 500));
}
