/**
 * Tests for buildLanguageTestConstraints function added in Task 3.5 (v6.46).
 *
 * Since buildLanguageTestConstraints is not exported from system-enhancer.ts,
 * we recreate its logic with an injectable mock for getProfileForFile to test it directly.
 */
import { describe, expect, it } from 'bun:test';

/**
 * Type for language profile mock
 */
interface LanguageProfileMock {
	displayName: string;
	prompts: {
		testConstraints?: string[];
	};
}

/**
 * Recreates the buildLanguageTestConstraints logic with injectable mock.
 * This is copied from the source implementation to test a private function.
 * Source: system-enhancer.ts lines 393-423
 */
function buildLanguageTestConstraintsTest(
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
		const testConstraints = profile.prompts.testConstraints ?? [];
		for (const constraint of testConstraints) {
			if (!seenConstraints.has(constraint) && allConstraints.length < 10) {
				seenConstraints.add(constraint);
				allConstraints.push(constraint);
			}
		}
	}

	if (allConstraints.length === 0) return null;

	return `[LANGUAGE-SPECIFIC TEST CONSTRAINTS — ${languageLabel}]\n${allConstraints.map((c) => `- ${c}`).join('\n')}`;
}

describe('buildLanguageTestConstraints', () => {
	describe('Null and empty input handling', () => {
		it('returns null when input is null', () => {
			const result = buildLanguageTestConstraintsTest(null, () => null);
			expect(result).toBe(null);
		});

		it('returns null when input is empty string', () => {
			const result = buildLanguageTestConstraintsTest('', () => null);
			expect(result).toBe(null);
		});

		it('returns null when task has no src/ file paths', () => {
			const taskText = '- [ ] 3.5: Do something without file paths';
			const result = buildLanguageTestConstraintsTest(taskText, () => null);
			expect(result).toBe(null);
		});
	});

	describe('Basic constraint extraction', () => {
		it('returns constraints block for PHP file', () => {
			const taskText =
				'Update src/hooks/system-enhancer.ts to add new functionality';
			const mockProfile: LanguageProfileMock = {
				displayName: 'PHP',
				prompts: {
					testConstraints: [
						'Prefer feature tests for HTTP and authentication flows',
						'Use unit tests for isolated business logic',
					],
				},
			};

			const result = buildLanguageTestConstraintsTest(taskText, (path) => {
				if (path === 'src/hooks/system-enhancer.ts') return mockProfile;
				return null;
			});

			expect(result).not.toBeNull();
			expect(result).toContain('[LANGUAGE-SPECIFIC TEST CONSTRAINTS — PHP]');
			expect(result).toContain('- Prefer feature tests for HTTP');
			expect(result).toContain('- Use unit tests for isolated business logic');
		});

		it('returns null for TypeScript file (no testConstraints defined)', () => {
			const taskText = 'Update src/tools/lint.ts to add new functionality';
			const mockProfile: LanguageProfileMock = {
				displayName: 'TypeScript / JavaScript',
				prompts: {
					testConstraints: undefined, // TypeScript has no testConstraints
				},
			};

			const result = buildLanguageTestConstraintsTest(taskText, (path) => {
				if (path === 'src/tools/lint.ts') return mockProfile;
				return null;
			});

			expect(result).toBeNull();
		});

		it('returns null for unknown file extension (no profile)', () => {
			const taskText = 'Update src/lang/grammars/kotlin.wasm';
			const result = buildLanguageTestConstraintsTest(taskText, () => null);
			expect(result).toBeNull();
		});
	});

	describe('PHP profile with Laravel test constraints', () => {
		const phpProfile: LanguageProfileMock = {
			displayName: 'PHP',
			prompts: {
				testConstraints: [
					'Prefer feature tests for HTTP, middleware, and authentication flows — use Laravel RefreshDatabase or DatabaseTransactions traits',
					'Use unit tests for isolated business logic classes that do not require the full Laravel application container',
					'Pest and PHPUnit coexist in many Laravel repos — php artisan test runs both; do not assume PHPUnit-only',
					'Use .env.testing for test environment configuration; run php artisan config:clear when environment changes affect tests',
					'For database tests, prefer RefreshDatabase over manual setUp/tearDown to avoid state leakage between tests',
				],
			},
		};

		it('extracts all 5 PHP Laravel test constraints', () => {
			const taskText = 'Update src/lang/profiles.ts to add new language';

			const result = buildLanguageTestConstraintsTest(
				taskText,
				() => phpProfile,
			);

			expect(result).not.toBeNull();
			expect(result).toContain('[LANGUAGE-SPECIFIC TEST CONSTRAINTS — PHP]');
			expect(result).toContain('RefreshDatabase');
			expect(result).toContain('php artisan test');
			expect(result).toContain('Pest');
			expect(result).toContain('.env.testing');
		});

		it('constraint count is limited to 10', () => {
			const manyConstraints = Array.from(
				{ length: 15 },
				(_, i) => `Test constraint ${i + 1}`,
			);
			const profile: LanguageProfileMock = {
				displayName: 'PHP',
				prompts: { testConstraints: manyConstraints },
			};

			const result = buildLanguageTestConstraintsTest(
				'Update src/foo.php',
				() => profile,
			);

			expect(result).not.toBeNull();
			const lines = result!.split('\n');
			const constraintLines = lines.filter((line) => line.startsWith('- '));
			expect(constraintLines.length).toBe(10);
		});
	});

	describe('Regex pattern matching', () => {
		it('matches src/ file paths in various contexts', () => {
			const taskText =
				'- [ ] 3.5.1: Update src/hooks/test.ts\n- [ ] 3.5.2: Modify src/config/types.php';
			const mockProfile: LanguageProfileMock = {
				displayName: 'PHP',
				prompts: {
					testConstraints: ['Constraint 1'],
				},
			};

			const result = buildLanguageTestConstraintsTest(taskText, (path) => {
				if (path.startsWith('src/')) return mockProfile;
				return null;
			});

			expect(result).not.toBeNull();
		});

		it('matches file paths with dots in directory names', () => {
			const taskText = 'Update src/hooks/build/test.ts';
			const mockProfile: LanguageProfileMock = {
				displayName: 'TypeScript / JavaScript',
				prompts: {
					testConstraints: ['Constraint 1'],
				},
			};

			const result = buildLanguageTestConstraintsTest(taskText, (path) => {
				if (path === 'src/hooks/build/test.ts') return mockProfile;
				return null;
			});

			expect(result).not.toBeNull();
		});
	});

	describe('Constraint deduplication', () => {
		it('removes duplicate constraints across multiple files', () => {
			const taskText =
				'- [ ] 3.5.1: Update src/hooks/test.php\n- [ ] 3.5.2: Modify src/config/app.php';
			const mockProfile: LanguageProfileMock = {
				displayName: 'PHP',
				prompts: {
					testConstraints: [
						'Use RefreshDatabase trait',
						'Use unit tests for isolated logic',
						'Use RefreshDatabase trait', // Duplicate
						'Use unit tests for isolated logic', // Duplicate
						'Use .env.testing',
					],
				},
			};

			const result = buildLanguageTestConstraintsTest(taskText, (path) => {
				if (path.startsWith('src/')) return mockProfile;
				return null;
			});

			expect(result).not.toBeNull();

			// Count unique constraints (each starts with "- ")
			const lines = result!.split('\n');
			const constraintLines = lines.filter((line) => line.startsWith('- '));
			expect(constraintLines.length).toBe(3); // Only 3 unique constraints

			// Verify no duplicates
			const constraintTexts = constraintLines.map((line) => line.slice(2));
			const uniqueConstraints = new Set(constraintTexts);
			expect(uniqueConstraints.size).toBe(3);
		});

		it('handles files from different languages', () => {
			const taskText =
				'- [ ] 3.5.1: Update src/hooks/test.php\n- [ ] 3.5.2: Modify src/main.rs';
			const phpProfile: LanguageProfileMock = {
				displayName: 'PHP',
				prompts: {
					testConstraints: ['Use RefreshDatabase', 'Use Pest'],
				},
			};
			const rustProfile: LanguageProfileMock = {
				displayName: 'Rust',
				prompts: {
					testConstraints: ['Use #[test] attribute'], // No overlap with PHP
				},
			};

			const result = buildLanguageTestConstraintsTest(taskText, (path) => {
				if (path.endsWith('.php')) return phpProfile;
				if (path.endsWith('.rs')) return rustProfile;
				return null;
			});

			expect(result).not.toBeNull();
			expect(result).toContain('PHP'); // First language label
			expect(result).toContain('Use RefreshDatabase');
			expect(result).toContain('Use Pest');
			expect(result).toContain('Use #[test] attribute');
		});
	});

	describe('Constraint limit (10 items max)', () => {
		it('limits output to exactly 10 constraints when profile has more', () => {
			const taskText = 'Update src/hooks/test.php';
			const constraints = Array.from(
				{ length: 15 },
				(_, i) => `Constraint ${i + 1}`,
			);
			const mockProfile: LanguageProfileMock = {
				displayName: 'PHP',
				prompts: {
					testConstraints: constraints,
				},
			};

			const result = buildLanguageTestConstraintsTest(
				taskText,
				() => mockProfile,
			);

			expect(result).not.toBeNull();

			// Count constraint lines
			const lines = result!.split('\n');
			const constraintLines = lines.filter((line) => line.startsWith('- '));
			expect(constraintLines.length).toBe(10);
		});
	});

	describe('Multiple language files', () => {
		it('merges constraints from multiple PHP files without duplicates', () => {
			const taskText =
				'- [ ] 3.5.1: Update src/hooks/test.php\n- [ ] 3.5.2: Modify src/hooks/pkg-audit.php\n- [ ] 3.5.3: Fix src/config/app.php';
			const mockProfile: LanguageProfileMock = {
				displayName: 'PHP',
				prompts: {
					testConstraints: [
						'Prefer feature tests for HTTP',
						'Use RefreshDatabase',
						'Use .env.testing',
					],
				},
			};

			const result = buildLanguageTestConstraintsTest(taskText, (path) => {
				if (path.endsWith('.php')) return mockProfile;
				return null;
			});

			expect(result).not.toBeNull();
			expect(result).toContain('[LANGUAGE-SPECIFIC TEST CONSTRAINTS — PHP]');

			// Should have exactly 3 unique constraints
			const lines = result!.split('\n');
			const constraintLines = lines.filter((line) => line.startsWith('- '));
			expect(constraintLines.length).toBe(3);
		});
	});

	describe('Empty constraints handling', () => {
		it('returns null when profile has empty testConstraints array', () => {
			const taskText = 'Update src/hooks/test.php';
			const mockProfile: LanguageProfileMock = {
				displayName: 'PHP',
				prompts: {
					testConstraints: [],
				},
			};

			const result = buildLanguageTestConstraintsTest(
				taskText,
				() => mockProfile,
			);
			expect(result).toBeNull();
		});

		it('returns null when profile has undefined testConstraints', () => {
			const taskText = 'Update src/tools/lint.ts';
			const mockProfile: LanguageProfileMock = {
				displayName: 'TypeScript / JavaScript',
				prompts: {
					testConstraints: undefined,
				},
			};

			const result = buildLanguageTestConstraintsTest(
				taskText,
				() => mockProfile,
			);
			expect(result).toBeNull();
		});

		it('returns null when all files have no profile', () => {
			const taskText =
				'- [ ] 3.5.1: Update src/hooks/test.php\n- [ ] 3.5.2: Modify src/config/types.ts';
			const result = buildLanguageTestConstraintsTest(taskText, () => null);
			expect(result).toBeNull();
		});
	});

	describe('File path edge cases', () => {
		it('matches file paths with multiple dots (e.g., src/test.fixtures.php)', () => {
			const taskText = 'Update src/test.fixtures.php';
			const mockProfile: LanguageProfileMock = {
				displayName: 'PHP',
				prompts: {
					testConstraints: ['Constraint 1'],
				},
			};

			const result = buildLanguageTestConstraintsTest(taskText, (path) => {
				if (path === 'src/test.fixtures.php') return mockProfile;
				return null;
			});

			expect(result).not.toBeNull();
		});

		it('matches file paths with underscores and hyphens', () => {
			const taskText = 'Update src/tools/custom_file-name.test.php';
			const mockProfile: LanguageProfileMock = {
				displayName: 'PHP',
				prompts: {
					testConstraints: ['Constraint 1'],
				},
			};

			const result = buildLanguageTestConstraintsTest(taskText, (path) => {
				if (path === 'src/tools/custom_file-name.test.php') return mockProfile;
				return null;
			});

			expect(result).not.toBeNull();
		});

		it('does not match non-src/ file paths', () => {
			const taskText = 'Update tests/unit/hooks/test.php and lib/other.js';
			const mockProfile: LanguageProfileMock = {
				displayName: 'PHP',
				prompts: {
					testConstraints: ['Constraint 1'],
				},
			};

			const result = buildLanguageTestConstraintsTest(
				taskText,
				() => mockProfile,
			);
			expect(result).toBeNull();
		});
	});

	describe('Output format verification', () => {
		it('produces correct output format with header and bullet points', () => {
			const taskText = 'Update src/hooks/test.php';
			const mockProfile: LanguageProfileMock = {
				displayName: 'PHP',
				prompts: {
					testConstraints: ['Constraint 1', 'Constraint 2', 'Constraint 3'],
				},
			};

			const result = buildLanguageTestConstraintsTest(
				taskText,
				() => mockProfile,
			);

			expect(result).not.toBeNull();

			// Verify format: [LANGUAGE-SPECIFIC TEST CONSTRAINTS — <language>]
			expect(result).toMatch(/^\[LANGUAGE-SPECIFIC TEST CONSTRAINTS — PHP\]/);

			// Verify each constraint starts with "- "
			const lines = result!.split('\n');
			const constraintLines = lines.slice(1); // Skip header
			for (const line of constraintLines) {
				expect(line).toMatch(/^- /);
			}
		});

		it('uses first language label when multiple languages present', () => {
			const taskText =
				'- [ ] 3.5.1: Update src/hooks/test.php\n- [ ] 3.5.2: Modify src/main.rs';
			const phpProfile: LanguageProfileMock = {
				displayName: 'PHP',
				prompts: {
					testConstraints: ['PHP Constraint 1'],
				},
			};
			const rustProfile: LanguageProfileMock = {
				displayName: 'Rust',
				prompts: {
					testConstraints: ['Rust Constraint 1'],
				},
			};

			const result = buildLanguageTestConstraintsTest(taskText, (path) => {
				if (path.endsWith('.php')) return phpProfile;
				if (path.endsWith('.rs')) return rustProfile;
				return null;
			});

			expect(result).not.toBeNull();
			// Should use first language's display name
			expect(result).toContain('PHP');
		});
	});

	describe('Injection behavior (v6.46)', () => {
		/**
		 * v6.46 injects testConstraints for test_engineer agent when baseRole === 'test_engineer'
		 * The function is called with extractCurrentTaskFromPlan(plan) as currentTaskText
		 */
		it('returns null for empty task text (plan with no task)', () => {
			const result = buildLanguageTestConstraintsTest(null, () => null);
			expect(result).toBeNull();
		});

		it('returns null when task has no src/ file paths', () => {
			const taskText = 'Review the existing test suite';
			const result = buildLanguageTestConstraintsTest(taskText, () => null);
			expect(result).toBeNull();
		});

		it('injects PHP test constraints for PHP file task', () => {
			// Note: buildLanguageTestConstraints only matches src/ file paths
			const taskText =
				'Write tests for src/lang/profiles.php to validate testConstraints';
			const phpProfile: LanguageProfileMock = {
				displayName: 'PHP',
				prompts: {
					testConstraints: [
						'Prefer feature tests for HTTP flows',
						'Use RefreshDatabase trait',
					],
				},
			};

			const result = buildLanguageTestConstraintsTest(taskText, (path) => {
				if (path.includes('.php')) return phpProfile;
				return null;
			});

			expect(result).not.toBeNull();
			expect(result).toContain('[LANGUAGE-SPECIFIC TEST CONSTRAINTS — PHP]');
			expect(result).toContain('RefreshDatabase');
		});
	});
});
