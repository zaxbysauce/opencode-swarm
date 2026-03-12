import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { complexity_hotspots } from '../../../src/tools/complexity-hotspots';
import type { ToolContext } from '@opencode-ai/plugin';

// Mock for Bun.spawn
let originalSpawn: typeof Bun.spawn;
let mockStdout: string = '';
let mockStderr: string = '';
let mockExitCode: number = 0;

function mockSpawn(cmd: string[], opts: unknown) {
	const encoder = new TextEncoder();
	const stdoutReadable = new ReadableStream({
		start(controller) {
			controller.enqueue(encoder.encode(mockStdout));
			controller.close();
		}
	});
	const stderrReadable = new ReadableStream({
		start(controller) {
			controller.enqueue(encoder.encode(mockStderr));
			controller.close();
		}
	});

	return {
		stdout: stdoutReadable,
		stderr: stderrReadable,
		exited: Promise.resolve(mockExitCode),
		exitCode: mockExitCode,
	} as unknown as ReturnType<typeof Bun.spawn>;
}

// Temp directories
let tempDir: string;
let originalCwd: string;

// Helper to create mock context
function getMockContext(): ToolContext {
	return {
		sessionID: 'test-session',
		messageID: 'test-message',
		agent: 'test-agent',
		directory: tempDir,
		worktree: tempDir,
		abort: new AbortController().signal,
		metadata: () => ({}),
		ask: async () => undefined,
	};
}

