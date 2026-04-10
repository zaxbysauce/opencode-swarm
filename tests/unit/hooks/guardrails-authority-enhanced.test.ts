/**
 * Tests for enhanced file authority system
 *
 * Covers:
 * - normalizePathWithCache: cross-platform path normalization with caching
 * - getGlobMatcher: picomatch glob pattern matching with caching
 * - checkFileAuthorityWithRules: DENY-first authority evaluation
 * - checkFileAuthority: public API for authority checking
 * - Default agent authority rules
 */

import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import {
	classifyFile,
	type FileZone,
} from '../../../src/context/zone-classifier';
import {
	type AuthorityConfig,
	checkFileAuthority,
	DEFAULT_AGENT_AUTHORITY_RULES,
} from '../../../src/hooks/guardrails';

const TEST_CWD = '/test/project';

describe('normalizePathWithCache', () => {
	test('normalizes relative paths to absolute', () => {
		const result = checkFileAuthority('architect', 'src/index.ts', TEST_CWD);
		// Should return allowed: true (path exists and is allowed)
		expect(result.allowed).toBe(true);
	});

	test('architect allows any path not explicitly blocked', () => {
		const result = checkFileAuthority(
			'architect',
			'/home/user/project/src/index.ts',
			TEST_CWD,
		);
		// Architect has no prefix restrictions, so absolute paths are allowed
		expect(result.allowed).toBe(true);
	});

	test('architect allows paths with .. segments in general', () => {
		const result = checkFileAuthority(
			'architect',
			'../parent/file.ts',
			TEST_CWD,
		);
		// Architect has no prefix restrictions by default
		expect(result.allowed).toBe(true);
	});
});

describe('getGlobMatcher - via checkFileAuthority', () => {
	test('blockedGlobs blocks matching paths', () => {
		const authorityConfig: AuthorityConfig = {
			enabled: true,
			rules: {
				test_agent: {
					blockedGlobs: ['**/node_modules/**', '**/.git/**'],
				},
			},
		};

		const result = checkFileAuthority(
			'test_agent',
			'node_modules/package/index.js',
			TEST_CWD,
			authorityConfig,
		);
		expect(result.allowed).toBe(false);
		expect(result.reason).toContain('blocked (glob');
	});

	test('allowedGlobs allows matching paths when otherwise blocked', () => {
		const authorityConfig: AuthorityConfig = {
			enabled: true,
			rules: {
				coder: {
					// Override to allow specific glob that would normally be blocked
					blockedPrefix: ['src/'],
					allowedGlobs: ['src/allowed/*'],
				},
			},
		};

		const result = checkFileAuthority(
			'coder',
			'src/allowed/file.ts',
			TEST_CWD,
			authorityConfig,
		);
		expect(result.allowed).toBe(true);
	});

	test('glob matching with wildcards', () => {
		const authorityConfig: AuthorityConfig = {
			enabled: true,
			rules: {
				test_agent: {
					blockedGlobs: ['*.test.ts', '*.spec.ts'],
				},
			},
		};

		// These should be blocked by glob pattern
		const blocked1 = checkFileAuthority(
			'test_agent',
			'foo.test.ts',
			TEST_CWD,
			authorityConfig,
		);
		expect(blocked1.allowed).toBe(false);

		const blocked2 = checkFileAuthority(
			'test_agent',
			'bar.spec.ts',
			TEST_CWD,
			authorityConfig,
		);
		expect(blocked2.allowed).toBe(false);

		// Non-matching should be allowed (no allowedPrefix = default allow)
		const allowed = checkFileAuthority(
			'test_agent',
			'foo.ts',
			TEST_CWD,
			authorityConfig,
		);
		expect(allowed.allowed).toBe(true);
	});

	test('glob caching works correctly', () => {
		const authorityConfig: AuthorityConfig = {
			enabled: true,
			rules: {
				test_agent: {
					blockedGlobs: ['node_modules/**'],
				},
			},
		};

		// Test that the same pattern produces consistent results
		const result1 = checkFileAuthority(
			'test_agent',
			'node_modules/foo/index.js',
			TEST_CWD,
			authorityConfig,
		);
		const result2 = checkFileAuthority(
			'test_agent',
			'node_modules/bar/index.js',
			TEST_CWD,
			authorityConfig,
		);

		// Both should be blocked (same glob pattern)
		expect(result1.allowed).toBe(false);
		expect(result2.allowed).toBe(false);
	});

	test('malformed blockedGlobs pattern does not crash and allows access', () => {
		const authorityConfig: AuthorityConfig = {
			enabled: true,
			rules: {
				test_agent: {
					blockedGlobs: ['[invalid(glob'], // unclosed bracket — picomatch throws
				},
			},
		};

		const result = checkFileAuthority(
			'test_agent',
			'any/path.ts',
			TEST_CWD,
			authorityConfig,
		);

		// malformed pattern compiles to () => false → never blocks → allowed
		expect(result.allowed).toBe(true);
		// Note: warn() only logs when OPENCODE_SWARM_DEBUG=1 (module-level gate)
		// The important behavior is that malformed patterns don't crash and allow access
	});
});

