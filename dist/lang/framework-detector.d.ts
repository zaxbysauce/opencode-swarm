/**
 * Framework Detection Utilities
 *
 * Provides deterministic multi-signal framework detection.
 * Laravel detection uses at least 2 of 3 signals to avoid false positives.
 */
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
export declare function detectLaravelProject(directory: string): boolean;
/**
 * Get individual Laravel detection signals for a directory.
 * Exposed for testing and diagnostic purposes.
 *
 * @param directory - Absolute path to the project root
 * @returns LaravelDetectionSignals with each signal's boolean state
 */
export declare function getLaravelSignals(directory: string): LaravelDetectionSignals;
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
export declare function getLaravelCommandOverlay(directory: string): LaravelCommandOverlay | null;
