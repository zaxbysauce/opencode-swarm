/**
 * Adversarial tests for completion-verify tool
 * Tests: path traversal via files_touched, oversized payloads, malformed JSON,
 * Unicode/emoji edge cases, ReDoS vulnerability, race conditions, and boundary violations.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// We need to test the actual behavior, so we import the real function
// and use a mock-free approach (validateSwarmPath is NOT applied to file targets)
import { executeCompletionVerify } from '../../../src/tools/completion-verify';

// Helper to create temp test directories
function createTempDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'completion-verify-adv-'));
}

// Helper to create a mock plan.json
function createPlanFile(dir: string, plan: object) {
	const planPath = path.join(dir, '.swarm', 'plan.json');
	fs.mkdirSync(path.join(dir, '.swarm'), { recursive: true });
	fs.writeFileSync(planPath, JSON.stringify(plan), 'utf-8');
}

// Helper to create a source file
function createSourceFile(dir: string, filePath: string, content: string) {
	const fullPath = path.join(dir, filePath);
	const dirPart = path.dirname(fullPath);
	fs.mkdirSync(dirPart, { recursive: true });
	fs.writeFileSync(fullPath, content, 'utf-8');
}

// ============ 1. PATH TRAVERSAL VIA files_touched ============
describe('path traversal attacks', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir();
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it('should prevent path traversal via files_touched (absolute path outside project)', async () => {
		// Security fix: completion_verify now checks that resolved file paths stay within
		// the project directory. An absolute path in files_touched must be rejected.
		const secretDir = path.join(
			os.tmpdir(),
			'completion-verify-secret-' + Date.now(),
		);
		fs.mkdirSync(secretDir, { recursive: true });
		const secretPath = path.join(secretDir, 'secret.txt');
		fs.writeFileSync(secretPath, 'SUPER_SECRET_DATA_12345', 'utf-8');

		const plan = {
			phases: [
				{
					id: 1,
					name: 'Test Phase',
					tasks: [
						{
							id: '1.1',
							description: 'Update configuration',
							status: 'completed',
							files_touched: [secretPath], // Absolute path outside project
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);

		const result = await executeCompletionVerify({ phase: 1 }, tempDir);
		const parsed = JSON.parse(result);

		// The path escapes the project directory — tool must block with a boundary error,
		// not read the file and then fail on identifiers.
		expect(parsed.status).toBe('blocked');
		expect(parsed.blockedTasks[0].reason).toContain(
			'escapes the project directory',
		);

		// Cleanup
		fs.rmSync(secretDir, { recursive: true, force: true });
	});

	it('should prevent relative path traversal via files_touched (../../ escape)', async () => {
		// Security fix: relative traversal sequences that resolve outside the project
		// root must also be blocked before file I/O is attempted.
		const plan = {
			phases: [
				{
					id: 1,
					name: 'Test Phase',
					tasks: [
						{
							id: '1.1',
							description: 'Update something',
							status: 'completed',
							files_touched: [
								'../../../../../../../../../../../../../../../tmp/test-file',
							],
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);

		const result = await executeCompletionVerify({ phase: 1 }, tempDir);
		const parsed = JSON.parse(result);

		// Should block because the path escapes the project directory
		expect(parsed.status).toBe('blocked');
		expect(parsed.tasksBlocked).toBe(1);
		expect(parsed.blockedTasks[0].reason).toContain(
			'escapes the project directory',
		);
	});

	it('should handle null byte in file path from files_touched', async () => {
		// Null bytes in paths can cause undefined behavior
		const nullBytePath = 'src/file\x00.txt';
		const plan = {
			phases: [
				{
					id: 1,
					name: 'Test Phase',
					tasks: [
						{
							id: '1.1',
							description: 'Update something',
							status: 'completed',
							files_touched: [nullBytePath],
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);

		// Should not crash - either skip or block gracefully
		const result = await executeCompletionVerify({ phase: 1 }, tempDir);
		const parsed = JSON.parse(result);

		expect(parsed.status).toBeDefined();
		expect(parsed.tasksChecked).toBe(1);
	});

	it('should handle Windows-style absolute path traversal', async () => {
		// On Windows, C:\Windows\System32 style paths
		const plan = {
			phases: [
				{
					id: 1,
					name: 'Test Phase',
					tasks: [
						{
							id: '1.1',
							description: 'Update something',
							status: 'completed',
							files_touched: ['C:\\Windows\\System32\\config\\SAM'],
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);

		// Should attempt to read (and likely fail, triggering block)
		const result = await executeCompletionVerify({ phase: 1 }, tempDir);
		const parsed = JSON.parse(result);

		// Should not crash
		expect(parsed.status).toBeDefined();
	});
});

// ============ 2. OVERSIZED FILE CONTENT (Memory/Performance) ============
describe('oversized payload attacks', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir();
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it('should handle 10MB+ source file without crashing', async () => {
		// Create a 10MB+ source file
		const largeContent = 'x'.repeat(15 * 1024 * 1024); // 15MB
		createSourceFile(tempDir, 'src/large-file.ts', largeContent);

		const plan = {
			phases: [
				{
					id: 1,
					name: 'Test Phase',
					tasks: [
						{
							id: '1.1',
							description: 'Create `someIdentifier` in src/large-file.ts',
							status: 'completed',
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);

		// Should complete without crashing (might be slow but should succeed)
		const result = await executeCompletionVerify({ phase: 1 }, tempDir);
		const parsed = JSON.parse(result);

		// Should find the identifier or block
		expect(parsed.status).toBeDefined();
		expect(parsed.tasksChecked).toBe(1);
	}, 30000); // 30 second timeout for large file

	it('should handle 100MB source file', async () => {
		// Create a 100MB source file
		const hugeContent =
			'export const data = "'.padEnd(100 * 1024 * 1024, 'x') + '";';
		createSourceFile(tempDir, 'src/huge-file.ts', hugeContent);

		const plan = {
			phases: [
				{
					id: 1,
					name: 'Test Phase',
					tasks: [
						{
							id: '1.1',
							description: 'Create `someIdentifier` in src/huge-file.ts',
							status: 'completed',
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);

		const result = await executeCompletionVerify({ phase: 1 }, tempDir);
		const parsed = JSON.parse(result);

		expect(parsed.status).toBeDefined();
	}, 60000); // 60 second timeout

	it('should handle file with extremely long lines', async () => {
		// Create a file with a single extremely long line (>1MB)
		const longLine = 'export const x = "'.padEnd(5 * 1024 * 1024, 'x') + '";';
		createSourceFile(tempDir, 'src/long-line.ts', longLine);

		const plan = {
			phases: [
				{
					id: 1,
					name: 'Test Phase',
					tasks: [
						{
							id: '1.1',
							description: 'Create `x` in src/long-line.ts',
							status: 'completed',
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);

		const result = await executeCompletionVerify({ phase: 1 }, tempDir);
		const parsed = JSON.parse(result);

		expect(parsed.status).toBeDefined();
	}, 30000);
});

// ============ 3. MALFORMED JSON IN PLAN ============
describe('malformed plan.json attacks', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir();
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it('should handle invalid JSON in plan.json', async () => {
		fs.mkdirSync(path.join(tempDir, '.swarm'), { recursive: true });
		fs.writeFileSync(
			path.join(tempDir, '.swarm', 'plan.json'),
			'{ invalid json: true, }',
			'utf-8',
		);

		// Should catch the parse error and return success=false, blocked=true
		const result = await executeCompletionVerify({ phase: 1 }, tempDir);
		const parsed = JSON.parse(result);

		// The tool wraps JSON.parse in try/catch and returns passed with warning
		expect(parsed.status).toBe('passed');
		expect(parsed.reason).toContain('Cannot verify without plan.json');
	});

	it('should handle completely invalid JSON (not even object)', async () => {
		fs.mkdirSync(path.join(tempDir, '.swarm'), { recursive: true });
		fs.writeFileSync(
			path.join(tempDir, '.swarm', 'plan.json'),
			'just a string',
			'utf-8',
		);

		const result = await executeCompletionVerify({ phase: 1 }, tempDir);
		const parsed = JSON.parse(result);

		// Should handle gracefully
		expect(parsed.status).toBe('passed');
		expect(parsed.reason).toContain('Cannot verify without plan.json');
	});

	it('should handle empty file as plan.json', async () => {
		fs.mkdirSync(path.join(tempDir, '.swarm'), { recursive: true });
		fs.writeFileSync(path.join(tempDir, '.swarm', 'plan.json'), '', 'utf-8');

		const result = await executeCompletionVerify({ phase: 1 }, tempDir);
		const parsed = JSON.parse(result);

		expect(parsed.status).toBe('passed');
		expect(parsed.reason).toContain('Cannot verify without plan.json');
	});

	it('should handle plan.json with null byte injection', async () => {
		fs.mkdirSync(path.join(tempDir, '.swarm'), { recursive: true });
		// Inject null byte in JSON
		fs.writeFileSync(
			path.join(tempDir, '.swarm', 'plan.json'),
			'{"phases": [\x00null]}',
			'utf-8',
		);

		const result = await executeCompletionVerify({ phase: 1 }, tempDir);
		const parsed = JSON.parse(result);

		expect(parsed.status).toBe('passed');
		expect(parsed.reason).toContain('Cannot verify without plan.json');
	});

	it('should handle plan.json with unexpected deeply nested structure', async () => {
		fs.mkdirSync(path.join(tempDir, '.swarm'), { recursive: true });
		// Create deeply nested JSON that might cause stack overflow in parsing
		const deepObj = { a: { b: { c: { d: { e: { f: { g: 'deep' } } } } } } };
		fs.writeFileSync(
			path.join(tempDir, '.swarm', 'plan.json'),
			JSON.stringify({ phases: [deepObj] }),
			'utf-8',
		);

		const result = await executeCompletionVerify({ phase: 1 }, tempDir);
		const parsed = JSON.parse(result);

		expect(parsed.status).toBeDefined();
	});

	it('should handle plan.json with extremely large array of phases', async () => {
		fs.mkdirSync(path.join(tempDir, '.swarm'), { recursive: true });
		// Create plan with 10000 phases
		const phases = Array.from({ length: 10000 }, (_, i) => ({
			id: i + 1,
			name: `Phase ${i + 1}`,
			tasks: [],
		}));
		fs.writeFileSync(
			path.join(tempDir, '.swarm', 'plan.json'),
			JSON.stringify({ phases }),
			'utf-8',
		);

		const result = await executeCompletionVerify({ phase: 5000 }, tempDir);
		const parsed = JSON.parse(result);

		// Should handle large phase array
		expect(parsed.status).toBeDefined();
	}, 30000);
});

// ============ 4. UNICODE/EMOJI IN TASK DESCRIPTIONS ============
describe('unicode/emoji edge case attacks', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir();
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it('should handle task description with emoji identifiers', async () => {
		createSourceFile(
			tempDir,
			'src/emoji.ts',
			'export function 🎉() { return 42; }',
		);

		const plan = {
			phases: [
				{
					id: 1,
					name: 'Test Phase',
					tasks: [
						{
							id: '1.1',
							description: 'Create `🎉` in src/emoji.ts',
							status: 'completed',
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);

		const result = await executeCompletionVerify({ phase: 1 }, tempDir);
		const parsed = JSON.parse(result);

		// The emoji might not match the regex properly
		// Should handle without crashing
		expect(parsed.status).toBeDefined();
	});

	it('should handle task description with RTL unicode characters', async () => {
		// RTL unicode can confuse regex matching
		createSourceFile(tempDir, 'src/rtl.ts', 'export const value = 42;');

		const plan = {
			phases: [
				{
					id: 1,
					name: 'Test Phase',
					tasks: [
						{
							id: '1.1',
							description: 'Create `value\u200F` in src/rtl.ts', // Right-to-left mark
							status: 'completed',
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);

		const result = await executeCompletionVerify({ phase: 1 }, tempDir);
		const parsed = JSON.parse(result);

		expect(parsed.status).toBeDefined();
	});

	it('should handle task description with combining characters', async () => {
		// Combining characters can create visual confusion
		createSourceFile(tempDir, 'src/combine.ts', 'export const café = 42;');

		const plan = {
			phases: [
				{
					id: 1,
					name: 'Test Phase',
					tasks: [
						{
							id: '1.1',
							description: 'Create `café` in src/combine.ts', // é can be e + combining accent
							status: 'completed',
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);

		const result = await executeCompletionVerify({ phase: 1 }, tempDir);
		const parsed = JSON.parse(result);

		expect(parsed.status).toBeDefined();
	});

	it('should handle null byte in task description', async () => {
		createSourceFile(tempDir, 'src/null.ts', 'export const x = 1;');

		const plan = {
			phases: [
				{
					id: 1,
					name: 'Test Phase',
					tasks: [
						{
							id: '1.1',
							description: 'Create `x\x00` in src/null.ts',
							status: 'completed',
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);

		const result = await executeCompletionVerify({ phase: 1 }, tempDir);
		const parsed = JSON.parse(result);

		expect(parsed.status).toBeDefined();
	});

	it('should handle zero-width characters in identifiers', async () => {
		// Zero-width space can be invisible identifier injection
		createSourceFile(tempDir, 'src/zwc.ts', 'export const secret = 42;');

		const plan = {
			phases: [
				{
					id: 1,
					name: 'Test Phase',
					tasks: [
						{
							id: '1.1',
							description: 'Create `secret\u200B` in src/zwc.ts', // zero-width space after secret
							status: 'completed',
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);

		const result = await executeCompletionVerify({ phase: 1 }, tempDir);
		const parsed = JSON.parse(result);

		expect(parsed.status).toBeDefined();
	});
});

// ============ 5. REGEX DoS (ReDoS) VULNERABILITY ============
describe('ReDoS vulnerability in identifier parsing', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir();
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it('should handle catastrophic backtracking in regex patterns', async () => {
		// Create a source file with content designed to trigger ReDoS
		// The camelCase regex is: /\b([a-z][a-zA-Z0-9]{2,})\b/g
		// With input like: aaaaaaaaaaaaaaaaaaaaaaaaaaa...
		// The {2,} can cause exponential matching attempts
		const adversarialContent = 'a'.repeat(50) + ' '; // 50 lowercase letters
		createSourceFile(tempDir, 'src/redos.ts', adversarialContent);

		const plan = {
			phases: [
				{
					id: 1,
					name: 'Test Phase',
					tasks: [
						{
							id: '1.1',
							description: 'Create `someIdentifier` in src/redos.ts',
							status: 'completed',
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);

		const start = Date.now();
		const result = await executeCompletionVerify({ phase: 1 }, tempDir);
		const duration = Date.now() - start;
		const parsed = JSON.parse(result);

		// Should complete in reasonable time (< 5 seconds)
		expect(duration).toBeLessThan(5000);
		expect(parsed.status).toBeDefined();
	});

	it('should handle deeply nested structures in task description', async () => {
		// Many nested brackets could stress the regex engine
		const nested = '('.repeat(100) + 'identifier' + ')'.repeat(100);
		createSourceFile(tempDir, 'src/nested.ts', 'export const identifier = 1;');

		const plan = {
			phases: [
				{
					id: 1,
					name: 'Test Phase',
					tasks: [
						{
							id: '1.1',
							description: `Create \`${nested}\` in src/nested.ts`,
							status: 'completed',
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);

		const start = Date.now();
		const result = await executeCompletionVerify({ phase: 1 }, tempDir);
		const duration = Date.now() - start;

		expect(duration).toBeLessThan(5000);
		const parsed = JSON.parse(result);
		expect(parsed.status).toBeDefined();
	});

	it('should handle many special characters in description', async () => {
		// Many regex special chars could stress the engine
		const manySpecialChars =
			'$'.repeat(100) + '||'.repeat(50) + '&&'.repeat(50);
		createSourceFile(tempDir, 'src/special.ts', 'export const identifier = 1;');

		const plan = {
			phases: [
				{
					id: 1,
					name: 'Test Phase',
					tasks: [
						{
							id: '1.1',
							description: `Create identifier in src/special.ts and also ${manySpecialChars}`,
							status: 'completed',
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);

		const start = Date.now();
		const result = await executeCompletionVerify({ phase: 1 }, tempDir);
		const duration = Date.now() - start;

		expect(duration).toBeLessThan(5000);
		const parsed = JSON.parse(result);
		expect(parsed.status).toBeDefined();
	});
});

// ============ 6. CONCURRENT EVIDENCE WRITES (Race Condition) ============
describe('concurrent evidence write race conditions', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir();
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it('should handle concurrent calls to same phase', async () => {
		createSourceFile(tempDir, 'src/file.ts', 'export const identifier = 1;');

		const plan = {
			phases: [
				{
					id: 1,
					name: 'Test Phase',
					tasks: [
						{
							id: '1.1',
							description: 'Create `identifier` in src/file.ts',
							status: 'completed',
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);

		// Run 10 concurrent verifications for phase 1
		const promises = Array.from({ length: 10 }, () =>
			executeCompletionVerify({ phase: 1 }, tempDir),
		);

		const results = await Promise.all(promises);
		const parsed = results.map((r) => JSON.parse(r));

		// All should succeed
		parsed.forEach((p) => {
			expect(p.status).toBeDefined();
		});

		// Evidence file should exist
		const evidencePath = path.join(
			tempDir,
			'.swarm',
			'evidence',
			'1',
			'completion-verify.json',
		);
		expect(fs.existsSync(evidencePath)).toBe(true);

		// Evidence should be valid JSON (last writer wins, but should be valid)
		const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf-8'));
		expect(evidence.schema_version).toBe('1.0.0');
	});

	it('should handle concurrent calls to different phases', async () => {
		// Create plans for multiple phases
		for (let phase = 1; phase <= 5; phase++) {
			const phaseDir = path.join(tempDir, '.swarm', 'evidence', `${phase}`);
			fs.mkdirSync(phaseDir, { recursive: true });
		}

		createSourceFile(tempDir, 'src/file.ts', 'export const identifier = 1;');

		const plan = {
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					tasks: [
						{
							id: '1.1',
							description: 'Create `identifier` in src/file.ts',
							status: 'completed',
						},
					],
				},
				{
					id: 2,
					name: 'Phase 2',
					tasks: [
						{
							id: '2.1',
							description: 'Create `identifier` in src/file.ts',
							status: 'completed',
						},
					],
				},
				{
					id: 3,
					name: 'Phase 3',
					tasks: [
						{
							id: '3.1',
							description: 'Create `identifier` in src/file.ts',
							status: 'completed',
						},
					],
				},
				{
					id: 4,
					name: 'Phase 4',
					tasks: [
						{
							id: '4.1',
							description: 'Create `identifier` in src/file.ts',
							status: 'completed',
						},
					],
				},
				{
					id: 5,
					name: 'Phase 5',
					tasks: [
						{
							id: '5.1',
							description: 'Create `identifier` in src/file.ts',
							status: 'completed',
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);

		// Run concurrent verifications for all 5 phases
		const promises = Array.from({ length: 5 }, (_, i) =>
			executeCompletionVerify({ phase: i + 1 }, tempDir),
		);

		const results = await Promise.all(promises);
		const parsed = results.map((r) => JSON.parse(r));

		// All should succeed
		parsed.forEach((p) => {
			expect(p.status).toBe('passed');
		});
	});

	it('should handle evidence directory with special characters', async () => {
		// Create a directory with special characters
		const specialDir = path.join(
			tempDir,
			'.swarm',
			'evidence',
			'phase-with-$pecial',
		);
		fs.mkdirSync(specialDir, { recursive: true });

		createSourceFile(tempDir, 'src/file.ts', 'export const identifier = 1;');

		const plan = {
			phases: [
				{
					id: 1,
					name: 'Test Phase',
					tasks: [
						{
							id: '1.1',
							description: 'Create `identifier` in src/file.ts',
							status: 'completed',
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);

		// Tool will create its own evidence dir, but should still work
		const result = await executeCompletionVerify({ phase: 1 }, tempDir);
		const parsed = JSON.parse(result);

		expect(parsed.status).toBe('passed');
	});
});

// ============ 7. BOUNDARY VIOLATIONS ============
describe('boundary violations', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir();
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it('should handle phase = Number.MAX_SAFE_INTEGER', async () => {
		createSourceFile(tempDir, 'src/file.ts', 'export const identifier = 1;');

		const plan = {
			phases: [
				{
					id: 1,
					name: 'Test Phase',
					tasks: [
						{
							id: '1.1',
							description: 'Create `identifier` in src/file.ts',
							status: 'completed',
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);

		const result = await executeCompletionVerify(
			{ phase: Number.MAX_SAFE_INTEGER },
			tempDir,
		);
		const parsed = JSON.parse(result);

		// MAX_SAFE_INTEGER is finite and >= 1, so it passes the validity check.
		// But it won't be found in the plan, so it returns "Phase X not found"
		expect(parsed.status).toBe('blocked');
		expect(parsed.reason).toContain('not found in plan.json');
	});

	it('should handle phase = NaN', async () => {
		createSourceFile(tempDir, 'src/file.ts', 'export const identifier = 1;');

		const plan = {
			phases: [
				{
					id: 1,
					name: 'Test Phase',
					tasks: [
						{
							id: '1.1',
							description: 'Create `identifier` in src/file.ts',
							status: 'completed',
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);

		const result = await executeCompletionVerify({ phase: NaN }, tempDir);
		const parsed = JSON.parse(result);

		expect(parsed.status).toBe('blocked');
		expect(parsed.reason).toContain('Invalid phase number');
	});

	it('should handle phase = Infinity', async () => {
		createSourceFile(tempDir, 'src/file.ts', 'export const identifier = 1;');

		const plan = {
			phases: [
				{
					id: 1,
					name: 'Test Phase',
					tasks: [
						{
							id: '1.1',
							description: 'Create `identifier` in src/file.ts',
							status: 'completed',
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);

		const result = await executeCompletionVerify({ phase: Infinity }, tempDir);
		const parsed = JSON.parse(result);

		expect(parsed.status).toBe('blocked');
		expect(parsed.reason).toContain('Invalid phase number');
	});

	it('should handle phase = -0', async () => {
		createSourceFile(tempDir, 'src/file.ts', 'export const identifier = 1;');

		const plan = {
			phases: [
				{
					id: 1,
					name: 'Test Phase',
					tasks: [
						{
							id: '1.1',
							description: 'Create `identifier` in src/file.ts',
							status: 'completed',
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);

		const result = await executeCompletionVerify({ phase: -0 }, tempDir);
		const parsed = JSON.parse(result);

		// -0 is treated as 0, which is invalid
		expect(parsed.status).toBe('blocked');
	});

	it('should handle negative phase number', async () => {
		createSourceFile(tempDir, 'src/file.ts', 'export const identifier = 1;');

		const plan = {
			phases: [
				{
					id: 1,
					name: 'Test Phase',
					tasks: [
						{
							id: '1.1',
							description: 'Create `identifier` in src/file.ts',
							status: 'completed',
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);

		const result = await executeCompletionVerify({ phase: -999 }, tempDir);
		const parsed = JSON.parse(result);

		expect(parsed.status).toBe('blocked');
		expect(parsed.reason).toContain('Invalid phase number');
	});

	it('should handle plan with 10000+ tasks in a single phase', async () => {
		createSourceFile(tempDir, 'src/file.ts', 'export const identifier = 1;');

		const tasks = Array.from({ length: 10000 }, (_, i) => ({
			id: `1.${i + 1}`,
			description: 'Create `identifier` in src/file.ts',
			status: 'completed' as const,
		}));

		const plan = {
			phases: [
				{
					id: 1,
					name: 'Large Phase',
					tasks,
				},
			],
		};
		createPlanFile(tempDir, plan);

		const start = Date.now();
		const result = await executeCompletionVerify({ phase: 1 }, tempDir);
		const duration = Date.now() - start;

		// Should complete in reasonable time
		expect(duration).toBeLessThan(30000);
		const parsed = JSON.parse(result);
		expect(parsed.status).toBeDefined();
		expect(parsed.tasksChecked).toBe(10000);
	}, 60000);
});

// ============ 8. TYPE CONFUSION ATTACKS ============
describe('type confusion attacks', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir();
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it('should handle phase as string instead of number', async () => {
		createSourceFile(tempDir, 'src/file.ts', 'export const identifier = 1;');

		const plan = {
			phases: [
				{
					id: 1,
					name: 'Test Phase',
					tasks: [
						{
							id: '1.1',
							description: 'Create `identifier` in src/file.ts',
							status: 'completed',
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);

		// @ts-ignore - deliberately passing wrong type
		const result = await executeCompletionVerify({ phase: '1' }, tempDir);
		const parsed = JSON.parse(result);

		// The tool's execute function coerces string to number
		expect(parsed.status).toBeDefined();
	});

	it('should handle phase as object instead of number', async () => {
		createSourceFile(tempDir, 'src/file.ts', 'export const identifier = 1;');

		const plan = {
			phases: [
				{
					id: 1,
					name: 'Test Phase',
					tasks: [
						{
							id: '1.1',
							description: 'Create `identifier` in src/file.ts',
							status: 'completed',
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);

		// @ts-ignore - deliberately passing wrong type
		const result = await executeCompletionVerify(
			{ phase: { value: 1 } },
			tempDir,
		);
		const parsed = JSON.parse(result);

		expect(parsed.status).toBe('blocked');
		expect(parsed.reason).toContain('Invalid phase number');
	});

	it('should handle null phase', async () => {
		createSourceFile(tempDir, 'src/file.ts', 'export const identifier = 1;');

		const plan = {
			phases: [
				{
					id: 1,
					name: 'Test Phase',
					tasks: [
						{
							id: '1.1',
							description: 'Create `identifier` in src/file.ts',
							status: 'completed',
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);

		// @ts-ignore - deliberately passing wrong type
		const result = await executeCompletionVerify({ phase: null }, tempDir);
		const parsed = JSON.parse(result);

		expect(parsed.status).toBe('blocked');
		expect(parsed.reason).toContain('Invalid phase number');
	});

	it('should handle undefined phase', async () => {
		createSourceFile(tempDir, 'src/file.ts', 'export const identifier = 1;');

		const plan = {
			phases: [
				{
					id: 1,
					name: 'Test Phase',
					tasks: [
						{
							id: '1.1',
							description: 'Create `identifier` in src/file.ts',
							status: 'completed',
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);

		// @ts-ignore - deliberately passing wrong type
		const result = await executeCompletionVerify({ phase: undefined }, tempDir);
		const parsed = JSON.parse(result);

		expect(parsed.status).toBe('blocked');
		expect(parsed.reason).toContain('Invalid phase number');
	});

	it('should handle plan with non-array tasks', async () => {
		fs.mkdirSync(path.join(tempDir, '.swarm'), { recursive: true });
		// @ts-ignore - deliberately malformed
		fs.writeFileSync(
			path.join(tempDir, '.swarm', 'plan.json'),
			JSON.stringify({
				phases: [{ id: 1, name: 'Test', tasks: 'not-an-array' }],
			}),
			'utf-8',
		);

		const result = await executeCompletionVerify({ phase: 1 }, tempDir);
		const parsed = JSON.parse(result);

		// Should handle the error gracefully
		expect(parsed.status).toBeDefined();
	});

	it('should handle plan with undefined files_touched', async () => {
		const plan = {
			phases: [
				{
					id: 1,
					name: 'Test Phase',
					tasks: [
						{
							id: '1.1',
							description: 'Create `identifier` in src/file.ts',
							status: 'completed',
							files_touched: undefined,
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);
		createSourceFile(tempDir, 'src/file.ts', 'export const identifier = 1;');

		const result = await executeCompletionVerify({ phase: 1 }, tempDir);
		const parsed = JSON.parse(result);

		// Should handle undefined files_touched gracefully
		expect(parsed.status).toBeDefined();
	});

	it('should handle plan with null files_touched', async () => {
		const plan = {
			phases: [
				{
					id: 1,
					name: 'Test Phase',
					tasks: [
						{
							id: '1.1',
							description: 'Create `identifier` in src/file.ts',
							status: 'completed',
							files_touched: null,
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);
		createSourceFile(tempDir, 'src/file.ts', 'export const identifier = 1;');

		const result = await executeCompletionVerify({ phase: 1 }, tempDir);
		const parsed = JSON.parse(result);

		expect(parsed.status).toBeDefined();
	});
});

// ============ 9. EVIDENCE WRITE FAILURE HANDLING ============
describe('evidence write failure handling', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir();
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it('should not fail tool when evidence write fails', async () => {
		createSourceFile(tempDir, 'src/file.ts', 'export const identifier = 1;');

		const plan = {
			phases: [
				{
					id: 1,
					name: 'Test Phase',
					tasks: [
						{
							id: '1.1',
							description: 'Create `identifier` in src/file.ts',
							status: 'completed',
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);

		// Make evidence directory read-only
		const evidenceDir = path.join(tempDir, '.swarm', 'evidence', '1');
		fs.mkdirSync(evidenceDir, { recursive: true });
		fs.chmodSync(evidenceDir, 0o444); // Read-only

		// Tool should still return result, not throw
		const result = await executeCompletionVerify({ phase: 1 }, tempDir);
		const parsed = JSON.parse(result);

		// Tool should report success despite evidence write failure
		expect(parsed.status).toBe('passed');

		// Restore permissions for cleanup
		fs.chmodSync(evidenceDir, 0o755);
	});

	it('should handle evidence write to nested non-existent directory', async () => {
		createSourceFile(tempDir, 'src/file.ts', 'export const identifier = 1;');

		const plan = {
			phases: [
				{
					id: 1,
					name: 'Test Phase',
					tasks: [
						{
							id: '1.1',
							description: 'Create `identifier` in src/file.ts',
							status: 'completed',
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);

		// Create a file at the evidence path to make directory creation fail
		const evidencePath = path.join(
			tempDir,
			'.swarm',
			'evidence',
			'1',
			'completion-verify.json',
		);
		fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
		fs.writeFileSync(evidencePath, 'existing file');
		fs.chmodSync(evidencePath, 0o444);
		fs.chmodSync(path.dirname(evidencePath), 0o555); // Make parent read-only

		const result = await executeCompletionVerify({ phase: 1 }, tempDir);
		const parsed = JSON.parse(result);

		// Should handle gracefully
		expect(parsed.status).toBe('passed');

		// Cleanup
		fs.chmodSync(path.dirname(evidencePath), 0o755);
		fs.chmodSync(evidencePath, 0o644);
	});
});

// ============ 10. INJECTION IN TASK DESCRIPTIONS ============
describe('injection attacks in task descriptions', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir();
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it('should handle SQL injection attempt in identifier', async () => {
		createSourceFile(tempDir, 'src/sql.ts', 'export const identifier = 1;');

		const plan = {
			phases: [
				{
					id: 1,
					name: 'Test Phase',
					tasks: [
						{
							id: '1.1',
							description: "Create `' OR '1'='1` in src/sql.ts",
							status: 'completed',
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);

		const result = await executeCompletionVerify({ phase: 1 }, tempDir);
		const parsed = JSON.parse(result);

		// Should handle without crashing - backticks would be part of identifier
		expect(parsed.status).toBeDefined();
	});

	it('should handle template literal injection', async () => {
		createSourceFile(tempDir, 'src/tpl.ts', 'export const identifier = 1;');

		const plan = {
			phases: [
				{
					id: 1,
					name: 'Test Phase',
					tasks: [
						{
							id: '1.1',
							description: 'Create `${malicious}` in src/tpl.ts',
							status: 'completed',
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);

		const result = await executeCompletionVerify({ phase: 1 }, tempDir);
		const parsed = JSON.parse(result);

		expect(parsed.status).toBeDefined();
	});

	it('should handle HTML/script injection in description', async () => {
		createSourceFile(tempDir, 'src/html.ts', 'export const identifier = 1;');

		const plan = {
			phases: [
				{
					id: 1,
					name: 'Test Phase',
					tasks: [
						{
							id: '1.1',
							description:
								'Create `identifier` in src/html.ts <script>alert(1)</script>',
							status: 'completed',
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);

		const result = await executeCompletionVerify({ phase: 1 }, tempDir);
		const parsed = JSON.parse(result);

		expect(parsed.status).toBeDefined();
	});

	it('should handle path traversal characters in description (not files_touched)', async () => {
		// Path traversal chars in description should be treated as literal text
		// The regex in parseFilePaths won't extract src/../etc/passwd as a valid path
		// because it doesn't match the source file patterns (doesn't end in .ts, etc)
		createSourceFile(tempDir, 'src/file.ts', 'export const identifier = 1;');

		const plan = {
			phases: [
				{
					id: 1,
					name: 'Test Phase',
					tasks: [
						{
							id: '1.1',
							description:
								'Create `identifier` in src/../etc/passwd or src/file.ts',
							status: 'completed',
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);

		const result = await executeCompletionVerify({ phase: 1 }, tempDir);
		const parsed = JSON.parse(result);

		// Should pass because src/file.ts is valid and contains identifier
		// The src/../etc/passwd part is ignored by the regex
		expect(parsed.status).toBe('passed');
		expect(parsed.tasksBlocked).toBe(0);
	});
});

describe('Research/inventory task skip behavior (Kimi K2 regression)', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir();
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it('phase with only research tasks (no files_touched, no file paths) passes verification', () => {
		// Regression: Kimi K2.5 could not complete Phase 1 because completion_verify blocked
		// all research/inventory tasks. These tasks produce knowledge artifacts, not source files.
		const plan = {
			phases: [
				{
					id: 1,
					name: 'Research & Inventory',
					tasks: [
						{
							id: '1.1',
							description:
								'Inventory all Python files and identify test coverage gaps',
							status: 'completed',
						},
						{
							id: '1.2',
							description: 'Review CI/CD pipeline configuration for gaps',
							status: 'completed',
						},
						{
							id: '1.3',
							description: 'Analyze dependency security posture',
							status: 'completed',
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);

		return executeCompletionVerify({ phase: 1 }, tempDir).then((raw) => {
			const parsed = JSON.parse(raw);
			// All 3 tasks are research tasks with no files → all skipped, none blocked
			expect(parsed.status).toBe('passed');
			expect(parsed.tasksBlocked).toBe(0);
			expect(parsed.tasksSkipped).toBe(3);
			expect(parsed.tasksChecked).toBe(3);
		});
	});

	it('mixed phase: research tasks skipped, implementation tasks verified normally', () => {
		// Research task + implementation task in same phase:
		// Research task should skip, implementation task should be verified against its file.
		const plan = {
			phases: [
				{
					id: 1,
					name: 'Phase 1',
					tasks: [
						{
							id: '1.1',
							description: 'Inventory codebase and document gaps',
							status: 'completed',
						},
						{
							id: '1.2',
							description: 'Create `setupAuth` in src/auth/setup.ts',
							status: 'completed',
						},
					],
				},
			],
		};
		createPlanFile(tempDir, plan);
		createSourceFile(
			tempDir,
			'src/auth/setup.ts',
			'export function setupAuth() {}',
		);

		return executeCompletionVerify({ phase: 1 }, tempDir).then((raw) => {
			const parsed = JSON.parse(raw);
			// 1.1: skipped (no file targets), 1.2: passed (identifier found in file)
			expect(parsed.status).toBe('passed');
			expect(parsed.tasksBlocked).toBe(0);
			expect(parsed.tasksSkipped).toBe(1);
			expect(parsed.tasksChecked).toBe(2);
		});
	});
});
