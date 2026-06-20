/**
 * Verification tests for scoped-funnel protocol in specify, brainstorm, and issue-ingest skills.
 *
 * Validates that all abbreviated funnel summaries in these skills contain:
 * 1. All five classification categories
 * 2. Overconfidence guard
 * 3. Always-surface protection with UNNECESSARY/DROP override
 * 4. SoundingBoardVerdict mapping reference
 * 5. Assumptions recording requirement
 */

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SKILLS_TO_TEST = ['specify', 'brainstorm', 'issue-ingest'];

describe('Scoped Funnel Protocol Verification (specify, brainstorm, issue-ingest)', () => {
	for (const skillSlug of SKILLS_TO_TEST) {
		describe(`${skillSlug} skill`, () => {
			const skillPath = join(
				process.cwd(),
				'.opencode/skills',
				skillSlug,
				'SKILL.md',
			);
			const content = readFileSync(skillPath, 'utf-8');

			it('file exists and is readable', () => {
				expect(content).toBeDefined();
				expect(content.length).toBeGreaterThan(0);
			});

			it('contains reference to clarification funnel', () => {
				expect(content).toContain('clarification funnel');
			});

			it('contains all five classification categories', () => {
				const categories = [
					'self_resolved',
					'critic_resolved',
					'research_needed',
					'user_decision',
					'deferred_nonblocking',
				];
				for (const category of categories) {
					expect(
						content,
						`${skillSlug} missing classification category: ${category}`,
					).toContain(category);
				}
			});

			it('contains overconfidence guard reference', () => {
				expect(
					content,
					`${skillSlug} missing overconfidence guard`,
				).toContain('Overconfidence guard');
			});

			it('contains always-surface protection requirement', () => {
				expect(
					content,
					`${skillSlug} missing always-surface protection`,
				).toContain('always-surface');
			});

			it('contains UNNECESSARY/DROP override language', () => {
				expect(
					content,
					`${skillSlug} missing UNNECESSARY/DROP override`,
				).toMatch(/UNNECESSARY.*DROP|UNNECESSARY[^\n]*DROP/);
			});

			it('contains SoundingBoardVerdict reference', () => {
				expect(
					content,
					`${skillSlug} missing SoundingBoardVerdict`,
				).toContain('SoundingBoardVerdict');
			});

			it('contains assumptions recording requirement', () => {
				expect(
					content,
					`${skillSlug} missing assumptions recording requirement`,
				).toMatch(/assumptions|recorded/i);
			});

			it('explicitly mentions the four funnel outcomes (UNNECESSARY/DROP, RESOLVE, REPHRASE, APPROVED/ASK_USER)', () => {
				expect(
					content,
					`${skillSlug} missing UNNECESSARY`,
				).toContain('UNNECESSARY');
				expect(
					content,
					`${skillSlug} missing DROP`,
				).toContain('DROP');
				expect(
					content,
					`${skillSlug} missing RESOLVE`,
				).toContain('RESOLVE');
				expect(
					content,
					`${skillSlug} missing REPHRASE`,
				).toContain('REPHRASE');
				expect(
					content,
					`${skillSlug} missing APPROVED`,
				).toContain('APPROVED');
				expect(
					content,
					`${skillSlug} missing ASK_USER`,
				).toContain('ASK_USER');
			});
		});
	}
});
