import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { checkFileAuthority } from '../../../src/hooks/guardrails';

// Helper to check if result is a denial
function isDenied(
	result: ReturnType<typeof checkFileAuthority>,
): result is { allowed: false; reason: string } {
	return !result.allowed;
}

describe('guardrails-authority - File Authority Enforcement', () => {
	let tempDir: string;

	beforeEach(async () => {
		// Create a temporary directory for each test
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'authority-test-'));
	});

	afterEach(async () => {
		// Cleanup
		try {
			await fs.rm(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	describe('Architect blocked from .swarm/plan.md', () => {
		it('blocks architect from writing to .swarm/plan.md', () => {
			const result = checkFileAuthority('architect', '.swarm/plan.md', tempDir);
			expect(result.allowed).toBe(false);
			if (isDenied(result)) {
				expect(result.reason).toContain('Path blocked');
			}
		});

		it('blocks architect from writing to .swarm/plan.json', () => {
			const result = checkFileAuthority(
				'architect',
				'.swarm/plan.json',
				tempDir,
			);
			expect(result.allowed).toBe(false);
			if (isDenied(result)) {
				expect(result.reason).toContain('Path blocked');
			}
		});

		it('allows architect to write to src files', () => {
			const result = checkFileAuthority(
				'architect',
				'src/utils/helper.ts',
				tempDir,
			);
			// Architect has no allowedPrefixes so should be allowed
			// (blockedExact is checked, but src/ is not in blocked)
			expect(result.allowed).toBe(true);
		});
	});

	describe('Coder blocked from evidence/', () => {
		it('blocks coder from writing to .swarm/evidence/', () => {
			const result = checkFileAuthority(
				'coder',
				'.swarm/evidence/test.json',
				tempDir,
			);
			expect(result.allowed).toBe(false);
			if (isDenied(result)) {
				expect(result.reason).toContain('Path blocked');
			}
		});

		it('blocks coder from writing to .swarm/plan.md', () => {
			const result = checkFileAuthority('coder', '.swarm/plan.md', tempDir);
			expect(result.allowed).toBe(false);
			if (isDenied(result)) {
				expect(result.reason).toContain('Path blocked');
			}
		});

		it('blocks coder from writing to .swarm/config.json', () => {
			const result = checkFileAuthority('coder', '.swarm/config.json', tempDir);
			expect(result.allowed).toBe(false);
			if (isDenied(result)) {
				expect(result.reason).toContain('Path blocked');
			}
		});

		it('allows coder to write to src/', () => {
			const result = checkFileAuthority(
				'coder',
				'src/services/api.ts',
				tempDir,
			);
			expect(result.allowed).toBe(true);
		});

		it('allows coder to write to tests/', () => {
			const result = checkFileAuthority(
				'coder',
				'tests/unit/api.test.ts',
				tempDir,
			);
			expect(result.allowed).toBe(true);
		});

		it('allows coder to write to docs/', () => {
			const result = checkFileAuthority('coder', 'docs/api.md', tempDir);
			expect(result.allowed).toBe(true);
		});

		it('allows coder to write to scripts/', () => {
			const result = checkFileAuthority('coder', 'scripts/build.sh', tempDir);
			expect(result.allowed).toBe(true);
		});

		it('blocks coder from writing outside allowed paths', () => {
			const result = checkFileAuthority('coder', 'README.md', tempDir);
			expect(result.allowed).toBe(false);
			if (isDenied(result)) {
				expect(result.reason).toContain('not in allowed list');
			}
		});
	});

	describe('Reviewer allowed in evidence/', () => {
		it('allows reviewer to write to .swarm/evidence/', () => {
			const result = checkFileAuthority(
				'reviewer',
				'.swarm/evidence/test.json',
				tempDir,
			);
			expect(result.allowed).toBe(true);
		});

		it('allows reviewer to write to .swarm/outputs/', () => {
			const result = checkFileAuthority(
				'reviewer',
				'.swarm/outputs/report.md',
				tempDir,
			);
			expect(result.allowed).toBe(true);
		});

		it('blocks reviewer from writing to src/', () => {
			const result = checkFileAuthority('reviewer', 'src/utils.ts', tempDir);
			expect(result.allowed).toBe(false);
			if (isDenied(result)) {
				expect(result.reason).toContain('Path blocked');
			}
		});

		it('blocks reviewer from writing to .swarm/plan.md', () => {
			const result = checkFileAuthority('reviewer', '.swarm/plan.md', tempDir);
			expect(result.allowed).toBe(false);
			if (isDenied(result)) {
				expect(result.reason).toContain('Path blocked');
			}
		});
	});

	describe('Explorer read-only (no writes)', () => {
		it('blocks explorer from writing to any path', () => {
			const result = checkFileAuthority(
				'explorer',
				'any/path/file.ts',
				tempDir,
			);
			expect(result.allowed).toBe(false);
			if (isDenied(result)) {
				expect(result.reason).toContain('Path blocked');
			}
		});

		it('blocks explorer from writing to src/', () => {
			const result = checkFileAuthority('explorer', 'src/file.ts', tempDir);
			expect(result.allowed).toBe(false);
		});

		it('blocks explorer from writing to .swarm/', () => {
			const result = checkFileAuthority(
				'explorer',
				'.swarm/evidence/file.json',
				tempDir,
			);
			expect(result.allowed).toBe(false);
		});
	});

	describe('SME read-only (no writes)', () => {
		it('blocks sme from writing to any path', () => {
			const result = checkFileAuthority('sme', 'any/path/file.ts', tempDir);
			expect(result.allowed).toBe(false);
		});

		it('blocks sme from writing to docs/', () => {
			const result = checkFileAuthority('sme', 'docs/guide.md', tempDir);
			expect(result.allowed).toBe(false);
		});
	});

	describe('Test Engineer write scope', () => {
		it('allows test_engineer to write to tests/', () => {
			const result = checkFileAuthority(
				'test_engineer',
				'tests/unit/test.ts',
				tempDir,
			);
			expect(result.allowed).toBe(true);
		});

		it('allows test_engineer to write to .swarm/evidence/', () => {
			const result = checkFileAuthority(
				'test_engineer',
				'.swarm/evidence/test.json',
				tempDir,
			);
			expect(result.allowed).toBe(true);
		});

		it('blocks test_engineer from writing to src/', () => {
			const result = checkFileAuthority(
				'test_engineer',
				'src/file.ts',
				tempDir,
			);
			expect(result.allowed).toBe(false);
			if (isDenied(result)) {
				expect(result.reason).toContain('Path blocked');
			}
		});

		it('blocks test_engineer from writing to .swarm/plan.md', () => {
			const result = checkFileAuthority(
				'test_engineer',
				'.swarm/plan.md',
				tempDir,
			);
			expect(result.allowed).toBe(false);
		});
	});

	describe('Docs and Designer write scope', () => {
		it('allows docs to write to docs/', () => {
			const result = checkFileAuthority('docs', 'docs/guide.md', tempDir);
			expect(result.allowed).toBe(true);
		});

		it('allows docs to write to .swarm/outputs/', () => {
			const result = checkFileAuthority(
				'docs',
				'.swarm/outputs/file.md',
				tempDir,
			);
			expect(result.allowed).toBe(true);
		});

		it('blocks docs from writing to src/', () => {
			const result = checkFileAuthority('docs', 'src/file.ts', tempDir);
			expect(result.allowed).toBe(false);
		});

		it('allows designer to write to docs/', () => {
			const result = checkFileAuthority('designer', 'docs/design.md', tempDir);
			expect(result.allowed).toBe(true);
		});

		it('blocks designer from writing to src/', () => {
			const result = checkFileAuthority('designer', 'src/app.ts', tempDir);
			expect(result.allowed).toBe(false);
		});
	});

	describe('Critic write scope', () => {
		it('allows critic to write to .swarm/evidence/', () => {
			const result = checkFileAuthority(
				'critic',
				'.swarm/evidence/notes.txt',
				tempDir,
			);
			expect(result.allowed).toBe(true);
		});

		it('blocks critic from writing to src/', () => {
			const result = checkFileAuthority('critic', 'src/code.ts', tempDir);
			expect(result.allowed).toBe(false);
		});

		it('blocks critic from writing to .swarm/plan.md', () => {
			const result = checkFileAuthority('critic', '.swarm/plan.md', tempDir);
			expect(result.allowed).toBe(false);
		});
	});

	describe('Unknown agent denied by default', () => {
		it('blocks unknown agent', () => {
			const result = checkFileAuthority(
				'unknown-agent',
				'src/file.ts',
				tempDir,
			);
			expect(result.allowed).toBe(false);
			if (isDenied(result)) {
				expect(result.reason).toContain('Unknown agent');
			}
		});

		it('blocks random agent name', () => {
			const result = checkFileAuthority('hacker', 'src/payload.ts', tempDir);
			expect(result.allowed).toBe(false);
		});
	});

	describe('Agent name normalization', () => {
		it('handles case insensitivity', () => {
			const result = checkFileAuthority('ARCHITECT', '.swarm/plan.md', tempDir);
			expect(result.allowed).toBe(false);
		});
	});

	describe('v6.20 warnings only (not blocking)', () => {
		it('checkFileAuthority returns denial without throwing', () => {
			// The function should return a result object, not throw
			const result = checkFileAuthority('explorer', 'src/file.ts', tempDir);
			expect(result).toHaveProperty('allowed');
			expect(result.allowed).toBe(false);
			expect(result).toHaveProperty('reason');
		});

		it('checkFileAuthority returns success without throwing', () => {
			// Should return allowed: true, not throw
			const result = checkFileAuthority('architect', 'src/file.ts', tempDir);
			expect(result).toHaveProperty('allowed');
			expect(result.allowed).toBe(true);
		});
	});

	describe('Cross-platform paths work', () => {
		it('handles Windows backslash paths in file path', () => {
			// The filePath parameter can contain backslashes
			const result = checkFileAuthority(
				'architect',
				'.swarm\\plan.md',
				tempDir,
			);
			// Path normalization should handle this - should still be blocked
			expect(result.allowed).toBe(false);
		});

		it('handles Windows backslash in coder path', () => {
			const result = checkFileAuthority(
				'coder',
				'src\\utils\\helper.ts',
				tempDir,
			);
			expect(result.allowed).toBe(true);
		});
	});

	describe('Absolute path normalization (issue #259)', () => {
		it('allows coder to write to src/ via absolute path', () => {
			const absolutePath = path.join(
				tempDir,
				'src',
				'services',
				'price-calculator.ts',
			);
			const result = checkFileAuthority('coder', absolutePath, tempDir);
			expect(result.allowed).toBe(true);
		});

		it('allows coder to write to tests/ via absolute path', () => {
			const absolutePath = path.join(tempDir, 'tests', 'unit', 'test.ts');
			const result = checkFileAuthority('coder', absolutePath, tempDir);
			expect(result.allowed).toBe(true);
		});

		it('blocks coder from writing outside allowed paths via absolute path', () => {
			const absolutePath = path.join(tempDir, 'README.md');
			const result = checkFileAuthority('coder', absolutePath, tempDir);
			expect(result.allowed).toBe(false);
			if (isDenied(result)) {
				expect(result.reason).toContain('not in allowed list');
			}
		});

		it('blocks coder from .swarm/ via absolute path', () => {
			const absolutePath = path.join(tempDir, '.swarm', 'config.json');
			const result = checkFileAuthority('coder', absolutePath, tempDir);
			expect(result.allowed).toBe(false);
		});

		it('blocks architect from .swarm/plan.md via absolute path', () => {
			const absolutePath = path.join(tempDir, '.swarm', 'plan.md');
			const result = checkFileAuthority('architect', absolutePath, tempDir);
			expect(result.allowed).toBe(false);
			if (isDenied(result)) {
				expect(result.reason).toContain('Path blocked');
			}
		});

		it('handles forward-slash absolute paths (Unix-style)', () => {
			const absolutePath = tempDir + '/src/utils/helper.ts';
			const result = checkFileAuthority('coder', absolutePath, tempDir);
			expect(result.allowed).toBe(true);
		});
	});

	describe('Edge cases', () => {
		it('handles empty file path', () => {
			const result = checkFileAuthority('coder', '', tempDir);
			// Empty path - should check against directory
			expect(result).toHaveProperty('allowed');
		});

		it('handles deep nested paths', () => {
			const result = checkFileAuthority(
				'coder',
				'src/deep/nested/directory/structure/file.ts',
				tempDir,
			);
			expect(result.allowed).toBe(true);
		});

		it('handles single file in root', () => {
			const result = checkFileAuthority('coder', 'index.ts', tempDir);
			// Not in allowed prefixes for coder
			expect(result.allowed).toBe(false);
		});
	});
});
