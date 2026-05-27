/**
 * Regression coverage for mirrored on-demand skills.
 */

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIRRORED_ARCHITECT_MODE_SKILLS = [
	['plan', '.opencode/skills/plan/SKILL.md', '.claude/skills/plan/SKILL.md'],
	[
		'execute',
		'.opencode/skills/execute/SKILL.md',
		'.claude/skills/execute/SKILL.md',
	],
] as const;

describe('architect mode skill mirrors - regression: prevent mirror drift (F-001)', () => {
	for (const [
		skillName,
		opencodePath,
		claudePath,
	] of MIRRORED_ARCHITECT_MODE_SKILLS) {
		it(`${skillName} skill stays byte-identical across OpenCode and Claude mirrors`, () => {
			// Future protocol edits must update both mirrors together; otherwise
			// OpenCode and Claude sessions can diverge silently.
			const opencodeSkill = readFileSync(
				join(process.cwd(), opencodePath),
				'utf-8',
			);
			const claudeSkill = readFileSync(
				join(process.cwd(), claudePath),
				'utf-8',
			);

			expect(claudeSkill).toBe(opencodeSkill);
		});
	}
});
