/**
 * Laravel Framework Detection Tests
 *
 * Tests deterministic multi-signal detection for Laravel projects.
 * Uses fixture directories from tests/fixtures/ to validate real-world behavior.
 *
 * Drift note: If detectLaravelProject signal logic changes, update tests here.
 * Detection requires >= 2 of 3 signals: artisan, laravel/framework dep, config/app.php.
 */

import { afterEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	detectLaravelProject,
	getLaravelCommandOverlay,
	getLaravelSignals,
	isLarastanConfigured,
} from '../../../src/lang/framework-detector';

const FIXTURES = path.join(process.cwd(), 'tests', 'fixtures');

describe('Laravel Framework Detection', () => {
	describe('fixture-based detection', () => {
		it('detectLaravelProject(laravel-baseline) returns true', () => {
			const fixturePath = path.join(FIXTURES, 'laravel-baseline');
			expect(detectLaravelProject(fixturePath)).toBe(true);
		});

		it('detectLaravelProject(generic-composer) returns false', () => {
			const fixturePath = path.join(FIXTURES, 'generic-composer');
			expect(detectLaravelProject(fixturePath)).toBe(false);
		});

		it('detectLaravelProject(phpunit-project) returns false', () => {
			const fixturePath = path.join(FIXTURES, 'phpunit-project');
			expect(detectLaravelProject(fixturePath)).toBe(false);
		});

		it('detectLaravelProject(pest-project) returns false', () => {
			const fixturePath = path.join(FIXTURES, 'pest-project');
			expect(detectLaravelProject(fixturePath)).toBe(false);
		});
	});

	describe('getLaravelSignals', () => {
		// Drift: protects 2-of-3 signal detection logic.
		// Signals: artisan file, laravel/framework in require, config/app.php.
		// If threshold or signal names change, update detectLaravelProject() in framework-detector.ts.
		it('getLaravelSignals(laravel-baseline) has artisan and dep but not config/app', () => {
			const fixturePath = path.join(FIXTURES, 'laravel-baseline');
			const signals = getLaravelSignals(fixturePath);
			expect(signals.hasArtisanFile).toBe(true);
			expect(signals.hasLaravelFrameworkDep).toBe(true);
			expect(signals.hasConfigApp).toBe(false);
		});

		it('getLaravelSignals(generic-composer) all signals false', () => {
			const fixturePath = path.join(FIXTURES, 'generic-composer');
			const signals = getLaravelSignals(fixturePath);
			expect(signals.hasArtisanFile).toBe(false);
			expect(signals.hasLaravelFrameworkDep).toBe(false);
			expect(signals.hasConfigApp).toBe(false);
		});
	});

	describe('temp directory edge cases', () => {
		let tempDir: string;

		afterEach(() => {
			if (tempDir && fs.existsSync(tempDir)) {
				fs.rmSync(tempDir, { recursive: true, force: true });
			}
		});

		it('empty directory returns false', () => {
			tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'laravel-detect-'));
			expect(detectLaravelProject(tempDir)).toBe(false);
		});

		it('directory with ONLY artisan file (1 signal) returns false', () => {
			tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'laravel-detect-'));
			fs.writeFileSync(path.join(tempDir, 'artisan'), '#!/usr/bin/env php\n');
			expect(detectLaravelProject(tempDir)).toBe(false);
		});

		it('directory with artisan + laravel/framework dep (2 signals) returns true', () => {
			tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'laravel-detect-'));
			fs.writeFileSync(path.join(tempDir, 'artisan'), '#!/usr/bin/env php\n');
			fs.writeFileSync(
				path.join(tempDir, 'composer.json'),
				JSON.stringify({
					name: 'test/temp',
					require: { 'laravel/framework': '^11.0' },
				}),
			);
			expect(detectLaravelProject(tempDir)).toBe(true);
		});

		it('directory with all 3 signals returns true', () => {
			tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'laravel-detect-'));
			fs.writeFileSync(path.join(tempDir, 'artisan'), '#!/usr/bin/env php\n');
			fs.writeFileSync(
				path.join(tempDir, 'composer.json'),
				JSON.stringify({
					name: 'test/temp',
					require: { 'laravel/framework': '^11.0' },
				}),
			);
			fs.mkdirSync(path.join(tempDir, 'config'));
			fs.writeFileSync(path.join(tempDir, 'config', 'app.php'), '<?php\n');
			expect(detectLaravelProject(tempDir)).toBe(true);
		});

		it('detectLaravelProject with non-existent directory returns false', () => {
			const nonexistent = path.join(
				os.tmpdir(),
				'nonexistent-laravel-project-' + Date.now(),
			);
			expect(detectLaravelProject(nonexistent)).toBe(false);
		});

		it('detectLaravelProject with malformed composer.json returns false', () => {
			tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'laravel-detect-'));
			fs.writeFileSync(path.join(tempDir, 'composer.json'), '{ invalid json }');
			expect(detectLaravelProject(tempDir)).toBe(false);
		});
	});

	describe('adversarial cases', () => {
		let tempDir: string;

		afterEach(() => {
			if (tempDir && fs.existsSync(tempDir)) {
				fs.rmSync(tempDir, { recursive: true, force: true });
			}
		});

		it('composer.json has laravel/framework in require-dev only returns false for signal', () => {
			tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'laravel-detect-'));
			fs.writeFileSync(
				path.join(tempDir, 'composer.json'),
				JSON.stringify({
					name: 'test/temp',
					require: { php: '>=8.1' },
					'require-dev': { 'laravel/framework': '^11.0' },
				}),
			);
			const signals = getLaravelSignals(tempDir);
			expect(signals.hasLaravelFrameworkDep).toBe(false);
			expect(detectLaravelProject(tempDir)).toBe(false);
		});

		it('composer.json has laravel/lumen-framework but not laravel/framework returns false', () => {
			tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'laravel-detect-'));
			fs.writeFileSync(
				path.join(tempDir, 'composer.json'),
				JSON.stringify({
					name: 'test/temp',
					require: { 'laravel/lumen-framework': '^11.0' },
				}),
			);
			const signals = getLaravelSignals(tempDir);
			expect(signals.hasLaravelFrameworkDep).toBe(false);
			expect(detectLaravelProject(tempDir)).toBe(false);
		});

		it('artisan directory (not a file) does not satisfy artisan signal when combined with laravel dep', () => {
			// Drift: protects checkArtisanFile() isFile guard.
			// If checkArtisanFile changes to use existsSync only, this test fails correctly.
			tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'laravel-detect-'));
			// Create a DIRECTORY named 'artisan' — not a file
			fs.mkdirSync(path.join(tempDir, 'artisan'));
			fs.writeFileSync(
				path.join(tempDir, 'composer.json'),
				JSON.stringify({
					name: 'test/temp',
					require: { 'laravel/framework': '^11.0' },
				}),
			);
			// artisan directory + laravel/framework dep = 1 valid signal (dep) + 1 invalid (dir)
			// Should NOT detect as Laravel (requires ≥2 valid signals)
			expect(detectLaravelProject(tempDir)).toBe(false);
			// Also verify the artisan signal itself is false
			const signals = getLaravelSignals(tempDir);
			expect(signals.hasArtisanFile).toBe(false);
			expect(signals.hasLaravelFrameworkDep).toBe(true);
		});
	});
});

