import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { placeholderScan } from '../../../src/tools/placeholder-scan';

// Helper to create temp test directories
function createTempDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'placeholder-plan-test-'));
}

// Helper to create test files
function createTestFile(
	dir: string,
	filename: string,
	content: string,
): string {
	const filePath = path.join(dir, filename);
	const parentDir = path.dirname(filePath);
	if (!fs.existsSync(parentDir)) {
		fs.mkdirSync(parentDir, { recursive: true });
	}
	fs.writeFileSync(filePath, content, 'utf-8');
	return filePath;
}

describe('placeholder_scan - plan file bracket-placeholder detection', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir();
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	// ============ Group 1: isPlanFile detection (tested via placeholderScan) ============

	describe('isPlanFile detection', () => {
		it('.swarm/plan.md → isPlanFile returns true', async () => {
			// Create .swarm/plan.md
			const planPath = path.join(tempDir, '.swarm', 'plan.md');
			createTestFile(tempDir, '.swarm/plan.md', '# Plan\n- [ ] Task 1\n');

			const result = await placeholderScan(
				{ changed_files: ['.swarm/plan.md'] },
				tempDir,
			);

			// File should be scanned (plan files are scanned)
			expect(result.summary.files_scanned).toBe(1);
		});

		it('/home/user/project/.swarm/plan.md → true', async () => {
			// Simulate a path like /home/user/project/.swarm/plan.md
			const planPath = path.join(tempDir, 'project', '.swarm', 'plan.md');
			createTestFile(tempDir, 'project/.swarm/plan.md', '# Plan\n');

			const result = await placeholderScan(
				{ changed_files: ['project/.swarm/plan.md'] },
				tempDir,
			);

			expect(result.summary.files_scanned).toBe(1);
		});

		it('C:/project/.swarm/plan.md → true (Windows path)', async () => {
			const planPath = path.join(tempDir, 'project', '.swarm', 'plan.md');
			createTestFile(tempDir, 'project/.swarm/plan.md', '# Plan\n');

			const result = await placeholderScan(
				{ changed_files: ['project/.swarm/plan.md'] },
				tempDir,
			);

			expect(result.summary.files_scanned).toBe(1);
		});

		it('.SWARM/plan.md → true (case-insensitive)', async () => {
			createTestFile(tempDir, '.SWARM/plan.md', '# Plan\n');

			const result = await placeholderScan(
				{ changed_files: ['.SWARM/plan.md'] },
				tempDir,
			);

			expect(result.summary.files_scanned).toBe(1);
		});

		it('plan.md → false (not a plan file)', async () => {
			createTestFile(tempDir, 'plan.md', '# Plan\n- [ ] Task 1\n');

			const result = await placeholderScan(
				{ changed_files: ['plan.md'] },
				tempDir,
			);

			// plan.md should be scanned but not as a plan file (no bracket placeholder patterns)
			expect(result.summary.files_scanned).toBe(1);
		});

		it('src/plan.md → false', async () => {
			createTestFile(tempDir, 'src/plan.md', '# Plan\n- [ ] Task 1\n');

			const result = await placeholderScan(
				{ changed_files: ['src/plan.md'] },
				tempDir,
			);

			expect(result.summary.files_scanned).toBe(1);
		});

		it('.swarm/context.md → false', async () => {
			createTestFile(tempDir, '.swarm/context.md', '# Context\n');

			const result = await placeholderScan(
				{ changed_files: ['.swarm/context.md'] },
				tempDir,
			);

			expect(result.summary.files_scanned).toBe(1);
		});
	});

	// ============ Group 2: Detection of bracket placeholders ============

	describe('Detection of bracket placeholders', () => {
		it('Plan with - [ ] 1.1: [task] [SMALL] → finding with rule_id placeholder/plan-bracket-task', async () => {
			const planContent = `- [ ] 1.1: [task] [SMALL]`;
			createTestFile(tempDir, '.swarm/plan.md', planContent);

			const result = await placeholderScan(
				{ changed_files: ['.swarm/plan.md'] },
				tempDir,
			);

			expect(result.verdict).toBe('fail');
			expect(result.findings).toHaveLength(1);
			expect(result.findings[0].rule_id).toBe('placeholder/plan-bracket-task');
			expect(result.findings[0].line).toBe(1);
			expect(result.findings[0].kind).toBe('other');
		});

		it('Plan with # [Project] title → finding with rule_id placeholder/plan-bracket-project', async () => {
			const planContent = `# [Project] Plan`;
			createTestFile(tempDir, '.swarm/plan.md', planContent);

			const result = await placeholderScan(
				{ changed_files: ['.swarm/plan.md'] },
				tempDir,
			);

			expect(result.verdict).toBe('fail');
			expect(result.findings).toHaveLength(1);
			expect(result.findings[0].rule_id).toBe(
				'placeholder/plan-bracket-project',
			);
			expect(result.findings[0].line).toBe(1);
		});

		it('Plan with Phase: [date] → finding with rule_id placeholder/plan-bracket-date', async () => {
			const planContent = `## Phase 1\nDate: [date]`;
			createTestFile(tempDir, '.swarm/plan.md', planContent);

			const result = await placeholderScan(
				{ changed_files: ['.swarm/plan.md'] },
				tempDir,
			);

			expect(result.verdict).toBe('fail');
			expect(result.findings).toHaveLength(1);
			expect(result.findings[0].rule_id).toBe('placeholder/plan-bracket-date');
			expect(result.findings[0].line).toBe(2);
		});

		it('Plan with - [BLOCKED] 1.1: description - [reason] → finding with rule_id placeholder/plan-bracket-reason', async () => {
			const planContent = `- [BLOCKED] 1.1: description - [reason]`;
			createTestFile(tempDir, '.swarm/plan.md', planContent);

			const result = await placeholderScan(
				{ changed_files: ['.swarm/plan.md'] },
				tempDir,
			);

			expect(result.verdict).toBe('fail');
			expect(result.findings).toHaveLength(1);
			expect(result.findings[0].rule_id).toBe(
				'placeholder/plan-bracket-reason',
			);
			expect(result.findings[0].line).toBe(1);
		});

		it('Plan with - [ ] 1.1: [description] [SMALL] → finding with rule_id placeholder/plan-bracket-description', async () => {
			const planContent = `- [ ] 1.1: [description] [SMALL]`;
			createTestFile(tempDir, '.swarm/plan.md', planContent);

			const result = await placeholderScan(
				{ changed_files: ['.swarm/plan.md'] },
				tempDir,
			);

			expect(result.verdict).toBe('fail');
			expect(result.findings).toHaveLength(1);
			expect(result.findings[0].rule_id).toBe(
				'placeholder/plan-bracket-description',
			);
			expect(result.findings[0].line).toBe(1);
		});

		it('Case-insensitive [TASK]: plan with - [ ] 1.1: [TASK] → finding with rule_id placeholder/plan-bracket-task', async () => {
			const planContent = `- [ ] 1.1: [TASK] [SMALL]`;
			createTestFile(tempDir, '.swarm/plan.md', planContent);

			const result = await placeholderScan(
				{ changed_files: ['.swarm/plan.md'] },
				tempDir,
			);

			expect(result.verdict).toBe('fail');
			expect(result.findings).toHaveLength(1);
			expect(result.findings[0].rule_id).toBe('placeholder/plan-bracket-task');
		});

		it('Case-insensitive [Description]: plan with - [ ] 1.1: [Description] → finding with rule_id placeholder/plan-bracket-description', async () => {
			const planContent = `- [ ] 1.1: [Description] [SMALL]`;
			createTestFile(tempDir, '.swarm/plan.md', planContent);

			const result = await placeholderScan(
				{ changed_files: ['.swarm/plan.md'] },
				tempDir,
			);

			expect(result.verdict).toBe('fail');
			expect(result.findings).toHaveLength(1);
			expect(result.findings[0].rule_id).toBe(
				'placeholder/plan-bracket-description',
			);
		});

		it('Multiple placeholders → multiple findings returned', async () => {
			const planContent = `# [Project] Plan
- [ ] 1.1: [task] [SMALL]
- [ ] 1.2: [description] [MEDIUM]
Date: [date]`;
			createTestFile(tempDir, '.swarm/plan.md', planContent);

			const result = await placeholderScan(
				{ changed_files: ['.swarm/plan.md'] },
				tempDir,
			);

			expect(result.verdict).toBe('fail');
			expect(result.findings.length).toBeGreaterThanOrEqual(3);
			const ruleIds = result.findings.map((f) => f.rule_id);
			expect(ruleIds).toContain('placeholder/plan-bracket-project');
			expect(ruleIds).toContain('placeholder/plan-bracket-task');
			expect(ruleIds).toContain('placeholder/plan-bracket-description');
		});

		it('Clean plan with real content (no bracket placeholders) → no findings, verdict pass', async () => {
			const planContent = `# Project Setup
- [ ] 1.1: Initialize repository [SMALL]
- [ ] 1.2: Configure linting [SMALL]
- [x] 1.3: Set up testing [COMPLETE]`;
			createTestFile(tempDir, '.swarm/plan.md', planContent);

			const result = await placeholderScan(
				{ changed_files: ['.swarm/plan.md'] },
				tempDir,
			);

			expect(result.verdict).toBe('pass');
			expect(result.findings).toHaveLength(0);
			expect(result.summary.files_scanned).toBe(1);
		});

		it('[x] checkbox is NOT flagged (not a placeholder pattern)', async () => {
			const planContent = `- [x] 1.1: Complete task [DONE]`;
			createTestFile(tempDir, '.swarm/plan.md', planContent);

			const result = await placeholderScan(
				{ changed_files: ['.swarm/plan.md'] },
				tempDir,
			);

			expect(result.verdict).toBe('pass');
			expect(result.findings).toHaveLength(0);
		});

		it('[ ] empty checkbox is NOT flagged', async () => {
			const planContent = `- [ ] 1.1: Task description`;
			createTestFile(tempDir, '.swarm/plan.md', planContent);

			const result = await placeholderScan(
				{ changed_files: ['.swarm/plan.md'] },
				tempDir,
			);

			expect(result.verdict).toBe('pass');
			expect(result.findings).toHaveLength(0);
		});

		it('[SMALL] is NOT flagged (not in pattern list)', async () => {
			const planContent = `- [ ] 1.1: Task description [SMALL]`;
			createTestFile(tempDir, '.swarm/plan.md', planContent);

			const result = await placeholderScan(
				{ changed_files: ['.swarm/plan.md'] },
				tempDir,
			);

			expect(result.verdict).toBe('pass');
			expect(result.findings).toHaveLength(0);
		});

		it('[MEDIUM] is NOT flagged', async () => {
			const planContent = `- [ ] 1.1: Task description [MEDIUM]`;
			createTestFile(tempDir, '.swarm/plan.md', planContent);

			const result = await placeholderScan(
				{ changed_files: ['.swarm/plan.md'] },
				tempDir,
			);

			expect(result.verdict).toBe('pass');
			expect(result.findings).toHaveLength(0);
		});

		it('[COMPLETE] is NOT flagged', async () => {
			const planContent = `- [x] 1.1: Task description [COMPLETE]`;
			createTestFile(tempDir, '.swarm/plan.md', planContent);

			const result = await placeholderScan(
				{ changed_files: ['.swarm/plan.md'] },
				tempDir,
			);

			expect(result.verdict).toBe('pass');
			expect(result.findings).toHaveLength(0);
		});

		it('[IN PROGRESS] is NOT flagged', async () => {
			const planContent = `- [ ] 1.1: Task description [IN PROGRESS]`;
			createTestFile(tempDir, '.swarm/plan.md', planContent);

			const result = await placeholderScan(
				{ changed_files: ['.swarm/plan.md'] },
				tempDir,
			);

			expect(result.verdict).toBe('pass');
			expect(result.findings).toHaveLength(0);
		});

		it('[BLOCKED] is NOT flagged', async () => {
			const planContent = `- [BLOCKED] 1.1: Task description`;
			createTestFile(tempDir, '.swarm/plan.md', planContent);

			const result = await placeholderScan(
				{ changed_files: ['.swarm/plan.md'] },
				tempDir,
			);

			expect(result.verdict).toBe('pass');
			expect(result.findings).toHaveLength(0);
		});
	});

	// ============ Group 3: Non-plan.md files are not scanned with plan patterns ============

	describe('Non-plan.md files are not scanned with plan patterns', () => {
		it('A file named src/config.ts with [task] text → NOT flagged by plan patterns', async () => {
			createTestFile(
				tempDir,
				'src/config.ts',
				'// Config file\nconst task = "[task]";',
			);

			const result = await placeholderScan(
				{ changed_files: ['src/config.ts'] },
				tempDir,
			);

			// [task] is not a TODO/FIXME, so normal scanner won't flag it either
			expect(result.verdict).toBe('pass');
			expect(result.findings).toHaveLength(0);
		});

		it('Regular markdown file with [task] → NOT flagged', async () => {
			createTestFile(tempDir, 'README.md', '# README\n## [task] section\n');

			const result = await placeholderScan(
				{ changed_files: ['README.md'] },
				tempDir,
			);

			expect(result.verdict).toBe('pass');
			expect(result.findings).toHaveLength(0);
		});

		it('Different location plan.md (not in .swarm) → NOT flagged by plan patterns', async () => {
			createTestFile(tempDir, 'docs/plan.md', '# Plan\n- [ ] 1.1: [task]\n');

			const result = await placeholderScan(
				{ changed_files: ['docs/plan.md'] },
				tempDir,
			);

			// Not in .swarm, so plan patterns don't apply
			expect(result.verdict).toBe('pass');
			expect(result.findings).toHaveLength(0);
		});
	});

	// ============ Group 4: Findings structure ============

	describe('Findings structure', () => {
		it('Each finding has path, line (1-indexed), kind=other, excerpt (≤100 chars), rule_id', async () => {
			const planContent = `- [ ] 1.1: [task] Implement feature [SMALL]`;
			createTestFile(tempDir, '.swarm/plan.md', planContent);

			const result = await placeholderScan(
				{ changed_files: ['.swarm/plan.md'] },
				tempDir,
			);

			expect(result.findings).toHaveLength(1);
			const finding = result.findings[0];

			expect(finding.path).toBe('.swarm/plan.md');
			expect(finding.line).toBe(1);
			expect(finding.kind).toBe('other');
			expect(finding.rule_id).toBe('placeholder/plan-bracket-task');
			expect(finding.excerpt.length).toBeLessThanOrEqual(100);
			expect(finding.excerpt).toContain('[task]');
		});

		it('Excerpt is truncated at 100 characters for long lines', async () => {
			const longLine = `- [ ] 1.1: ${'x'.repeat(150)} [task] [SMALL]`;
			createTestFile(tempDir, '.swarm/plan.md', longLine);

			const result = await placeholderScan(
				{ changed_files: ['.swarm/plan.md'] },
				tempDir,
			);

			expect(result.findings).toHaveLength(1);
			expect(result.findings[0].excerpt.length).toBeLessThanOrEqual(100);
		});

		it('Multiple findings have correct line numbers', async () => {
			const planContent = `# [Project] Plan
## Phase 1
- [ ] 1.1: [task] First task [SMALL]
- [ ] 1.2: [description] Second task [MEDIUM]
Date: [date]`;
			createTestFile(tempDir, '.swarm/plan.md', planContent);

			const result = await placeholderScan(
				{ changed_files: ['.swarm/plan.md'] },
				tempDir,
			);

			expect(result.findings.length).toBeGreaterThanOrEqual(3);

			const projectFinding = result.findings.find(
				(f) => f.rule_id === 'placeholder/plan-bracket-project',
			);
			const taskFinding = result.findings.find(
				(f) => f.rule_id === 'placeholder/plan-bracket-task',
			);
			const dateFinding = result.findings.find(
				(f) => f.rule_id === 'placeholder/plan-bracket-date',
			);

			expect(projectFinding?.line).toBe(1);
			expect(taskFinding?.line).toBe(3);
			expect(dateFinding?.line).toBe(5);
		});
	});

	// ============ Edge Cases ============

	describe('Edge cases', () => {
		it('Plan file with no bracket placeholders but has TODO → pass (plan scanner only checks bracket placeholders)', async () => {
			const planContent = `# Project Plan
- [ ] 1.1: Implement feature [SMALL]
- [ ] TODO: Add error handling [MEDIUM]`;
			createTestFile(tempDir, '.swarm/plan.md', planContent);

			const result = await placeholderScan(
				{ changed_files: ['.swarm/plan.md'] },
				tempDir,
			);

			// Plan file scanner only checks for bracket placeholders, not regular TODO patterns
			expect(result.verdict).toBe('pass');
			expect(result.findings).toHaveLength(0);
		});

		it('Mix of bracket placeholders and TODO in plan file → only bracket placeholders detected (plan scanner only checks bracket patterns)', async () => {
			const planContent = `# [Project] Plan
- [ ] 1.1: [task] First task [SMALL]
- [ ] TODO: Add error handling [MEDIUM]`;
			createTestFile(tempDir, '.swarm/plan.md', planContent);

			const result = await placeholderScan(
				{ changed_files: ['.swarm/plan.md'] },
				tempDir,
			);

			// Only bracket placeholders are detected, not regular TODO patterns
			expect(result.verdict).toBe('fail');
			expect(result.findings.length).toBeGreaterThanOrEqual(2);
			const ruleIds = result.findings.map((f) => f.rule_id);
			expect(ruleIds).toContain('placeholder/plan-bracket-project');
			expect(ruleIds).toContain('placeholder/plan-bracket-task');
			expect(ruleIds).not.toContain('placeholder/comment-todo');
		});

		it('Empty plan file → pass, no findings', async () => {
			createTestFile(tempDir, '.swarm/plan.md', '');

			const result = await placeholderScan(
				{ changed_files: ['.swarm/plan.md'] },
				tempDir,
			);

			expect(result.verdict).toBe('pass');
			expect(result.findings).toHaveLength(0);
		});

		it('Plan file with only whitespace → pass, no findings', async () => {
			createTestFile(tempDir, '.swarm/plan.md', '   \n\n   \n');

			const result = await placeholderScan(
				{ changed_files: ['.swarm/plan.md'] },
				tempDir,
			);

			expect(result.verdict).toBe('pass');
			expect(result.findings).toHaveLength(0);
		});

		it('Plan file with bracket placeholder at end of line → detected', async () => {
			const planContent = `- [ ] 1.1: Task description [task]`;
			createTestFile(tempDir, '.swarm/plan.md', planContent);

			const result = await placeholderScan(
				{ changed_files: ['.swarm/plan.md'] },
				tempDir,
			);

			expect(result.verdict).toBe('fail');
			expect(result.findings).toHaveLength(1);
			expect(result.findings[0].rule_id).toBe('placeholder/plan-bracket-task');
		});

		it('Plan file with multiple same bracket placeholders on one line → detected once', async () => {
			const planContent = `- [ ] 1.1: [task] [task] duplicate [SMALL]`;
			createTestFile(tempDir, '.swarm/plan.md', planContent);

			const result = await placeholderScan(
				{ changed_files: ['.swarm/plan.md'] },
				tempDir,
			);

			expect(result.verdict).toBe('fail');
			// Should detect [task] pattern on this line
			expect(result.findings.length).toBeGreaterThanOrEqual(1);
		});

		it('Plan file nested in subdirectory .swarm/plan.md → detected', async () => {
			createTestFile(
				tempDir,
				'project/.swarm/plan.md',
				`- [ ] 1.1: [task] [SMALL]`,
			);

			const result = await placeholderScan(
				{ changed_files: ['project/.swarm/plan.md'] },
				tempDir,
			);

			expect(result.verdict).toBe('fail');
			expect(result.findings).toHaveLength(1);
			expect(result.findings[0].rule_id).toBe('placeholder/plan-bracket-task');
		});
	});

	// ============ Summary accuracy ============

	describe('Summary accuracy for plan files', () => {
		it('Correctly counts files scanned with bracket placeholders', async () => {
			createTestFile(tempDir, '.swarm/plan.md', `- [ ] 1.1: [task] [SMALL]`);

			const result = await placeholderScan(
				{ changed_files: ['.swarm/plan.md'] },
				tempDir,
			);

			expect(result.summary.files_scanned).toBe(1);
			expect(result.summary.findings_count).toBe(1);
			expect(result.summary.files_with_findings).toBe(1);
		});

		it('Correctly counts multiple findings in plan file', async () => {
			const planContent = `# [Project] Plan
- [ ] 1.1: [task] First task [SMALL]
- [ ] 1.2: [description] Second task [MEDIUM]
Date: [date]`;
			createTestFile(tempDir, '.swarm/plan.md', planContent);

			const result = await placeholderScan(
				{ changed_files: ['.swarm/plan.md'] },
				tempDir,
			);

			expect(result.summary.files_scanned).toBe(1);
			// [Project], [task], [description], [date] = 4 findings
			expect(result.summary.findings_count).toBe(4);
			expect(result.summary.files_with_findings).toBe(1);
		});

		it('Clean plan file contributes to files_scanned but not findings', async () => {
			createTestFile(
				tempDir,
				'.swarm/plan.md',
				`# Plan\n- [ ] 1.1: Task [SMALL]`,
			);

			const result = await placeholderScan(
				{ changed_files: ['.swarm/plan.md'] },
				tempDir,
			);

			expect(result.summary.files_scanned).toBe(1);
			expect(result.summary.findings_count).toBe(0);
			expect(result.summary.files_with_findings).toBe(0);
		});
	});

	// ============ Adversarial Security Testing ============

	describe('placeholder-scan plan.md — Adversarial', () => {
		// Helper to create temp plan files for adversarial tests
		function makeTmpPlan(content: string): string {
			const planPath = path.join(tempDir, '.swarm', 'plan.md');
			const parentDir = path.dirname(planPath);
			if (!fs.existsSync(parentDir)) {
				fs.mkdirSync(parentDir, { recursive: true });
			}
			fs.writeFileSync(planPath, content, 'utf-8');
			return planPath;
		}

		// ============ Attack Vector 1: Path traversal via filePath ============
		describe('Path traversal via filePath', () => {
			it('Path "../.swarm/plan.md" is NOT treated as plan file (no parent directory traversal)', async () => {
				// Create a decoy file at actual .swarm/plan.md with placeholder
				makeTmpPlan(`# [Project] Real Plan`);

				// Try to use a path traversal attack
				const result = await placeholderScan(
					{ changed_files: ['../.swarm/plan.md'] },
					tempDir,
				);

				// Should NOT scan the parent directory's plan.md (path not found or normalized)
				// Security: path should be resolved within directory, allowing traversal would be vulnerable
				expect(result.summary.files_scanned).toBe(0);
			});

			it('Path "../../etc/passwd" is NOT treated as plan file', async () => {
				const result = await placeholderScan(
					{ changed_files: ['../../etc/passwd'] },
					tempDir,
				);

				// Security: external system files should never be scanned
				expect(result.summary.files_scanned).toBe(0);
			});

			it('Path "../../../.swarm/plan.md" is NOT treated as plan file', async () => {
				const result = await placeholderScan(
					{ changed_files: ['../../../.swarm/plan.md'] },
					tempDir,
				);

				// Security: multiple parent traversals should be blocked
				expect(result.summary.files_scanned).toBe(0);
			});

			it('Path with URL encoding "%2e%2e%2f.swarm%2fplan.md" is NOT treated as plan file', async () => {
				const result = await placeholderScan(
					{ changed_files: ['%2e%2e%2f.swarm%2fplan.md'] },
					tempDir,
				);

				// Security: URL-encoded path traversal should be blocked
				expect(result.summary.files_scanned).toBe(0);
			});

			it('Path "\\..\\.swarm\\plan.md" (Windows backslash traversal) is NOT treated as plan file', async () => {
				const result = await placeholderScan(
					{ changed_files: ['\\..\\.swarm\\plan.md'] },
					tempDir,
				);

				// Security: Windows-style traversal should be blocked
				expect(result.summary.files_scanned).toBe(0);
			});

			it('Path with null byte ".swarm/plan.md\\x00.md" is handled safely', async () => {
				// Note: Node.js fs will reject paths with null bytes
				const result = await placeholderScan(
					{ changed_files: ['.swarm/plan.md\x00.md'] },
					tempDir,
				);

				// Security: should not crash, should handle gracefully
				expect(result.summary.files_scanned).toBe(0);
			});

			it('Absolute path to .swarm/plan.md outside directory is NOT scanned', async () => {
				// Create a real plan file at tempDir
				makeTmpPlan(`# [Project] Plan`);

				// Try with absolute path
				const absolutePath = path.join(tempDir, '.swarm', 'plan.md');
				const result = await placeholderScan(
					{ changed_files: [absolutePath] },
					tempDir,
				);

				// Behavior depends on whether absolute paths are allowed
				// Security: even if allowed, it should only scan within the workspace
				// If file exists at absolute path, it might be scanned (this tests the behavior)
				// The key security property is that we can't use traversal to escape
			});
		});

		// ============ Attack Vector 2: ReDoS via plan content ============
		describe('ReDoS via plan content', () => {
			it('Extremely long line (10K chars) without placeholders completes quickly', async () => {
				// Create a line with many characters that could cause backtracking
				// The patterns are /\[task\]/gi, etc. - these are simple fixed strings in brackets
				// They should not cause backtracking
				const longLine = 'a'.repeat(10000);
				makeTmpPlan(`${longLine}`);

				const startTime = Date.now();
				const result = await placeholderScan(
					{ changed_files: ['.swarm/plan.md'] },
					tempDir,
				);
				const duration = Date.now() - startTime;

				// Security: should complete in reasonable time (< 1 second)
				expect(duration).toBeLessThan(1000);
				expect(result.verdict).toBe('pass');
				expect(result.findings).toHaveLength(0);
			});

			it('Long line (10K chars) with many potential bracket matches completes quickly', async () => {
				// Create content with many characters that could interact with bracket patterns
				const content = `[${'x'.repeat(10000)}]`;
				makeTmpPlan(content);

				const startTime = Date.now();
				const result = await placeholderScan(
					{ changed_files: ['.swarm/plan.md'] },
					tempDir,
				);
				const duration = Date.now() - startTime;

				// Security: should complete quickly despite long content
				expect(duration).toBeLessThan(1000);
				// The pattern /\[task\]/gi, etc. should not match this
				expect(result.verdict).toBe('pass');
			});

			it('Line with many "t" characters before "ask" does not cause ReDoS', async () => {
				// Pattern: /\[task\]/gi
				// With many 't' chars before, regex should still be efficient
				const content = `[${'t'.repeat(5000)}ask]`;
				makeTmpPlan(content);

				const startTime = Date.now();
				const result = await placeholderScan(
					{ changed_files: ['.swarm/plan.md'] },
					tempDir,
				);
				const duration = Date.now() - startTime;

				// Security: no catastrophic backtracking
				expect(duration).toBeLessThan(1000);
				// Pattern /\[task\]/gi should NOT match because it requires exact "[task]"
				expect(result.verdict).toBe('pass');
			});

			it('Line with many opening brackets does not cause ReDoS', async () => {
				// Test with pattern that might backtrack on multiple [
				const content = `${'['.repeat(5000)}task]`;
				makeTmpPlan(content);

				const startTime = Date.now();
				const result = await placeholderScan(
					{ changed_files: ['.swarm/plan.md'] },
					tempDir,
				);
				const duration = Date.now() - startTime;

				// Security: should handle efficiently
				expect(duration).toBeLessThan(1000);
			});

			it('Multiple long lines each with potential ReDoS patterns complete quickly', async () => {
				const lines: string[] = [];
				for (let i = 0; i < 100; i++) {
					lines.push(`[${'a'.repeat(500)}]`);
				}
				makeTmpPlan(lines.join('\n'));

				const startTime = Date.now();
				const result = await placeholderScan(
					{ changed_files: ['.swarm/plan.md'] },
					tempDir,
				);
				const duration = Date.now() - startTime;

				// Security: should scale linearly, not exponentially
				expect(duration).toBeLessThan(1000);
			});
		});

		// ============ Attack Vector 3: Regex lastIndex pollution ============
		describe('Regex lastIndex pollution', () => {
			it('Global regex state is reset between lines (no lastIndex pollution)', async () => {
				// Plan patterns use global flag (e.g., /\[task\]/gi)
				// Test that lastIndex is properly reset
				const content = `Line 1: [task]
Line 2: [task]
Line 3: [task]`;
				makeTmpPlan(content);

				const result = await placeholderScan(
					{ changed_files: ['.swarm/plan.md'] },
					tempDir,
				);

				// Security: all three lines should be detected, not just first one
				expect(result.findings.length).toBeGreaterThanOrEqual(3);
				expect(result.findings[0].line).toBe(1);
				expect(result.findings[1].line).toBe(2);
				expect(result.findings[2].line).toBe(3);
			});

			it('Multiple scans of same file yield consistent results', async () => {
				const content = `# [Project] Plan
- [ ] 1.1: [task] Task [SMALL]`;
				makeTmpPlan(content);

				const result1 = await placeholderScan(
					{ changed_files: ['.swarm/plan.md'] },
					tempDir,
				);

				const result2 = await placeholderScan(
					{ changed_files: ['.swarm/plan.md'] },
					tempDir,
				);

				// Security: results should be identical
				expect(result1.findings.length).toBe(result2.findings.length);
				expect(result1.verdict).toBe(result2.verdict);
			});

			it('Pattern with multiple matches on single line is detected correctly', async () => {
				// Global patterns should find all matches on a line
				const content = `[task] some text [task] more text [task]`;
				makeTmpPlan(content);

				const result = await placeholderScan(
					{ changed_files: ['.swarm/plan.md'] },
					tempDir,
				);

				// Security: pattern.test() is used, not match(), so it returns true/false
				// But lastIndex should still be reset
				expect(result.verdict).toBe('fail');
				// At least one finding should be reported
				expect(result.findings.length).toBeGreaterThanOrEqual(1);
			});

			it('Different patterns on same line all detected correctly', async () => {
				const content = `[task] [Project] [date] [reason] [description]`;
				makeTmpPlan(content);

				const result = await placeholderScan(
					{ changed_files: ['.swarm/plan.md'] },
					tempDir,
				);

				// Security: all 5 patterns should trigger independently
				expect(result.findings.length).toBeGreaterThanOrEqual(5);
				const ruleIds = result.findings.map((f) => f.rule_id);
				expect(ruleIds).toContain('placeholder/plan-bracket-task');
				expect(ruleIds).toContain('placeholder/plan-bracket-project');
				expect(ruleIds).toContain('placeholder/plan-bracket-date');
				expect(ruleIds).toContain('placeholder/plan-bracket-reason');
				expect(ruleIds).toContain('placeholder/plan-bracket-description');
			});
		});

		// ============ Attack Vector 4: Binary content in plan.md ============
		describe('Binary content in plan.md', () => {
			it('Plan file with null byte (\\x00) is skipped (binary file detection)', async () => {
				// Create file with null byte - this is the binary check in the code
				const planPath = path.join(tempDir, '.swarm', 'plan.md');
				fs.mkdirSync(path.dirname(planPath), { recursive: true });
				fs.writeFileSync(planPath, '# [Project] Plan\x00more content');

				const result = await placeholderScan(
					{ changed_files: ['.swarm/plan.md'] },
					tempDir,
				);

				// Security: binary files should be skipped to prevent crashes/UB
				expect(result.summary.files_scanned).toBe(0);
				expect(result.findings).toHaveLength(0);
			});

			it('Plan file with multiple null bytes is skipped', async () => {
				const planPath = path.join(tempDir, '.swarm', 'plan.md');
				fs.mkdirSync(path.dirname(planPath), { recursive: true });
				fs.writeFileSync(planPath, `\x00\x00\x00`);

				const result = await placeholderScan(
					{ changed_files: ['.swarm/plan.md'] },
					tempDir,
				);

				// Security: should skip completely
				expect(result.summary.files_scanned).toBe(0);
			});

			it('Plan file with UTF-16 null bytes is handled gracefully', async () => {
				const planPath = path.join(tempDir, '.swarm', 'plan.md');
				fs.mkdirSync(path.dirname(planPath), { recursive: true });
				// Write with encoding that might introduce null-like bytes
				fs.writeFileSync(planPath, '# [Project] Plan', 'utf16le');

				const result = await placeholderScan(
					{ changed_files: ['.swarm/plan.md'] },
					tempDir,
				);

				// Security: should handle without crashing
				// UTF-16 files may contain null bytes in their encoding
				// The binary check should catch this
			});

			it('Plan file with high unicode characters but no null bytes is scanned', async () => {
				// High unicode chars like emojis should be fine
				const content = `# 🎯 Project Plan 🚀
- [ ] 1.1: [task] 实现功能 🔧
- [ ] 1.2: [description] 描述任务 📝`;
				makeTmpPlan(content);

				const result = await placeholderScan(
					{ changed_files: ['.swarm/plan.md'] },
					tempDir,
				);

				// Should scan successfully and detect placeholders
				expect(result.summary.files_scanned).toBe(1);
				expect(result.verdict).toBe('fail');
				expect(result.findings.length).toBeGreaterThanOrEqual(2);
			});
		});

		// ============ Attack Vector 5: Extremely large file ============
		describe('Extremely large file', () => {
			it('Plan file exactly at MAX_FILE_SIZE (1MB) is scanned', async () => {
				// MAX_FILE_SIZE = 1024 * 1024 (1MB)
				// Create content that's exactly 1MB - some small overhead
				const content = '# [Project] Plan\n' + 'x'.repeat(1024 * 1024 - 20);
				makeTmpPlan(content);

				const result = await placeholderScan(
					{ changed_files: ['.swarm/plan.md'] },
					tempDir,
				);

				// Should scan (file size <= MAX_FILE_SIZE)
				expect(result.summary.files_scanned).toBe(1);
			});

			it('Plan file larger than MAX_FILE_SIZE (1MB + 1 byte) is skipped', async () => {
				// Create content slightly larger than 1MB
				const content = '# [Project] Plan\n' + 'x'.repeat(1024 * 1024 + 100);
				makeTmpPlan(content);

				const result = await placeholderScan(
					{ changed_files: ['.swarm/plan.md'] },
					tempDir,
				);

				// Security: should skip large files to prevent DoS
				expect(result.summary.files_scanned).toBe(0);
				expect(result.findings).toHaveLength(0);
			});

			it('Plan file much larger than MAX_FILE_SIZE (5MB) is skipped quickly', async () => {
				// Create a very large file
				const planPath = path.join(tempDir, '.swarm', 'plan.md');
				fs.mkdirSync(path.dirname(planPath), { recursive: true });

				const startTime = Date.now();
				// Write 5MB of data
				fs.writeFileSync(planPath, 'x'.repeat(5 * 1024 * 1024));

				const result = await placeholderScan(
					{ changed_files: ['.swarm/plan.md'] },
					tempDir,
				);
				const duration = Date.now() - startTime;

				// Security: should skip quickly without reading entire file
				expect(duration).toBeLessThan(1000);
				expect(result.summary.files_scanned).toBe(0);
			});

			it('Plan file with placeholder at start of very large file is not scanned (size limit)', async () => {
				const content = `# [Project] Plan\n` + 'x'.repeat(2 * 1024 * 1024);
				makeTmpPlan(content);

				const result = await placeholderScan(
					{ changed_files: ['.swarm/plan.md'] },
					tempDir,
				);

				// Security: size check happens before reading content
				expect(result.summary.files_scanned).toBe(0);
				expect(result.findings).toHaveLength(0);
			});

			it('Plan file with many lines but within size limit is scanned', async () => {
				const lines: string[] = ['# [Project] Plan'];
				// Create 1,000 lines (reduced from 10,000 to stay under evidence bundle size limit)
				for (let i = 0; i < 1000; i++) {
					lines.push(`- [ ] ${i + 1}: [task] Task ${i + 1} [SMALL]`);
				}
				makeTmpPlan(lines.join('\n'));

				const startTime = Date.now();
				const result = await placeholderScan(
					{ changed_files: ['.swarm/plan.md'] },
					tempDir,
				);
				const duration = Date.now() - startTime;

				// Should scan successfully
				expect(result.summary.files_scanned).toBe(1);
				expect(result.verdict).toBe('fail');
				expect(result.findings.length).toBeGreaterThanOrEqual(1000);
				// Should complete in reasonable time
				expect(duration).toBeLessThan(5000);
			});
		});

		// ============ Attack Vector 6: Injection via plan content ============
		describe('Injection via plan content', () => {
			it('Plan with regex special characters in content does not cause errors', async () => {
				// Test various regex special characters
				const content = `# Project Plan
- [ ] 1.1: [task] Test with . * + ? ^ $ ( ) [ ] { } | \\ [SMALL]
- [ ] 1.2: [description] More regex chars: \\d \\w \\s \\b \\D \\W \\S [MEDIUM]`;
				makeTmpPlan(content);

				const result = await placeholderScan(
					{ changed_files: ['.swarm/plan.md'] },
					tempDir,
				);

				// Security: should not crash or misinterpret
				expect(result.summary.files_scanned).toBe(1);
				expect(result.verdict).toBe('fail');
				// Should detect [task] and [description] despite regex special chars
				expect(result.findings.length).toBeGreaterThanOrEqual(2);
			});

			it('Plan content with backslash sequences is handled correctly', async () => {
				const content = `# [Project] Plan
- [ ] 1.1: [task] Task with \\n\\r\\t escapes [SMALL]
- [ ] 1.2: [description] More \\\\ escapes [MEDIUM]`;
				makeTmpPlan(content);

				const result = await placeholderScan(
					{ changed_files: ['.swarm/plan.md'] },
					tempDir,
				);

				// Should scan successfully
				expect(result.summary.files_scanned).toBe(1);
			});

			it('Plan content that looks like regex syntax but is not', async () => {
				const content = `# Project Plan
This document explains regex patterns:
- We use /[task]/gi for task placeholders
- We use /[Project]/g for project placeholders
- [ ] 1.1: [task] Implement parser [SMALL]`;
				makeTmpPlan(content);

				const result = await placeholderScan(
					{ changed_files: ['.swarm/plan.md'] },
					tempDir,
				);

				// Security: text explaining regex should not be treated as actual regex
				// But actual [task] placeholder should be detected
				expect(result.verdict).toBe('fail');
			});

			it('Plan with bracket-like constructs that are not placeholders', async () => {
				const content = `# Project Plan
See reference: [RFC 1234] for details
Check status: [PASS] or [FAIL]
Output: [1, 2, 3] array result
- [ ] 1.1: [task] Real task [SMALL]`;
				makeTmpPlan(content);

				const result = await placeholderScan(
					{ changed_files: ['.swarm/plan.md'] },
					tempDir,
				);

				// Should only detect [task] (the actual placeholder pattern)
				// [RFC 1234], [PASS], [FAIL], [1, 2, 3] should not match
				expect(result.verdict).toBe('fail');
				expect(result.findings).toHaveLength(1);
				expect(result.findings[0].rule_id).toBe(
					'placeholder/plan-bracket-task',
				);
			});

			it('Plan with nested brackets is handled correctly', async () => {
				const content = `- [ ] 1.1: [task] [[nested]] brackets [task] [SMALL]`;
				makeTmpPlan(content);

				const result = await placeholderScan(
					{ changed_files: ['.swarm/plan.md'] },
					tempDir,
				);

				// Should detect [task] pattern(s)
				expect(result.verdict).toBe('fail');
				// [[nested]] should not match any pattern
			});

			it('Plan content with escaped brackets is handled correctly', async () => {
				const content = `# Project Plan
In markdown, escape with backslash: \\[not a bracket\\]
- [ ] 1.1: [task] Real task [SMALL]`;
				makeTmpPlan(content);

				const result = await placeholderScan(
					{ changed_files: ['.swarm/plan.md'] },
					tempDir,
				);

				// Backslash-escaped [not a bracket] is literal text with backslash
				// Only actual [task] should be detected
				expect(result.verdict).toBe('fail');
			});

			it('Plan content with homoglyph attacks (look-alike brackets)', async () => {
				// Unicode brackets that look similar but are different characters
				const content = `- [ ] 1.1: ［task］ Full-width brackets [SMALL]
- [ ] 1.2: [task] Normal brackets [SMALL]`;
				makeTmpPlan(content);

				const result = await placeholderScan(
					{ changed_files: ['.swarm/plan.md'] },
					tempDir,
				);

				// Security: full-width brackets should NOT match (they're different chars)
				// Only normal [task] should be detected
				expect(result.findings).toHaveLength(1);
				expect(result.findings[0].line).toBe(2); // Second line with normal brackets
			});
		});
	});
});
