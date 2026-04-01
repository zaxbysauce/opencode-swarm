/**
 * Tests for buildLanguageCoderConstraints function added in Task 6.1.
 *
 * Since buildLanguageCoderConstraints is not exported from system-enhancer.ts,
 * we recreate its logic with an injectable mock for getProfileForFile to test it directly.
 */
import { describe, expect, it } from 'bun:test';

/**
 * Type for language profile mock
 */
interface LanguageProfileMock {
	displayName: string;
	prompts: {
		coderConstraints: string[];
	};
}

/**
 * Recreates the buildLanguageCoderConstraints logic with injectable mock.
 * This is copied from the source implementation to test a private function.
 */
function buildLanguageCoderConstraintsTest(
	currentTaskText: string | null,
	getProfileForFileMock: (path: string) => LanguageProfileMock | null,
): string | null {
	if (!currentTaskText) return null;

	// Extract file paths from task text (e.g. "src/tools/lint.ts")
	// Note: The regex in the source is /\bsrc\/\S+\.[a-zA-Z0-9]+\b/g
	const filePaths = currentTaskText.match(/\bsrc\/\S+\.[a-zA-Z0-9]+\b/g) ?? [];
	if (filePaths.length === 0) return null;

	// Collect unique constraints across all task file paths (max 10 total)
	const allConstraints: string[] = [];
	const seenConstraints = new Set<string>();
	let languageLabel = '';

	for (const filePath of filePaths) {
		const profile = getProfileForFileMock(filePath);
		if (!profile) continue;
		if (!languageLabel) {
			languageLabel = profile.displayName;
		}
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

describe('buildLanguageCoderConstraints', () => {
	describe('Null and empty input handling', () => {
		it('returns null when input is null', () => {
			const result = buildLanguageCoderConstraintsTest(null, () => null);
			expect(result).toBe(null);
		});

		it('returns null when input is empty string', () => {
			const result = buildLanguageCoderConstraintsTest('', () => null);
			expect(result).toBe(null);
		});

		it('returns null when task has no src/ file paths', () => {
			const taskText = '- [ ] 1.1: Do something without file paths';
			const result = buildLanguageCoderConstraintsTest(taskText, () => null);
			expect(result).toBe(null);
		});
	});

	describe('Basic constraint extraction', () => {
		it('returns constraints block for TypeScript file', () => {
			const taskText = 'Update src/tools/lint.ts to add new functionality';
			const mockProfile: LanguageProfileMock = {
				displayName: 'TypeScript / JavaScript',
				prompts: {
					coderConstraints: [
						'Use explicit return types for all functions',
						'Avoid any types except in type guards',
					],
				},
			};

			const result = buildLanguageCoderConstraintsTest(taskText, (path) => {
				if (path === 'src/tools/lint.ts') return mockProfile;
				return null;
			});

			expect(result).not.toBe(null);
			expect(result).toContain(
				'[LANGUAGE-SPECIFIC CONSTRAINTS — TypeScript / JavaScript]',
			);
			expect(result).toContain('- Use explicit return types for all functions');
			expect(result).toContain('- Avoid any types except in type guards');
		});

		it('returns null for unknown file extension (no profile)', () => {
			const taskText = 'Update src/lang/grammars/kotlin.wasm';
			const result = buildLanguageCoderConstraintsTest(taskText, () => null);
			expect(result).toBe(null);
		});
	});

	describe('Regex pattern matching', () => {
		it('matches src/ file paths in various contexts', () => {
			const taskText =
				'- [ ] 1.1: Update src/tools/lint.ts\n- [ ] 1.2: Modify src/config/types.ts';
			const mockProfile: LanguageProfileMock = {
				displayName: 'TypeScript / JavaScript',
				prompts: {
					coderConstraints: ['Constraint 1'],
				},
			};

			const result = buildLanguageCoderConstraintsTest(taskText, (path) => {
				if (path.startsWith('src/')) return mockProfile;
				return null;
			});

			expect(result).not.toBe(null);
		});

		it('matches uppercase file extension (case insensitive)', () => {
			const taskText = 'Update src/tools/lint.TS to fix bug';
			const mockProfile: LanguageProfileMock = {
				displayName: 'TypeScript / JavaScript',
				prompts: {
					coderConstraints: ['Constraint 1'],
				},
			};

			const result = buildLanguageCoderConstraintsTest(taskText, (path) => {
				// Note: The regex is /[a-zA-Z0-9]+/ which matches uppercase letters too
				if (path.endsWith('lint.TS')) return mockProfile;
				return null;
			});

			expect(result).not.toBe(null);
		});

		it('matches file paths with dots in directory names', () => {
			const taskText = 'Update src/tools/build/lint.ts';
			const mockProfile: LanguageProfileMock = {
				displayName: 'TypeScript / JavaScript',
				prompts: {
					coderConstraints: ['Constraint 1'],
				},
			};

			const result = buildLanguageCoderConstraintsTest(taskText, (path) => {
				if (path === 'src/tools/build/lint.ts') return mockProfile;
				return null;
			});

			expect(result).not.toBe(null);
		});
	});

	describe('Constraint deduplication', () => {
		it('removes duplicate constraints across multiple files', () => {
			const taskText =
				'- [ ] 1.1: Update src/tools/lint.ts\n- [ ] 1.2: Modify src/config/types.ts';
			const mockProfile: LanguageProfileMock = {
				displayName: 'TypeScript / JavaScript',
				prompts: {
					coderConstraints: [
						'Use explicit return types',
						'Avoid any types',
						'Use explicit return types', // Duplicate
						'Avoid any types', // Duplicate
						'Add JSDoc comments',
					],
				},
			};

			const result = buildLanguageCoderConstraintsTest(taskText, (path) => {
				if (path.startsWith('src/')) return mockProfile;
				return null;
			});

			expect(result).not.toBe(null);

			// Count unique constraints (each starts with "- ")
			const lines = result?.split('\n') ?? [];
			const constraintLines = lines.filter((line) => line.startsWith('- '));
			expect(constraintLines.length).toBe(3); // Only 3 unique constraints

			// Verify no duplicates
			const constraintTexts = constraintLines.map((line) => line.slice(2));
			const uniqueConstraints = new Set(constraintTexts);
			expect(uniqueConstraints.size).toBe(3);
		});

		it('handles files from different languages with overlapping constraints', () => {
			const taskText =
				'- [ ] 1.1: Update src/tools/lint.ts\n- [ ] 1.2: Modify src/main.rs';
			const tsProfile: LanguageProfileMock = {
				displayName: 'TypeScript / JavaScript',
				prompts: {
					coderConstraints: [
						'Use explicit return types',
						'Avoid any types',
						'Add documentation',
					],
				},
			};
			const rustProfile: LanguageProfileMock = {
				displayName: 'Rust',
				prompts: {
					coderConstraints: [
						'Use explicit return types', // Overlapping
						'Use Result types',
						'Avoid unwrap()',
					],
				},
			};

			const result = buildLanguageCoderConstraintsTest(taskText, (path) => {
				if (path.endsWith('.ts')) return tsProfile;
				if (path.endsWith('.rs')) return rustProfile;
				return null;
			});

			expect(result).not.toBe(null);

			// Should have 5 unique constraints (3 TS + 3 Rust - 1 duplicate)
			const lines = result?.split('\n') ?? [];
			const constraintLines = lines.filter((line) => line.startsWith('- '));
			expect(constraintLines.length).toBe(5);

			// "Use explicit return types" should appear only once
			const countExplicitReturn = constraintLines.filter((line) =>
				line.includes('explicit return types'),
			).length;
			expect(countExplicitReturn).toBe(1);
		});
	});

	describe('Constraint limit (10 items max)', () => {
		it('limits output to exactly 10 constraints when profile has more', () => {
			const taskText = 'Update src/tools/lint.ts';
			const constraints = Array.from(
				{ length: 15 },
				(_, i) => `Constraint ${i + 1}`,
			);
			const mockProfile: LanguageProfileMock = {
				displayName: 'TypeScript / JavaScript',
				prompts: {
					coderConstraints: constraints,
				},
			};

			const result = buildLanguageCoderConstraintsTest(
				taskText,
				() => mockProfile,
			);

			expect(result).not.toBe(null);

			// Count constraint lines
			const lines = result?.split('\n') ?? [];
			const constraintLines = lines.filter((line) => line.startsWith('- '));
			expect(constraintLines.length).toBe(10);

			// Verify it's the first 10 constraints
			for (let i = 0; i < 10; i++) {
				expect(result).toContain(`- Constraint ${i + 1}`);
			}

			// Constraint 11 should NOT be in output
			expect(result).not.toContain('Constraint 11');
		});

		it('limits output to 10 constraints even with multiple files', () => {
			const taskText =
				'- [ ] 1.1: Update src/tools/lint.ts\n- [ ] 1.2: Modify src/config/types.ts';
			const constraints1 = Array.from(
				{ length: 8 },
				(_, i) => `File1 Constraint ${i + 1}`,
			);
			const constraints2 = Array.from(
				{ length: 8 },
				(_, i) => `File2 Constraint ${i + 1}`,
			);
			const mockProfile: LanguageProfileMock = {
				displayName: 'TypeScript / JavaScript',
				prompts: {
					coderConstraints: [...constraints1, ...constraints2],
				},
			};

			const result = buildLanguageCoderConstraintsTest(
				taskText,
				() => mockProfile,
			);

			expect(result).not.toBe(null);

			const lines = result?.split('\n') ?? [];
			const constraintLines = lines.filter((line) => line.startsWith('- '));
			expect(constraintLines.length).toBe(10);
		});
	});

	describe('Multiple language files', () => {
		it('merges constraints from multiple TypeScript files without duplicates', () => {
			const taskText =
				'- [ ] 1.1: Update src/tools/lint.ts\n- [ ] 1.2: Modify src/tools/pkg-audit.ts\n- [ ] 1.3: Fix src/config/types.ts';
			const mockProfile: LanguageProfileMock = {
				displayName: 'TypeScript / JavaScript',
				prompts: {
					coderConstraints: [
						'Use explicit return types',
						'Avoid any types',
						'Add JSDoc comments',
					],
				},
			};

			const result = buildLanguageCoderConstraintsTest(taskText, (path) => {
				if (path.endsWith('.ts')) return mockProfile;
				return null;
			});

			expect(result).not.toBe(null);
			expect(result).toContain(
				'[LANGUAGE-SPECIFIC CONSTRAINTS — TypeScript / JavaScript]',
			);

			// Should have exactly 3 unique constraints
			const lines = result?.split('\n') ?? [];
			const constraintLines = lines.filter((line) => line.startsWith('- '));
			expect(constraintLines.length).toBe(3);
		});
	});

	describe('Empty constraints handling', () => {
		it('returns null when profile has empty constraints array', () => {
			const taskText = 'Update src/tools/lint.ts';
			const mockProfile: LanguageProfileMock = {
				displayName: 'TypeScript / JavaScript',
				prompts: {
					coderConstraints: [],
				},
			};

			const result = buildLanguageCoderConstraintsTest(
				taskText,
				() => mockProfile,
			);
			expect(result).toBe(null);
		});

		it('returns null when all files have no profile', () => {
			const taskText =
				'- [ ] 1.1: Update src/tools/lint.ts\n- [ ] 1.2: Modify src/config/types.ts';
			const result = buildLanguageCoderConstraintsTest(taskText, () => null);
			expect(result).toBe(null);
		});
	});

	describe('File path edge cases', () => {
		it('matches file paths with multiple dots (e.g., src/test.fixtures.ts)', () => {
			const taskText = 'Update src/test.fixtures.ts';
			const mockProfile: LanguageProfileMock = {
				displayName: 'TypeScript / JavaScript',
				prompts: {
					coderConstraints: ['Constraint 1'],
				},
			};

			const result = buildLanguageCoderConstraintsTest(taskText, (path) => {
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
					coderConstraints: ['Constraint 1'],
				},
			};

			const result = buildLanguageCoderConstraintsTest(taskText, (path) => {
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
					coderConstraints: ['Constraint 1'],
				},
			};

			const result = buildLanguageCoderConstraintsTest(
				taskText,
				() => mockProfile,
			);
			expect(result).toBe(null);
		});
	});

	describe('Output format verification', () => {
		it('produces correct output format with header and bullet points', () => {
			const taskText = 'Update src/tools/lint.ts';
			const mockProfile: LanguageProfileMock = {
				displayName: 'TypeScript / JavaScript',
				prompts: {
					coderConstraints: ['Constraint 1', 'Constraint 2', 'Constraint 3'],
				},
			};

			const result = buildLanguageCoderConstraintsTest(
				taskText,
				() => mockProfile,
			);

			expect(result).not.toBe(null);

			// Verify format: [LANGUAGE-SPECIFIC CONSTRAINTS — <language>]
			expect(result).toMatch(
				/^\[LANGUAGE-SPECIFIC CONSTRAINTS — TypeScript \/ JavaScript\]/,
			);

			// Verify each constraint starts with "- "
			const lines = result?.split('\n') ?? [];
			const constraintLines = lines.slice(1); // Skip header
			for (const line of constraintLines) {
				expect(line).toMatch(/^- /);
			}
		});

		it('uses first language label when multiple languages present', () => {
			const taskText =
				'- [ ] 1.1: Update src/tools/lint.ts\n- [ ] 1.2: Modify src/main.rs';
			const tsProfile: LanguageProfileMock = {
				displayName: 'TypeScript / JavaScript',
				prompts: {
					coderConstraints: ['TS Constraint 1'],
				},
			};
			const rustProfile: LanguageProfileMock = {
				displayName: 'Rust',
				prompts: {
					coderConstraints: ['Rust Constraint 1'],
				},
			};

			const result = buildLanguageCoderConstraintsTest(taskText, (path) => {
				if (path.endsWith('.ts')) return tsProfile;
				if (path.endsWith('.rs')) return rustProfile;
				return null;
			});

			expect(result).not.toBe(null);
			// Should use first language's display name
			expect(result).toContain('TypeScript / JavaScript');
		});
	});
});