describe('checkFileAuthorityWithRules - DENY-first evaluation', () => {
	describe('Step 1: readOnly', () => {
		test('blocks all writes for read-only agents', () => {
			const result = checkFileAuthority('explorer', 'src/index.ts', TEST_CWD);
			expect(result.allowed).toBe(false);
			expect(result.reason).toContain('read-only');
		});

		test('sme is read-only by default', () => {
			const result = checkFileAuthority('sme', 'src/index.ts', TEST_CWD);
			expect(result.allowed).toBe(false);
			expect(result.reason).toContain('read-only');
		});
	});

	describe('Step 2: blockedExact', () => {
		test('architect blocked exact plan files', () => {
			const result = checkFileAuthority(
				'architect',
				'.swarm/plan.md',
				TEST_CWD,
			);
			expect(result.allowed).toBe(false);
			expect(result.reason).toContain('blocked (exact)');
		});

		test('architect blocked exact plan.json', () => {
			const result = checkFileAuthority(
				'architect',
				'.swarm/plan.json',
				TEST_CWD,
			);
			expect(result.allowed).toBe(false);
			expect(result.reason).toContain('blocked (exact)');
		});

		test('reviewer blocked exact plan files', () => {
			const result = checkFileAuthority('reviewer', '.swarm/plan.md', TEST_CWD);
			expect(result.allowed).toBe(false);
		});
	});

	describe('Step 3: blockedGlobs', () => {
		test('blocks paths matching blockedGlobs', () => {
			const authorityConfig: AuthorityConfig = {
				enabled: true,
				rules: {
					test_agent: {
						blockedGlobs: ['**/secrets/**', '**/credentials/*'],
					},
				},
			};

			const result = checkFileAuthority(
				'test_agent',
				'src/secrets/api-key.txt',
				TEST_CWD,
				authorityConfig,
			);
			expect(result.allowed).toBe(false);
			expect(result.reason).toContain('blocked (glob');
		});
	});

	describe('Step 4: allowedExact', () => {
		test('allows exact paths even if would be blocked by prefix', () => {
			const authorityConfig: AuthorityConfig = {
				enabled: true,
				rules: {
					coder: {
						blockedPrefix: ['src/'],
						allowedExact: ['src/specific-file.ts'],
					},
				},
			};

			const result = checkFileAuthority(
				'coder',
				'src/specific-file.ts',
				TEST_CWD,
				authorityConfig,
			);
			expect(result.allowed).toBe(true);
		});

		test('blockedExact takes precedence over allowedExact', () => {
			const authorityConfig: AuthorityConfig = {
				enabled: true,
				rules: {
					test_agent: {
						blockedExact: ['secret.txt'],
						allowedExact: ['secret.txt'],
					},
				},
			};

			const result = checkFileAuthority(
				'test_agent',
				'secret.txt',
				TEST_CWD,
				authorityConfig,
			);
			// blockedExact should take precedence (comes first in evaluation order)
			expect(result.allowed).toBe(false);
		});
	});

	describe('Step 5: allowedGlobs', () => {
		test('allows paths matching allowedGlobs even if blocked by prefix', () => {
			const authorityConfig: AuthorityConfig = {
				enabled: true,
				rules: {
					coder: {
						blockedPrefix: ['src/'],
						allowedGlobs: ['src/generated/*'],
					},
				},
			};

			const result = checkFileAuthority(
				'coder',
				'src/generated/file.ts',
				TEST_CWD,
				authorityConfig,
			);
			expect(result.allowed).toBe(true);
		});
	});

	describe('Step 6: allowedPrefix', () => {
		test('coder allowed prefix - src directory', () => {
			const result = checkFileAuthority('coder', 'src/index.ts', TEST_CWD);
			// Default coder has allowedPrefix: ['src/', 'tests/', ...]
			// Path should be allowed
			expect(result.allowed).toBe(true);
		});

		test('coder blocked by missing prefix', () => {
			const result = checkFileAuthority(
				'coder',
				'config/settings.json',
				TEST_CWD,
			);
			// Default coder doesn't have config/ in allowedPrefix
			expect(result.allowed).toBe(false);
			expect(result.reason).toContain('not in allowed list');
		});

		test('test_engineer allowed prefix - tests directory', () => {
			const result = checkFileAuthority(
				'test_engineer',
				'tests/unit/example.test.ts',
				TEST_CWD,
			);
			expect(result.allowed).toBe(true);
		});
	});

	describe('Step 7: blockedPrefix', () => {
		test('coder blockedPrefix - Path blocked (has allowedPrefix)', () => {
			const result = checkFileAuthority('coder', '.swarm/state.json', TEST_CWD);
			// Coder has allowedPrefix configured, so .swarm is not in the allowed list
			expect(result.allowed).toBe(false);
			expect(result.reason).toContain('Path blocked');
		});

		test('reviewer blockedPrefix blocks src directory', () => {
			const result = checkFileAuthority('reviewer', 'src/index.ts', TEST_CWD);
			// Reviewer default: allowedPrefix: ['.swarm/evidence/', '.swarm/outputs/']
			// So src/ should be blocked by blockedPrefix: ['src/']
			expect(result.allowed).toBe(false);
		});

		test('test_engineer blockedPrefix blocks src', () => {
			const result = checkFileAuthority(
				'test_engineer',
				'src/index.ts',
				TEST_CWD,
			);
			expect(result.allowed).toBe(false);
		});
	});

	describe('Step 8: blockedZones', () => {
		test('architect with explicit blocked zones - generated zone', () => {
			const authorityConfig: AuthorityConfig = {
				enabled: true,
				rules: {
					architect: {
						blockedZones: ['generated'],
					},
				},
			};

			// Test with a path that would be classified as generated
			const result = checkFileAuthority(
				'architect',
				'dist/bundle.js',
				TEST_CWD,
				authorityConfig,
			);
			// dist/ is typically in production zone, not generated
			// This depends on zone classification
			expect(result.allowed).toBe(true);
		});

		test('coder blocked config zone - opencode.json', () => {
			// Default coder has blockedZones: ['generated', 'config']
			// But opencode.json might be blocked by allowedPrefix first
			// Let's check a file that is in config zone but passes allowedPrefix
			const result = checkFileAuthority('coder', 'opencode.json', TEST_CWD);
			// Coder has allowedPrefix, so opencode.json fails that first
			expect(result.allowed).toBe(false);
			expect(result.reason).toContain('not in allowed list');
		});

		test('zone check happens when path passes prefix checks', () => {
			// Create a config file that passes allowedPrefix
			const authorityConfig: AuthorityConfig = {
				enabled: true,
				rules: {
					coder: {
						allowedPrefix: ['src/', 'config/'],
						blockedZones: ['config'],
					},
				},
			};

			const result = checkFileAuthority(
				'coder',
				'config/settings.json',
				TEST_CWD,
				authorityConfig,
			);
			// Path passes prefix check but blocked by zone
			expect(result.allowed).toBe(false);
			expect(result.zone).toBe('config');
		});
	});

	describe('Priority: allowedExact over blockedGlobs', () => {
		test('blockedGlobs blocks before allowedExact check', () => {
			const authorityConfig: AuthorityConfig = {
				enabled: true,
				rules: {
					test_agent: {
						// No prefix rules, so it's allow-by-default
						blockedGlobs: ['**/*.log'],
						allowedExact: ['error.log'],
					},
				},
			};

			const result = checkFileAuthority(
				'test_agent',
				'error.log',
				TEST_CWD,
				authorityConfig,
			);
			// blockedGlobs blocks first, allowedExact is not checked for blocked paths
			// error.log matches **/*.log glob pattern
			expect(result.allowed).toBe(false);
			expect(result.reason).toContain('blocked (glob');
		});

		test('allowedExact works when not matched by blockedGlobs', () => {
			const authorityConfig: AuthorityConfig = {
				enabled: true,
				rules: {
					test_agent: {
						blockedGlobs: ['logs/*.log'],
						allowedExact: ['error.log'],
					},
				},
			};

			const result = checkFileAuthority(
				'test_agent',
				'error.log',
				TEST_CWD,
				authorityConfig,
			);
			// error.log does NOT match logs/*.log (not in logs/ directory)
			// so allowedExact allows it
			expect(result.allowed).toBe(true);
		});
	});

	describe('Priority: allowedGlobs over blockedPrefix', () => {
		test('allowedGlobs takes precedence over blockedPrefix', () => {
			const authorityConfig: AuthorityConfig = {
				enabled: true,
				rules: {
					test_agent: {
						blockedPrefix: ['src/'],
						allowedGlobs: ['src/special/*'],
					},
				},
			};

			const result = checkFileAuthority(
				'test_agent',
				'src/special/file.ts',
				TEST_CWD,
				authorityConfig,
			);
			// allowedGlobs should allow even though blockedPrefix would block
			expect(result.allowed).toBe(true);
		});
	});
});

