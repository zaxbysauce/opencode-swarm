import * as fs from 'node:fs';
import * as path from 'node:path';

export const BUNDLED_PROJECT_SKILLS = [
	'brainstorm',
	'specify',
	'clarify-spec',
	'resume',
	'clarify',
	'discover',
	'consult',
	'pre-phase-briefing',
	'council',
	'deep-dive',
	'codebase-review-swarm',
	'design-docs',
	'swarm-pr-review',
	'swarm-pr-feedback',
	'issue-ingest',
	'plan',
	'critic-gate',
	'execute',
	'phase-wrap',
] as const;

const MAX_SKILL_FILES = 64;
const MAX_SKILL_BYTES = 512_000;

interface CopyState {
	files: number;
	bytes: number;
}

function isSymbolicLink(p: string): boolean {
	try {
		return fs.lstatSync(p).isSymbolicLink();
	} catch {
		return false;
	}
}

function ensureNotSymlinkedDirectory(p: string): boolean {
	try {
		const stat = fs.lstatSync(p);
		return stat.isDirectory() && !stat.isSymbolicLink();
	} catch (err) {
		return (err as NodeJS.ErrnoException).code === 'ENOENT';
	}
}

function copyBundledDirectoryBounded(
	sourceDir: string,
	destDir: string,
	state: CopyState,
	relativeDir = '',
): void {
	const currentSource = path.join(sourceDir, relativeDir);
	const currentDest = path.join(destDir, relativeDir);
	const entries = fs.readdirSync(currentSource, { withFileTypes: true });

	fs.mkdirSync(currentDest, { recursive: true });

	for (const entry of entries) {
		const relativeEntry = path.join(relativeDir, entry.name);
		const sourcePath = path.join(sourceDir, relativeEntry);
		const destPath = path.join(destDir, relativeEntry);

		if (entry.isSymbolicLink() || isSymbolicLink(sourcePath)) continue;

		if (entry.isDirectory()) {
			copyBundledDirectoryBounded(sourceDir, destDir, state, relativeEntry);
			continue;
		}

		if (!entry.isFile()) continue;

		const stat = fs.statSync(sourcePath);
		state.files += 1;
		state.bytes += stat.size;
		if (state.files > MAX_SKILL_FILES || state.bytes > MAX_SKILL_BYTES) {
			throw new Error('bundled skill package exceeds copy bounds');
		}

		fs.mkdirSync(path.dirname(destPath), { recursive: true });
		try {
			fs.copyFileSync(sourcePath, destPath, fs.constants.COPYFILE_EXCL);
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
		}
	}
}

/**
 * Materialize missing built-in mode skills into the target project so architect
 * MODE dispatch can load SKILL.md files in repositories that do not already
 * vendor the latest opencode-swarm skill tree.
 *
 * This is intentionally missing-only and fail-open: custom project skills are
 * never overwritten, and any filesystem error leaves command execution fail-open.
 */
export function syncBundledProjectSkillsIfMissing(
	projectDirectory: string,
	packageRoot: string,
	quiet = false,
): void {
	try {
		const sourceRoot = path.join(packageRoot, '.opencode', 'skills');
		const opencodeDir = path.join(projectDirectory, '.opencode');
		const skillsDir = path.join(opencodeDir, 'skills');

		if (!ensureNotSymlinkedDirectory(opencodeDir)) return;
		if (!ensureNotSymlinkedDirectory(skillsDir)) return;

		for (const slug of BUNDLED_PROJECT_SKILLS) {
			const sourceDir = path.join(sourceRoot, slug);
			const sourceSkill = path.join(sourceDir, 'SKILL.md');
			const destDir = path.join(skillsDir, slug);
			const destSkill = path.join(destDir, 'SKILL.md');

			if (!fs.existsSync(sourceSkill)) continue;
			if (fs.existsSync(destSkill)) continue;
			if (!ensureNotSymlinkedDirectory(destDir)) continue;

			copyBundledDirectoryBounded(sourceDir, destDir, { files: 0, bytes: 0 });
			if (!quiet) {
				console.warn(
					`[opencode-swarm] Installed bundled skill .opencode/skills/${slug}/SKILL.md for first-class /swarm command support`,
				);
			}
		}
	} catch {
		// Non-fatal: plugin init and command registration must remain fail-open.
	}
}
