import { describe, expect, it } from 'bun:test';

// Recreated function pattern (private helper from src/hooks/system-enhancer.ts)
interface LanguageProfileMock {
	displayName: string;
	prompts: { coderConstraints: string[] };
}

function buildLanguageCoderConstraintsTest(
	currentTaskText: string | null,
	getProfileForFileMock: (path: string) => LanguageProfileMock | null,
): string | null {
	if (!currentTaskText) return null;
	const filePaths = currentTaskText.match(/\bsrc\/\S+\.[a-zA-Z0-9]+\b/g) ?? [];
	if (filePaths.length === 0) return null;
	const allConstraints: string[] = [];
	const seenConstraints = new Set<string>();
	let languageLabel = '';
	for (const filePath of filePaths) {
		const profile = getProfileForFileMock(filePath);
		if (!profile) continue;
		if (!languageLabel) languageLabel = profile.displayName;
		for (const constraint of profile.prompts.coderConstraints) {
			if (!seenConstraints.has(constraint) && allConstraints.length < 10) {
				seenConstraints.add(constraint);
				allConstraints.push(constraint);
			}
		}
	}
	if (allConstraints.length === 0) return null;
	return `[LANGUAGE-SPECIFIC CONSTRAINTS — ${languageLabel}]\n${allConstraints.map((c) => `- ${c}`).join('\n')}`;
}

