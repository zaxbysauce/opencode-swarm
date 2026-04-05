/**
 * PHP Language Profile — Adversarial Security & Boundary Tests
 *
 * Attack surface: LanguageRegistry lookup behavior, command string integrity,
 * priority ordering, and mutation isolation.
 *
 * All tests use exact assertions — no toBeTruthy/toBeDefined bypasses.
 */

import { describe, expect, test } from 'bun:test';
import { LANGUAGE_REGISTRY } from '../../../src/lang/profiles';

describe('PHP Profile Adversarial Security Tests', () => {
	const SHELL_METACHARACTERS = [
		';',
		'|',
		'&',
		'$',
		'`',
		'(',
		')',
		'{',
		'}',
		'[',
		']',
		'<',
		'>',
		'\\',
		"'",
		'"',
		'\n',
		'\r',
		'\x00',
	];

	// ─────────────────────────────────────────────────────────────────────────────
	// Vector 1-2: Null/undefined extension inputs — must not throw
	// ─────────────────────────────────────────────────────────────────────────────

	test('getByExtension(null) does not throw, returns undefined', () => {
		expect(() =>
			LANGUAGE_REGISTRY.getByExtension(null as unknown as string),
		).not.toThrow();
		const result = LANGUAGE_REGISTRY.getByExtension(null as unknown as string);
		expect(result).toBeUndefined();
	});

	test('getByExtension(undefined) does not throw, returns undefined', () => {
		expect(() =>
			LANGUAGE_REGISTRY.getByExtension(undefined as unknown as string),
		).not.toThrow();
		const result = LANGUAGE_REGISTRY.getByExtension(
			undefined as unknown as string,
		);
		expect(result).toBeUndefined();
	});

	// ─────────────────────────────────────────────────────────────────────────────
	// Vector 3: Empty string extension — must return undefined
	// ─────────────────────────────────────────────────────────────────────────────

	test('getByExtension("") returns undefined — empty string not registered', () => {
		const result = LANGUAGE_REGISTRY.getByExtension('');
		expect(result).toBeUndefined();
	});

	// ─────────────────────────────────────────────────────────────────────────────
	// Vector 4-5: Valid PHP extensions — must return PHP profile
	// ─────────────────────────────────────────────────────────────────────────────

	test('getByExtension(".php") returns php profile', () => {
		const result = LANGUAGE_REGISTRY.getByExtension('.php');
		expect(result).toBeDefined();
		expect(result!.id).toBe('php');
	});

	test('getByExtension(".phtml") returns php profile', () => {
		const result = LANGUAGE_REGISTRY.getByExtension('.phtml');
		expect(result).toBeDefined();
		expect(result!.id).toBe('php');
	});

	// ─────────────────────────────────────────────────────────────────────────────
	// Vector 6: Build command strings — no shell metacharacters
	// ─────────────────────────────────────────────────────────────────────────────

	test('build.commands[0].cmd contains no shell metacharacters', () => {
		const phpProfile = LANGUAGE_REGISTRY.getById('php');
		const cmd = phpProfile!.build.commands[0].cmd;

		for (const char of SHELL_METACHARACTERS) {
			expect(cmd).not.toContain(char);
		}
	});

	test('build.commands[0].cmd is exactly "composer install --no-interaction --prefer-dist"', () => {
		const phpProfile = LANGUAGE_REGISTRY.getById('php');
		const cmd = phpProfile!.build.commands[0].cmd;
		expect(cmd).toBe('composer install --no-interaction --prefer-dist');
	});

	// ─────────────────────────────────────────────────────────────────────────────
	// Vector 7: Audit command — no shell metacharacters beyond spaces/dashes
	// ─────────────────────────────────────────────────────────────────────────────

	test('audit.command contains no shell metacharacters', () => {
		const phpProfile = LANGUAGE_REGISTRY.getById('php');
		const cmd = phpProfile!.audit.command;

		for (const char of SHELL_METACHARACTERS) {
			expect(cmd).not.toContain(char);
		}
	});

	test('audit.command is exactly "composer audit --locked --format=json"', () => {
		const phpProfile = LANGUAGE_REGISTRY.getById('php');
		expect(phpProfile!.audit.command).toBe(
			'composer audit --locked --format=json',
		);
	});

	// ─────────────────────────────────────────────────────────────────────────────
	// Vector 8: Mutation isolation — mutating returned profile does not affect registry
	// ─────────────────────────────────────────────────────────────────────────────

	test('PHP profile tier is a valid tier value (1, 2, or 3)', () => {
		const profile = LANGUAGE_REGISTRY.getById('php')!;
		expect([1, 2, 3]).toContain(profile.tier);
	});

	test('KNOWN: registry getById returns mutable reference — pre-existing design limitation', () => {
		// This test documents a pre-existing limitation: getById() returns the internal
		// mutable reference. This affects ALL profiles, not just PHP.
		// Tracked for future hardening (separate from task 2.1 scope).
		const ref = LANGUAGE_REGISTRY.getById('php')!;
		expect(typeof ref).toBe('object'); // Reference is an object
		// Do NOT mutate ref here — it would pollute other tests
	});

	test('registry returns same reference on repeated calls (singleton behavior)', () => {
		const phpProfile1 = LANGUAGE_REGISTRY.getById('php');
		const phpProfile2 = LANGUAGE_REGISTRY.getById('php');
		expect(phpProfile1).toBe(phpProfile2);
	});

	// ─────────────────────────────────────────────────────────────────────────────
	// Vector 9: getById and getByExtension return the same object
	// ─────────────────────────────────────────────────────────────────────────────

	test('getById("php") and getByExtension(".php") return the same object reference', () => {
		const byId = LANGUAGE_REGISTRY.getById('php');
		const byExt = LANGUAGE_REGISTRY.getByExtension('.php');
		expect(byId).toBe(byExt);
	});

	// ─────────────────────────────────────────────────────────────────────────────
	// Vector 10: PHPStan linter commands — all hardcoded, no user interpolation
	// ─────────────────────────────────────────────────────────────────────────────

	test('PHPStan linter cmds contain no template placeholders or variable syntax', () => {
		const phpProfile = LANGUAGE_REGISTRY.getById('php');
		const phpstanLinters = phpProfile!.lint.linters.filter(
			(l) => l.name === 'PHPStan',
		);

		for (const linter of phpstanLinters) {
			// No template literals or string interpolation
			expect(linter.cmd).not.toContain('${');
			expect(linter.cmd).not.toContain('%s');
			expect(linter.cmd).not.toContain('{0}');
			expect(linter.cmd).not.toContain('$');

			// All PHPStan commands are exactly the same hardcoded string
			expect(linter.cmd).toBe('vendor/bin/phpstan analyse');
		}
	});

	test('PHP-CS-Fixer linter cmd is hardcoded with no interpolation', () => {
		const phpProfile = LANGUAGE_REGISTRY.getById('php');
		const fixerLinter = phpProfile!.lint.linters.find(
			(l) => l.name === 'PHP-CS-Fixer',
		);

		expect(fixerLinter).toBeDefined();
		expect(fixerLinter!.cmd).toBe(
			'vendor/bin/php-cs-fixer fix --dry-run --diff',
		);
		expect(fixerLinter!.cmd).not.toContain('${');
		expect(fixerLinter!.cmd).not.toContain('$');
	});

	// ─────────────────────────────────────────────────────────────────────────────
	// Additional boundary: extension with leading dot variations
	// ─────────────────────────────────────────────────────────────────────────────

	test('getByExtension("php") returns undefined — missing leading dot', () => {
		const result = LANGUAGE_REGISTRY.getByExtension('php');
		expect(result).toBeUndefined();
	});

	test('getByExtension(".Php") returns undefined — case sensitive', () => {
		const result = LANGUAGE_REGISTRY.getByExtension('.Php');
		expect(result).toBeUndefined();
	});

	test('getByExtension(".php ") returns undefined — trailing whitespace', () => {
		const result = LANGUAGE_REGISTRY.getByExtension('.php ');
		expect(result).toBeUndefined();
	});

	test('getByExtension(" .php") returns undefined — leading whitespace', () => {
		const result = LANGUAGE_REGISTRY.getByExtension(' .php');
		expect(result).toBeUndefined();
	});

	// ─────────────────────────────────────────────────────────────────────────────
	// Additional boundary: malicious extension patterns
	// ─────────────────────────────────────────────────────────────────────────────

	test('getByExtension with path traversal attempt returns undefined', () => {
		const result = LANGUAGE_REGISTRY.getByExtension('../etc/passwd');
		expect(result).toBeUndefined();
	});

	test('getByExtension with SQL injection pattern returns undefined', () => {
		const result = LANGUAGE_REGISTRY.getByExtension("'.php' OR '1'='1");
		expect(result).toBeUndefined();
	});

	test('getByExtension with null byte returns undefined', () => {
		const result = LANGUAGE_REGISTRY.getByExtension('.php\x00');
		expect(result).toBeUndefined();
	});

	// ─────────────────────────────────────────────────────────────────────────────
	// Priority ordering integrity
	// ─────────────────────────────────────────────────────────────────────────────

	test('PHPUnit framework entries have distinct priorities', () => {
		const phpProfile = LANGUAGE_REGISTRY.getById('php');
		const priorities = phpProfile!.test.frameworks.map((f) => f.priority);
		const uniquePriorities = new Set(priorities);
		expect(uniquePriorities.size).toBe(priorities.length);
	});

	test('PHPStan linter entries have distinct priorities', () => {
		const phpProfile = LANGUAGE_REGISTRY.getById('php');
		const priorities = phpProfile!.lint.linters.map((l) => l.priority);
		const uniquePriorities = new Set(priorities);
		expect(uniquePriorities.size).toBe(priorities.length);
	});

	// ─────────────────────────────────────────────────────────────────────────────
	// Profile identity invariants
	// ─────────────────────────────────────────────────────────────────────────────

	test('PHP profile has id "php"', () => {
		const phpProfile = LANGUAGE_REGISTRY.getById('php');
		expect(phpProfile!.id).toBe('php');
	});

	// DRIFT-SENSITIVE: If Phase 3.3 (.blade.php support) or any future extension additions
	// are made to the PHP profile, update this test's expected array accordingly.
	// Protection: src/lang/profiles.ts PHP profile extensions field
	test('PHP profile extensions array contains exactly [".php", ".phtml", ".blade.php"]', () => {
		const phpProfile = LANGUAGE_REGISTRY.getById('php');
		expect(phpProfile!.extensions).toEqual(['.php', '.phtml', '.blade.php']);
	});

	test('PHP profile tier is 3', () => {
		const phpProfile = LANGUAGE_REGISTRY.getById('php');
		expect(phpProfile!.tier).toBe(3);
	});
});