describe('getLaravelCommandOverlay', () => {
	// Uses laravel-baseline fixture which has: artisan + laravel/framework dep (2 signals)
	// No pint.json, no phpstan.neon, no .php-cs-fixer.php in the minimal fixture

	it('returns null for non-Laravel project (generic-composer)', () => {
		const overlay = getLaravelCommandOverlay(
			path.join(FIXTURES, 'generic-composer'),
		);
		expect(overlay).toBeNull();
	});

	// Drift: protects getLaravelCommandOverlay() returning php artisan test.
	// If Laravel test command changes, update this test, CI docs, and docs/releases/v6.49.0.md.
	it('returns Laravel command overlay for laravel-baseline fixture', () => {
		const overlay = getLaravelCommandOverlay(
			path.join(FIXTURES, 'laravel-baseline'),
		);
		expect(overlay).not.toBeNull();
		expect(overlay!.testCommand).toBe('php artisan test');
		expect(overlay!.auditCommand).toBe('composer audit --locked --format=json');
		expect(overlay!.supportsParallel).toBe(true);
	});

	it('lintCommand is null when neither pint.json nor .php-cs-fixer.php present', () => {
		const overlay = getLaravelCommandOverlay(
			path.join(FIXTURES, 'laravel-baseline'),
		);
		expect(overlay).not.toBeNull();
		expect(overlay!.lintCommand).toBeNull();
	});

	it('staticAnalysisCommand is null when no phpstan.neon present', () => {
		const overlay = getLaravelCommandOverlay(
			path.join(FIXTURES, 'laravel-baseline'),
		);
		expect(overlay).not.toBeNull();
		expect(overlay!.staticAnalysisCommand).toBeNull();
	});

	it('prefers pint.json for lintCommand over php-cs-fixer when both present', () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'laravel-overlay-'));
		try {
			// Set up 2 Laravel signals
			fs.writeFileSync(
				path.join(tmpDir, 'artisan'),
				'#!/usr/bin/env php\n<?php',
			);
			fs.writeFileSync(
				path.join(tmpDir, 'composer.json'),
				JSON.stringify({
					require: { 'laravel/framework': '^11.0' },
				}),
			);
			// Both lint tools present
			fs.writeFileSync(path.join(tmpDir, 'pint.json'), '{}');
			fs.writeFileSync(path.join(tmpDir, '.php-cs-fixer.php'), '<?php');

			const overlay = getLaravelCommandOverlay(tmpDir);
			expect(overlay).not.toBeNull();
			expect(overlay!.lintCommand).toBe('vendor/bin/pint --test');
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it('uses php-cs-fixer when no pint.json but .php-cs-fixer.php present', () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'laravel-fixer-'));
		try {
			fs.writeFileSync(
				path.join(tmpDir, 'artisan'),
				'#!/usr/bin/env php\n<?php',
			);
			fs.writeFileSync(
				path.join(tmpDir, 'composer.json'),
				JSON.stringify({
					require: { 'laravel/framework': '^11.0' },
				}),
			);
			fs.writeFileSync(path.join(tmpDir, '.php-cs-fixer.php'), '<?php');

			const overlay = getLaravelCommandOverlay(tmpDir);
			expect(overlay).not.toBeNull();
			expect(overlay!.lintCommand).toBe(
				'vendor/bin/php-cs-fixer fix --dry-run --diff',
			);
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it('returns phpstan analyse when phpstan.neon present', () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'laravel-phpstan-'));
		try {
			fs.writeFileSync(
				path.join(tmpDir, 'artisan'),
				'#!/usr/bin/env php\n<?php',
			);
			fs.writeFileSync(
				path.join(tmpDir, 'composer.json'),
				JSON.stringify({
					require: { 'laravel/framework': '^11.0' },
				}),
			);
			fs.writeFileSync(
				path.join(tmpDir, 'phpstan.neon'),
				'includes:\n  - ./vendor/nunomaduro/larastan/extension.neon\n',
			);

			const overlay = getLaravelCommandOverlay(tmpDir);
			expect(overlay).not.toBeNull();
			expect(overlay!.staticAnalysisCommand).toBe('vendor/bin/phpstan analyse');
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it('returns phpstan analyse when phpstan.neon.dist present (no .neon)', () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'laravel-phpdist-'));
		try {
			fs.writeFileSync(
				path.join(tmpDir, 'artisan'),
				'#!/usr/bin/env php\n<?php',
			);
			fs.writeFileSync(
				path.join(tmpDir, 'composer.json'),
				JSON.stringify({
					require: { 'laravel/framework': '^11.0' },
				}),
			);
			fs.writeFileSync(
				path.join(tmpDir, 'phpstan.neon.dist'),
				'parameters:\n  level: 5\n',
			);

			const overlay = getLaravelCommandOverlay(tmpDir);
			expect(overlay).not.toBeNull();
			expect(overlay!.staticAnalysisCommand).toBe('vendor/bin/phpstan analyse');
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it('testCommand is always php artisan test regardless of tool config', () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'laravel-test-'));
		try {
			fs.writeFileSync(
				path.join(tmpDir, 'artisan'),
				'#!/usr/bin/env php\n<?php',
			);
			fs.writeFileSync(
				path.join(tmpDir, 'composer.json'),
				JSON.stringify({
					require: { 'laravel/framework': '^11.0' },
				}),
			);
			// Even when phpunit.xml is present, test command is artisan
			fs.writeFileSync(path.join(tmpDir, 'phpunit.xml'), '<phpunit/>');

			const overlay = getLaravelCommandOverlay(tmpDir);
			expect(overlay).not.toBeNull();
			expect(overlay!.testCommand).toBe('php artisan test');
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	// staticAnalysisTool content-based Larastan detection
	it('staticAnalysisTool is larastan when phpstan.neon contains nunomaduro/larastan', () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'laravel-larastan-'));
		try {
			fs.writeFileSync(
				path.join(tmpDir, 'artisan'),
				'#!/usr/bin/env php\n<?php',
			);
			fs.writeFileSync(
				path.join(tmpDir, 'composer.json'),
				JSON.stringify({ require: { 'laravel/framework': '^11.0' } }),
			);
			fs.writeFileSync(
				path.join(tmpDir, 'phpstan.neon'),
				'includes:\n    - ./vendor/nunomaduro/larastan/extension.neon\n',
			);
			const overlay = getLaravelCommandOverlay(tmpDir);
			expect(overlay).not.toBeNull();
			expect(overlay!.staticAnalysisTool).toBe('larastan');
			expect(overlay!.staticAnalysisCommand).toBe('vendor/bin/phpstan analyse');
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it('staticAnalysisTool is larastan when phpstan.neon contains larastan/larastan', () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'laravel-larastan2-'));
		try {
			fs.writeFileSync(
				path.join(tmpDir, 'artisan'),
				'#!/usr/bin/env php\n<?php',
			);
			fs.writeFileSync(
				path.join(tmpDir, 'composer.json'),
				JSON.stringify({ require: { 'laravel/framework': '^11.0' } }),
			);
			fs.writeFileSync(
				path.join(tmpDir, 'phpstan.neon'),
				'includes:\n    - ./vendor/larastan/larastan/extension.neon\n',
			);
			const overlay = getLaravelCommandOverlay(tmpDir);
			expect(overlay).not.toBeNull();
			expect(overlay!.staticAnalysisTool).toBe('larastan');
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it('staticAnalysisTool is phpstan when phpstan.neon present but has no Larastan marker', () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'laravel-phpstan2-'));
		try {
			fs.writeFileSync(
				path.join(tmpDir, 'artisan'),
				'#!/usr/bin/env php\n<?php',
			);
			fs.writeFileSync(
				path.join(tmpDir, 'composer.json'),
				JSON.stringify({ require: { 'laravel/framework': '^11.0' } }),
			);
			fs.writeFileSync(
				path.join(tmpDir, 'phpstan.neon'),
				'parameters:\n  level: 5\n  paths:\n    - src\n',
			);
			const overlay = getLaravelCommandOverlay(tmpDir);
			expect(overlay).not.toBeNull();
			expect(overlay!.staticAnalysisTool).toBe('phpstan');
			expect(overlay!.staticAnalysisCommand).toBe('vendor/bin/phpstan analyse');
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it('staticAnalysisTool is phpstan when only phpstan.neon.dist present (no .neon)', () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'laravel-neondist2-'));
		try {
			fs.writeFileSync(
				path.join(tmpDir, 'artisan'),
				'#!/usr/bin/env php\n<?php',
			);
			fs.writeFileSync(
				path.join(tmpDir, 'composer.json'),
				JSON.stringify({ require: { 'laravel/framework': '^11.0' } }),
			);
			// phpstan.neon.dist with Larastan content — but isLarastanConfigured
			// only reads phpstan.neon, so this should still be 'phpstan'
			fs.writeFileSync(
				path.join(tmpDir, 'phpstan.neon.dist'),
				'includes:\n    - ./vendor/nunomaduro/larastan/extension.neon\n',
			);
			const overlay = getLaravelCommandOverlay(tmpDir);
			expect(overlay).not.toBeNull();
			expect(overlay!.staticAnalysisTool).toBe('phpstan');
			expect(overlay!.staticAnalysisCommand).toBe('vendor/bin/phpstan analyse');
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it('staticAnalysisTool is null when no phpstan config present', () => {
		const overlay = getLaravelCommandOverlay(
			path.join(FIXTURES, 'laravel-baseline'),
		);
		expect(overlay).not.toBeNull();
		expect(overlay!.staticAnalysisTool).toBeNull();
	});
});