describe('Rule merging with defaults', () => {
	test('merges user rules with defaults', () => {
		const authorityConfig: AuthorityConfig = {
			enabled: true,
			rules: {
				coder: {
					allowedExact: ['custom/path.txt'],
				},
			},
		};

		// Should have both custom and default properties
		// Test via authority check
		const result = checkFileAuthority(
			'coder',
			'custom/path.txt',
			TEST_CWD,
			authorityConfig,
		);
		expect(result.allowed).toBe(true);
	});

	test('user rules override defaults for new properties', () => {
		const authorityConfig: AuthorityConfig = {
			enabled: true,
			rules: {
				architect: {
					blockedExact: ['custom/blocked.txt'],
				},
			},
		};

		// Both custom and default should be present (merged)
		const result = checkFileAuthority(
			'architect',
			'custom/blocked.txt',
			TEST_CWD,
			authorityConfig,
		);
		expect(result.allowed).toBe(false);
		expect(result.reason).toContain('blocked (exact)');
	});

	test('returns defaults when no rules provided', () => {
		const result = checkFileAuthority('architect', 'src/file.ts', TEST_CWD);
		// Architect should have default rules
		expect(result.allowed).toBe(true);
	});

	test('handles disabled authority', () => {
		const authorityConfig: AuthorityConfig = { enabled: false };
		// When disabled, should use defaults
		const result = checkFileAuthority(
			'architect',
			'src/file.ts',
			TEST_CWD,
			authorityConfig,
		);
		expect(result.allowed).toBe(true);
	});

	test('normalizes agent names to lowercase', () => {
		const authorityConfig: AuthorityConfig = {
			enabled: true,
			rules: {
				CODER: {
					allowedExact: ['test.txt'],
				},
			},
		};

		// lowercase version should work
		const result = checkFileAuthority(
			'coder',
			'test.txt',
			TEST_CWD,
			authorityConfig,
		);
		expect(result.allowed).toBe(true);
	});
});

