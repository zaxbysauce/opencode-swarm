import { describe, expect, test } from 'bun:test';
import type { ClassifiedChange } from '../semantic-classifier.js';
import {
	generateSummary,
	generateSummaryMarkdown,
} from '../summary-generator.js';

const createMockChange = (
	overrides: Partial<ClassifiedChange> = {},
): ClassifiedChange => ({
	category: 'LOGIC_CHANGE',
	riskLevel: 'Medium',
	filePath: 'src/utils.ts',
	symbolName: 'testFunc',
	changeType: 'modified',
	lineStart: 1,
	lineEnd: 10,
	description: 'Test description',
	...overrides,
});

describe('generateSummary', () => {
	test('1. returns correct totalFiles for unique file paths', () => {
		const changes: ClassifiedChange[] = [
			createMockChange({ filePath: 'src/a.ts' }),
			createMockChange({ filePath: 'src/b.ts' }),
			createMockChange({ filePath: 'src/a.ts' }), // duplicate file
		];
		const summary = generateSummary(changes);
		expect(summary.totalFiles).toBe(2);
	});

	test('2. returns correct totalChanges count', () => {
		const changes: ClassifiedChange[] = [
			createMockChange({ filePath: 'src/a.ts' }),
			createMockChange({ filePath: 'src/b.ts' }),
			createMockChange({ filePath: 'src/c.ts' }),
		];
		const summary = generateSummary(changes);
		expect(summary.totalChanges).toBe(3);
	});

	test('3. byRisk has all 4 keys: Critical, High, Medium, Low', () => {
		const summary = generateSummary([]);
		const riskKeys = Object.keys(summary.byRisk);
		expect(riskKeys).toEqual(['Critical', 'High', 'Medium', 'Low']);
	});

	test('4. byCategory has all 9 keys', () => {
		const summary = generateSummary([]);
		const categoryKeys = Object.keys(summary.byCategory);
		expect(categoryKeys).toEqual([
			'SIGNATURE_CHANGE',
			'API_CHANGE',
			'GUARD_REMOVED',
			'LOGIC_CHANGE',
			'DELETED_FUNCTION',
			'NEW_FUNCTION',
			'REFACTOR',
			'COSMETIC',
			'UNCLASSIFIED',
		]);
	});

	test('5. criticalItems equals the Critical group', () => {
		const criticalChange = createMockChange({ riskLevel: 'Critical' });
		const otherChange = createMockChange({ riskLevel: 'High' });
		const changes = [criticalChange, otherChange];
		const summary = generateSummary(changes);
		expect(summary.criticalItems).toEqual([criticalChange]);
		expect(summary.criticalItems).toEqual(summary.byRisk.Critical);
	});

	test('6. empty input produces totalFiles=0, totalChanges=0, all arrays empty', () => {
		const summary = generateSummary([]);
		expect(summary.totalFiles).toBe(0);
		expect(summary.totalChanges).toBe(0);
		expect(summary.byRisk.Critical).toEqual([]);
		expect(summary.byRisk.High).toEqual([]);
		expect(summary.byRisk.Medium).toEqual([]);
		expect(summary.byRisk.Low).toEqual([]);
		expect(summary.byCategory.SIGNATURE_CHANGE).toEqual([]);
		expect(summary.byCategory.API_CHANGE).toEqual([]);
		expect(summary.byCategory.GUARD_REMOVED).toEqual([]);
		expect(summary.byCategory.LOGIC_CHANGE).toEqual([]);
		expect(summary.byCategory.DELETED_FUNCTION).toEqual([]);
		expect(summary.byCategory.NEW_FUNCTION).toEqual([]);
		expect(summary.byCategory.REFACTOR).toEqual([]);
		expect(summary.byCategory.COSMETIC).toEqual([]);
		expect(summary.byCategory.UNCLASSIFIED).toEqual([]);
	});

	test('7. changes correctly grouped by risk level', () => {
		const changes: ClassifiedChange[] = [
			createMockChange({ riskLevel: 'Critical', category: 'SIGNATURE_CHANGE' }),
			createMockChange({ riskLevel: 'Critical', category: 'GUARD_REMOVED' }),
			createMockChange({ riskLevel: 'High', category: 'LOGIC_CHANGE' }),
			createMockChange({ riskLevel: 'Medium', category: 'REFACTOR' }),
			createMockChange({ riskLevel: 'Low', category: 'COSMETIC' }),
		];
		const summary = generateSummary(changes);
		expect(summary.byRisk.Critical).toHaveLength(2);
		expect(summary.byRisk.High).toHaveLength(1);
		expect(summary.byRisk.Medium).toHaveLength(1);
		expect(summary.byRisk.Low).toHaveLength(1);
	});

	test('8. changes correctly grouped by category', () => {
		const changes: ClassifiedChange[] = [
			createMockChange({ category: 'SIGNATURE_CHANGE' }),
			createMockChange({ category: 'SIGNATURE_CHANGE' }),
			createMockChange({ category: 'API_CHANGE' }),
			createMockChange({ category: 'GUARD_REMOVED' }),
			createMockChange({ category: 'LOGIC_CHANGE' }),
			createMockChange({ category: 'DELETED_FUNCTION' }),
			createMockChange({ category: 'NEW_FUNCTION' }),
			createMockChange({ category: 'REFACTOR' }),
			createMockChange({ category: 'COSMETIC' }),
			createMockChange({ category: 'UNCLASSIFIED' }),
		];
		const summary = generateSummary(changes);
		expect(summary.byCategory.SIGNATURE_CHANGE).toHaveLength(2);
		expect(summary.byCategory.API_CHANGE).toHaveLength(1);
		expect(summary.byCategory.GUARD_REMOVED).toHaveLength(1);
		expect(summary.byCategory.LOGIC_CHANGE).toHaveLength(1);
		expect(summary.byCategory.DELETED_FUNCTION).toHaveLength(1);
		expect(summary.byCategory.NEW_FUNCTION).toHaveLength(1);
		expect(summary.byCategory.REFACTOR).toHaveLength(1);
		expect(summary.byCategory.COSMETIC).toHaveLength(1);
		expect(summary.byCategory.UNCLASSIFIED).toHaveLength(1);
	});
});

