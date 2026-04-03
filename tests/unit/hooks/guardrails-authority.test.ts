import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	type AuthorityConfig,
	type GuardrailsConfig,
	GuardrailsConfigSchema,
} from '../../../src/config/schema';
import {
	checkFileAuthority,
	createGuardrailsHooks,
} from '../../../src/hooks/guardrails';
import {
	beginInvocation,
	ensureAgentSession,
	getAgentSession,
	resetSwarmState,
	startAgentSession,
	swarmState,
} from '../../../src/state';

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

	describe('Prefixed agent inherits canonical defaults', () => {
		it('allows paid_coder to write to src/file.ts (inherits coder allowedPrefix)', () => {
			const result = checkFileAuthority('paid_coder', 'src/file.ts', tempDir);
			expect(result.allowed).toBe(true);
		});

		it('allows mega_reviewer to write to .swarm/evidence/x.json (inherits reviewer allowedPrefix)', () => {
			const result = checkFileAuthority(
				'mega_reviewer',
				'.swarm/evidence/x.json',
				tempDir,
			);
			expect(result.allowed).toBe(true);
		});

		it('denies paid_coder writing to .swarm/plan.md (coder defaults block .swarm/)', () => {
			const result = checkFileAuthority(
				'paid_coder',
				'.swarm/plan.md',
				tempDir,
			);
			expect(result.allowed).toBe(false);
			if (isDenied(result)) {
				expect(result.reason).toContain('Path blocked');
			}
		});

		it('allows unprefixed canonical coder to write to src/file.ts', () => {
			const result = checkFileAuthority('coder', 'src/file.ts', tempDir);
			expect(result.allowed).toBe(true);
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

	describe('Config key case normalization', () => {
		it('config key "CODER" matches lookup for "coder"', () => {
			const result = checkFileAuthority('coder', 'src/file.ts', tempDir, {
				enabled: true,
				rules: {
					CODER: {
						allowedPrefix: ['lib/'], // Override: CODER can only write to lib/
					},
				},
			});
			// src/ is no longer in allowedPrefix, so should be blocked
			expect(result.allowed).toBe(false);
			if (isDenied(result)) {
				expect(result.reason).toContain('not in allowed list');
			}
		});

		it('config key "Paid_Coder" matches lookup for "paid_coder"', () => {
			const result = checkFileAuthority('paid_coder', 'src/file.ts', tempDir, {
				enabled: true,
				rules: {
					Paid_Coder: {
						allowedPrefix: ['lib/'], // Override: Paid_Coder can only write to lib/
					},
				},
			});
			// src/ is no longer in allowedPrefix, so should be blocked
			expect(result.allowed).toBe(false);
			if (isDenied(result)) {
				expect(result.reason).toContain('not in allowed list');
			}
		});

		it('exact override for "paid_coder" wins over canonical coder fallback', () => {
			// paid_coder normally inherits from coder defaults (allows src/)
			// But config with "paid_coder" exact key should override that
			const result = checkFileAuthority('paid_coder', 'src/file.ts', tempDir, {
				enabled: true,
				rules: {
					coder: {
						allowedPrefix: ['lib/'],
					},
					paid_coder: {
						allowedPrefix: ['src/'], // Exact match for paid_coder
					},
				},
			});
			// paid_coder exact override should allow src/
			expect(result.allowed).toBe(true);
		});

		it('empty rules {} preserves all defaults', () => {
			const result = checkFileAuthority('coder', 'src/file.ts', tempDir, {
				enabled: true,
				rules: {},
			});
			// Empty rules should preserve all defaults
			expect(result.allowed).toBe(true);
		});
	});

	describe('Config-based authority overrides', () => {
		it('uses default rules when no authorityConfig is provided', () => {
			const result = checkFileAuthority('coder', 'src/file.ts', tempDir);
			expect(result.allowed).toBe(true);
		});

		it('uses default rules when authorityConfig is undefined', () => {
			const result = checkFileAuthority(
				'coder',
				'src/file.ts',
				tempDir,
				undefined,
			);
			expect(result.allowed).toBe(true);
		});

		it('user rules override default allowedPrefix for coder', () => {
			const result = checkFileAuthority('coder', 'src/file.ts', tempDir, {
				enabled: true,
				rules: {
					coder: {
						allowedPrefix: ['lib/'], // Override: coder can only write to lib/
					},
				},
			});
			// src/ is no longer in allowedPrefix, so should be blocked
			expect(result.allowed).toBe(false);
			if (isDenied(result)) {
				expect(result.reason).toContain('not in allowed list');
			}
		});

		it('user rules allow new paths for coder', () => {
			const result = checkFileAuthority('coder', 'lib/utils.ts', tempDir, {
				enabled: true,
				rules: {
					coder: {
						allowedPrefix: ['lib/'],
					},
				},
			});
			expect(result.allowed).toBe(true);
		});

		it('user rules add new agent not in defaults', () => {
			const result = checkFileAuthority(
				'custom_agent',
				'custom/path.ts',
				tempDir,
				{
					enabled: true,
					rules: {
						custom_agent: {
							allowedPrefix: ['custom/'],
						},
					},
				},
			);
			expect(result.allowed).toBe(true);
		});

		it('authority disabled falls back to defaults', () => {
			const result = checkFileAuthority('coder', 'src/file.ts', tempDir, {
				enabled: false,
				rules: {
					coder: {
						allowedPrefix: ['lib/'], // Should be ignored
					},
				},
			});
			// Falls back to defaults where src/ is allowed for coder
			expect(result.allowed).toBe(true);
		});

		it('user rules override blockedPrefix for coder', () => {
			const result = checkFileAuthority(
				'coder',
				'.swarm/evidence/test.ts',
				tempDir,
				{
					enabled: true,
					rules: {
						coder: {
							blockedPrefix: [], // Remove .swarm/ block
							allowedPrefix: ['.swarm/'],
							blockedZones: ['generated'], // Remove config zone block
						},
					},
				},
			);
			// With override, coder can now write to .swarm/
			expect(result.allowed).toBe(true);
		});

		it('user rules override readOnly for explorer', () => {
			const result = checkFileAuthority('explorer', 'notes.txt', tempDir, {
				enabled: true,
				rules: {
					explorer: {
						readOnly: false,
						allowedPrefix: [''],
					},
				},
			});
			// Explorer is no longer read-only with override
			expect(result.allowed).toBe(true);
		});

		it('empty rules object preserves defaults', () => {
			const result = checkFileAuthority('coder', 'src/file.ts', tempDir, {
				enabled: true,
				rules: {},
			});
			// Empty rules should preserve all defaults
			expect(result.allowed).toBe(true);
		});

		it('partial override preserves other default fields', () => {
			// Override only allowedPrefix, blockedPrefix should still apply from defaults
			const result = checkFileAuthority('coder', '.swarm/plan.md', tempDir, {
				enabled: true,
				rules: {
					coder: {
						allowedPrefix: ['src/', 'lib/'],
						// blockedPrefix not specified — should NOT inherit default ['.swarm/']
						// because the merge logic uses userRule.blockedPrefix ?? existing.blockedPrefix
						// and undefined means the user didn't specify it, so it falls back to default
					},
				},
			});
			// .swarm/ should still be blocked because blockedPrefix falls back to default
			expect(result.allowed).toBe(false);
			if (isDenied(result)) {
				expect(result.reason).toContain('Path blocked');
			}
		});

		// NOTE: allowedPrefix: [] means deny all paths; omission of allowedPrefix means no allowlist restriction
		it('allowedPrefix: [] denies traversal attempt outside cwd', () => {
			// Using traversal sequence to escape tempDir - path.resolve normalizes ../
			const result = checkFileAuthority(
				'coder',
				'../../../etc/passwd',
				tempDir,
				{
					enabled: true,
					rules: {
						coder: {
							allowedPrefix: [], // Deny all - no paths are allowed
						},
					},
				},
			);
			expect(result.allowed).toBe(false);
			if (isDenied(result)) {
				expect(result.reason).toContain('not in allowed list');
			}
		});
	});

	describe('toolBefore hook integration tests (PR 378)', () => {
		let tempDir: string;
		let originalCwd: string;
		let hooksConfig: GuardrailsConfig;

		beforeEach(async () => {
			// Create a temporary directory for each test
			tempDir = await fs.mkdtemp(
				path.join(os.tmpdir(), 'authority-hook-test-'),
			);
			originalCwd = process.cwd();
			process.chdir(tempDir);
			resetSwarmState();

			// Create .swarm directory for plan.md test
			await fs.mkdir(path.join(tempDir, '.swarm'), { recursive: true });
			// Create .swarm/plan.md
			await fs.writeFile(
				path.join(tempDir, '.swarm', 'plan.md'),
				'# Plan\n- Task 1: test',
			);
			// Create generated directory for zone test
			await fs.mkdir(path.join(tempDir, 'generated'), { recursive: true });

			// Initialize guardrails config for hook tests
			hooksConfig = GuardrailsConfigSchema.parse({ enabled: true });
		});

		afterEach(async () => {
			process.chdir(originalCwd);
			try {
				await fs.rm(tempDir, { recursive: true, force: true });
			} catch {
				// Ignore cleanup errors
			}
		});

		/**
		 * Test 1: architect write to src/file.ts → allowed
		 * DEFAULT_AGENT_AUTHORITY_RULES for architect has no allowedPrefix (no restriction),
		 * blockedZones is ['generated'] but src/ is production zone.
		 */
		it('architect write to src/file.ts is allowed via toolBefore hook', async () => {
			const sessionId = 'toolbefore-architect-src';
			ensureAgentSession(sessionId, 'architect');
			swarmState.activeAgent.set(sessionId, 'architect');
			beginInvocation(sessionId, 'architect');

			const hooks = createGuardrailsHooks(tempDir, hooksConfig);

			// Should NOT throw - architect has no allowedPrefix restriction
			await hooks.toolBefore(
				{ tool: 'write', sessionID: sessionId, callID: 'call-1' },
				{ args: { filePath: 'src/file.ts' } },
			);
		});

		/**
		 * Test 2: architect write to nested/dist/file.ts → BLOCKED by blockedZones
		 * architect has blockedZones: ['generated'], and 'nested/dist/file.ts' is classified
		 * as 'generated' zone by classifyFile() (which checks for /dist/ pattern).
		 * NOTE: classifyFile does NOT recognize 'dist/' at path start as 'generated' zone.
		 * It only recognizes: .wasm, /dist/, /build/, .swarm/checkpoints/
		 */
		it('architect write to nested/dist/file.ts is blocked by blockedZones', async () => {
			const sessionId = 'toolbefore-architect-generated';
			ensureAgentSession(sessionId, 'architect');
			swarmState.activeAgent.set(sessionId, 'architect');
			beginInvocation(sessionId, 'architect');

			const hooks = createGuardrailsHooks(tempDir, hooksConfig);

			// Should throw due to blockedZones=['generated'] - nested/dist/ is classified as 'generated'
			await expect(
				hooks.toolBefore(
					{ tool: 'write', sessionID: sessionId, callID: 'call-2' },
					{ args: { filePath: 'nested/dist/file.ts' } },
				),
			).rejects.toThrow();
		});

		/**
		 * Test 3: architect write to .swarm/plan.md → PLAN STATE VIOLATION
		 * handlePlanAndScopeProtection throws first before authority check.
		 */
		it('architect write to .swarm/plan.md throws PLAN STATE VIOLATION', async () => {
			const sessionId = 'toolbefore-architect-plan';
			ensureAgentSession(sessionId, 'architect');
			swarmState.activeAgent.set(sessionId, 'architect');
			beginInvocation(sessionId, 'architect');

			const hooks = createGuardrailsHooks(tempDir, hooksConfig);

			// Should throw PLAN STATE VIOLATION - handlePlanAndScopeProtection runs first
			await expect(
				hooks.toolBefore(
					{ tool: 'write', sessionID: sessionId, callID: 'call-3' },
					{ args: { filePath: '.swarm/plan.md' } },
				),
			).rejects.toThrow(/PLAN STATE VIOLATION/i);
		});

		/**
		 * Test 4: reviewer write to src/file.ts via delegation → BLOCKED
		 * When delegationActive=true and reviewer tries to write to src/ (which is
		 * blocked by reviewer's blockedPrefix: ['src/']), handleDelegatedWriteTracking
		 * should throw due to authority check failure at line 525.
		 */
		it('reviewer write to src/file.ts via delegation is blocked', async () => {
			const sessionId = 'toolbefore-reviewer-delegation';
			ensureAgentSession(sessionId, 'reviewer');
			swarmState.activeAgent.set(sessionId, 'reviewer');
			const session = getAgentSession(sessionId)!;
			session.delegationActive = true; // Simulate delegation in progress
			beginInvocation(sessionId, 'reviewer');

			const hooks = createGuardrailsHooks(tempDir, hooksConfig);

			// Should throw because reviewer has blockedPrefix: ['src/']
			await expect(
				hooks.toolBefore(
					{ tool: 'write', sessionID: sessionId, callID: 'call-4' },
					{ args: { filePath: 'src/file.ts' } },
				),
			).rejects.toThrow(/WRITE BLOCKED/i);
		});

		/**
		 * Test 5: paid_coder write to src/file.ts via delegation → ALLOWED
		 * When delegationActive=true and paid_coder (which inherits from coder)
		 * tries to write to src/, the canonical fallback allows it because
		 * coder's allowedPrefix includes 'src/'.
		 */
		it('paid_coder write to src/file.ts via delegation is allowed', async () => {
			const sessionId = 'toolbefore-paidcoder-delegation';
			ensureAgentSession(sessionId, 'paid_coder');
			swarmState.activeAgent.set(sessionId, 'paid_coder');
			const session = getAgentSession(sessionId)!;
			session.delegationActive = true; // Simulate delegation in progress
			beginInvocation(sessionId, 'paid_coder');

			const hooks = createGuardrailsHooks(tempDir, hooksConfig);

			// Should NOT throw - coder (which paid_coder inherits from) allows src/
			await hooks.toolBefore(
				{ tool: 'write', sessionID: sessionId, callID: 'call-5' },
				{ args: { filePath: 'src/file.ts' } },
			);
		});

		/**
		 * Test 6: mixed-case config key 'PAID_CODER' in authority config → works correctly
		 * The config key normalization (toLowerCase) should allow proper lookup.
		 * delegationActive must be true to exercise the authority override path.
		 */
		it('mixed-case config key PAID_CODER works correctly', async () => {
			const sessionId = 'toolbefore-mixedcase-config';
			ensureAgentSession(sessionId, 'paid_coder');
			swarmState.activeAgent.set(sessionId, 'paid_coder');
			const session = getAgentSession(sessionId)!;
			session.delegationActive = true; // Enable delegation to exercise authority override
			beginInvocation(sessionId, 'paid_coder');

			// Authority config with mixed-case key 'PAID_CODER'
			const authorityConfig: AuthorityConfig = {
				enabled: true,
				rules: {
					PAID_CODER: {
						allowedPrefix: ['lib/'], // Override: PAID_CODER can only write to lib/
						blockedPrefix: ['src/'], // Explicitly block src/ to test mixed-case key works
					},
				},
			};

			// Pass authorityConfig as 4th positional argument to createGuardrailsHooks
			const hooks = createGuardrailsHooks(
				tempDir,
				hooksConfig,
				undefined,
				authorityConfig,
			);

			// paid_coder with PAID_CODER override should now be blocked from src/
			// because the override has blockedPrefix: ['src/']
			await expect(
				hooks.toolBefore(
					{ tool: 'write', sessionID: sessionId, callID: 'call-6' },
					{ args: { filePath: 'src/file.ts' } },
				),
			).rejects.toThrow(/WRITE BLOCKED/i);
		});
	});
});