describe('DEFAULT_AGENT_AUTHORITY_RULES', () => {
	test('architect has correct defaults', () => {
		const rules = DEFAULT_AGENT_AUTHORITY_RULES;
		expect(rules.architect.blockedExact).toEqual([
			'.swarm/plan.md',
			'.swarm/plan.json',
		]);
		expect(rules.architect.blockedZones).toContain('generated');
	});

	test('coder has correct defaults', () => {
		const rules = DEFAULT_AGENT_AUTHORITY_RULES;
		expect(rules.coder.blockedPrefix).toContain('.swarm/');
		expect(rules.coder.allowedPrefix).toContain('src/');
		expect(rules.coder.blockedZones).toContain('generated');
		expect(rules.coder.blockedZones).toContain('config');
	});

	test('explorer is read-only', () => {
		const rules = DEFAULT_AGENT_AUTHORITY_RULES;
		expect(rules.explorer.readOnly).toBe(true);
	});

	test('test_engineer has correct defaults', () => {
		const rules = DEFAULT_AGENT_AUTHORITY_RULES;
		expect(rules.test_engineer.blockedExact).toContain('.swarm/plan.md');
		expect(rules.test_engineer.allowedPrefix).toContain('tests/');
		expect(rules.test_engineer.blockedPrefix).toContain('src/');
	});
});