describe('buildLanguageCoderConstraints - ADVERSARIAL TESTS', () => {
	describe('1. Regex-special characters in path', () => {
		it('should not crash with brackets in paths', () => {
			const taskText = 'Update src/tools/[evil].ts and src/tools/(bad).ts';
			const mockGetProfile = (path: string) => {
				if (path.includes('[evil]') || path.includes('(bad)')) {
					return null; // Mock returns null for problematic paths
				}
				return {
					displayName: 'TypeScript / JavaScript',
					prompts: { coderConstraints: ['Use TypeScript', 'Prefer const'] },
				};
			};

			// Should not throw exception
			const result = buildLanguageCoderConstraintsTest(
				taskText,
				mockGetProfile,
			);

			// Returns null because regex extracts partial paths that don't match extension pattern
			expect(result).toBeNull();
		});

		it('should handle paths with special regex chars that do have extensions', () => {
			const taskText = 'Update src/tools/test[1].ts';
			const mockGetProfile = () => ({
				displayName: 'TypeScript / JavaScript',
				prompts: { coderConstraints: ['Use TypeScript'] },
			});

			// Should not crash - the regex \S+ will match up to the extension
			const result = buildLanguageCoderConstraintsTest(
				taskText,
				mockGetProfile,
			);

			// Returns a result because test[1].ts matches the pattern
			expect(result).not.toBeNull();
			expect(result).toContain('Use TypeScript');
		});
	});

	describe('2. Very long task text (10,000 chars)', () => {
		it('should handle 10,000 character task text without crashing', () => {
			const baseText = 'src/tools/lint.ts ';
			const repetitions = 500; // 20 chars * 500 = 10,000 chars
			const longTaskText = baseText.repeat(repetitions);

			const mockGetProfile = () => ({
				displayName: 'TypeScript / JavaScript',
				prompts: {
					coderConstraints: ['Constraint 1', 'Constraint 2', 'Constraint 3'],
				},
			});

			// Should not throw and should complete quickly
			const result = buildLanguageCoderConstraintsTest(
				longTaskText,
				mockGetProfile,
			);

			expect(result).not.toBeNull();
			expect(result).toContain('Constraint 1');
			expect(result).toContain('Constraint 2');
			expect(result).toContain('Constraint 3');
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
					prompts: { coderConstraints: ['Use TypeScript'] },
				};
			};

			const result = buildLanguageCoderConstraintsTest(
				taskText,
				mockGetProfile,
			);

			// Regex \S+ stops at space, so "src/my" doesn't have an extension dot
			// Therefore no valid path is extracted
			expect(result).toBeNull();
			// Mock should not have been called because no valid path was matched
			expect(mockWasCalled).toBeFalse();
		});

		it('should match path when space appears after the full path', () => {
			const taskText = 'Update src/tools/lint.ts and other stuff';

			const mockGetProfile = () => ({
				displayName: 'TypeScript / JavaScript',
				prompts: { coderConstraints: ['Use TypeScript'] },
			});

			const result = buildLanguageCoderConstraintsTest(
				taskText,
				mockGetProfile,
			);

			expect(result).not.toBeNull();
			expect(result).toContain('Use TypeScript');
		});
	});

	describe('4. XSS-like content in constraint text', () => {
		it('should preserve XSS content verbatim without escaping', () => {
			const taskText = 'Update src/tools/lint.ts';
			const xssPayload = "<script>alert('xss')</script>";

			const mockGetProfile = () => ({
				displayName: 'TypeScript / JavaScript',
				prompts: { coderConstraints: [xssPayload, 'normal constraint'] },
			});

			const result = buildLanguageCoderConstraintsTest(
				taskText,
				mockGetProfile,
			);

			expect(result).not.toBeNull();
			expect(result).toContain(xssPayload);
			expect(result).toContain('normal constraint');
			// XSS payload should appear exactly as provided (no escaping)
			expect(result).toContain(`<script>alert('xss')</script>`);
		});
	});

	describe('5. 100 repeated identical file paths', () => {
		it('should deduplicate constraints despite repeated paths', () => {
			const baseText = 'src/tools/lint.ts';
			const repetitions = 100;
			const taskText = Array(repetitions).fill(baseText).join(' ');

			const mockGetProfile = () => ({
				displayName: 'TypeScript / JavaScript',
				prompts: {
					coderConstraints: ['Constraint 1', 'Constraint 2', 'Constraint 3'],
				},
			});

			const result = buildLanguageCoderConstraintsTest(
				taskText,
				mockGetProfile,
			);

			expect(result).not.toBeNull();

			// Count the number of constraint lines (lines starting with "- ")
			const constraintLines = result!
				.split('\n')
				.filter((line) => line.startsWith('- '));
			expect(constraintLines.length).toBe(3);

			expect(result).toContain('- Constraint 1');
			expect(result).toContain('- Constraint 2');
			expect(result).toContain('- Constraint 3');
		});
	});

	describe('6. Profile with empty coderConstraints array', () => {
		it('should return null when profile has empty constraints array', () => {
			const taskText = 'Update src/tools/lint.ts';

			const mockGetProfile = () => ({
				displayName: 'TypeScript / JavaScript',
				prompts: { coderConstraints: [] },
			});

			const result = buildLanguageCoderConstraintsTest(
				taskText,
				mockGetProfile,
			);

			expect(result).toBeNull();
		});
	});

	describe('7. Mixed language task hitting cap of 10', () => {
		it('should cap at 10 constraints across multiple languages', () => {
			const taskText =
				'Update src/tools/lint.ts and src/main.py and src/cmd/main.go';

			const tsConstraints = ['TS1', 'TS2', 'TS3', 'TS4'];
			const pyConstraints = ['PY1', 'PY2', 'PY3', 'PY4'];
			const goConstraints = ['GO1', 'GO2', 'GO3', 'GO4'];

			const mockGetProfile = (path: string) => {
				if (path.endsWith('.ts')) {
					return {
						displayName: 'TypeScript / JavaScript',
						prompts: { coderConstraints: tsConstraints },
					};
				} else if (path.endsWith('.py')) {
					return {
						displayName: 'Python',
						prompts: { coderConstraints: pyConstraints },
					};
				} else if (path.endsWith('.go')) {
					return {
						displayName: 'Go',
						prompts: { coderConstraints: goConstraints },
					};
				}
				return null;
			};

			const result = buildLanguageCoderConstraintsTest(
				taskText,
				mockGetProfile,
			);

			expect(result).not.toBeNull();
			expect(result).toContain('TypeScript / JavaScript');

			// Count constraint lines
			const constraintLines = result!
				.split('\n')
				.filter((line) => line.startsWith('- '));
			expect(constraintLines.length).toBe(10);

			// Verify first profile's displayName is used
			expect(result).toContain(
				'LANGUAGE-SPECIFIC CONSTRAINTS — TypeScript / JavaScript',
			);

			// Verify constraints from all three languages are present
			// Order: TS first, then PY, then GO (based on file order in task)
			expect(result).toContain('- TS1');
			expect(result).toContain('- TS2');
			expect(result).toContain('- TS3');
			expect(result).toContain('- TS4');
			expect(result).toContain('- PY1');
			expect(result).toContain('- PY2');
			expect(result).toContain('- PY3');
			expect(result).toContain('- PY4');
			expect(result).toContain('- GO1');
			expect(result).toContain('- GO2');

			// GO3 and GO4 should NOT be present (cap at 10)
			expect(result).not.toContain('- GO3');
			expect(result).not.toContain('- GO4');
		});
	});

	describe('8. Task text is only whitespace', () => {
		it('should return null for whitespace-only text', () => {
			const taskText = '   \t\n\r   ';

			const mockGetProfile = () => ({
				displayName: 'TypeScript / JavaScript',
				prompts: { coderConstraints: ['Use TypeScript'] },
			});

			const result = buildLanguageCoderConstraintsTest(
				taskText,
				mockGetProfile,
			);

			expect(result).toBeNull();
		});
	});

	describe('9. Task text with unicode whitespace', () => {
		it('should handle unicode whitespace characters', () => {
			// U+2003 em space, U+00A0 non-breaking space, U+200B zero-width space
			const taskText = '\u2003\u00a0\u200b';

			const mockGetProfile = () => ({
				displayName: 'TypeScript / JavaScript',
				prompts: { coderConstraints: ['Use TypeScript'] },
			});

			// Zero-width space \u200B is NOT matched by \S (it's a whitespace character)
			// Non-breaking space \u00A0 is NOT matched by \S (it's a whitespace character)
			// Em space \u2003 is NOT matched by \S (it's a whitespace character)
			// So all are whitespace, no src/ path should be found

			const result = buildLanguageCoderConstraintsTest(
				taskText,
				mockGetProfile,
			);

			expect(result).toBeNull();
		});

		it('should handle unicode whitespace mixed with valid path', () => {
			// U+00A0 non-breaking space between path segments
			const taskText = 'Update\u00a0src/tools/lint.ts';

			const mockGetProfile = () => ({
				displayName: 'TypeScript / JavaScript',
				prompts: { coderConstraints: ['Use TypeScript'] },
			});

			// \S does not match non-breaking space, so "src/tools/lint.ts" should still match
			const result = buildLanguageCoderConstraintsTest(
				taskText,
				mockGetProfile,
			);

			expect(result).not.toBeNull();
			expect(result).toContain('Use TypeScript');
		});
	});

	describe('10. Constraint text that is an empty string', () => {
		it('should include empty string constraints without crashing', () => {
			const taskText = 'Update src/tools/lint.ts';

			const mockGetProfile = () => ({
				displayName: 'TypeScript / JavaScript',
				prompts: { coderConstraints: ['', 'real constraint', ''] },
			});

			const result = buildLanguageCoderConstraintsTest(
				taskText,
				mockGetProfile,
			);

			expect(result).not.toBeNull();

			// Count constraint lines
			const constraintLines = result!
				.split('\n')
				.filter((line) => line.startsWith('- '));
			expect(constraintLines.length).toBe(2);

			// Empty string creates a line with just "- "
			expect(result).toContain('- ');
			expect(result).toContain('- real constraint');

			// Verify deduplication: second empty string should not appear
			const emptyConstraintLines = result!
				.split('\n')
				.filter((line) => line === '- ');
			expect(emptyConstraintLines.length).toBe(1);
		});
	});

	describe('Additional edge cases', () => {
		it('should handle null task text', () => {
			const mockGetProfile = () => ({
				displayName: 'TypeScript / JavaScript',
				prompts: { coderConstraints: ['Use TypeScript'] },
			});

			const result = buildLanguageCoderConstraintsTest(null, mockGetProfile);

			expect(result).toBeNull();
		});

		it('should handle empty string task text', () => {
			const taskText = '';

			const mockGetProfile = () => ({
				displayName: 'TypeScript / JavaScript',
				prompts: { coderConstraints: ['Use TypeScript'] },
			});

			const result = buildLanguageCoderConstraintsTest(
				taskText,
				mockGetProfile,
			);

			expect(result).toBeNull();
		});

		it('should handle task text without src/ paths', () => {
			const taskText = 'Update lib/tools/lint.ts and test/main.ts';

			const mockGetProfile = () => ({
				displayName: 'TypeScript / JavaScript',
				prompts: { coderConstraints: ['Use TypeScript'] },
			});

			const result = buildLanguageCoderConstraintsTest(
				taskText,
				mockGetProfile,
			);

			expect(result).toBeNull();
		});

		it('should handle file paths with numbers in extension', () => {
			const taskText = 'Update src/file.ts123';

			const mockGetProfile = () => ({
				displayName: 'TypeScript / JavaScript',
				prompts: { coderConstraints: ['Use TypeScript'] },
			});

			const result = buildLanguageCoderConstraintsTest(
				taskText,
				mockGetProfile,
			);

			expect(result).not.toBeNull();
			expect(result).toContain('Use TypeScript');
		});

		it('should handle file paths with uppercase extensions', () => {
			const taskText = 'Update src/file.TS';

			const mockGetProfile = () => ({
				displayName: 'TypeScript / JavaScript',
				prompts: { coderConstraints: ['Use TypeScript'] },
			});

			const result = buildLanguageCoderConstraintsTest(
				taskText,
				mockGetProfile,
			);

			expect(result).not.toBeNull();
			expect(result).toContain('Use TypeScript');
		});

		it('should handle mixed case extensions', () => {
			const taskText = 'Update src/file.Ts';

			const mockGetProfile = () => ({
				displayName: 'TypeScript / JavaScript',
				prompts: { coderConstraints: ['Use TypeScript'] },
			});

			const result = buildLanguageCoderConstraintsTest(
				taskText,
				mockGetProfile,
			);

			expect(result).not.toBeNull();
			expect(result).toContain('Use TypeScript');
		});
	});
});
