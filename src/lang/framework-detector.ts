/**
 * Framework Detection Utilities
 *
 * Provides deterministic multi-signal framework detection.
 * Laravel detection uses at least 2 of 3 signals to avoid false positives.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Detection signals for Laravel framework identification.
 * Each signal independently indicates a Laravel project.
 */
export interface LaravelDetectionSignals {
	/** artisan file present in project root (no extension) */
	hasArtisanFile: boolean;
	/** laravel/framework present in composer.json require dependencies */
	hasLaravelFrameworkDep: boolean;
	/** config/app.php present (Laravel config directory structure) */
	hasConfigApp: boolean;
}

/**
 * Resolved command overlay for a detected Laravel project.
 * All fields are set to best-available commands for CI-quality use.
 */
export interface LaravelCommandOverlay {
	/** Primary test command. Always php artisan test for Laravel. */
	testCommand: string;
	/** Lint/format command. Pint if detected, PHP-CS-Fixer otherwise, null if neither. */
	lintCommand: string | null;
	/** Static analysis command. PHPStan if phpstan config is present, null otherwise. */
	staticAnalysisCommand: string | null;
	/** Dependency audit command (always composer audit --locked --format=json for Laravel). */
	auditCommand: string;
	/** Whether --parallel flag is supported (Pest parallel testing via artisan). */
	supportsParallel: boolean;
}

/**
 * Detect whether a directory is a Laravel project.
 * Uses multi-signal detection: at least 2 of 3 signals must be present
 * to minimize false positives against generic Composer PHP projects.
 *
 * Signals checked:
 * 1. artisan file in project root (strong signal — only Laravel projects have this)
 * 2. laravel/framework in composer.json require section
 * 3. config/app.php file (Laravel directory structure)
 *
 * @param directory - Absolute path to the project root
 * @returns true if project is a Laravel project, false otherwise
 */
export function detectLaravelProject(directory: string): boolean {
	const signals = getLaravelSignals(directory);
	const signalCount = [
		signals.hasArtisanFile,
		signals.hasLaravelFrameworkDep,
		signals.hasConfigApp,
	].filter(Boolean).length;
	return signalCount >= 2;
}

/**
 * Get individual Laravel detection signals for a directory.
 * Exposed for testing and diagnostic purposes.
 *
 * @param directory - Absolute path to the project root
 * @returns LaravelDetectionSignals with each signal's boolean state
 */
export function getLaravelSignals(directory: string): LaravelDetectionSignals {
	const hasArtisanFile = checkArtisanFile(directory);
	const hasLaravelFrameworkDep = checkLaravelFrameworkDep(directory);
	const hasConfigApp = checkConfigApp(directory);
	return { hasArtisanFile, hasLaravelFrameworkDep, hasConfigApp };
}

/**
 * Check for artisan file presence in project root.
 * The artisan file is present in all Laravel projects and is not
 * typically present in any other PHP framework.
 */
function checkArtisanFile(directory: string): boolean {
	const artisanPath = path.join(directory, 'artisan');
	if (!fs.existsSync(artisanPath)) return false;
	try {
		return fs.statSync(artisanPath).isFile();
	} catch {
		return false;
	}
}

/**
 * Check for laravel/framework in composer.json require section.
 * Only checks runtime dependencies (require), not require-dev.
 */
function checkLaravelFrameworkDep(directory: string): boolean {
	const composerPath = path.join(directory, 'composer.json');
	if (!fs.existsSync(composerPath)) return false;
	try {
		const content = fs.readFileSync(composerPath, 'utf-8');
		const parsed = JSON.parse(content);
		const require = parsed?.require ?? {};
		return typeof require['laravel/framework'] === 'string';
	} catch {
		return false;
	}
}

/**
 * Check for config/app.php — standard Laravel configuration file.
 * Present in all full Laravel installations.
 */
function checkConfigApp(directory: string): boolean {
	return fs.existsSync(path.join(directory, 'config', 'app.php'));
}

/**
 * Get the Laravel command overlay for a project directory.
 * Returns null if the directory is not a Laravel project.
 *
 * Command selection logic:
 * - testCommand: always 'php artisan test' (wraps both PHPUnit and Pest)
 * - lintCommand: 'vendor/bin/pint --test' if pint.json present,
 *   'vendor/bin/php-cs-fixer fix --dry-run --diff' if .php-cs-fixer.php present,
 *   null otherwise
 * - staticAnalysisCommand: 'vendor/bin/phpstan analyse' if phpstan.neon or phpstan.neon.dist present,
 *   null otherwise
 * - auditCommand: always 'composer audit --locked --format=json'
 * - supportsParallel: true (php artisan test --parallel is supported)
 *
 * @param directory - Absolute path to the project root
 * @returns LaravelCommandOverlay if Laravel detected, null if not a Laravel project
 */
export function getLaravelCommandOverlay(
	directory: string,
): LaravelCommandOverlay | null {
	if (!detectLaravelProject(directory)) {
		return null;
	}

	// Lint command: prefer Pint, fall back to PHP-CS-Fixer
	let lintCommand: string | null = null;
	if (fs.existsSync(path.join(directory, 'pint.json'))) {
		lintCommand = 'vendor/bin/pint --test';
	} else if (fs.existsSync(path.join(directory, '.php-cs-fixer.php'))) {
		lintCommand = 'vendor/bin/php-cs-fixer fix --dry-run --diff';
	}

	// Static analysis: detect PHPStan via config file presence
	let staticAnalysisCommand: string | null = null;
	if (
		fs.existsSync(path.join(directory, 'phpstan.neon')) ||
		fs.existsSync(path.join(directory, 'phpstan.neon.dist'))
	) {
		staticAnalysisCommand = 'vendor/bin/phpstan analyse';
	}

	return {
		testCommand: 'php artisan test',
		lintCommand,
		staticAnalysisCommand,
		auditCommand: 'composer audit --locked --format=json',
		supportsParallel: true,
	};
}