describe('generateSummaryMarkdown', () => {
	test('9. markdown contains "## Change Summary" header with correct counts', () => {
		const changes: ClassifiedChange[] = [
			createMockChange({ filePath: 'src/a.ts' }),
			createMockChange({ filePath: 'src/b.ts' }),
		];
		const summary = generateSummary(changes);
		const markdown = generateSummaryMarkdown(summary);
		expect(markdown).toContain('## Change Summary (2 files, 2 changes)');
	});

	test('10. markdown uses "### Critical (review first)" header', () => {
		const summary = generateSummary([]);
		const markdown = generateSummaryMarkdown(summary);
		expect(markdown).toContain('### Critical (review first)');
	});

	test('11. markdown uses "### Low (skim)" header', () => {
		const summary = generateSummary([]);
		const markdown = generateSummaryMarkdown(summary);
		expect(markdown).toContain('### Low (skim)');
	});

	test('12. empty groups show "- (none)" in markdown', () => {
		const summary = generateSummary([]);
		const markdown = generateSummaryMarkdown(summary);
		const lines = markdown.split('\n');
		const noneCount = lines.filter((line) => line === '- (none)').length;
		expect(noneCount).toBe(4); // All 4 risk levels are empty
	});

	test('13. each change appears as "- filePath: CATEGORY — description" in markdown', () => {
		const changes: ClassifiedChange[] = [
			createMockChange({
				filePath: 'src/utils.ts',
				category: 'LOGIC_CHANGE',
				description: 'Function body logic changed for testFunc',
			}),
		];
		const summary = generateSummary(changes);
		const markdown = generateSummaryMarkdown(summary);
		expect(markdown).toContain(
			'- src/utils.ts: LOGIC_CHANGE — Function body logic changed for testFunc',
		);
	});

	test('14. multiple files with same change counted correctly', () => {
		const changes: ClassifiedChange[] = [
			createMockChange({
				filePath: 'src/a.ts',
				category: 'COSMETIC',
				riskLevel: 'Low',
			}),
			createMockChange({
				filePath: 'src/b.ts',
				category: 'COSMETIC',
				riskLevel: 'Low',
			}),
			createMockChange({
				filePath: 'src/c.ts',
				category: 'COSMETIC',
				riskLevel: 'Low',
			}),
		];
		const summary = generateSummary(changes);
		const markdown = generateSummaryMarkdown(summary);
		// 3 files, 3 changes total
		expect(summary.totalFiles).toBe(3);
		expect(summary.totalChanges).toBe(3);
		expect(markdown).toContain('## Change Summary (3 files, 3 changes)');
		// All 3 COSMETIC changes should appear in Low section
		const lowSection = markdown.split('### Low (skim)')[1];
		expect(lowSection).toContain('- src/a.ts: COSMETIC');
		expect(lowSection).toContain('- src/b.ts: COSMETIC');
		expect(lowSection).toContain('- src/c.ts: COSMETIC');
	});

	test('markdown output has correct structure with all sections', () => {
		const changes: ClassifiedChange[] = [
			createMockChange({
				riskLevel: 'Critical',
				category: 'SIGNATURE_CHANGE',
				filePath: 'src/api.ts',
				description: 'Signature changed',
			}),
			createMockChange({
				riskLevel: 'High',
				category: 'LOGIC_CHANGE',
				filePath: 'src/core.ts',
				description: 'Logic changed',
			}),
		];
		const summary = generateSummary(changes);
		const markdown = generateSummaryMarkdown(summary);

		// Header
		expect(markdown).toContain('## Change Summary (2 files, 2 changes)');
		// Risk sections in order
		expect(markdown).toContain('### Critical (review first)');
		expect(markdown).toContain('### High');
		expect(markdown).toContain('### Medium');
		expect(markdown).toContain('### Low (skim)');
		// Content
		expect(markdown).toContain(
			'- src/api.ts: SIGNATURE_CHANGE — Signature changed',
		);
		expect(markdown).toContain('- src/core.ts: LOGIC_CHANGE — Logic changed');
		// Empty sections show (none)
		const mediumSection = markdown.split('### Medium')[1].split('###')[0];
		expect(mediumSection).toContain('- (none)');
	});
});