describe('Cross-platform path handling', () => {
	test('handles Windows-style paths', () => {
		// Test with Windows-style separators (should be normalized)
		const result = checkFileAuthority('architect', 'src\\index.ts', TEST_CWD);
		// Should be normalized and allowed (architect has no prefix restrictions)
		expect(result.allowed).toBe(true);
	});

	test('handles mixed separators', () => {
		const result = checkFileAuthority('coder', 'src/subdir\\file.ts', TEST_CWD);
		// Path should be normalized
		expect(result.allowed).toBe(true);
	});
});

describe('Edge cases', () => {
	test('returns unknown agent for unrecognized agents', () => {
		const result = checkFileAuthority('unknown_agent', 'src/file.ts', TEST_CWD);
		expect(result.allowed).toBe(false);
		expect(result.reason).toContain('Unknown agent');
	});

	test('empty file path is allowed for architect (no prefix restrictions)', () => {
		const result = checkFileAuthority('architect', '', TEST_CWD);
		// Architect has no prefix restrictions, empty path is allowed
		expect(result.allowed).toBe(true);
	});

	test('allows path with no rules configured - default allow', () => {
		const authorityConfig: AuthorityConfig = {
			enabled: true,
			rules: {
				new_agent: {},
			},
		};

		const result = checkFileAuthority(
			'new_agent',
			'any/path.txt',
			TEST_CWD,
			authorityConfig,
		);
		// Empty rules means no restrictions, so allow by default
		expect(result.allowed).toBe(true);
	});

	test('empty allowedPrefix blocks all paths', () => {
		const authorityConfig: AuthorityConfig = {
			enabled: true,
			rules: {
				test_agent: {
					allowedPrefix: [],
				},
			},
		};

		const result = checkFileAuthority(
			'test_agent',
			'src/file.ts',
			TEST_CWD,
			authorityConfig,
		);
		// Empty allowedPrefix array means nothing is allowed
		expect(result.allowed).toBe(false);
	});
});

describe('Security: path traversal protection', () => {
	test('architect allows .. paths (no prefix restrictions)', () => {
		const result = checkFileAuthority(
			'architect',
			'../../../etc/passwd',
			TEST_CWD,
		);
		// Architect has no prefix restrictions
		expect(result.allowed).toBe(true);
	});

	test('coder blocks absolute paths outside project', () => {
		const result = checkFileAuthority('coder', '/etc/passwd', TEST_CWD);
		// Should be blocked by allowedPrefix rules
		expect(result.allowed).toBe(false);
	});
});

describe('Classification integration', () => {
	test('classifyFile returns object with zone property', () => {
		const result = classifyFile('package.json');
		// classifyFile returns an object with zone property
		expect(result.zone).toBe('config');
	});

	test('classifyFile identifies source files', () => {
		const result = classifyFile('src/index.ts');
		// src/ is typically classified as production zone
		expect(result.zone).toBe('production');
	});

	test('classifyFile identifies config files', () => {
		const result = classifyFile('tsconfig.json');
		expect(result.zone).toBe('config');
	});
});