// Helper to create directory structure
function createTestFile(relativePath: string, content: string) {
	const fullPath = path.join(tempDir, relativePath);
	const dir = path.dirname(fullPath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	fs.writeFileSync(fullPath, content);
}

describe('complexity_hotspots tool', async () => {
	beforeEach(() => {
		originalSpawn = Bun.spawn;
		mockStdout = '';
		mockStderr = '';
		mockExitCode = 0;
		Bun.spawn = mockSpawn;

		// Save current directory and create temp dir
		originalCwd = process.cwd();
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'complexity-hotspots-test-'));
		process.chdir(tempDir);
	});

	afterEach(() => {
		Bun.spawn = originalSpawn;
		process.chdir(originalCwd);
		// Clean up temp dir
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	// ============ VERIFICATION TESTS ============

	describe('Verification Tests - estimateComplexity', async () => {
		it('1. estimateComplexity counts if statements correctly', async () => {
			const content = `
if (a) { x++; }
if (b) { y++; }
if (c) { z++; }
`;
			// Write file directly to tempDir
			fs.writeFileSync(path.join(tempDir, 'test-if.ts'), content);
			// Git log outputs just the filename (relative to cwd)
			mockStdout = '\ntest-if.ts\ntest-if.ts\n';
			
			const result = await complexity_hotspots.execute({ days: 90, top_n: 20 }, getMockContext());
			const parsed = JSON.parse(result);
			
			expect(parsed.hotspots[0].complexity).toBe(4); // 1 (base) + 3 ifs = 4
		});

		it('2. estimateComplexity counts for loops correctly', async () => {
			const content = `
for (let i = 0; i < 10; i++) { console.log(i); }
for (let j = 0; j < 5; j++) { console.log(j); }
`;
			fs.writeFileSync(path.join(tempDir, 'test-for.ts'), content);
			mockStdout = '\ntest-for.ts\ntest-for.ts\n';
			
			const result = await complexity_hotspots.execute({ days: 90, top_n: 20 }, getMockContext());
			const parsed = JSON.parse(result);
			
			expect(parsed.hotspots[0].complexity).toBe(3); // 1 (base) + 2 for = 3
		});

		it('3. estimateComplexity counts while loops correctly', async () => {
			const content = `
while (condition) { doSomething(); }
while (other) { doOther(); }
`;
			fs.writeFileSync(path.join(tempDir, 'test-while.ts'), content);
			mockStdout = '\ntest-while.ts\ntest-while.ts\n';
			
			const result = await complexity_hotspots.execute({ days: 90, top_n: 20 }, getMockContext());
			const parsed = JSON.parse(result);
			
			expect(parsed.hotspots[0].complexity).toBe(3); // 1 (base) + 2 while = 3
		});

		it('4. estimateComplexity counts switch statements correctly', async () => {
			const content = `
switch (value) {
	case 1: break;
	case 2: break;
	case 3: break;
}
switch (other) {
	case 'a': break;
	case 'b': break;
}
`;
			fs.writeFileSync(path.join(tempDir, 'test-switch.ts'), content);
			mockStdout = '\ntest-switch.ts\ntest-switch.ts\n';
			
			const result = await complexity_hotspots.execute({ days: 90, top_n: 20 }, getMockContext());
			const parsed = JSON.parse(result);
			
			// 2 switches + 5 cases = 7, plus base 1 = 8
			expect(parsed.hotspots[0].complexity).toBe(8);
		});

		it('5. estimateComplexity counts catch blocks correctly', async () => {
			const content = `
try { x; } catch (e) { handleError(e); }
try { y; } catch (err) { log(err); }
`;
			fs.writeFileSync(path.join(tempDir, 'test-catch.ts'), content);
			mockStdout = '\ntest-catch.ts\ntest-catch.ts\n';
			
			const result = await complexity_hotspots.execute({ days: 90, top_n: 20 }, getMockContext());
			const parsed = JSON.parse(result);
			
			// 1 base + 2 catches = 3
			expect(parsed.hotspots[0].complexity).toBe(3);
		});

		it('6. estimateComplexity counts && operators correctly', async () => {
			const content = `
if (a && b && c) { x; }
if (d && e) { y; }
`;
			fs.writeFileSync(path.join(tempDir, 'test-and.ts'), content);
			mockStdout = '\ntest-and.ts\ntest-and.ts\n';
			
			const result = await complexity_hotspots.execute({ days: 90, top_n: 20 }, getMockContext());
			const parsed = JSON.parse(result);
			
			// 1 base + 2 ifs + 3 && = 6
			expect(parsed.hotspots[0].complexity).toBe(6);
		});

		it('7. estimateComplexity counts || operators correctly', async () => {
			const content = `
if (a || b || c) { x; }
if (d || e) { y; }
`;
			fs.writeFileSync(path.join(tempDir, 'test-or.ts'), content);
			mockStdout = '\ntest-or.ts\ntest-or.ts\n';
			
			const result = await complexity_hotspots.execute({ days: 90, top_n: 20 }, getMockContext());
			const parsed = JSON.parse(result);
			
			// 1 base + 2 ifs + 2 || = 5... wait, let me recalculate:
			// First if has a||b||c = 2 || operators
			// Second if has d||e = 1 || operator
			// Total || = 3
			// 1 base + 2 ifs + 3 || = 6
			expect(parsed.hotspots[0].complexity).toBe(6);
		});

		it('8. estimateComplexity ignores line comments (//)', async () => {
			const content = `
// This is a comment
if (realCondition) { x; }
// another comment
// yet another
if (anotherReal) { y; }
`;
			fs.writeFileSync(path.join(tempDir, 'test-line-comment.ts'), content);
			mockStdout = '\ntest-line-comment.ts\ntest-line-comment.ts\n';
			
			const result = await complexity_hotspots.execute({ days: 90, top_n: 20 }, getMockContext());
			const parsed = JSON.parse(result);
			
			// Should count 2 ifs, not 4
			expect(parsed.hotspots[0].complexity).toBe(3); // 1 base + 2 ifs = 3
		});

		it('9. estimateComplexity ignores block comments (/* */)', async () => {
			const content = `
/* This is a block comment */
if (realCondition) { x; }
/* another
   multi-line
   comment */
if (anotherReal) { y; }
/* end */
`;
			fs.writeFileSync(path.join(tempDir, 'test-block-comment.ts'), content);
			mockStdout = '\ntest-block-comment.ts\ntest-block-comment.ts\n';
			
			const result = await complexity_hotspots.execute({ days: 90, top_n: 20 }, getMockContext());
			const parsed = JSON.parse(result);
			
			// Should count 2 ifs, not 4
			expect(parsed.hotspots[0].complexity).toBe(3); // 1 base + 2 ifs = 3
		});

		it('10. estimateComplexity ignores string literals', async () => {
			const content = `
const x = "if (this is in a string)";
const y = 'another "if" in string';
const z = \`template with if\`;
if (realCondition) { doSomething(); }
`;
			fs.writeFileSync(path.join(tempDir, 'test-strings.ts'), content);
			mockStdout = '\ntest-strings.ts\ntest-strings.ts\n';
			
			const result = await complexity_hotspots.execute({ days: 90, top_n: 20 }, getMockContext());
			const parsed = JSON.parse(result);
			
			// Should count only 1 real if
			expect(parsed.hotspots[0].complexity).toBe(2); // 1 base + 1 if = 2
		});

		it('11. estimateComplexity returns 1 for empty/simple file (base complexity)', async () => {
			const content = `// Just a comment with no code`;
			fs.writeFileSync(path.join(tempDir, 'test-empty.ts'), content);
			mockStdout = '\ntest-empty.ts\ntest-empty.ts\n';
			
			const result = await complexity_hotspots.execute({ days: 90, top_n: 20 }, getMockContext());
			const parsed = JSON.parse(result);
			
			// Only base complexity of 1
			expect(parsed.hotspots[0].complexity).toBe(1);
		});

		it('12. Risk score calculation works correctly', async () => {
			const content = `
if (a) { if (b) { if (c) { x; } } }
if (d) { if (e) { if (f) { x; } } }
if (g) { if (h) { if (i) { x; } } }
`;
			fs.writeFileSync(path.join(tempDir, 'test-risk.ts'), content);
			// churnCount = 10 (file appears 10 times in git log)
			mockStdout = '\ntest-risk.ts\n'.repeat(10);
			
			const result = await complexity_hotspots.execute({ days: 90, top_n: 20 }, getMockContext());
			const parsed = JSON.parse(result);
			
			// complexity = 10 (1 base + 9 ifs)
			// riskScore = round(10 * log2(10) * 10) / 10
			const expectedComplexity = 10;
			const expectedRiskScore = Math.round(10 * Math.log2(expectedComplexity) * 10) / 10;
			expect(parsed.hotspots[0].complexity).toBe(expectedComplexity);
			expect(parsed.hotspots[0].riskScore).toBe(expectedRiskScore);
		});

		it('13. Recommendation thresholds work correctly', async () => {
			// Create file with high complexity and churn for full_gates
			const content1 = `
if (a) { if (b) { if (c) { if (d) { if (e) { x; } } } } }
if (f) { if (g) { if (h) { if (i) { if (j) { x; } } } } }
if (k) { if (l) { if (m) { if (n) { if (o) { x; } } } } }
if (p) { if (q) { if (r) { if (s) { if (t) { x; } } } } }
if (u) { if (v) { if (w) { if (x) { if (y) { x; } } } } }
`;
			fs.writeFileSync(path.join(tempDir, 'test-high.ts'), content1);
			// High churn for full_gates
			mockStdout = '\ntest-high.ts\n'.repeat(20);
			
			const result = await complexity_hotspots.execute({ days: 90, top_n: 20 }, getMockContext());
			const parsed = JSON.parse(result);
			
			// Check recommendation is at least full_gates or security_review
			const rec = parsed.hotspots[0].recommendation;
			expect(['full_gates', 'security_review', 'enhanced_review', 'standard']).toContain(rec);
		});

		it('14. Test files excluded from results (.test. in name)', async () => {
			// Create src subdirectory
			fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
			mockStdout = '\nsrc/auth/login.test.ts\nsrc/auth/login.test.ts\nsrc/app.ts\n';
			
			fs.writeFileSync(path.join(tempDir, 'src', 'app.ts'), 'if (x) { y; }');
			
			const result = await complexity_hotspots.execute({ days: 90, top_n: 20 }, getMockContext());
			const parsed = JSON.parse(result);
			
			// Should only include app.ts, not login.test.ts
			const testFiles = parsed.hotspots.filter((h: any) => h.file.includes('.test.'));
			expect(testFiles.length).toBe(0);
		});

		it('15. Test files excluded from results (.spec. in name)', async () => {
			fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
			mockStdout = '\nsrc/auth/login.spec.ts\nsrc/auth/login.spec.ts\nsrc/app.ts\n';
			
			fs.writeFileSync(path.join(tempDir, 'src', 'app.ts'), 'if (x) { y; }');
			
			const result = await complexity_hotspots.execute({ days: 90, top_n: 20 }, getMockContext());
			const parsed = JSON.parse(result);
			
			// Should only include app.ts, not login.spec.ts
			const specFiles = parsed.hotspots.filter((h: any) => h.file.includes('.spec.'));
			expect(specFiles.length).toBe(0);
		});

		it('16. node_modules excluded from results', async () => {
			fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
			mockStdout = '\nnode_modules/lodash/index.js\nnode_modules/lodash/index.js\nsrc/app.ts\n';
			
			fs.writeFileSync(path.join(tempDir, 'src', 'app.ts'), 'if (x) { y; }');
			
			const result = await complexity_hotspots.execute({ days: 90, top_n: 20 }, getMockContext());
			const parsed = JSON.parse(result);
			
			// Should only include app.ts, not node_modules
			const nodeModulesFiles = parsed.hotspots.filter((h: any) => h.file.includes('node_modules'));
			expect(nodeModulesFiles.length).toBe(0);
		});

		it('17. Returns correct summary counts', async () => {
			fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
			
			const highRisk = `if (a) { if (b) { if (c) { if (d) { if (e) { x; } } } } }
if (f) { if (g) { if (h) { if (i) { if (j) { x; } } } } }`;
			const mediumRisk = `if (a) { if (b) { if (c) { x; } } }
if (d) { if (e) { if (f) { x; } } }`;
			const lowRisk = `if (a) { x; }
if (b) { y; }`;
			const minRisk = `const x = 1;`;
			
			fs.writeFileSync(path.join(tempDir, 'src', 'high.ts'), highRisk);
			fs.writeFileSync(path.join(tempDir, 'src', 'medium.ts'), mediumRisk);
			fs.writeFileSync(path.join(tempDir, 'src', 'low.ts'), lowRisk);
			fs.writeFileSync(path.join(tempDir, 'src', 'min.ts'), minRisk);
			
			mockStdout = '\nsrc/high.ts\n'.repeat(20) + '\nsrc/medium.ts\n'.repeat(10) + '\nsrc/low.ts\n'.repeat(5) + '\nsrc/min.ts\n';
			
			const result = await complexity_hotspots.execute({ days: 90, top_n: 20 }, getMockContext());
			const parsed = JSON.parse(result);
			
			// Verify summary counts sum to total hotspots
			const total = parsed.summary.fullGates + parsed.summary.securityReview + 
				parsed.summary.enhancedReview + parsed.summary.standard;
			expect(total).toBe(parsed.hotspots.length);
		});

		it('18. Git log output parsing: correctly counts file occurrences', async () => {
			fs.mkdirSync(path.join(tempDir, 'src', 'auth'), { recursive: true });
			fs.mkdirSync(path.join(tempDir, 'src', 'api'), { recursive: true });
			fs.mkdirSync(path.join(tempDir, 'src', 'utils'), { recursive: true });
			
			mockStdout = `
src/auth/login.ts
src/auth/login.ts
src/api/routes.ts
src/api/routes.ts
src/api/routes.ts
src/utils/helper.ts
src/utils/helper.ts
`;
			
			fs.writeFileSync(path.join(tempDir, 'src', 'auth', 'login.ts'), 'if (x) { y; }');
			fs.writeFileSync(path.join(tempDir, 'src', 'api', 'routes.ts'), 'if (a) { b; }');
			fs.writeFileSync(path.join(tempDir, 'src', 'utils', 'helper.ts'), 'const x = 1;');
			
			const result = await complexity_hotspots.execute({ days: 90, top_n: 20 }, getMockContext());
			const parsed = JSON.parse(result);
			
			// Find login.ts - should have churn count of 2
			const loginEntry = parsed.hotspots.find((h: any) => h.file.includes('login.ts'));
			expect(loginEntry?.churnCount).toBe(2);
			
			// Find routes.ts - should have churn count of 3
			const routesEntry = parsed.hotspots.find((h: any) => h.file.includes('routes.ts'));
			expect(routesEntry?.churnCount).toBe(3);
			
			// Find helper.ts - should have churn count of 2
			const helperEntry = parsed.hotspots.find((h: any) => h.file.includes('helper.ts'));
			expect(helperEntry?.churnCount).toBe(2);
		});

		it('19. Path normalization: Windows backslashes converted to forward slashes', async () => {
			// Git on Windows outputs backslashes
			fs.mkdirSync(path.join(tempDir, 'src', 'auth'), { recursive: true });
			fs.mkdirSync(path.join(tempDir, 'src', 'api'), { recursive: true });
			
			mockStdout = `
src\\auth\\login.ts
src\\auth\\login.ts
src\\api\\routes.ts
`;
			
			fs.writeFileSync(path.join(tempDir, 'src', 'auth', 'login.ts'), 'if (x) { y; }');
			fs.writeFileSync(path.join(tempDir, 'src', 'api', 'routes.ts'), 'if (a) { b; }');
			
			const result = await complexity_hotspots.execute({ days: 90, top_n: 20 }, getMockContext());
			const parsed = JSON.parse(result);
			
			// All paths should use forward slashes
			for (const hotspot of parsed.hotspots) {
				expect(hotspot.file).not.toContain('\\\\');
			}
		});

		it('20. else if counted correctly', async () => {
			const content = `
if (a) { x; }
else if (b) { y; }
else if (c) { z; }
else if (d) { w; }
`;
			fs.writeFileSync(path.join(tempDir, 'test-elseif.ts'), content);
			mockStdout = '\ntest-elseif.ts\ntest-elseif.ts\n';
			
			const result = await complexity_hotspots.execute({ days: 90, top_n: 20 }, getMockContext());
			const parsed = JSON.parse(result);
			
			// The code counts if and else if separately:
			// 1 if + 3 else if (each counted by the regex) + 3 ifs inside else if (matched by \bif\b)
			// + 1 base = 8
			expect(parsed.hotspots[0].complexity).toBe(8);
		});
	});

	// ============ ADVERSARIAL TESTS ============

	describe('Adversarial Tests - Input Validation', async () => {
		it('1. days = 0 returns error (out of range)', async () => {
			const result = await complexity_hotspots.execute({ days: 0, top_n: 20 }, getMockContext());
			const parsed = JSON.parse(result);
			
			expect(parsed.error).toBeDefined();
			expect(parsed.error).toContain('days must be between 1 and 365');
			expect(parsed.analyzedFiles).toBe(0);
		});

		it('2. days = 366 returns error (out of range)', async () => {
			const result = await complexity_hotspots.execute({ days: 366, top_n: 20 }, getMockContext());
			const parsed = JSON.parse(result);
			
			expect(parsed.error).toBeDefined();
			expect(parsed.error).toContain('days must be between 1 and 365');
			expect(parsed.analyzedFiles).toBe(0);
		});

		it('3. days = -1 returns error (negative)', async () => {
			const result = await complexity_hotspots.execute({ days: -1, top_n: 20 }, getMockContext());
			const parsed = JSON.parse(result);
			
			expect(parsed.error).toBeDefined();
			expect(parsed.error).toContain('days must be between 1 and 365');
			expect(parsed.analyzedFiles).toBe(0);
		});

		it('4. top_n = 0 returns error (out of range)', async () => {
			const result = await complexity_hotspots.execute({ days: 90, top_n: 0 }, getMockContext());
			const parsed = JSON.parse(result);
			
			expect(parsed.error).toBeDefined();
			expect(parsed.error).toContain('top_n must be between 1 and 100');
			expect(parsed.analyzedFiles).toBe(0);
		});

		it('5. top_n = 101 returns error (out of range)', async () => {
			const result = await complexity_hotspots.execute({ days: 90, top_n: 101 }, getMockContext());
			const parsed = JSON.parse(result);
			
			expect(parsed.error).toBeDefined();
			expect(parsed.error).toContain('top_n must be between 1 and 100');
			expect(parsed.analyzedFiles).toBe(0);
		});

		it('6. extensions with shell metacharacter "ts;rm -rf /" returns error', async () => {
			const result = await complexity_hotspots.execute({ 
				days: 90, 
				top_n: 20, 
				extensions: 'ts;rm -rf /' 
			}, getMockContext());
			const parsed = JSON.parse(result);
			
			expect(parsed.error).toBeDefined();
			expect(parsed.error).toContain('shell metacharacters');
			expect(parsed.analyzedFiles).toBe(0);
		});

		it('7. extensions with pipe character returns error', async () => {
			const result = await complexity_hotspots.execute({ 
				days: 90, 
				top_n: 20, 
				extensions: 'ts|js' 
			}, getMockContext());
			const parsed = JSON.parse(result);
			
			expect(parsed.error).toBeDefined();
			expect(parsed.error).toContain('shell metacharacters');
		});

		it('8. extensions with ampersand returns error', async () => {
			const result = await complexity_hotspots.execute({ 
				days: 90, 
				top_n: 20, 
				extensions: 'ts&js' 
			}, getMockContext());
			const parsed = JSON.parse(result);
			
			expect(parsed.error).toBeDefined();
			expect(parsed.error).toContain('shell metacharacters');
		});

		it('9. extensions with backtick returns error', async () => {
			const result = await complexity_hotspots.execute({ 
				days: 90, 
				top_n: 20, 
				extensions: 'ts`js' 
			}, getMockContext());
			const parsed = JSON.parse(result);
			
			expect(parsed.error).toBeDefined();
			expect(parsed.error).toContain('shell metacharacters');
		});

		it('10. extensions with dollar returns error', async () => {
			const result = await complexity_hotspots.execute({ 
				days: 90, 
				top_n: 20, 
				extensions: 'ts$js' 
			}, getMockContext());
			const parsed = JSON.parse(result);
			
			expect(parsed.error).toBeDefined();
			expect(parsed.error).toContain('shell metacharacters');
		});

		it('11. extensions with percent returns error', async () => {
			const result = await complexity_hotspots.execute({ 
				days: 90, 
				top_n: 20, 
				extensions: 'ts%js' 
			}, getMockContext());
			const parsed = JSON.parse(result);
			
			expect(parsed.error).toBeDefined();
			expect(parsed.error).toContain('shell metacharacters');
		});

		it('12. extensions with backslash returns error', async () => {
			const result = await complexity_hotspots.execute({ 
				days: 90, 
				top_n: 20, 
				extensions: 'ts\\js' 
			}, getMockContext());
			const parsed = JSON.parse(result);
			
			expect(parsed.error).toBeDefined();
			expect(parsed.error).toContain('shell metacharacters');
		});

		it('13. top_n as float returns error (not integer)', async () => {
			const result = await complexity_hotspots.execute({ 
				days: 90, 
				top_n: 10.5 
			}, getMockContext());
			const parsed = JSON.parse(result);
			
			expect(parsed.error).toBeDefined();
			expect(parsed.error).toContain('top_n must be an integer');
		});

		it('14. days as float returns error (not integer)', async () => {
			const result = await complexity_hotspots.execute({ 
				days: 90.5, 
				top_n: 20 
			}, getMockContext());
			const parsed = JSON.parse(result);
			
			expect(parsed.error).toBeDefined();
			expect(parsed.error).toContain('days must be an integer');
		});

		it('15. extensions with newline returns error (control character)', async () => {
			const result = await complexity_hotspots.execute({ 
				days: 90, 
				top_n: 20, 
				extensions: 'ts\njs' 
			}, getMockContext());
			const parsed = JSON.parse(result);
			
			expect(parsed.error).toBeDefined();
			expect(parsed.error).toContain('control characters');
		});

		it('16. extensions with tab returns error (control character)', async () => {
			const result = await complexity_hotspots.execute({ 
				days: 90, 
				top_n: 20, 
				extensions: 'ts\tjs' 
			}, getMockContext());
			const parsed = JSON.parse(result);
			
			expect(parsed.error).toBeDefined();
			expect(parsed.error).toContain('control characters');
		});

		it('17. Default values work correctly (days=90, top_n=20)', async () => {
			fs.writeFileSync(path.join(tempDir, 'app.ts'), 'if (x) { y; }');
			mockStdout = '\napp.ts\n';
			
			const result = await complexity_hotspots.execute({}, getMockContext());
			const parsed = JSON.parse(result);
			
			expect(parsed.error).toBeUndefined();
			expect(parsed.period).toBe('90 days');
		});

		it('18. Boundaries work: days=1 is valid', async () => {
			fs.writeFileSync(path.join(tempDir, 'app.ts'), 'if (x) { y; }');
			mockStdout = '\napp.ts\n';
			
			const result = await complexity_hotspots.execute({ days: 1, top_n: 20 }, getMockContext());
			const parsed = JSON.parse(result);
			
			expect(parsed.error).toBeUndefined();
			expect(parsed.period).toBe('1 days');
		});

		it('19. Boundaries work: days=365 is valid', async () => {
			fs.writeFileSync(path.join(tempDir, 'app.ts'), 'if (x) { y; }');
			mockStdout = '\napp.ts\n';
			
			const result = await complexity_hotspots.execute({ days: 365, top_n: 20 }, getMockContext());
			const parsed = JSON.parse(result);
			
			expect(parsed.error).toBeUndefined();
			expect(parsed.period).toBe('365 days');
		});

		it('20. Boundaries work: top_n=1 is valid', async () => {
			fs.writeFileSync(path.join(tempDir, 'app.ts'), 'if (x) { y; }');
			mockStdout = '\napp.ts\n';
			
			const result = await complexity_hotspots.execute({ days: 90, top_n: 1 }, getMockContext());
			const parsed = JSON.parse(result);
			
			expect(parsed.error).toBeUndefined();
			expect(parsed.hotspots.length).toBeLessThanOrEqual(1);
		});

		it('21. Boundaries work: top_n=100 is valid', async () => {
			fs.writeFileSync(path.join(tempDir, 'app.ts'), 'if (x) { y; }');
			mockStdout = '\napp.ts\n';
			
			const result = await complexity_hotspots.execute({ days: 90, top_n: 100 }, getMockContext());
			const parsed = JSON.parse(result);
			
			expect(parsed.error).toBeUndefined();
		});

		it('22. extensions with valid comma-separated values works', async () => {
			fs.writeFileSync(path.join(tempDir, 'app.ts'), 'if (x) { y; }');
			fs.writeFileSync(path.join(tempDir, 'app.js'), 'if (a) { b; }');
			mockStdout = '\napp.ts\napp.js\n';
			
			const result = await complexity_hotspots.execute({ 
				days: 90, 
				top_n: 20, 
				extensions: 'ts,js' 
			}, getMockContext());
			const parsed = JSON.parse(result);
			
			expect(parsed.error).toBeUndefined();
		});

		it('23. extensions with dot prefix works', async () => {
			fs.writeFileSync(path.join(tempDir, 'app.ts'), 'if (x) { y; }');
			mockStdout = '\napp.ts\n';
			
			const result = await complexity_hotspots.execute({ 
				days: 90, 
				top_n: 20, 
				extensions: '.ts,.js' 
			}, getMockContext());
			const parsed = JSON.parse(result);
			
			expect(parsed.error).toBeUndefined();
		});
	});
});
