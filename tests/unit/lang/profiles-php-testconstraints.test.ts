/**
 * testConstraints field and injection tests for PHP profile (Task 3.5)
 *
 * Validates:
 * - PHP profile has testConstraints defined with >= 3 entries
 * - Entries contain Laravel-specific guidance (RefreshDatabase, php artisan test)
 * - Other profiles (TypeScript) do NOT have testConstraints defined
 * - The buildLanguageTestConstraints function behavior (indirectly, via profile data)
 *
 * Note: buildLanguageTestConstraints is a private function in system-enhancer.ts.
 * We test it indirectly by verifying the profile data that feeds into it.
 */

import { describe, expect, it } from 'bun:test';
import { LANGUAGE_REGISTRY } from '../../../src/lang/profiles';

describe('PHP profile testConstraints', () => {
	const phpProfile = LANGUAGE_REGISTRY.getById('php');

	it('PHP profile is registered', () => {
		expect(phpProfile).toBeDefined();
		expect(phpProfile!.id).toBe('php');
	});

	it('prompts.testConstraints is defined (not undefined)', () => {
		expect(phpProfile!.prompts.testConstraints).toBeDefined();
	});

	it('testConstraints has at least 3 entries (acceptance criteria)', () => {
		expect(phpProfile!.prompts.testConstraints!.length).toBeGreaterThanOrEqual(
			3,
		);
	});

	it('contains Laravel guidance: RefreshDatabase trait', () => {
		const constraints = phpProfile!.prompts.testConstraints!;
		const hasRefreshDatabase = constraints.some(
			(c) =>
				c.includes('RefreshDatabase') || c.includes('DatabaseTransactions'),
		);
		expect(hasRefreshDatabase).toBe(true);
	});

	it('contains Laravel guidance: php artisan test command', () => {
		const constraints = phpProfile!.prompts.testConstraints!;
		const hasArtisanTest = constraints.some((c) =>
			c.includes('php artisan test'),
		);
		expect(hasArtisanTest).toBe(true);
	});

	it('contains guidance about Pest and PHPUnit coexistence', () => {
		const constraints = phpProfile!.prompts.testConstraints!;
		const hasPestNote = constraints.some(
			(c) => c.includes('Pest') && c.includes('PHPUnit'),
		);
		expect(hasPestNote).toBe(true);
	});

	it('contains .env.testing guidance for database tests', () => {
		const constraints = phpProfile!.prompts.testConstraints!;
		const hasEnvTesting = constraints.some((c) => c.includes('.env.testing'));
		expect(hasEnvTesting).toBe(true);
	});

	it('all testConstraints are non-empty strings', () => {
		const constraints = phpProfile!.prompts.testConstraints!;
		for (const c of constraints) {
			expect(typeof c).toBe('string');
			expect(c.trim().length).toBeGreaterThan(0);
		}
	});
});

describe('Other profiles do NOT have testConstraints', () => {
	it('TypeScript profile does not have testConstraints defined', () => {
		const tsProfile = LANGUAGE_REGISTRY.getById('typescript');
		expect(tsProfile).toBeDefined();
		expect(tsProfile!.prompts.testConstraints).toBeUndefined();
	});

	it('Python profile does not have testConstraints defined', () => {
		const pyProfile = LANGUAGE_REGISTRY.getById('python');
		expect(pyProfile).toBeDefined();
		expect(pyProfile!.prompts.testConstraints).toBeUndefined();
	});

	it('Rust profile does not have testConstraints defined', () => {
		const rustProfile = LANGUAGE_REGISTRY.getById('rust');
		expect(rustProfile).toBeDefined();
		expect(rustProfile!.prompts.testConstraints).toBeUndefined();
	});

	it('Go profile does not have testConstraints defined', () => {
		const goProfile = LANGUAGE_REGISTRY.getById('go');
		expect(goProfile).toBeDefined();
		expect(goProfile!.prompts.testConstraints).toBeUndefined();
	});
});

