/**
 * Tests for buildLanguageReviewerChecklist function added in Task 6.2.
 *
 * Since buildLanguageReviewerChecklist is not exported from system-enhancer.ts,
 * we recreate its logic with an injectable mock for getProfileForFile to test it directly.
 */
import { describe, expect, it } from 'bun:test';

/**
 * Type for language profile mock
 */
interface LanguageProfileMock {
	displayName: string;
	prompts: {
		reviewerChecklist: string[];
	};
}

/**
 * Recreates the buildLanguageReviewerChecklist logic with injectable mock.
 * This is copied from the source implementation to test a private function.
 */
function buildLanguageReviewerChecklistTest(
	currentTaskText: string | null,
	getProfileForFileMock: (path: string) => LanguageProfileMock | null,
): string | null {
	if (!currentTaskText) return null;

	// Extract file paths from task text (e.g. "src/tools/lint.ts")
	// Note: The regex in the source is /\bsrc\/\S+\.[a-zA-Z0-9]+\b/g
	const filePaths = currentTaskText.match(/\bsrc\/\S+\.[a-zA-Z0-9]+\b/g) ?? [];
	if (filePaths.length === 0) return null;

	// Collect unique checklist items across all task file paths (max 10 total)
	const allItems: string[] = [];
	const seenItems = new Set<string>();
	let languageLabel = '';

	for (const filePath of filePaths) {
		const profile = getProfileForFileMock(filePath);
		if (!profile) continue;
		if (!languageLabel) {
			languageLabel = profile.displayName;
		}
		for (const item of profile.prompts.reviewerChecklist) {
			if (!seenItems.has(item) && allItems.length < 10) {
				seenItems.add(item);
				allItems.push(item);
			}
		}
	}

	if (allItems.length === 0) return null;

	return `[LANGUAGE-SPECIFIC REVIEW CHECKLIST — ${languageLabel}]\n${allItems.map((i) => `- [ ] ${i}`).join('\n')}`;
}

