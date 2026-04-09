import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Read the source file directly since EXPLORER_PROMPT is not exported
const EXPLORER_SOURCE = readFileSync(
	resolve(import.meta.dir, '../../../src/agents/explorer.ts'),
	'utf-8',
);

// Extract the EXPLORER_PROMPT value from the source
function extractPromptBlock(source: string, promptName: string): string {
	const regex = new RegExp(
		`const ${promptName}\\s*=\\s*\x60([\\s\\S]*?)\x60;?\\s*export`,
		'm',
	);
	const match = source.match(regex);
	return match ? match[1] : '';
}

const EXPLORER_PROMPT = extractPromptBlock(EXPLORER_SOURCE, 'EXPLORER_PROMPT');

describe('EXPLORER_PROMPT section structure', () => {
	const ANALYSIS_PROTOCOL_START = '## ANALYSIS PROTOCOL';
	const OUTPUT_FORMAT_START = 'OUTPUT FORMAT (MANDATORY';

	// Extract ANALYSIS PROTOCOL section
	const getAnalysisProtocol = () => {
		const start = EXPLORER_PROMPT.indexOf(ANALYSIS_PROTOCOL_START);
		const end = EXPLORER_PROMPT.indexOf(OUTPUT_FORMAT_START);
		return EXPLORER_PROMPT.slice(start, end);
	};

	// Extract OUTPUT FORMAT section
	const getOutputFormat = () => {
		const start = EXPLORER_PROMPT.indexOf(OUTPUT_FORMAT_START);
		return EXPLORER_PROMPT.slice(start);
	};

	describe('ANALYSIS PROTOCOL sections', () => {
		test('1. contains COMPLEXITY INDICATORS section', () => {
			const analysis = getAnalysisProtocol();
			expect(analysis).toContain('### COMPLEXITY INDICATORS');
		});

		test('2. contains RUNTIME/BEHAVIORAL CONCERNS section', () => {
			const analysis = getAnalysisProtocol();
			expect(analysis).toContain('### RUNTIME/BEHAVIORAL CONCERNS');
		});

		test('3. COMPLEXITY INDICATORS covers structural concerns', () => {
			const analysis = getAnalysisProtocol();
			const complexitySection = analysis
				.split('### COMPLEXITY INDICATORS')[1]
				.split('### ')[0];
			// Structural concerns: cyclomatic complexity, deep nesting, large files, deep inheritance hierarchies
			expect(complexitySection.toLowerCase()).toContain(
				'cyclomatic complexity',
			);
			expect(complexitySection.toLowerCase()).toContain('deep nesting');
			expect(complexitySection.toLowerCase()).toContain('large files');
			expect(complexitySection.toLowerCase()).toContain(
				'inheritance hierarchies',
			);
		});

		test('4. RUNTIME/BEHAVIORAL CONCERNS covers behavioral concerns', () => {
			const analysis = getAnalysisProtocol();
			const runtimeSection = analysis
				.split('### RUNTIME/BEHAVIORAL CONCERNS')[1]
				.split('### ')[0];
			// Behavioral concerns: missing error handling, platform-specific assumptions
			expect(runtimeSection.toLowerCase()).toContain('error handling');
			expect(runtimeSection.toLowerCase()).toContain('platform-specific');
		});

		test('5. RELEVANT CONSTRAINTS includes error handling coverage patterns and platform-specific assumptions', () => {
			const analysis = getAnalysisProtocol();
			const constraintsSection = analysis
				.split('### RELEVANT CONSTRAINTS')[1]
				.split('### ')[0];
			expect(constraintsSection.toLowerCase()).toContain(
				'error handling coverage patterns',
			);
			expect(constraintsSection.toLowerCase()).toContain(
				'platform-specific assumptions',
			);
		});

		test('6. No RISKS section exists in ANALYSIS PROTOCOL', () => {
			const analysis = getAnalysisProtocol();
			// RISKS section should not exist (it was renamed to RUNTIME/BEHAVIORAL CONCERNS)
			expect(analysis).not.toContain('### RISKS');
		});

		test('7. COMPLEXITY INDICATORS and RUNTIME/BEHAVIORAL CONCERNS are distinct sections', () => {
			const analysis = getAnalysisProtocol();
			const complexityIdx = analysis.indexOf('### COMPLEXITY INDICATORS');
			const runtimeIdx = analysis.indexOf('### RUNTIME/BEHAVIORAL CONCERNS');
			const relevantIdx = analysis.indexOf('### RELEVANT CONSTRAINTS');

			// Both sections must exist
			expect(complexityIdx).toBeGreaterThan(-1);
			expect(runtimeIdx).toBeGreaterThan(-1);

			// RUNTIME/BEHAVIORAL CONCERNS comes after COMPLEXITY INDICATORS
			expect(runtimeIdx).toBeGreaterThan(complexityIdx);

			// Both come before RELEVANT CONSTRAINTS
			expect(complexityIdx).toBeLessThan(relevantIdx);
			expect(runtimeIdx).toBeLessThan(relevantIdx);

			// Extract content between sections to verify no overlap
			const complexityContent = analysis.slice(complexityIdx, runtimeIdx);
			const runtimeContent = analysis.slice(runtimeIdx, relevantIdx);

			// Verify each section has its own distinct content
			expect(complexityContent).not.toContain(
				'### RUNTIME/BEHAVIORAL CONCERNS',
			);
			expect(runtimeContent).not.toContain('### COMPLEXITY INDICATORS');
		});
	});

	describe('OUTPUT FORMAT sections', () => {
		test('8. OUTPUT FORMAT includes COMPLEXITY INDICATORS section', () => {
			const output = getOutputFormat();
			expect(output).toContain('COMPLEXITY INDICATORS:');
		});

		test('8. OUTPUT FORMAT includes RELEVANT CONSTRAINTS section', () => {
			const output = getOutputFormat();
			expect(output).toContain('RELEVANT CONSTRAINTS:');
		});

		test('8. OUTPUT FORMAT does NOT include old RISKS section', () => {
			const output = getOutputFormat();
			expect(output).not.toContain('RISKS:');
		});
	});

	describe('section content validation', () => {
		test('COMPLEXITY INDICATORS content matches structural focus', () => {
			const analysis = getAnalysisProtocol();
			const complexitySection = analysis
				.split('### COMPLEXITY INDICATORS')[1]
				.split('### ')[0];
			// Verify the content is about structural concerns, not behavioral
			expect(complexitySection.toLowerCase()).toContain('complex');
			expect(complexitySection.toLowerCase()).toContain('large');
		});

		test('RUNTIME/BEHAVIORAL CONCERNS content matches behavioral focus', () => {
			const analysis = getAnalysisProtocol();
			const runtimeSection = analysis
				.split('### RUNTIME/BEHAVIORAL CONCERNS')[1]
				.split('### ')[0];
			// Verify the content is about behavioral/runtime concerns
			expect(runtimeSection.toLowerCase()).toContain('missing');
			expect(runtimeSection.toLowerCase()).toContain('platform');
		});
	});
});
