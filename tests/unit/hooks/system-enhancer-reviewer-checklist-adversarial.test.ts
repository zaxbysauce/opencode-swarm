import { describe, expect, it } from 'bun:test';

// Recreated function pattern (private helper from src/hooks/system-enhancer.ts)
interface LanguageProfileMock {
	displayName: string;
	prompts: { reviewerChecklist: string[] };
}

function buildLanguageReviewerChecklistTest(
	currentTaskText: string | null,
	getProfileForFileMock: (path: string) => LanguageProfileMock | null,
): string | null {
	if (!currentTaskText) return null;
	const filePaths = currentTaskText.match(/\bsrc\/\S+\.[a-zA-Z0-9]+\b/g) ?? [];
	if (filePaths.length === 0) return null;
	const allItems: string[] = [];
	const seenItems = new Set<string>();
	let languageLabel = '';
	for (const filePath of filePaths) {
		const profile = getProfileForFileMock(filePath);
		if (!profile) continue;
		if (!languageLabel) languageLabel = profile.displayName;
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

describe('buildLanguageReviewerChecklist - ADVERSARIAL TESTS', () => {
	describe('1. Regex-special characters in path', () => {
		it('should not crash with brackets in paths', () => {
			const taskText = 'Update src/tools/[evil].ts and src/tools/(bad).ts';
			const mockGetProfile = (path: string) => {
				// Mock returns null for problematic paths
				return null;
			};

			// Should not throw exception
			const result = buildLanguageReviewerChecklistTest(
				taskText,
				mockGetProfile,
			);

			// Returns null because mock returns null
			expect(result).toBeNull();
		});
	});

	describe('2. Very long task text (10,000 chars)', () => {
		it('should handle 10,000 character task text without crashing', () => {
			const baseText = 'src/tools/lint.ts ';
			const repetitions = 500; // 20 chars * 500 = 10,000 chars
			const longTaskText = baseText.repeat(repetitions);

			const mockGetProfile = () => ({
				displayName: 'TypeScript / JavaScript',
				prompts: { reviewerChecklist: ['Check 1', 'Check 2', 'Check 3'] },
			});

			// Should not throw and should complete quickly
			const result = buildLanguageReviewerChecklistTest(
				longTaskText,
				mockGetProfile,
			);

			expect(result).not.toBeNull();
			expect(result).toContain('Check 1');
			expect(result).toContain('Check 2');
			expect(result).toContain('Check 3');

			// Verify ≤10 items in output
			const checklistLines = result!
				.split('\n')
				.filter((line) => line.startsWith('- [ ] '));
			expect(checklistLines.length).toBeLessThanOrEqual(10);
		});
	});

	describe('3. Path with spaces in task text', () => {
		it('should not match paths interrupted by spaces', () => {
			const taskText = 'Update src/my tools/file.ts';

			let mockWasCalled = false;
			const mockGetProfile = () => {
				mockWasCalled = true;
				return {
					displayName: 'TypeScript / JavaScript',
					prompts: { reviewerChecklist: ['Check TypeScript'] },
				};
			};

			const result = buildLanguageReviewerChecklistTest(
				taskText,
				mockGetProfile,
			);

			// Regex \S+ stops at space, so "src/my" doesn't have an extension dot
			// Therefore no valid path is extracted
			expect(result).toBeNull();
			// Mock should not have been called because no valid path was matched
			expect(mockWasCalled).toBeFalse();
		});
	});

	describe('4. XSS-like content in checklist item', () => {
		it('should preserve XSS content verbatim without escaping', () => {
			const taskText = 'Update src/tools/lint.ts';
			const xssPayload = "<script>alert('xss')</script>";

			const mockGetProfile = () => ({
				displayName: 'TypeScript / JavaScript',
				prompts: { reviewerChecklist: [xssPayload, 'real item'] },
			});

			const result = buildLanguageReviewerChecklistTest(
				taskText,
				mockGetProfile,
			);

			expect(result).not.toBeNull();
			expect(result).toContain(xssPayload);
			expect(result).toContain('real item');
			// XSS payload should appear exactly as provided (no escaping)
			expect(result).toContain(`- [ ] <script>alert('xss')</script>`);
		});
	});

	describe('5. 100 repeated identical file paths', () => {
		it('should deduplicate checklist items despite repeated paths', () => {
			const baseText = 'src/tools/lint.ts';
			const repetitions = 100;
			const taskText = Array(repetitions).fill(baseText).join(' ');

			const mockGetProfile = () => ({
				displayName: 'TypeScript / JavaScript',
				prompts: { reviewerChecklist: ['Check 1', 'Check 2', 'Check 3'] },
			});

			const result = buildLanguageReviewerChecklistTest(
				taskText,
				mockGetProfile,
			);

			expect(result).not.toBeNull();

			// Count the number of checklist lines (lines starting with "- [ ] ")
			const checklistLines = result!
				.split('\n')
				.filter((line) => line.startsWith('- [ ] '));
			expect(checklistLines.length).toBe(3);

			expect(result).toContain('- [ ] Check 1');
			expect(result).toContain('- [ ] Check 2');
			expect(result).toContain('- [ ] Check 3');
		});
	});

	describe('6. Profile with empty reviewerChecklist array', () => {
		it('should return null when profile has empty checklist array', () => {
			const taskText = 'Update src/tools/lint.ts';

			const mockGetProfile = () => ({
				displayName: 'TypeScript / JavaScript',
				prompts: { reviewerChecklist: [] },
			});

			const result = buildLanguageReviewerChecklistTest(
				taskText,
				mockGetProfile,
			);

			expect(result).toBeNull();
		});
	});

	describe('7. Mixed language task hitting cap of 10', () => {
		it('should cap at 10 checklist items across multiple languages', () => {
			const taskText =
				'Update src/tools/lint.ts and src/main.py and src/cmd/main.go';

			const tsItems = ['TS1', 'TS2', 'TS3', 'TS4'];
			const pyItems = ['PY1', 'PY2', 'PY3', 'PY4'];
			const goItems = ['GO1', 'GO2', 'GO3', 'GO4'];

			const mockGetProfile = (path: string) => {
				if (path.endsWith('.ts')) {
					return {
						displayName: 'TypeScript / JavaScript',
						prompts: { reviewerChecklist: tsItems },
					};
				} else if (path.endsWith('.py')) {
					return {
						displayName: 'Python',
						prompts: { reviewerChecklist: pyItems },
					};
				} else if (path.endsWith('.go')) {
					return {
						displayName: 'Go',
						prompts: { reviewerChecklist: goItems },
					};
				}
				return null;
			};

			const result = buildLanguageReviewerChecklistTest(
				taskText,
				mockGetProfile,
			);

			expect(result).not.toBeNull();
			expect(result).toContain('TypeScript / JavaScript');

			// Count checklist lines
			const checklistLines = result!
				.split('\n')
				.filter((line) => line.startsWith('- [ ] '));
			expect(checklistLines.length).toBe(10);

			// Verify first profile's displayName is used
			expect(result).toContain(
				'LANGUAGE-SPECIFIC REVIEW CHECKLIST — TypeScript / JavaScript',
			);

			// Verify items from all three languages are present
			// Order: TS first, then PY, then GO (based on file order in task)
			expect(result).toContain('- [ ] TS1');
			expect(result).toContain('- [ ] TS2');
			expect(result).toContain('- [ ] TS3');
			expect(result).toContain('- [ ] TS4');
			expect(result).toContain('- [ ] PY1');
			expect(result).toContain('- [ ] PY2');
			expect(result).toContain('- [ ] PY3');
			expect(result).toContain('- [ ] PY4');
			expect(result).toContain('- [ ] GO1');
			expect(result).toContain('- [ ] GO2');

			// GO3 and GO4 should NOT be present (cap at 10)
			expect(result).not.toContain('- [ ] GO3');
			expect(result).not.toContain('- [ ] GO4');
		});
	});

	describe('8. Task text is only whitespace', () => {
		it('should return null for whitespace-only text', () => {
			const taskText = '   \t\n\r   ';

			const mockGetProfile = () => ({
				displayName: 'TypeScript / JavaScript',
				prompts: { reviewerChecklist: ['Check TypeScript'] },
			});

			const result = buildLanguageReviewerChecklistTest(
				taskText,
				mockGetProfile,
			);

			expect(result).toBeNull();
		});
	});

	describe('9. Checklist text that is an empty string', () => {
		it('should include empty string checklist items without crashing', () => {
			const taskText = 'Update src/tools/lint.ts';

			const mockGetProfile = () => ({
				displayName: 'TypeScript / JavaScript',
				prompts: { reviewerChecklist: ['', 'real item', ''] },
			});

			const result = buildLanguageReviewerChecklistTest(
				taskText,
				mockGetProfile,
			);

			expect(result).not.toBeNull();

			// Count checklist lines
			const checklistLines = result!
				.split('\n')
				.filter((line) => line.startsWith('- [ ] '));
			expect(checklistLines.length).toBe(2);

			// Empty string creates a line with just "- [ ] "
			expect(result).toContain('- [ ] ');
			expect(result).toContain('- [ ] real item');

			// Verify deduplication: second empty string should not appear
			const emptyItemLines = result!
				.split('\n')
				.filter((line) => line === '- [ ] ');
			expect(emptyItemLines.length).toBe(1);
		});
	});

	describe('10. Newlines in checklist item', () => {
		it('should preserve newlines in checklist items verbatim', () => {
			const taskText = 'Update src/tools/lint.ts';
			const itemWithNewline = 'Check for\nnewlines in output';

			const mockGetProfile = () => ({
				displayName: 'TypeScript / JavaScript',
				prompts: { reviewerChecklist: [itemWithNewline, 'normal item'] },
			});

			// Should not throw exception
			const result = buildLanguageReviewerChecklistTest(
				taskText,
				mockGetProfile,
			);

			expect(result).not.toBeNull();
			expect(result).toContain(itemWithNewline);
			expect(result).toContain('normal item');

			// The newline should appear in the output (creates multi-line item)
			expect(result).toContain('Check for');
			expect(result).toContain('newlines in output');
		});
	});

	describe('11. Very long checklist item (1000 chars)', () => {
		it('should handle 1000 character checklist item without crashing', () => {
			const taskText = 'Update src/tools/lint.ts';
			const longItem = 'x'.repeat(1000);

			const mockGetProfile = () => ({
				displayName: 'TypeScript / JavaScript',
				prompts: { reviewerChecklist: [longItem] },
			});

			// Should not throw exception
			const result = buildLanguageReviewerChecklistTest(
				taskText,
				mockGetProfile,
			);

			expect(result).not.toBeNull();
			expect(result).toContain(longItem);

			// Verify the long item is included verbatim
			const checklistLines = result!
				.split('\n')
				.filter((line) => line.startsWith('- [ ] '));
			expect(checklistLines.length).toBe(1);
			expect(checklistLines[0].length).toBeGreaterThan(1000); // "- [ ] " prefix + 1000 chars
		});
	});

	describe('12. Empty displayName', () => {
		it('should handle empty displayName without crashing', () => {
			const taskText = 'Update src/tools/lint.ts';

			const mockGetProfile = () => ({
				displayName: '', // Empty string
				prompts: { reviewerChecklist: ['Check something'] },
			});

			// Should not throw exception
			const result = buildLanguageReviewerChecklistTest(
				taskText,
				mockGetProfile,
			);

			expect(result).not.toBeNull();

			// Header should have empty label
			expect(result).toContain('[LANGUAGE-SPECIFIC REVIEW CHECKLIST — ]');
			expect(result).toContain('- [ ] Check something');
		});
	});

	describe('Additional edge cases', () => {
		it('should handle null task text', () => {
			const mockGetProfile = () => ({
				displayName: 'TypeScript / JavaScript',
				prompts: { reviewerChecklist: ['Check TypeScript'] },
			});

			const result = buildLanguageReviewerChecklistTest(null, mockGetProfile);

			expect(result).toBeNull();
		});

		it('should handle empty string task text', () => {
			const taskText = '';

			const mockGetProfile = () => ({
				displayName: 'TypeScript / JavaScript',
				prompts: { reviewerChecklist: ['Check TypeScript'] },
			});

			const result = buildLanguageReviewerChecklistTest(
				taskText,
				mockGetProfile,
			);

			expect(result).toBeNull();
		});

		it('should handle task text without src/ paths', () => {
			const taskText = 'Update lib/tools/lint.ts and test/main.ts';

			const mockGetProfile = () => ({
				displayName: 'TypeScript / JavaScript',
				prompts: { reviewerChecklist: ['Check TypeScript'] },
			});

			const result = buildLanguageReviewerChecklistTest(
				taskText,
				mockGetProfile,
			);

			expect(result).toBeNull();
		});

		it('should handle file paths with numbers in extension', () => {
			const taskText = 'Update src/file.ts123';

			const mockGetProfile = () => ({
				displayName: 'TypeScript / JavaScript',
				prompts: { reviewerChecklist: ['Check TypeScript'] },
			});

			const result = buildLanguageReviewerChecklistTest(
				taskText,
				mockGetProfile,
			);

			expect(result).not.toBeNull();
			expect(result).toContain('Check TypeScript');
		});

		it('should handle file paths with uppercase extensions', () => {
			const taskText = 'Update src/file.TS';

			const mockGetProfile = () => ({
				displayName: 'TypeScript / JavaScript',
				prompts: { reviewerChecklist: ['Check TypeScript'] },
			});

			const result = buildLanguageReviewerChecklistTest(
				taskText,
				mockGetProfile,
			);

			expect(result).not.toBeNull();
			expect(result).toContain('Check TypeScript');
		});

		it('should handle mixed case extensions', () => {
			const taskText = 'Update src/file.Ts';

			const mockGetProfile = () => ({
				displayName: 'TypeScript / JavaScript',
				prompts: { reviewerChecklist: ['Check TypeScript'] },
			});

			const result = buildLanguageReviewerChecklistTest(
				taskText,
				mockGetProfile,
			);

			expect(result).not.toBeNull();
			expect(result).toContain('Check TypeScript');
		});

		it('should handle duplicate items across different profiles', () => {
			const taskText = 'Update src/tools/lint.ts and src/main.py';

			const mockGetProfile = (path: string) => {
				if (path.endsWith('.ts')) {
					return {
						displayName: 'TypeScript / JavaScript',
						prompts: { reviewerChecklist: ['Shared item', 'TS unique item'] },
					};
				} else if (path.endsWith('.py')) {
					return {
						displayName: 'Python',
						prompts: { reviewerChecklist: ['Shared item', 'PY unique item'] },
					};
				}
				return null;
			};

			const result = buildLanguageReviewerChecklistTest(
				taskText,
				mockGetProfile,
			);

			expect(result).not.toBeNull();

			// Count checklist lines - should be 3, not 4 (deduplicated "Shared item")
			const checklistLines = result!
				.split('\n')
				.filter((line) => line.startsWith('- [ ] '));
			expect(checklistLines.length).toBe(3);

			expect(result).toContain('- [ ] Shared item');
			expect(result).toContain('- [ ] TS unique item');
			expect(result).toContain('- [ ] PY unique item');

			// Verify "Shared item" appears only once
			const sharedItemCount = (result!.match(/- \[ \] Shared item/g) || [])
				.length;
			expect(sharedItemCount).toBe(1);
		});

		it('should use first language label when multiple languages present', () => {
			const taskText = 'Update src/tools/lint.ts and src/main.py';

			const mockGetProfile = (path: string) => {
				if (path.endsWith('.ts')) {
					return {
						displayName: 'TypeScript',
						prompts: { reviewerChecklist: ['TS item'] },
					};
				} else if (path.endsWith('.py')) {
					return {
						displayName: 'Python',
						prompts: { reviewerChecklist: ['PY item'] },
					};
				}
				return null;
			};

			const result = buildLanguageReviewerChecklistTest(
				taskText,
				mockGetProfile,
			);

			expect(result).not.toBeNull();
			// Should use first profile's displayName (TypeScript)
			expect(result).toContain(
				'LANGUAGE-SPECIFIC REVIEW CHECKLIST — TypeScript',
			);
		});

		it('should skip profiles that return null', () => {
			const taskText =
				'Update src/tools/lint.ts and src/unknown.xyz and src/main.py';

			const mockGetProfile = (path: string) => {
				if (path.endsWith('.ts')) {
					return {
						displayName: 'TypeScript',
						prompts: { reviewerChecklist: ['TS item'] },
					};
				} else if (path.endsWith('.py')) {
					return {
						displayName: 'Python',
						prompts: { reviewerChecklist: ['PY item'] },
					};
				}
				// Unknown extension returns null
				return null;
			};

			const result = buildLanguageReviewerChecklistTest(
				taskText,
				mockGetProfile,
			);

			expect(result).not.toBeNull();

			// Should have 2 items (TS and PY, skipped unknown.xyz)
			const checklistLines = result!
				.split('\n')
				.filter((line) => line.startsWith('- [ ] '));
			expect(checklistLines.length).toBe(2);
			expect(result).toContain('- [ ] TS item');
			expect(result).toContain('- [ ] PY item');
		});
	});
});
