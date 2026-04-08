/**
 * Tests for Task 5.3 - Spec Schema Validation
 * Tests FR ID format, obligation levels, scenario structure, and section/delta validation
 */
import { describe, expect, it } from 'bun:test';
import {
	DeltaSpecSchema,
	ObligationSchema,
	SpecDeltaSchema,
	SpecRequirementSchema,
	SpecScenarioSchema,
	SpecSectionSchema,
	SwarmSpecSchema,
	validateSpecContent,
} from '../config/spec-schema';

describe('SpecRequirementSchema', () => {
	it('should accept valid FR ID format (FR-001 through FR-999)', () => {
		const result = SpecRequirementSchema.safeParse({
			id: 'FR-001',
			obligation: 'MUST',
			text: 'Test requirement',
		});
		expect(result.success).toBe(true);
	});

	it('should reject FR-000 (invalid zero ID)', () => {
		const result = SpecRequirementSchema.safeParse({
			id: 'FR-000',
			obligation: 'MUST',
			text: 'Test requirement',
		});
		expect(result.success).toBe(false);
	});

	it('should reject invalid FR ID format', () => {
		const result = SpecRequirementSchema.safeParse({
			id: 'FR-01', // Too few digits
			obligation: 'MUST',
			text: 'Test requirement',
		});
		expect(result.success).toBe(false);
	});

	it('should reject non-numeric FR ID', () => {
		const result = SpecRequirementSchema.safeParse({
			id: 'FR-ABC',
			obligation: 'MUST',
			text: 'Test requirement',
		});
		expect(result.success).toBe(false);
	});

	it('should reject missing FR prefix', () => {
		const result = SpecRequirementSchema.safeParse({
			id: '001',
			obligation: 'MUST',
			text: 'Test requirement',
		});
		expect(result.success).toBe(false);
	});
});

describe('ObligationSchema', () => {
	it('should accept MUST obligation level', () => {
		const result = ObligationSchema.safeParse('MUST');
		expect(result.success).toBe(true);
	});

	it('should accept SHALL obligation level', () => {
		const result = ObligationSchema.safeParse('SHALL');
		expect(result.success).toBe(true);
	});

	it('should accept SHOULD obligation level', () => {
		const result = ObligationSchema.safeParse('SHOULD');
		expect(result.success).toBe(true);
	});

	it('should accept MAY obligation level', () => {
		const result = ObligationSchema.safeParse('MAY');
		expect(result.success).toBe(true);
	});

	it('should reject invalid obligation level', () => {
		const result = ObligationSchema.safeParse('MUST_NOT');
		expect(result.success).toBe(false);
	});

	it('should reject lowercase obligation level', () => {
		const result = ObligationSchema.safeParse('must');
		expect(result.success).toBe(false);
	});
});

describe('SpecScenarioSchema', () => {
	it('should accept valid scenario with when clause', () => {
		const result = SpecScenarioSchema.safeParse({
			name: 'User logs in',
			given: ['User is on login page'],
			when: ['User enters credentials'],
			thenClauses: ['User is authenticated'],
		});
		expect(result.success).toBe(true);
	});

	it('should reject scenario missing when clause', () => {
		const result = SpecScenarioSchema.safeParse({
			name: 'User logs in',
			given: ['User is on login page'],
			thenClauses: ['User is authenticated'],
		});
		expect(result.success).toBe(false);
	});

	it('should reject scenario with empty when array', () => {
		const result = SpecScenarioSchema.safeParse({
			name: 'User logs in',
			when: [],
			thenClauses: ['User is authenticated'],
		});
		expect(result.success).toBe(false);
	});

	it('should accept scenario without given clause (defaults to empty array)', () => {
		const result = SpecScenarioSchema.safeParse({
			name: 'Simple scenario',
			when: ['Event occurs'],
			thenClauses: ['Result happens'],
		});
		expect(result.success).toBe(true);
	});
});

describe('SpecSectionSchema', () => {
	it('should accept valid section with requirements', () => {
		const result = SpecSectionSchema.safeParse({
			name: 'Authentication',
			requirements: [
				{ id: 'FR-001', obligation: 'MUST', text: 'Must authenticate' },
			],
		});
		expect(result.success).toBe(true);
	});

	it('should accept section with empty requirements (default)', () => {
		const result = SpecSectionSchema.safeParse({
			name: 'Overview',
		});
		expect(result.success).toBe(true);
	});
});

describe('SwarmSpecSchema', () => {
	it('should accept valid full spec with sections', () => {
		const result = SwarmSpecSchema.safeParse({
			title: 'Test Spec',
			purpose: 'Testing spec validation',
			sections: [
				{
					name: 'Section 1',
					requirements: [
						{ id: 'FR-001', obligation: 'MUST', text: 'Requirement 1' },
					],
				},
			],
		});
		expect(result.success).toBe(true);
	});

	it('should reject spec with no sections', () => {
		const result = SwarmSpecSchema.safeParse({
			title: 'Test Spec',
			purpose: 'Testing spec validation',
			sections: [],
		});
		expect(result.success).toBe(false);
	});

	it('should reject spec missing title', () => {
		const result = SwarmSpecSchema.safeParse({
			purpose: 'Testing spec validation',
			sections: [
				{
					name: 'Section 1',
					requirements: [],
				},
			],
		});
		expect(result.success).toBe(false);
	});

	it('should reject spec missing purpose', () => {
		const result = SwarmSpecSchema.safeParse({
			title: 'Test Spec',
			sections: [
				{
					name: 'Section 1',
					requirements: [],
				},
			],
		});
		expect(result.success).toBe(false);
	});
});