describe('buildLanguageTestConstraints behavior (indirect)', () => {
	/**
	 * buildLanguageTestConstraints extracts file paths from task text and
	 * collects testConstraints from matching language profiles.
	 *
	 * Since we cannot call the private function directly, we verify the
	 * data contract it depends on: profiles with src/*.ts paths should
	 * yield TypeScript (no testConstraints) and profiles with src/*.php
	 * should yield PHP (with testConstraints).
	 */

	it('PHP profile would contribute testConstraints for src/*.php paths', () => {
		const phpProfile = LANGUAGE_REGISTRY.getById('php');
		// The function builds constraints from profile.prompts.testConstraints
		// PHP has 5 entries, TypeScript has none
		expect(phpProfile!.prompts.testConstraints).toBeDefined();
		expect(phpProfile!.prompts.testConstraints!.length).toBeGreaterThanOrEqual(
			5,
		);
	});

	it('TypeScript profile would NOT contribute testConstraints for src/*.ts paths', () => {
		const tsProfile = LANGUAGE_REGISTRY.getById('typescript');
		expect(tsProfile!.prompts.testConstraints).toBeUndefined();
	});

	it('getProfileForFile("src/foo.php") returns PHP profile with testConstraints', () => {
		// This simulates what buildLanguageTestConstraints does internally
		const profile = LANGUAGE_REGISTRY.getByExtension('.php');
		expect(profile).toBeDefined();
		expect(profile!.id).toBe('php');
		expect(profile!.prompts.testConstraints).toBeDefined();
		expect(profile!.prompts.testConstraints!.length).toBeGreaterThanOrEqual(3);
	});

	it('getProfileForFile("src/foo.ts") returns TypeScript profile without testConstraints', () => {
		const profile = LANGUAGE_REGISTRY.getByExtension('.ts');
		expect(profile).toBeDefined();
		expect(profile!.id).toBe('typescript');
		expect(profile!.prompts.testConstraints).toBeUndefined();
	});
});

describe('testConstraints injection header format', () => {
	/**
	 * buildLanguageTestConstraints returns a formatted block:
	 * `[LANGUAGE-SPECIFIC TEST CONSTRAINTS — ${languageLabel}]\n${constraints...}`
	 *
	 * We verify the profile data would produce valid output when formatted.
	 */

	it('PHP testConstraints format correctly when joined', () => {
		const phpProfile = LANGUAGE_REGISTRY.getById('php');
		const constraints = phpProfile!.prompts.testConstraints!;

		// Simulate what buildLanguageTestConstraints does:
		// `return \`[LANGUAGE-SPECIFIC TEST CONSTRAINTS — ${languageLabel}]\n${allConstraints.map((c) => `- ${c}`).join('\n')}\`;`
		const languageLabel = phpProfile.displayName;
		const formatted = `[LANGUAGE-SPECIFIC TEST CONSTRAINTS — ${languageLabel}]\n${constraints.map((c) => `- ${c}`).join('\n')}`;

		expect(formatted).toContain('[LANGUAGE-SPECIFIC TEST CONSTRAINTS');
		expect(formatted).toContain('PHP');
		expect(formatted).toContain('- Prefer feature tests');
		expect(formatted).toContain('- Use unit tests');
		expect(formatted).toContain('- Pest');
	});

	it('TypeScript testConstraints would produce null from buildLanguageTestConstraints', () => {
		// TypeScript has no testConstraints, so buildLanguageTestConstraints
		// would return null (allConstraints.length === 0 check)
		const tsProfile = LANGUAGE_REGISTRY.getById('typescript');
		expect(tsProfile!.prompts.testConstraints).toBeUndefined();

		// Simulating: if testConstraints is undefined/empty, function returns null
		const testConstraints = tsProfile!.prompts.testConstraints ?? [];
		expect(testConstraints.length).toBe(0); // Would cause null return
	});
});
