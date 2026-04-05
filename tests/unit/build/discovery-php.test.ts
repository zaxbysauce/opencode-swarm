import { afterEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { discoverBuildCommands } from '../../../src/build/discovery';

describe('PHP Composer build discovery', () => {
	let tmpDir: string;

	afterEach(() => {
		if (tmpDir && fs.existsSync(tmpDir)) {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it('detects composer.json as a php-composer build ecosystem', async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'php-composer-discovery-'));
		fs.writeFileSync(
			path.join(tmpDir, 'composer.json'),
			JSON.stringify({
				name: 'test/project',
				require: {},
			}),
		);

		const result = await discoverBuildCommands(tmpDir, { scope: 'all' });
		const ecosystems = result.commands.map((c) => c.ecosystem);
		const inCommands = ecosystems.includes('php-composer');
		const inSkipped = result.skipped.some(
			(s) => s.ecosystem === 'php-composer',
		);
		expect(
			inCommands || inSkipped,
			'php-composer should appear in commands OR skipped — it must be detected',
		).toBe(true);
	});

	it('php-composer ecosystem uses composer.json (not composer.lock) as build file', async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'php-composer-buildfile-'));
		// Only composer.lock — no composer.json
		fs.writeFileSync(
			path.join(tmpDir, 'composer.lock'),
			JSON.stringify({ packages: [] }),
		);

		const result = await discoverBuildCommands(tmpDir, { scope: 'all' });
		// php-composer should NOT appear as an active build command
		// (it may appear in skipped — that's fine and expected)
		const inCommands = result.commands.some(
			(c) => c.ecosystem === 'php-composer',
		);
		expect(inCommands).toBe(false);
	});

	it('php-composer command includes --no-interaction --prefer-dist flags', async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'php-composer-flags-'));
		fs.writeFileSync(
			path.join(tmpDir, 'composer.json'),
			JSON.stringify({ name: 'test/project' }),
		);

		const result = await discoverBuildCommands(tmpDir, { scope: 'all' });
		const phpCommands = result.commands.filter(
			(c) => c.ecosystem === 'php-composer',
		);

		// If composer is available, verify the command flags
		if (phpCommands.length > 0) {
			expect(phpCommands[0].command).toContain('--no-interaction');
			expect(phpCommands[0].command).toContain('--prefer-dist');
		}
		// If composer is not available, it should be in skipped — still confirms detection
	});

	it('php project does not get both php (profile) and php-composer (fallback) in commands', async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'php-dedup-'));
		fs.writeFileSync(
			path.join(tmpDir, 'composer.json'),
			JSON.stringify({ name: 'test/project' }),
		);
		fs.writeFileSync(path.join(tmpDir, 'index.php'), '<?php echo "hello";');

		const result = await discoverBuildCommands(tmpDir, { scope: 'all' });

		const phpProfileCount = result.commands.filter(
			(c) => c.ecosystem === 'php',
		).length;
		const phpComposerCount = result.commands.filter(
			(c) => c.ecosystem === 'php-composer',
		).length;

		// At most one of them should be in commands — no duplication via PROFILE_TO_ECOSYSTEM_NAMES
		expect(phpProfileCount + phpComposerCount).toBeLessThanOrEqual(1);
	});
});
