import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';

// Import the tool AFTER setting up test environment
const { checkpoint } = await import('../../../src/tools/checkpoint');

describe('checkpoint adversarial security tests', () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'checkpoint-adversarial-'));
		originalCwd = process.cwd();

		process.chdir(tempDir);
		execSync('git init', { encoding: 'utf-8' });
		execSync('git config user.email "test@test.com"', { encoding: 'utf-8' });
		execSync('git config user.name "Test"', { encoding: 'utf-8' });
		fs.writeFileSync(path.join(tempDir, 'initial.txt'), 'initial');
		execSync('git add .', { encoding: 'utf-8' });
		execSync('git commit -m "initial"', { encoding: 'utf-8' });
	});

	afterEach(() => {
		process.chdir(originalCwd);
		try {
			fs.rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	// SHELL INJECTION ATTEMPTS

	describe('shell injection attacks', () => {
		test('rejects semicolon command chaining', async () => {
			const result = await checkpoint.execute({ action: 'save', label: 'test; rm -rf /' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/shell metacharacters|control characters|invalid characters/);
		});

		test('rejects pipe command', async () => {
			const result = await checkpoint.execute({ action: 'save', label: 'test | cat /etc/passwd' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/shell metacharacters|control characters|invalid characters/);
		});

		test('rejects backtick command substitution', async () => {
			const result = await checkpoint.execute({ action: 'save', label: 'test `whoami`' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/shell metacharacters|control characters|invalid characters/);
		});

		test('rejects $() command substitution', async () => {
			const result = await checkpoint.execute({ action: 'save', label: 'test $(whoami)' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/shell metacharacters|control characters|invalid characters/);
		});

		test('rejects ampersand backgrounding', async () => {
			const result = await checkpoint.execute({ action: 'save', label: 'test & cat /etc/passwd' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/shell metacharacters|control characters|invalid characters/);
		});

		test('rejects dollar variable expansion', async () => {
			const result = await checkpoint.execute({ action: 'save', label: 'test $HOME' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/shell metacharacters|control characters|invalid characters/);
		});

		test('rejects parens grouping', async () => {
			const result = await checkpoint.execute({ action: 'save', label: 'test (ls)' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/shell metacharacters|control characters|invalid characters/);
		});

		test('rejects curly brace expansion', async () => {
			const result = await checkpoint.execute({ action: 'save', label: 'test {ls}' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/shell metacharacters|control characters|invalid characters/);
		});

		test('rejects angle bracket redirection', async () => {
			const result = await checkpoint.execute({ action: 'save', label: 'test < /etc/passwd' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/shell metacharacters|control characters|invalid characters/);
		});

		test('rejects single quote string', async () => {
			const result = await checkpoint.execute({ action: 'save', label: "test' + 'injection" });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/shell metacharacters|control characters|invalid characters/);
		});

		test('rejects double quote with var', async () => {
			const result = await checkpoint.execute({ action: 'save', label: 'test "${HOME}"' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/shell metacharacters|control characters|invalid characters/);
		});

		test('rejects newline injection', async () => {
			const result = await checkpoint.execute({ action: 'save', label: 'test\nrm -rf /' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			// Either shell metacharacters or invalid characters is acceptable
			expect(parsed.error).toMatch(/shell metacharacters|control characters|git flag pattern|invalid characters/);
		});

		test('rejects tab injection', async () => {
			const result = await checkpoint.execute({ action: 'save', label: 'test\twhoami' });
			const parsed = JSON.parse(result);
			// SECURITY FINDING: Tab characters are being accepted - this could enable injection
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/shell metacharacters|control characters|git flag pattern|invalid characters/);
		});

		test('rejects null byte injection', async () => {
			const result = await checkpoint.execute({ action: 'save', label: 'test\x00rm -rf' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/shell metacharacters|control characters|git flag pattern|invalid characters/);
		});
	});

	// PATH TRAVERSAL ATTEMPTS

	describe('path traversal attacks', () => {
		test('rejects double dot with slash', async () => {
			const result = await checkpoint.execute({ action: 'save', label: '../etc/passwd' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			// Either path traversal or invalid characters is acceptable
			expect(parsed.error).toMatch(/path traversal|invalid characters/);
		});

		test('rejects double dot with backslash', async () => {
			const result = await checkpoint.execute({ action: 'save', label: '..\\windows\\system32' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/path traversal|invalid characters/);
		});

		test('rejects forward slash path', async () => {
			const result = await checkpoint.execute({ action: 'save', label: 'some/path' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/path traversal|invalid characters/);
		});

		test('rejects backslash path', async () => {
			const result = await checkpoint.execute({ action: 'save', label: 'some\\path' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/path traversal|invalid characters/);
		});

		test('rejects multiple double dots', async () => {
			const result = await checkpoint.execute({ action: 'save', label: '../../../../etc/passwd' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/path traversal|invalid characters/);
		});

		test('rejects dot path', async () => {
			const result = await checkpoint.execute({ action: 'save', label: './secret' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/path traversal|invalid characters/);
		});

		test('rejects absolute path attempt', async () => {
			const result = await checkpoint.execute({ action: 'save', label: '/etc/passwd' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/path traversal|invalid characters/);
		});

		test('rejects encoded path traversal double encoding', async () => {
			const result = await checkpoint.execute({ action: 'save', label: '..%2F..%2Fetc' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/path traversal|invalid characters/);
		});

		test('rejects tilde path expansion', async () => {
			const result = await checkpoint.execute({ action: 'save', label: '~/ .ssh/id_rsa' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/shell metacharacters|path traversal|invalid characters/);
		});
	});

	// GIT COMMAND/FLAG INJECTION

	describe('git flag injection attempts', () => {
		test('rejects git config flag', async () => {
			const result = await checkpoint.execute({ action: 'save', label: '--global user.email' });
			const parsed = JSON.parse(result);
			// SECURITY: These should be rejected - git flags can be interpreted
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/shell metacharacters|control characters|git flag pattern|invalid characters/);
		});

		test('rejects git help flag', async () => {
			const result = await checkpoint.execute({ action: 'save', label: '--help' });
			const parsed = JSON.parse(result);
			// SECURITY: -- prefix should be rejected to prevent git interpretation
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/shell metacharacters|control characters|git flag pattern|invalid characters/);
		});

		test('rejects git version flag', async () => {
			const result = await checkpoint.execute({ action: 'save', label: '--version' });
			const parsed = JSON.parse(result);
			// SECURITY: -- prefix should be rejected
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/shell metacharacters|control characters|git flag pattern|invalid characters/);
		});

		test('rejects git exec-path flag', async () => {
			const result = await checkpoint.execute({ action: 'save', label: '--exec-path' });
			const parsed = JSON.parse(result);
			// SECURITY: -- prefix should be rejected
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/shell metacharacters|control characters|git flag pattern|invalid characters/);
		});

		test('rejects long option with equals', async () => {
			const result = await checkpoint.execute({ action: 'save', label: '--work-tree=/tmp' });
			const parsed = JSON.parse(result);
			// SECURITY: -- prefix and = should be rejected
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/shell metacharacters|control characters|git flag pattern|invalid characters/);
		});

		test('rejects unsafe repository flag', async () => {
			const result = await checkpoint.execute({ action: 'save', label: '--unsafe-repository' });
			const parsed = JSON.parse(result);
			// SECURITY: -- prefix should be rejected
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/shell metacharacters|control characters|git flag pattern|invalid characters/);
		});
	});

	// BOUNDARY VIOLATIONS

	describe('boundary violations', () => {
		test('accepts label at exactly MAX_LENGTH 100', async () => {
			const label = 'a'.repeat(100);
			const result = await checkpoint.execute({ action: 'save', label });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(true);
		});

		test('rejects label at MAX_LENGTH + 1', async () => {
			const label = 'a'.repeat(101);
			const result = await checkpoint.execute({ action: 'save', label });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toContain('exceeds maximum length');
		});

		test('rejects empty label', async () => {
			const result = await checkpoint.execute({ action: 'save', label: '' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toContain('label is required');
		});

		test('rejects whitespace-only label', async () => {
			const result = await checkpoint.execute({ action: 'save', label: '   ' });
			const parsed = JSON.parse(result);
			// SECURITY: Whitespace-only should be rejected as empty/insufficient
			expect(parsed.success).toBe(false);
		});

		test('rejects very long label 1000 chars', async () => {
			const label = 'a'.repeat(1000);
			const result = await checkpoint.execute({ action: 'save', label });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toContain('exceeds maximum length');
		});

		test('rejects extremely long label 10000 chars', async () => {
			const label = 'a'.repeat(10000);
			const result = await checkpoint.execute({ action: 'save', label });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toContain('exceeds maximum length');
		});
	});

	// UNICODE/ENCODING ATTACKS

	describe('unicode encoding attacks', () => {
		test('rejects Unicode fullwidth slash', async () => {
			const result = await checkpoint.execute({ action: 'save', label: 'test\uFF0Fpath' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/invalid characters|path traversal/);
		});

		test('rejects Unicode fullwidth backslash', async () => {
			const result = await checkpoint.execute({ action: 'save', label: 'test\uFF3Cpath' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/invalid characters|path traversal/);
		});

		test('rejects zero-width space', async () => {
			const result = await checkpoint.execute({ action: 'save', label: 'test\u200Bsecret' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/control characters|invalid characters/);
		});

		test('rejects zero-width joiner', async () => {
			const result = await checkpoint.execute({ action: 'save', label: 'test\u200Dsecret' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/control characters|invalid characters/);
		});

		test('rejects left-to-right mark', async () => {
			const result = await checkpoint.execute({ action: 'save', label: 'test\u200Esecret' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/control characters|invalid characters/);
		});

		test('rejects combining diacritical marks', async () => {
			const result = await checkpoint.execute({ action: 'save', label: 'test\u0300secret' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/control characters|invalid characters/);
		});

		test('rejects homoglyph attack Cyrillic a', async () => {
			const result = await checkpoint.execute({ action: 'save', label: '\u0430\u0430\u0430' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/control characters|invalid characters/);
		});

		test('rejects BOM Byte Order Mark', async () => {
			const result = await checkpoint.execute({ action: 'save', label: '\uFEFFtest' });
			const parsed = JSON.parse(result);
			// SECURITY: BOM should be rejected as invalid character
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/control characters|invalid characters/);
		});

		test('rejects accented characters', async () => {
			const result = await checkpoint.execute({ action: 'save', label: 'café' });
			const parsed = JSON.parse(result);
			// SECURITY: Accented chars should be rejected - they could be used for homoglyph attacks
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/control characters|invalid characters/);
		});
	});

	// MALFORMED LOG FILE ATTACKS

	describe('malformed checkpoint log attacks', () => {
		test('handles corrupted JSON gracefully', async () => {
			await checkpoint.execute({ action: 'save', label: 'corrupt-test' });

			const logPath = path.join(tempDir, '.swarm', 'checkpoints.json');
			fs.mkdirSync(path.dirname(logPath), { recursive: true });
			fs.writeFileSync(logPath, '{ broken json }', 'utf-8');

			const result = await checkpoint.execute({ action: 'list' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(true);
			expect(parsed.checkpoints).toEqual([]);
		});

		test('handles truncated JSON gracefully', async () => {
			// Create directory and file
			const logPath = path.join(tempDir, '.swarm', 'checkpoints.json');
			fs.mkdirSync(path.dirname(logPath), { recursive: true });
			fs.writeFileSync(logPath, '{"version":1,"checkpoints"', 'utf-8');

			const result = await checkpoint.execute({ action: 'list' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(true);
			expect(parsed.checkpoints).toEqual([]);
		});

		test('handles empty file gracefully', async () => {
			const logPath = path.join(tempDir, '.swarm', 'checkpoints.json');
			fs.mkdirSync(path.dirname(logPath), { recursive: true });
			fs.writeFileSync(logPath, '', 'utf-8');

			const result = await checkpoint.execute({ action: 'list' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(true);
			expect(parsed.checkpoints).toEqual([]);
		});

		test('handles missing checkpoints array', async () => {
			const logPath = path.join(tempDir, '.swarm', 'checkpoints.json');
			fs.mkdirSync(path.dirname(logPath), { recursive: true });
			fs.writeFileSync(logPath, '{"version":1}', 'utf-8');

			const result = await checkpoint.execute({ action: 'list' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(true);
			expect(parsed.checkpoints).toEqual([]);
		});

		test('handles invalid checkpoint structure', async () => {
			const logPath = path.join(tempDir, '.swarm', 'checkpoints.json');
			fs.mkdirSync(path.dirname(logPath), { recursive: true });
			fs.writeFileSync(logPath, '{"version":1,"checkpoints":[{"invalid":"structure"}]}', 'utf-8');

			const result = await checkpoint.execute({ action: 'list' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(true);
		});

		test('handles JSON with null bytes', async () => {
			const logPath = path.join(tempDir, '.swarm', 'checkpoints.json');
			fs.mkdirSync(path.dirname(logPath), { recursive: true });
			fs.writeFileSync(logPath, '{"version":1}\x00\x00', 'utf-8');

			const result = await checkpoint.execute({ action: 'list' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(true);
		});

		test('handles deeply nested JSON', async () => {
			const logPath = path.join(tempDir, '.swarm', 'checkpoints.json');
			fs.mkdirSync(path.dirname(logPath), { recursive: true });
			const nested = '{"version":1,"checkpoints":[' + '{"label":"a","sha":"b","timestamp":"c"}'.repeat(1000) + ']}';
			fs.writeFileSync(logPath, nested, 'utf-8');

			const result = await checkpoint.execute({ action: 'list' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(true);
		});
	});

	// JSON INJECTION ATTEMPTS

	describe('JSON injection attempts via label', () => {
		test('rejects label that looks like JSON', async () => {
			const result = await checkpoint.execute({ action: 'save', label: '{"injected":true}' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/shell metacharacters|control characters|git flag pattern|invalid characters/);
		});

		test('rejects label with JSON-like structure', async () => {
			const result = await checkpoint.execute({ action: 'save', label: 'key":"value' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/shell metacharacters|control characters|git flag pattern|invalid characters/);
		});

		test('rejects label attempting script injection', async () => {
			const result = await checkpoint.execute({ action: 'save', label: '<script>alert(1)</script>' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/shell metacharacters|control characters|git flag pattern|invalid characters/);
		});

		test('rejects label with SQL-like patterns', async () => {
			const result = await checkpoint.execute({ action: 'save', label: "test' OR '1'='1" });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/shell metacharacters|control characters|invalid characters/);
		});
	});

	// INVALID ACTION ATTACKS

	describe('invalid action attacks', () => {
		test('rejects empty action', async () => {
			const result = await checkpoint.execute({ action: '' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toContain('invalid action');
		});

		test('rejects action with spaces', async () => {
			const result = await checkpoint.execute({ action: 's av e' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toContain('invalid action');
		});

		test('rejects SQL injection in action', async () => {
			const result = await checkpoint.execute({ action: "'; DROP TABLE checkpoints; --" });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toContain('invalid action');
		});

		test('rejects action that is a number', async () => {
			const result = await checkpoint.execute({ action: '123' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toContain('invalid action');
		});

		test('rejects action with null byte', async () => {
			const result = await checkpoint.execute({ action: 'save\x00' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toContain('invalid action');
		});
	});

	// RESTORE ATTACKS SHA/BRANCH ABUSE

	describe('restore SHA branch abuse attempts', () => {
		test('restore to non-existent SHA fails gracefully', async () => {
			const result = await checkpoint.execute({ action: 'restore', label: 'nonexistent' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toContain('not found');
		});

		test('restore with empty checkpoint log handles gracefully', async () => {
			const result = await checkpoint.execute({ action: 'restore', label: 'any-label' });
			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toContain('not found');
		});

		test('cannot restore to SHA outside repository', async () => {
			await checkpoint.execute({ action: 'save', label: 'test-sha' });

			const listResult = await checkpoint.execute({ action: 'list' });
			const listParsed = JSON.parse(listResult);

			expect(listParsed.checkpoints[0].sha).toMatch(/^[a-f0-9]{40}$/);
		});
	});

	// LABEL FUZZING - EDGE CASES

	describe('label fuzzing edge cases', () => {
		test('rejects only newlines', async () => {
			const result = await checkpoint.execute({ action: 'save', label: '\n\n\n' });
			const parsed = JSON.parse(result);
			// SECURITY: Whitespace-only should be rejected
			expect(parsed.success).toBe(false);
		});

		test('rejects only tabs', async () => {
			const result = await checkpoint.execute({ action: 'save', label: '\t\t\t' });
			const parsed = JSON.parse(result);
			// SECURITY: Whitespace-only should be rejected
			expect(parsed.success).toBe(false);
		});

		test('rejects control characters', async () => {
			const result = await checkpoint.execute({ action: 'save', label: 'test\x01\x02\x03' });
			const parsed = JSON.parse(result);
			// SECURITY: Control chars should be rejected
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/shell metacharacters|control characters|git flag pattern|invalid characters/);
		});

		test('rejects vertical tab', async () => {
			const result = await checkpoint.execute({ action: 'save', label: 'test\x0bsecret' });
			const parsed = JSON.parse(result);
			// SECURITY: Vertical tab should be rejected
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/shell metacharacters|control characters|git flag pattern|invalid characters/);
		});

		test('rejects form feed', async () => {
			const result = await checkpoint.execute({ action: 'save', label: 'test\x0csecret' });
			const parsed = JSON.parse(result);
			// SECURITY: Form feed should be rejected
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/shell metacharacters|control characters|git flag pattern|invalid characters/);
		});

		test('rejects bell character', async () => {
			const result = await checkpoint.execute({ action: 'save', label: 'test\x07secret' });
			const parsed = JSON.parse(result);
			// SECURITY: Bell char should be rejected
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/shell metacharacters|control characters|git flag pattern|invalid characters/);
		});

		test('rejects escape character', async () => {
			const result = await checkpoint.execute({ action: 'save', label: 'test\x1bsecret' });
			const parsed = JSON.parse(result);
			// SECURITY: Escape char should be rejected
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/shell metacharacters|control characters|git flag pattern|invalid characters/);
		});

		test('rejects emoji in label', async () => {
			const result = await checkpoint.execute({ action: 'save', label: 'test 🚀' });
			const parsed = JSON.parse(result);
			// SECURITY: Emoji should be rejected as invalid character
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/control characters|invalid characters/);
		});

		test('rejects label with carriage return', async () => {
			const result = await checkpoint.execute({ action: 'save', label: 'test\rsecret' });
			const parsed = JSON.parse(result);
			// SECURITY: CR should be rejected
			expect(parsed.success).toBe(false);
			expect(parsed.error).toMatch(/shell metacharacters|control characters|git flag pattern|invalid characters/);
		});
	});

	// ATOMIC WRITE VERIFICATION

	describe('atomic write verification', () => {
		test('checkpoint log is valid JSON after save', async () => {
			await checkpoint.execute({ action: 'save', label: 'atomic-test' });

			const logPath = path.join(tempDir, '.swarm', 'checkpoints.json');
			const content = fs.readFileSync(logPath, 'utf-8');

			const parsed = JSON.parse(content);
			expect(parsed.version).toBe(1);
			expect(parsed.checkpoints).toHaveLength(1);
		});

		test('no temp file left behind', async () => {
			await checkpoint.execute({ action: 'save', label: 'cleanup-test' });

			const logPath = path.join(tempDir, '.swarm', 'checkpoints.json');
			const tempPath = logPath + '.tmp';

			expect(fs.existsSync(tempPath)).toBe(false);
		});

		test('can recover from write failure simulation', async () => {
			await checkpoint.execute({ action: 'save', label: 'recovery-test' });

			const result = await checkpoint.execute({ action: 'list' });
			const parsed = JSON.parse(result);

			expect(parsed.success).toBe(true);
			expect(parsed.count).toBe(1);
		});
	});

	// CONCURRENT ACCESS SIMULATION

	describe('concurrent access simulation', () => {
		test('rapid sequential saves handle correctly', async () => {
			const results = await Promise.all([
				checkpoint.execute({ action: 'save', label: 'concurrent-1' }),
				checkpoint.execute({ action: 'save', label: 'concurrent-2' }),
				checkpoint.execute({ action: 'save', label: 'concurrent-3' }),
			]);

			for (const result of results) {
				const parsed = JSON.parse(result);
				expect(parsed.success).toBe(true);
			}

			const listResult = await checkpoint.execute({ action: 'list' });
			const listParsed = JSON.parse(listResult);
			expect(listParsed.count).toBe(3);
		});

		test('duplicate label detection across concurrent saves', async () => {
			const results = await Promise.all([
				checkpoint.execute({ action: 'save', label: 'duplicate' }),
				checkpoint.execute({ action: 'save', label: 'duplicate' }),
			]);

			const successes = results.filter((r) => JSON.parse(r).success);
			expect(successes.length).toBe(1);
		});
	});
});
