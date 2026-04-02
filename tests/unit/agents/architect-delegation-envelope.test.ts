import { describe, expect, test } from 'bun:test';
import { createArchitectAgent } from '../../../src/agents/architect';

/**
 * TASK 2.6: DELEGATION ENVELOPE FIELDS
 *
 * Tests for delegation envelope fields in architect prompt:
 * - Section contains "DELEGATION ENVELOPE FIELDS"
 * - Section mentions taskId field
 * - Section mentions acceptanceCriteria field
 * - Section mentions errorStrategy field
 * - Section is after DELEGATION DISCIPLINE
 * - Token count ≤100 tokens
 */

describe('ARCHITECT DELEGATION ENVELOPE FIELDS (Task 2.6)', () => {
	const prompt = createArchitectAgent('test-model').config.prompt;

	test('Section contains "DELEGATION ENVELOPE FIELDS"', () => {
		expect(prompt).toContain('DELEGATION ENVELOPE FIELDS');
	});

	test('Section mentions taskId field', () => {
		const section = extractEnvelopeFieldsSection(prompt);
		expect(section).toContain('taskId');
	});

	test('Section mentions acceptanceCriteria field', () => {
		const section = extractEnvelopeFieldsSection(prompt);
		expect(section).toContain('acceptanceCriteria');
	});

	test('Section mentions errorStrategy field', () => {
		const section = extractEnvelopeFieldsSection(prompt);
		expect(section).toContain('errorStrategy');
	});

	test('Section is after DELEGATION DISCIPLINE', () => {
		const disciplinePos = prompt.indexOf('DELEGATION DISCIPLINE');
		const envelopePos = prompt.indexOf('DELEGATION ENVELOPE FIELDS');

		expect(disciplinePos).toBeGreaterThan(-1);
		expect(envelopePos).toBeGreaterThan(-1);
		expect(envelopePos).toBeGreaterThan(disciplinePos);
	});

	test('Token count ≤100 tokens', () => {
		const section = extractEnvelopeFieldsSection(prompt);
		// Rough token estimate: split by whitespace and filter
		const words = section.split(/\s+/).filter((w) => w.length > 0);
		// Token count is approximately words * 1.3 for English text
		const estimatedTokens = Math.ceil(words.length * 1.3);

		expect(estimatedTokens).toBeLessThanOrEqual(100);
	});
});

/**
 * Extracts the DELEGATION ENVELOPE FIELDS section from the prompt
 */
function extractEnvelopeFieldsSection(prompt: string): string {
	const start = prompt.indexOf('DELEGATION ENVELOPE FIELDS');
	if (start === -1) return '';

	// Find the end of the section (next major section header or double newline)
	const afterStart = prompt.slice(start + 30);
	const endMarkers = [
		'\n\nPARTIAL GATE',
		'\n\n## ',
		'\n\nDELEGATION FORMAT',
		'\n\nBefore delegating',
	];

	let end = -1;
	for (const marker of endMarkers) {
		const markerPos = afterStart.indexOf(marker);
		if (markerPos !== -1 && (end === -1 || markerPos < end)) {
			end = markerPos;
		}
	}

	if (end === -1) {
		return afterStart.slice(0, 500);
	}

	return prompt.slice(start, start + 30 + end);
}