describe('isLarastanConfigured', () => {
	let tempDir: string;

	afterEach(() => {
		if (tempDir && fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('returns false when phpstan.neon does not exist', () => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'larastan-check-'));
		expect(isLarastanConfigured(tempDir)).toBe(false);
	});

	it('returns true for phpstan.neon with nunomaduro/larastan include', () => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'larastan-check-'));
		fs.writeFileSync(
			path.join(tempDir, 'phpstan.neon'),
			'includes:\n    - ./vendor/nunomaduro/larastan/extension.neon\n',
		);
		expect(isLarastanConfigured(tempDir)).toBe(true);
	});

	it('returns true for phpstan.neon with larastan/larastan include', () => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'larastan-check-'));
		fs.writeFileSync(
			path.join(tempDir, 'phpstan.neon'),
			'includes:\n    - ./vendor/larastan/larastan/extension.neon\n',
		);
		expect(isLarastanConfigured(tempDir)).toBe(true);
	});

	it('returns false for phpstan.neon with no Larastan marker', () => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'larastan-check-'));
		fs.writeFileSync(
			path.join(tempDir, 'phpstan.neon'),
			'parameters:\n  level: 5\n  paths:\n    - src\n',
		);
		expect(isLarastanConfigured(tempDir)).toBe(false);
	});

	it('reads only first 4096 bytes (marker beyond limit is not detected)', () => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'larastan-check-'));
		// Pad with 4096 bytes of filler before adding Larastan marker
		const filler = 'x'.repeat(4096);
		fs.writeFileSync(
			path.join(tempDir, 'phpstan.neon'),
			filler + 'includes:\n    - ./vendor/nunomaduro/larastan/extension.neon\n',
		);
		expect(isLarastanConfigured(tempDir)).toBe(false);
	});

	it('detects marker that sits exactly within the first 4096 bytes', () => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'larastan-check-'));
		const marker = 'nunomaduro/larastan';
		// Place marker so it ends exactly at byte 4096
		const filler = 'x'.repeat(4096 - marker.length);
		fs.writeFileSync(
			path.join(tempDir, 'phpstan.neon'),
			filler + marker + '\nmore content\n',
		);
		expect(isLarastanConfigured(tempDir)).toBe(true);
	});

	it('returns false gracefully when phpstan.neon is unreadable (empty)', () => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'larastan-check-'));
		fs.writeFileSync(path.join(tempDir, 'phpstan.neon'), '');
		expect(isLarastanConfigured(tempDir)).toBe(false);
	});

	it('does not scan phpstan.neon.dist even when it contains a Larastan marker', () => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'larastan-check-'));
		fs.writeFileSync(
			path.join(tempDir, 'phpstan.neon.dist'),
			'includes:\n    - ./vendor/nunomaduro/larastan/extension.neon\n',
		);
		// No phpstan.neon — should return false
		expect(isLarastanConfigured(tempDir)).toBe(false);
	});
});