describe('SpecDeltaSchema', () => {
	it('should accept valid delta with added requirements', () => {
		const result = SpecDeltaSchema.safeParse({
			added: [{ id: 'FR-001', obligation: 'MUST', text: 'New requirement' }],
		});
		expect(result.success).toBe(true);
	});

	it('should accept valid delta with modified requirements', () => {
		const result = SpecDeltaSchema.safeParse({
			modified: [{ id: 'FR-001', obligation: 'MUST', text: 'Modified text' }],
		});
		expect(result.success).toBe(true);
	});

	it('should accept valid delta with removed requirements', () => {
		const result = SpecDeltaSchema.safeParse({
			removed: [
				{ id: 'FR-001', obligation: 'MUST', text: 'Removed requirement' },
			],
		});
		expect(result.success).toBe(true);
	});

	it('should reject delta with modified entries that have no id', () => {
		// Delta entries require proper FR IDs - this is validated by SpecRequirementSchema
		const result = SpecDeltaSchema.safeParse({
			modified: [{ id: '', obligation: 'MUST', text: 'Invalid' }],
		});
		expect(result.success).toBe(false);
	});

	it('should accept empty delta (all arrays default to empty)', () => {
		const result = SpecDeltaSchema.safeParse({});
		expect(result.success).toBe(true);
	});
});

describe('DeltaSpecSchema (union of full spec and delta)', () => {
	it('should accept full spec as valid DeltaSpec', () => {
		const result = DeltaSpecSchema.safeParse({
			title: 'Test Spec',
			purpose: 'Testing spec validation',
			sections: [
				{
					name: 'Section 1',
					requirements: [
						{ id: 'FR-001', obligation: 'MUST', text: 'Requirement' },
					],
				},
			],
		});
		expect(result.success).toBe(true);
	});

	it('should accept delta spec as valid DeltaSpec', () => {
		const result = DeltaSpecSchema.safeParse({
			added: [{ id: 'FR-001', obligation: 'MUST', text: 'Added' }],
		});
		expect(result.success).toBe(true);
	});
});

describe('validateSpecContent (markdown validation)', () => {
	it('should validate spec with valid FR IDs, obligations, and sections', () => {
		const content = `
# Test Spec

## Purpose
This spec defines testing requirements.

## Section 1
FR-001: MUST implement authentication
FR-002: SHOULD log all access attempts
`;
		const result = validateSpecContent(content);
		expect(result.valid).toBe(true);
		expect(result.issues).toHaveLength(0);
	});

	it('should reject content missing FR IDs', () => {
		const content = `
# Test Spec

## Section 1
This section has no FR IDs.
`;
		const result = validateSpecContent(content);
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.message.includes('FR-###'))).toBe(true);
	});

	it('should reject content missing obligation keywords', () => {
		const content = `
# Test Spec

## Section 1
FR-001: This is a requirement without obligation keyword.
`;
		const result = validateSpecContent(content);
		expect(result.valid).toBe(false);
		expect(
			result.issues.some((i) => i.message.includes('obligation keywords')),
		).toBe(true);
	});

	it('should reject content missing section headers', () => {
		const content = `
# Test Spec

This is just text without section headers.
FR-001: MUST do something.
`;
		const result = validateSpecContent(content);
		expect(result.valid).toBe(false);
		expect(
			result.issues.some((i) => i.message.includes('section headers')),
		).toBe(true);
	});

	it('should reject FR-000 in content', () => {
		const content = `
# Test Spec

## Section 1
FR-000: MUST not be valid.
`;
		const result = validateSpecContent(content);
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.message.includes('FR-000'))).toBe(true);
	});

	it('should accept valid delta spec content', () => {
		const content = `
# Delta Spec

## Changes
FR-001: MUST be added
FR-002: SHOULD be modified
`;
		const result = validateSpecContent(content);
		expect(result.valid).toBe(true);
	});

	it('should handle empty content', () => {
		const result = validateSpecContent('');
		expect(result.valid).toBe(false);
		expect(result.issues[0].message).toBe('Content is empty');
	});

	it('should strip fenced code blocks before validation', () => {
		const content = `
# Test Spec

\`\`\`javascript
// FR-999 would be inside code block
\`\`\`

## Section 1
FR-001: MUST be valid
`;
		const result = validateSpecContent(content);
		expect(result.valid).toBe(true);
		// Should not find FR-999 from code block
		expect(result.issues.some((i) => i.message.includes('FR-999'))).toBe(false);
	});
});