describe('buildLanguageReviewerChecklist', () => {
	describe('Null and empty input handling', () => {
		it('returns null when input is null', () => {
			const result = buildLanguageReviewerChecklistTest(null, () => null);
			expect(result).toBe(null);
		});

		it('returns null when input is empty string', () => {
			const result = buildLanguageReviewerChecklistTest('', () => null);
			expect(result).toBe(null);
		});

		it('returns null when task has no src/ file paths', () => {
			const taskText = '- [ ] 1.1: Do something without file paths';
			const result = buildLanguageReviewerChecklistTest(taskText, () => null);
			expect(result).toBe(null);
		});
	});

	describe('Basic checklist extraction', () => {
		it('returns checklist block for TypeScript file', () => {
			const taskText = 'Update src/tools/lint.ts to add new functionality';
			const mockProfile: LanguageProfileMock = {
				displayName: 'TypeScript / JavaScript',
				prompts: {
					reviewerChecklist: [
						'Check for explicit return types on all functions',
						'Ensure no any types except in type guards',
					],
				},
			};

			const result = buildLanguageReviewerChecklistTest(taskText, (path) => {
				if (path === 'src/tools/lint.ts') return mockProfile;
				return null;
			});

			expect(result).not.toBe(null);
			expect(result).toContain(
				'[LANGUAGE-SPECIFIC REVIEW CHECKLIST — TypeScript / JavaScript]',
			);
			expect(result).toContain(
				'- [ ] Check for explicit return types on all functions',
			);
			expect(result).toContain(
				'- [ ] Ensure no any types except in type guards',
			);
		});

		it('returns null for unknown file extension (no profile)', () => {
			const taskText = 'Update src/lang/grammars/kotlin.wasm';
			const result = buildLanguageReviewerChecklistTest(taskText, () => null);
			expect(result).toBe(null);
		});
	});

	describe('Item deduplication', () => {
		it('removes duplicate items across multiple files', () => {
			const taskText =
				'- [ ] 1.1: Update src/tools/lint.ts\n- [ ] 1.2: Modify src/config/types.ts';
			const mockProfile: LanguageProfileMock = {
				displayName: 'TypeScript / JavaScript',
				prompts: {
					reviewerChecklist: [
						'Check for explicit return types',
						'Ensure no any types',
						'Check for explicit return types', // Duplicate
						'Ensure no any types', // Duplicate
						'Verify JSDoc comments',
					],
				},
			};

			const result = buildLanguageReviewerChecklistTest(taskText, (path) => {
				if (path.startsWith('src/')) return mockProfile;
				return null;
			});

			expect(result).not.toBe(null);

			// Count unique checklist items (each starts with "- [ ] ")
			const lines = result?.split('\n') ?? [];
			const checklistLines = lines.filter((line) => line.startsWith('- [ ] '));
			expect(checklistLines.length).toBe(3); // Only 3 unique items

			// Verify no duplicates
			const itemTexts = checklistLines.map((line) => line.slice(6));
			const uniqueItems = new Set(itemTexts);
			expect(uniqueItems.size).toBe(3);
		});

		it('handles files from different languages with overlapping items', () => {
			const taskText =
				'- [ ] 1.1: Update src/tools/lint.ts\n- [ ] 1.2: Modify src/main.rs';
			const tsProfile: LanguageProfileMock = {
				displayName: 'TypeScript / JavaScript',
				prompts: {
					reviewerChecklist: [
						'Check for explicit return types',
						'Ensure no any types',
						'Verify documentation',
					],
				},
			};
			const rustProfile: LanguageProfileMock = {
				displayName: 'Rust',
				prompts: {
					reviewerChecklist: [
						'Check for explicit return types', // Overlapping
						'Verify Result types used',
						'Ensure no unwrap() calls',
					],
				},
			};

			const result = buildLanguageReviewerChecklistTest(taskText, (path) => {
				if (path.endsWith('.ts')) return tsProfile;
				if (path.endsWith('.rs')) return rustProfile;
				return null;
			});

			expect(result).not.toBe(null);

			// Should have 5 unique items (3 TS + 3 Rust - 1 duplicate)
			const lines = result?.split('\n') ?? [];
			const checklistLines = lines.filter((line) => line.startsWith('- [ ] '));
			expect(checklistLines.length).toBe(5);

			// "Check for explicit return types" should appear only once
			const countExplicitReturn = checklistLines.filter((line) =>
				line.includes('explicit return types'),
			).length;
			expect(countExplicitReturn).toBe(1);
		});
	});

	describe('Item limit (10 items max)', () => {
		it('limits output to exactly 10 items when profile has more', () => {
			const taskText = 'Update src/tools/lint.ts';
			const items = Array.from(
				{ length: 15 },
				(_, i) => `Checklist item ${i + 1}`,
			);
			const mockProfile: LanguageProfileMock = {
				displayName: 'TypeScript / JavaScript',
				prompts: {
					reviewerChecklist: items,
				},
			};

			const result = buildLanguageReviewerChecklistTest(
				taskText,
				() => mockProfile,
			);

			expect(result).not.toBe(null);

			// Count checklist item lines
			const lines = result?.split('\n') ?? [];
			const checklistLines = lines.filter((line) => line.startsWith('- [ ] '));
			expect(checklistLines.length).toBe(10);

			// Verify it's the first 10 items
			for (let i = 0; i < 10; i++) {
				expect(result).toContain(`- [ ] Checklist item ${i + 1}`);
			}

			// Item 11 should NOT be in output
			expect(result).not.toContain('Checklist item 11');
		});

		it('limits output to 10 items even with multiple files', () => {
			const taskText =
				'- [ ] 1.1: Update src/tools/lint.ts\n- [ ] 1.2: Modify src/config/types.ts';
			const items1 = Array.from({ length: 7 }, (_, i) => `File1 item ${i + 1}`);
			const items2 = Array.from({ length: 7 }, (_, i) => `File2 item ${i + 1}`);
			const mockProfile: LanguageProfileMock = {
				displayName: 'TypeScript / JavaScript',
				prompts: {
					reviewerChecklist: [...items1, ...items2],
				},
			};

			const result = buildLanguageReviewerChecklistTest(
				taskText,
				() => mockProfile,
			);

			expect(result).not.toBe(null);

			const lines = result?.split('\n') ?? [];
			const checklistLines = lines.filter((line) => line.startsWith('- [ ] '));
			expect(checklistLines.length).toBe(10);
		});
	});

	describe('Multiple language files', () => {
		it('merges items from multiple TypeScript files without duplicates', () => {
			const taskText =
				'- [ ] 1.1: Update src/tools/lint.ts\n- [ ] 1.2: Modify src/tools/pkg-audit.ts\n- [ ] 1.3: Fix src/config/types.ts';
			const mockProfile: LanguageProfileMock = {
				displayName: 'TypeScript / JavaScript',
				prompts: {
					reviewerChecklist: [
						'Check for explicit return types',
						'Ensure no any types',
						'Verify JSDoc comments',
					],
				},
			};

			const result = buildLanguageReviewerChecklistTest(taskText, (path) => {
				if (path.endsWith('.ts')) return mockProfile;
				return null;
			});

			expect(result).not.toBe(null);
			expect(result).toContain(
				'[LANGUAGE-SPECIFIC REVIEW CHECKLIST — TypeScript / JavaScript]',
			);

			// Should have exactly 3 unique items
			const lines = result?.split('\n') ?? [];
			const checklistLines = lines.filter((line) => line.startsWith('- [ ] '));
			expect(checklistLines.length).toBe(3);
		});

		it('merges items from multiple languages with first language label', () => {
			const taskText =
				'- [ ] 1.1: Update src/tools/lint.ts\n- [ ] 1.2: Modify src/main.rs';
			const tsProfile: LanguageProfileMock = {
				displayName: 'TypeScript / JavaScript',
				prompts: {
					reviewerChecklist: ['Check TS function types', 'Verify TS imports'],
				},
			};
			const rustProfile: LanguageProfileMock = {
				displayName: 'Rust',
				prompts: {
					reviewerChecklist: ['Check Rust safety', 'Verify Rust ownership'],
				},
			};

			const result = buildLanguageReviewerChecklistTest(taskText, (path) => {
				if (path.endsWith('.ts')) return tsProfile;
				if (path.endsWith('.rs')) return rustProfile;
				return null;
			});

			expect(result).not.toBe(null);
			// Should use first language's display name (TypeScript / JavaScript)
			expect(result).toContain('TypeScript / JavaScript');

			// Should have all 4 unique items
			const lines = result?.split('\n') ?? [];
			const checklistLines = lines.filter((line) => line.startsWith('- [ ] '));
			expect(checklistLines.length).toBe(4);
		});
	});

	describe('Empty checklist handling', () => {
		it('returns null when profile has empty reviewerChecklist array', () => {
			const taskText = 'Update src/tools/lint.ts';
			const mockProfile: LanguageProfileMock = {
				displayName: 'TypeScript / JavaScript',
				prompts: {
					reviewerChecklist: [],
				},
			};

			const result = buildLanguageReviewerChecklistTest(
				taskText,
				() => mockProfile,
			);
			expect(result).toBe(null);
		});

		it('returns null when all files have no profile', () => {
			const taskText =
				'- [ ] 1.1: Update src/tools/lint.ts\n- [ ] 1.2: Modify src/config/types.ts';
			const result = buildLanguageReviewerChecklistTest(taskText, () => null);
			expect(result).toBe(null);
		});
	});

	describe('File path edge cases', () => {
		it('matches file paths with multiple dots (e.g., src/test.fixtures.ts)', () => {
			const taskText = 'Update src/test.fixtures.ts';
			const mockProfile: LanguageProfileMock = {
				displayName: 'TypeScript / JavaScript',
				prompts: {
					reviewerChecklist: ['Check item 1'],
				},
			};

			const result = buildLanguageReviewerChecklistTest(taskText, (path) => {
				if (path === 'src/test.fixtures.ts') return mockProfile;
				return null;
			});

			expect(result).not.toBe(null);
		});

		it('matches file paths with underscores and hyphens', () => {
			const taskText = 'Update src/tools/custom_file-name.test.ts';
			const mockProfile: LanguageProfileMock = {
				displayName: 'TypeScript / JavaScript',
				prompts: {
					reviewerChecklist: ['Check item 1'],
				},
			};

			const result = buildLanguageReviewerChecklistTest(taskText, (path) => {
				if (path === 'src/tools/custom_file-name.test.ts') return mockProfile;
				return null;
			});

			expect(result).not.toBe(null);
		});

		it('does not match non-src/ file paths', () => {
			const taskText = 'Update tests/unit/hooks/test.ts and lib/other.js';
			const mockProfile: LanguageProfileMock = {
				displayName: 'TypeScript / JavaScript',
				prompts: {
					reviewerChecklist: ['Check item 1'],
				},
			};

			const result = buildLanguageReviewerChecklistTest(
				taskText,
				() => mockProfile,
			);
			expect(result).toBe(null);
		});
	});

	describe('Output format verification', () => {
		it('produces correct output format with header and checkbox items', () => {
			const taskText = 'Update src/tools/lint.ts';
			const mockProfile: LanguageProfileMock = {
				displayName: 'TypeScript / JavaScript',
				prompts: {
					reviewerChecklist: ['Check item 1', 'Check item 2', 'Check item 3'],
				},
			};

			const result = buildLanguageReviewerChecklistTest(
				taskText,
				() => mockProfile,
			);

			expect(result).not.toBe(null);

			// Verify format: [LANGUAGE-SPECIFIC REVIEW CHECKLIST — <language>]
			expect(result).toMatch(
				/^\[LANGUAGE-SPECIFIC REVIEW CHECKLIST — TypeScript \/ JavaScript\]/,
			);

			// Verify each item starts with "- [ ] " (note the space after checkbox)
			const lines = result?.split('\n') ?? [];
			const itemLines = lines.slice(1); // Skip header
			for (const line of itemLines) {
				expect(line).toMatch(/^- \[ \] /);
			}
		});

		it('uses first language label when multiple languages present', () => {
			const taskText =
				'- [ ] 1.1: Update src/tools/lint.ts\n- [ ] 1.2: Modify src/main.rs';
			const tsProfile: LanguageProfileMock = {
				displayName: 'TypeScript / JavaScript',
				prompts: {
					reviewerChecklist: ['TS Check 1'],
				},
			};
			const rustProfile: LanguageProfileMock = {
				displayName: 'Rust',
				prompts: {
					reviewerChecklist: ['Rust Check 1'],
				},
			};

			const result = buildLanguageReviewerChecklistTest(taskText, (path) => {
				if (path.endsWith('.ts')) return tsProfile;
				if (path.endsWith('.rs')) return rustProfile;
				return null;
			});

			expect(result).not.toBe(null);
			// Should use first language's display name
			expect(result).toContain('TypeScript / JavaScript');
		});

		it('ensures each item has checkbox format with space after checkbox', () => {
			const taskText = 'Update src/tools/lint.ts';
			const mockProfile: LanguageProfileMock = {
				displayName: 'TypeScript / JavaScript',
				prompts: {
					reviewerChecklist: ['Item one', 'Item two', 'Item three'],
				},
			};

			const result = buildLanguageReviewerChecklistTest(
				taskText,
				() => mockProfile,
			);

			expect(result).not.toBe(null);
			expect(result).toContain('- [ ] Item one');
			expect(result).toContain('- [ ] Item two');
			expect(result).toContain('- [ ] Item three');

			// Verify the exact prefix format
			const lines = result?.split('\n') ?? [];
			const itemLines = lines.filter((line) => line.startsWith('- [ ] '));
			expect(itemLines.length).toBe(3);

			// Each item should have exactly "- [ ] " prefix (6 characters)
			for (const line of itemLines) {
				expect(line.substring(0, 6)).toBe('- [ ] ');
			}
		});
	});

	describe('Multiple files same language', () => {
		it('dedupes items across multiple same-language files', () => {
			const taskText =
				'- [ ] 1.1: Update src/tools/lint.ts\n- [ ] 1.2: Modify src/config/types.ts';
			const mockProfile: LanguageProfileMock = {
				displayName: 'TypeScript / JavaScript',
				prompts: {
					reviewerChecklist: [
						'Check for explicit return types',
						'Ensure no any types',
						'Verify JSDoc comments',
					],
				},
			};

			const result = buildLanguageReviewerChecklistTest(taskText, (path) => {
				if (path.startsWith('src/')) return mockProfile;
				return null;
			});

			expect(result).not.toBe(null);

			// Should have exactly 3 unique items even though both files reference same profile
			const lines = result?.split('\n') ?? [];
			const itemLines = lines.filter((line) => line.startsWith('- [ ] '));
			expect(itemLines.length).toBe(3);
		});
	});

	describe('Item cap spans multiple files', () => {
		it('limits to 10 items when multiple files each contribute many items', () => {
			const taskText =
				'- [ ] 1.1: Update src/tools/lint.ts\n- [ ] 1.2: Modify src/config/types.ts';

			// First file contributes 7 items
			const file1Items = Array.from(
				{ length: 7 },
				(_, i) => `File1 Check ${i + 1}`,
			);
			// Second file contributes 7 items
			const file2Items = Array.from(
				{ length: 7 },
				(_, i) => `File2 Check ${i + 1}`,
			);

			// Simulate different profiles for different files
			const mockProfile1: LanguageProfileMock = {
				displayName: 'TypeScript / JavaScript',
				prompts: {
					reviewerChecklist: file1Items,
				},
			};
			const mockProfile2: LanguageProfileMock = {
				displayName: 'TypeScript / JavaScript',
				prompts: {
					reviewerChecklist: file2Items,
				},
			};

			const result = buildLanguageReviewerChecklistTest(taskText, (path) => {
				if (path === 'src/tools/lint.ts') return mockProfile1;
				if (path === 'src/config/types.ts') return mockProfile2;
				return null;
			});

			expect(result).not.toBe(null);

			const lines = result?.split('\n') ?? [];
			const itemLines = lines.filter((line) => line.startsWith('- [ ] '));
			expect(itemLines.length).toBe(10);

			// Verify we got the first 7 from file1 and first 3 from file2
			for (let i = 1; i <= 7; i++) {
				expect(result).toContain(`- [ ] File1 Check ${i}`);
			}
			for (let i = 1; i <= 3; i++) {
				expect(result).toContain(`- [ ] File2 Check ${i}`);
			}

			// Should NOT contain items 4-7 from file2
			expect(result).not.toContain('File2 Check 4');
			expect(result).not.toContain('File2 Check 5');
			expect(result).not.toContain('File2 Check 6');
			expect(result).not.toContain('File2 Check 7');
		});
	});
});
