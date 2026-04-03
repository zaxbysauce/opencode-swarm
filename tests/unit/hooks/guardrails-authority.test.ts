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
	DEFAULT_AGENT_AUTHORITY_RULES,
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
						// blockedPrefix not specified — DOES inherit default ['.swarm/'] from coder defaults
						// The merge logic: userRule.blockedPrefix ?? existing.blockedPrefix
						// undefined (user didn't specify) falls back to existing.blockedPrefix from defaults
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

describe('buildEffectiveRules pre-computation edge cases', () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'effective-rules-test-'));
		originalCwd = process.cwd();
		process.chdir(tempDir);
		resetSwarmState();

		// Create .swarm directory for plan.md test
		await fs.mkdir(path.join(tempDir, '.swarm'), { recursive: true });
		await fs.writeFile(
			path.join(tempDir, '.swarm', 'plan.md'),
			'# Plan\n- Task 1: test',
		);
	});

	afterEach(async () => {
		process.chdir(originalCwd);
		try {
			await fs.rm(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	// ============================================================
	// Group A — fast path correctness (via checkFileAuthority)
	// ============================================================

	describe('Group A — fast path correctness (via checkFileAuthority)', () => {
		it('A1: authorityConfig undefined → same result as calling with no config', () => {
			// Both calls should produce identical results
			const withUndefined = checkFileAuthority(
				'coder',
				'src/file.ts',
				tempDir,
				undefined,
			);
			const withoutArg = checkFileAuthority('coder', 'src/file.ts', tempDir);
			expect(withUndefined.allowed).toBe(withoutArg.allowed);
			expect(withUndefined).toEqual(withoutArg);
		});

		it('A2: authorityConfig.enabled === false with non-empty rules → user rules ignored, defaults apply', () => {
			// Even with rules that would restrict src/, enabled: false should use defaults
			const result = checkFileAuthority('coder', 'src/file.ts', tempDir, {
				enabled: false,
				rules: {
					coder: {
						allowedPrefix: ['lib/'], // Would block src/ if enabled
					},
				},
			});
			// Defaults allow coder to write to src/
			expect(result.allowed).toBe(true);
		});

		it('A3: authorityConfig.rules = {} (empty object) → defaults preserved, behavior identical to no-config', () => {
			const withEmptyRules = checkFileAuthority(
				'coder',
				'src/file.ts',
				tempDir,
				{
					enabled: true,
					rules: {},
				},
			);
			const withoutConfig = checkFileAuthority('coder', 'src/file.ts', tempDir);
			expect(withEmptyRules.allowed).toBe(withoutConfig.allowed);
			expect(withEmptyRules).toEqual(withoutConfig);
		});

		it('A4: coder with empty rules {} → can still write to src/, still blocked from .swarm/', () => {
			// Verify defaults are preserved: coder allowed in src/
			const srcResult = checkFileAuthority('coder', 'src/file.ts', tempDir, {
				enabled: true,
				rules: {},
			});
			expect(srcResult.allowed).toBe(true);

			// Verify defaults are preserved: coder blocked in .swarm/
			const swarmResult = checkFileAuthority(
				'coder',
				'.swarm/plan.md',
				tempDir,
				{
					enabled: true,
					rules: {},
				},
			);
			expect(swarmResult.allowed).toBe(false);
			if (isDenied(swarmResult)) {
				expect(swarmResult.reason).toContain('Path blocked');
			}
		});
	});

	// ============================================================
	// Group B — behavioral equivalence between pre-computed path (hook) and direct call
	// ============================================================

	describe('Group B — behavioral equivalence (hook vs direct checkFileAuthority)', () => {
		it('B1: hook path (toolBefore) and direct call produce identical ALLOWED result', async () => {
			const sessionId = 'equiv-allowed';
			ensureAgentSession(sessionId, 'coder');
			swarmState.activeAgent.set(sessionId, 'coder');
			beginInvocation(sessionId, 'coder');

			// Direct call result
			const directResult = checkFileAuthority('coder', 'src/file.ts', tempDir);

			// Hook path result via toolBefore
			const hooks = createGuardrailsHooks(
				tempDir,
				GuardrailsConfigSchema.parse({ enabled: true }),
			);

			// toolBefore should not throw for allowed paths
			await hooks.toolBefore(
				{ tool: 'write', sessionID: sessionId, callID: 'call-b1' },
				{ args: { filePath: 'src/file.ts' } },
			);

			expect(directResult.allowed).toBe(true);
		});

		it('B2: hook path (toolBefore) and direct call produce identical DENIED result', async () => {
			const sessionId = 'equiv-denied';
			ensureAgentSession(sessionId, 'coder');
			swarmState.activeAgent.set(sessionId, 'coder');
			const session = getAgentSession(sessionId)!;
			session.delegationActive = true; // Enable delegation to trigger authority check
			beginInvocation(sessionId, 'coder');

			// Direct call result
			const directResult = checkFileAuthority('coder', 'README.md', tempDir);

			// Hook path result via toolBefore - should throw for denied paths
			const hooks = createGuardrailsHooks(
				tempDir,
				GuardrailsConfigSchema.parse({ enabled: true }),
			);

			await expect(
				hooks.toolBefore(
					{ tool: 'write', sessionID: sessionId, callID: 'call-b2' },
					{ args: { filePath: 'README.md' } },
				),
			).rejects.toThrow(/WRITE BLOCKED/i);

			expect(directResult.allowed).toBe(false);
		});

		it('B3: mixed-case key "CODER" in config → hook path matches direct call result', async () => {
			const sessionId = 'equiv-mixedcase';
			ensureAgentSession(sessionId, 'coder');
			swarmState.activeAgent.set(sessionId, 'coder');
			beginInvocation(sessionId, 'coder');

			const authorityConfig: AuthorityConfig = {
				enabled: true,
				rules: {
					CODER: {
						allowedPrefix: ['custom/'], // Override: CODER can only write to custom/
					},
				},
			};

			// Direct call with mixed-case config
			const directResult = checkFileAuthority(
				'coder',
				'custom/file.ts',
				tempDir,
				authorityConfig,
			);

			// Hook path with same mixed-case config
			const hooks = createGuardrailsHooks(
				tempDir,
				GuardrailsConfigSchema.parse({ enabled: true }),
				undefined,
				authorityConfig,
			);

			// custom/ path should be allowed
			await hooks.toolBefore(
				{ tool: 'write', sessionID: sessionId, callID: 'call-b3' },
				{ args: { filePath: 'custom/file.ts' } },
			);

			expect(directResult.allowed).toBe(true);

			// Also verify src/ is now blocked (due to the mixed-case CODER override)
			const directBlocked = checkFileAuthority(
				'coder',
				'src/file.ts',
				tempDir,
				authorityConfig,
			);
			expect(directBlocked.allowed).toBe(false);
		});
	});

	// ============================================================
	// Group C — map isolation (pre-computed map must not be shared or mutated)
	// ============================================================

	describe('Group C — map isolation (pre-computed map not shared/mutated between hook instances)', () => {
		it('C1: two separate hook instances with DIFFERENT authorityConfig → each enforces its own config', async () => {
			// Instance 1: coder can only write to lib/
			const authorityConfig1: AuthorityConfig = {
				enabled: true,
				rules: {
					coder: {
						allowedPrefix: ['lib/'],
					},
				},
			};

			// Instance 2: coder can write to src/ (default override via empty rules)
			const authorityConfig2: AuthorityConfig = {
				enabled: true,
				rules: {
					coder: {
						allowedPrefix: ['src/'],
					},
				},
			};

			const sessionId1 = 'isolation-diff-1';
			const sessionId2 = 'isolation-diff-2';

			ensureAgentSession(sessionId1, 'coder');
			swarmState.activeAgent.set(sessionId1, 'coder');
			const session1 = getAgentSession(sessionId1)!;
			session1.delegationActive = true; // Enable delegation to trigger authority check
			beginInvocation(sessionId1, 'coder');

			ensureAgentSession(sessionId2, 'coder');
			swarmState.activeAgent.set(sessionId2, 'coder');
			const session2 = getAgentSession(sessionId2)!;
			session2.delegationActive = true;
			beginInvocation(sessionId2, 'coder');

			const hooks1 = createGuardrailsHooks(
				tempDir,
				GuardrailsConfigSchema.parse({ enabled: true }),
				undefined,
				authorityConfig1,
			);

			const hooks2 = createGuardrailsHooks(
				tempDir,
				GuardrailsConfigSchema.parse({ enabled: true }),
				undefined,
				authorityConfig2,
			);

			// hooks1 (lib/ only) should block src/
			await expect(
				hooks1.toolBefore(
					{ tool: 'write', sessionID: sessionId1, callID: 'call-c1-1' },
					{ args: { filePath: 'src/file.ts' } },
				),
			).rejects.toThrow(/WRITE BLOCKED/i);

			// hooks2 (src/ allowed) should allow src/
			await hooks2.toolBefore(
				{ tool: 'write', sessionID: sessionId2, callID: 'call-c1-2' },
				{ args: { filePath: 'src/file.ts' } },
			);
		});

		it('C2: two separate hook instances with SAME authorityConfig → both produce identical results', async () => {
			const sharedConfig: AuthorityConfig = {
				enabled: true,
				rules: {
					coder: {
						allowedPrefix: ['lib/'],
					},
				},
			};

			const sessionId1 = 'isolation-same-1';
			const sessionId2 = 'isolation-same-2';

			ensureAgentSession(sessionId1, 'coder');
			swarmState.activeAgent.set(sessionId1, 'coder');
			const session1 = getAgentSession(sessionId1)!;
			session1.delegationActive = true;
			beginInvocation(sessionId1, 'coder');

			ensureAgentSession(sessionId2, 'coder');
			swarmState.activeAgent.set(sessionId2, 'coder');
			const session2 = getAgentSession(sessionId2)!;
			session2.delegationActive = true;
			beginInvocation(sessionId2, 'coder');

			const hooks1 = createGuardrailsHooks(
				tempDir,
				GuardrailsConfigSchema.parse({ enabled: true }),
				undefined,
				sharedConfig,
			);

			const hooks2 = createGuardrailsHooks(
				tempDir,
				GuardrailsConfigSchema.parse({ enabled: true }),
				undefined,
				sharedConfig,
			);

			// Both should block src/ (only lib/ allowed)
			await expect(
				hooks1.toolBefore(
					{ tool: 'write', sessionID: sessionId1, callID: 'call-c2-1' },
					{ args: { filePath: 'src/file.ts' } },
				),
			).rejects.toThrow(/WRITE BLOCKED/i);

			await expect(
				hooks2.toolBefore(
					{ tool: 'write', sessionID: sessionId2, callID: 'call-c2-2' },
					{ args: { filePath: 'src/file.ts' } },
				),
			).rejects.toThrow(/WRITE BLOCKED/i);

			// Both should allow lib/
			await hooks1.toolBefore(
				{ tool: 'write', sessionID: sessionId1, callID: 'call-c2-3' },
				{ args: { filePath: 'lib/file.ts' } },
			);

			await hooks2.toolBefore(
				{ tool: 'write', sessionID: sessionId2, callID: 'call-c2-4' },
				{ args: { filePath: 'lib/file.ts' } },
			);
		});

		it('C3: multiple calls through same hook instance → results consistent (map not mutated between invocations)', async () => {
			const sessionId = 'isolation-multi';
			ensureAgentSession(sessionId, 'coder');
			swarmState.activeAgent.set(sessionId, 'coder');
			const session = getAgentSession(sessionId)!;
			session.delegationActive = true; // Enable delegation to trigger authority check
			beginInvocation(sessionId, 'coder');

			const hooks = createGuardrailsHooks(
				tempDir,
				GuardrailsConfigSchema.parse({ enabled: true }),
			);

			// Multiple calls - should all allow src/ consistently
			for (let i = 0; i < 5; i++) {
				await hooks.toolBefore(
					{ tool: 'write', sessionID: sessionId, callID: `call-c3-${i}` },
					{ args: { filePath: 'src/file.ts' } },
				);
			}

			// Also verify blocked paths remain blocked consistently
			for (let i = 0; i < 3; i++) {
				await expect(
					hooks.toolBefore(
						{
							tool: 'write',
							sessionID: sessionId,
							callID: `call-c3-block-${i}`,
						},
						{ args: { filePath: 'README.md' } },
					),
				).rejects.toThrow(/WRITE BLOCKED/i);
			}
		});
	});

	// ============================================================
	// Group D — disabled flag interaction with pre-computation
	// ============================================================

	describe('Group D — disabled flag interaction with pre-computation', () => {
		it('D1: enabled: true with actual rules → rules are applied via hook', async () => {
			const sessionId = 'disabled-true';
			ensureAgentSession(sessionId, 'coder');
			swarmState.activeAgent.set(sessionId, 'coder');
			const session = getAgentSession(sessionId)!;
			session.delegationActive = true; // Enable delegation to trigger authority check
			beginInvocation(sessionId, 'coder');

			const authorityConfig: AuthorityConfig = {
				enabled: true,
				rules: {
					coder: {
						allowedPrefix: ['lib/'], // Override: only lib/ allowed
					},
				},
			};

			const hooks = createGuardrailsHooks(
				tempDir,
				GuardrailsConfigSchema.parse({ enabled: true }),
				undefined,
				authorityConfig,
			);

			// src/ should be blocked (not in lib/ only)
			await expect(
				hooks.toolBefore(
					{ tool: 'write', sessionID: sessionId, callID: 'call-d1' },
					{ args: { filePath: 'src/file.ts' } },
				),
			).rejects.toThrow(/WRITE BLOCKED/i);
		});

		it('D2: enabled: false with actual rules → rules are ignored via hook (defaults apply)', async () => {
			const sessionId = 'disabled-false';
			ensureAgentSession(sessionId, 'coder');
			swarmState.activeAgent.set(sessionId, 'coder');
			const session = getAgentSession(sessionId)!;
			session.delegationActive = true; // Enable delegation to trigger authority check
			beginInvocation(sessionId, 'coder');

			const authorityConfig: AuthorityConfig = {
				enabled: false,
				rules: {
					coder: {
						allowedPrefix: ['lib/'], // Would block src/ if enabled
					},
				},
			};

			const hooks = createGuardrailsHooks(
				tempDir,
				GuardrailsConfigSchema.parse({ enabled: true }),
				undefined,
				authorityConfig,
			);

			// Defaults apply: coder can write to src/ (rules are ignored due to enabled: false)
			await hooks.toolBefore(
				{ tool: 'write', sessionID: sessionId, callID: 'call-d2' },
				{ args: { filePath: 'src/file.ts' } },
			);
		});

		it('D3: enabled: false then enabled: true in separate instances → each instance is independent', async () => {
			const sessionId1 = 'disabled-indep-1';
			const sessionId2 = 'disabled-indep-2';

			ensureAgentSession(sessionId1, 'coder');
			swarmState.activeAgent.set(sessionId1, 'coder');
			beginInvocation(sessionId1, 'coder');

			ensureAgentSession(sessionId2, 'coder');
			swarmState.activeAgent.set(sessionId2, 'coder');
			const session2 = getAgentSession(sessionId2)!;
			session2.delegationActive = true; // Enable delegation for the rejection test
			beginInvocation(sessionId2, 'coder');

			const authorityConfig1: AuthorityConfig = {
				enabled: false,
				rules: {
					coder: {
						allowedPrefix: ['lib/'],
					},
				},
			};

			const authorityConfig2: AuthorityConfig = {
				enabled: true,
				rules: {
					coder: {
						allowedPrefix: ['lib/'],
					},
				},
			};

			const hooks1 = createGuardrailsHooks(
				tempDir,
				GuardrailsConfigSchema.parse({ enabled: true }),
				undefined,
				authorityConfig1,
			);

			const hooks2 = createGuardrailsHooks(
				tempDir,
				GuardrailsConfigSchema.parse({ enabled: true }),
				undefined,
				authorityConfig2,
			);

			// hooks1: enabled: false → defaults apply → src/ allowed
			await hooks1.toolBefore(
				{ tool: 'write', sessionID: sessionId1, callID: 'call-d3-1' },
				{ args: { filePath: 'src/file.ts' } },
			);

			// hooks2: enabled: true with lib/ only → src/ blocked
			await expect(
				hooks2.toolBefore(
					{ tool: 'write', sessionID: sessionId2, callID: 'call-d3-2' },
					{ args: { filePath: 'src/file.ts' } },
				),
			).rejects.toThrow(/WRITE BLOCKED/i);
		});
	});

	// ============================================================
	// Group E — custom agent via pre-computed path
	// ============================================================

	describe('Group E — custom agent via pre-computed path', () => {
		it('E1: custom agent not in DEFAULT_AGENT_AUTHORITY_RULES, configured in authorityConfig.rules → accessible via hook', async () => {
			const sessionId = 'custom-agent';
			ensureAgentSession(sessionId, 'custom_coder');
			swarmState.activeAgent.set(sessionId, 'custom_coder');
			beginInvocation(sessionId, 'custom_coder');

			const authorityConfig: AuthorityConfig = {
				enabled: true,
				rules: {
					custom_coder: {
						allowedPrefix: ['custom/'],
					},
				},
			};

			const hooks = createGuardrailsHooks(
				tempDir,
				GuardrailsConfigSchema.parse({ enabled: true }),
				undefined,
				authorityConfig,
			);

			// custom_coder should be allowed to write to custom/
			await hooks.toolBefore(
				{ tool: 'write', sessionID: sessionId, callID: 'call-e1' },
				{ args: { filePath: 'custom/file.ts' } },
			);
		});

		it('E2: custom agent with allowedPrefix: [] via hook → all writes denied', async () => {
			const sessionId = 'custom-empty';
			ensureAgentSession(sessionId, 'strict_agent');
			swarmState.activeAgent.set(sessionId, 'strict_agent');
			const session = getAgentSession(sessionId)!;
			session.delegationActive = true; // Enable delegation to trigger authority check
			beginInvocation(sessionId, 'strict_agent');

			const authorityConfig: AuthorityConfig = {
				enabled: true,
				rules: {
					strict_agent: {
						allowedPrefix: [], // Deny all paths
					},
				},
			};

			const hooks = createGuardrailsHooks(
				tempDir,
				GuardrailsConfigSchema.parse({ enabled: true }),
				undefined,
				authorityConfig,
			);

			// Even a path that would normally be allowed should be denied
			await expect(
				hooks.toolBefore(
					{ tool: 'write', sessionID: sessionId, callID: 'call-e2' },
					{ args: { filePath: 'any/path/file.ts' } },
				),
			).rejects.toThrow(/WRITE BLOCKED/i);
		});

		it('E3: custom agent with no allowedPrefix in config via hook → no allowlist restriction (blockedPrefix still applies)', async () => {
			const sessionId = 'custom-no-allowlist';
			ensureAgentSession(sessionId, 'flexible_agent');
			swarmState.activeAgent.set(sessionId, 'flexible_agent');
			const session = getAgentSession(sessionId)!;
			session.delegationActive = true; // Enable delegation to trigger authority check
			beginInvocation(sessionId, 'flexible_agent');

			// Custom agent with only blockedPrefix set, no allowedPrefix
			const authorityConfig: AuthorityConfig = {
				enabled: true,
				rules: {
					flexible_agent: {
						blockedPrefix: ['.secret/'],
					},
				},
			};

			const hooks = createGuardrailsHooks(
				tempDir,
				GuardrailsConfigSchema.parse({ enabled: true }),
				undefined,
				authorityConfig,
			);

			// Should allow regular paths (no allowlist restriction)
			await hooks.toolBefore(
				{ tool: 'write', sessionID: sessionId, callID: 'call-e3-allowed' },
				{ args: { filePath: 'src/file.ts' } },
			);

			// Should block .secret/ paths (blockedPrefix still applies)
			await expect(
				hooks.toolBefore(
					{ tool: 'write', sessionID: sessionId, callID: 'call-e3-blocked' },
					{ args: { filePath: '.secret/file.ts' } },
				),
			).rejects.toThrow(/WRITE BLOCKED/i);
		});
	});
});
