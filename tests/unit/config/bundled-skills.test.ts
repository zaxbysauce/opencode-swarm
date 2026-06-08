import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { syncBundledProjectSkillsIfMissing } from '../../../src/config/bundled-skills';
import { createSafeTestDir } from '../../helpers/safe-test-dir';

function writePackageSkill(
	packageRoot: string,
	slug = 'codebase-review-swarm',
	body = 'canonical skill\n',
): void {
	const skillDir = path.join(packageRoot, '.opencode', 'skills', slug);
	fs.mkdirSync(path.join(skillDir, 'references'), { recursive: true });
	fs.writeFileSync(path.join(skillDir, 'SKILL.md'), body, 'utf-8');
	fs.writeFileSync(
		path.join(skillDir, 'references', 'review-protocol-v8.2.md'),
		'protocol\n',
		'utf-8',
	);
}

describe('syncBundledProjectSkillsIfMissing', () => {
	let projectDir: string;
	let packageRoot: string;
	let cleanupProject: () => void;
	let cleanupPackage: () => void;
	let warnOutput: string[];
	let origWarn: typeof console.warn;

	beforeEach(() => {
		({ dir: projectDir, cleanup: cleanupProject } = createSafeTestDir(
			'swarm-bundled-skill-project-',
		));
		({ dir: packageRoot, cleanup: cleanupPackage } = createSafeTestDir(
			'swarm-bundled-skill-package-',
		));
		writePackageSkill(packageRoot);
		writePackageSkill(packageRoot, 'design-docs', 'design docs skill\n');
		warnOutput = [];
		origWarn = console.warn;
		console.warn = (...args: unknown[]) => {
			warnOutput.push(args.map(String).join(' '));
		};
	});

	afterEach(() => {
		console.warn = origWarn;
		cleanupProject();
		cleanupPackage();
	});

	const projectSkillPath = (slug = 'codebase-review-swarm') =>
		path.join(projectDir, '.opencode', 'skills', slug, 'SKILL.md');

	test('installs missing bundled skills into the project skill tree', () => {
		syncBundledProjectSkillsIfMissing(projectDir, packageRoot);

		expect(fs.readFileSync(projectSkillPath(), 'utf-8')).toBe(
			'canonical skill\n',
		);
		expect(fs.readFileSync(projectSkillPath('design-docs'), 'utf-8')).toBe(
			'design docs skill\n',
		);
		expect(
			fs.existsSync(
				path.join(
					projectDir,
					'.opencode',
					'skills',
					'codebase-review-swarm',
					'references',
					'review-protocol-v8.2.md',
				),
			),
		).toBe(true);
		expect(
			warnOutput.some((m) => m.includes('codebase-review-swarm/SKILL.md')),
		).toBe(true);
		expect(warnOutput.some((m) => m.includes('design-docs/SKILL.md'))).toBe(
			true,
		);
	});

	test('does not overwrite an existing project skill', () => {
		fs.mkdirSync(path.dirname(projectSkillPath()), { recursive: true });
		fs.writeFileSync(projectSkillPath(), 'project override\n', 'utf-8');

		syncBundledProjectSkillsIfMissing(projectDir, packageRoot);

		expect(fs.readFileSync(projectSkillPath(), 'utf-8')).toBe(
			'project override\n',
		);
	});

	test('suppresses install warning when quiet is true', () => {
		syncBundledProjectSkillsIfMissing(projectDir, packageRoot, true);

		expect(fs.existsSync(projectSkillPath())).toBe(true);
		expect(warnOutput).toEqual([]);
	});

	test('skips a symlinked .opencode directory', () => {
		const target = path.join(projectDir, 'real-opencode');
		fs.mkdirSync(target, { recursive: true });
		fs.symlinkSync(
			target,
			path.join(projectDir, '.opencode'),
			process.platform === 'win32' ? 'junction' : 'dir',
		);

		syncBundledProjectSkillsIfMissing(projectDir, packageRoot);

		expect(fs.existsSync(path.join(target, 'skills'))).toBe(false);
	});

	test('fails open when the bundled source skill is absent', () => {
		cleanupPackage();
		({ dir: packageRoot, cleanup: cleanupPackage } = createSafeTestDir(
			'swarm-bundled-skill-empty-package-',
		));

		expect(() =>
			syncBundledProjectSkillsIfMissing(projectDir, packageRoot),
		).not.toThrow();
		expect(fs.existsSync(projectSkillPath())).toBe(false);
	});
});
