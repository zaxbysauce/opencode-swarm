/**
 * Laravel Fixture Tests — fixture-backed validation for detection and SAST coverage.
 * Verifies the laravel-baseline/ fixture correctly exercises detection signals,
 * Blade scanning, and Laravel-specific SAST rules.
 *
 * Drift note: If the fixture or detection logic changes, update these tests.
 */

import { describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
	detectLaravelProject,
	getLaravelSignals,
} from '../../../src/lang/framework-detector';
import { executeRulesSync } from '../../../src/sast/rules/index';

const FIXTURE = path.join(
	process.cwd(),
	'tests',
	'fixtures',
	'laravel-baseline',
);

describe('laravel-baseline fixture — detection', () => {
	it('detectLaravelProject returns true for laravel-baseline', () => {
		expect(detectLaravelProject(FIXTURE)).toBe(true);
	});

	it('getLaravelSignals shows artisan and laravel/framework dep', () => {
		const signals = getLaravelSignals(FIXTURE);
		expect(signals.hasArtisanFile).toBe(true);
		expect(signals.hasLaravelFrameworkDep).toBe(true);
		// config/app.php not in minimal fixture — only 2 of 3 signals needed
	});
});

describe('laravel-baseline fixture — Blade file presence', () => {
	it('welcome.blade.php exists in fixture', () => {
		const bladePath = path.join(
			FIXTURE,
			'resources',
			'views',
			'welcome.blade.php',
		);
		expect(fs.existsSync(bladePath)).toBe(true);
	});

	it('welcome.blade.php has .blade.php extension detectable by extname as .php', () => {
		expect(path.extname('welcome.blade.php')).toBe('.php');
	});
});

describe('laravel-baseline fixture — SAST rule coverage', () => {
	it('Eloquent model fires sast/php-laravel-mass-assignment rule', () => {
		const modelPath = path.join(FIXTURE, 'app', 'Models', 'User.php');
		const content = fs.readFileSync(modelPath, 'utf-8');
		const findings = executeRulesSync(modelPath, content, 'php');
		const massAssignmentFindings = findings.filter(
			(f) => f.rule_id === 'sast/php-laravel-mass-assignment',
		);
		expect(massAssignmentFindings.length).toBeGreaterThanOrEqual(1);
	});

	it('migration file fires sast/php-laravel-destructive-migration rule', () => {
		const migrationPath = path.join(
			FIXTURE,
			'database',
			'migrations',
			'2024_01_01_000000_create_users_table.php',
		);
		const content = fs.readFileSync(migrationPath, 'utf-8');
		const findings = executeRulesSync(migrationPath, content, 'php');
		const destructiveFindings = findings.filter(
			(f) => f.rule_id === 'sast/php-laravel-destructive-migration',
		);
		expect(destructiveFindings.length).toBeGreaterThanOrEqual(1);
	});

	it('controller with raw SQL fires sast/php-laravel-sql-injection rule', () => {
		const controllerPath = path.join(
			FIXTURE,
			'app',
			'Http',
			'Controllers',
			'UserController.php',
		);
		const content = fs.readFileSync(controllerPath, 'utf-8');
		const findings = executeRulesSync(controllerPath, content, 'php');
		const sqlFindings = findings.filter(
			(f) => f.rule_id === 'sast/php-laravel-sql-injection',
		);
		expect(sqlFindings.length).toBeGreaterThanOrEqual(1);
	});
});
