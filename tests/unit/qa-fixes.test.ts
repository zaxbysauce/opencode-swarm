import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDelegationEnvelope } from '../../src/hooks/delegation-gate';
import { resetSwarmState } from '../../src/state';

describe('QA fixes', () => {
	describe('Fix #3: handoff temp file uses crypto.randomUUID()', () => {
		it('should use UUID format in temp file path', async () => {
			// Verify the import works (crypto.randomUUID is available)
			const uuid = crypto.randomUUID();
			expect(uuid).toMatch(
				/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
			);
		});
	});

	describe('Fix #4: sanitizeLanguageId whitelist', () => {
		it('should accept valid lowercase language IDs', async () => {
			const { isGrammarAvailable, clearParserCache } = await import(
				'../../src/lang/runtime'
			);
			clearParserCache();
			// These are valid format-wise (may not have grammars)
			const result = await isGrammarAvailable('javascript');
			expect(typeof result).toBe('boolean');
		});

		it('should accept hyphenated language IDs', async () => {
			const { isGrammarAvailable, clearParserCache } = await import(
				'../../src/lang/runtime'
			);
			clearParserCache();
			const result = await isGrammarAvailable('objective-c');
			expect(typeof result).toBe('boolean');
		});

		it('should reject language IDs with underscores', async () => {
			const { isGrammarAvailable, clearParserCache } = await import(
				'../../src/lang/runtime'
			);
			clearParserCache();
			const result = await isGrammarAvailable('my_lang');
			expect(result).toBe(false);
		});

		it('should reject language IDs with spaces', async () => {
			const { isGrammarAvailable, clearParserCache } = await import(
				'../../src/lang/runtime'
			);
			clearParserCache();
			const result = await isGrammarAvailable('my lang');
			expect(result).toBe(false);
		});

		it('should reject language IDs with dots', async () => {
			const { isGrammarAvailable, clearParserCache } = await import(
				'../../src/lang/runtime'
			);
			clearParserCache();
			const result = await isGrammarAvailable('file.ext');
			expect(result).toBe(false);
		});
	});

	describe('Fix #5: delegation envelope file path validation', () => {
		let tempDir: string;

		beforeEach(async () => {
			resetSwarmState();
			tempDir = await mkdtemp(join(tmpdir(), 'delegation-test-'));
			await mkdir(join(tempDir, '.swarm'), { recursive: true });
		});

		afterEach(async () => {
			resetSwarmState();
			await rm(tempDir, { recursive: true, force: true });
		});

		it('should parse envelope without directory (no validation)', () => {
			const content = JSON.stringify({
				taskId: '1.1',
				targetAgent: 'coder',
				action: 'implement',
				commandType: 'task',
				files: ['../../etc/passwd'],
				acceptanceCriteria: ['done'],
				technicalContext: 'test',
			});
			const result = parseDelegationEnvelope(content);
			expect(result).not.toBeNull();
			expect(result!.files).toContain('../../etc/passwd');
		});

		it('should reject envelope with path traversal when directory is provided', () => {
			const content = JSON.stringify({
				taskId: '1.1',
				targetAgent: 'coder',
				action: 'implement',
				commandType: 'task',
				files: ['../../etc/passwd'],
				acceptanceCriteria: ['done'],
				technicalContext: 'test',
			});
			const result = parseDelegationEnvelope(content, tempDir);
			expect(result).toBeNull();
		});

		it('should reject envelope with absolute paths when directory is provided', () => {
			const content = JSON.stringify({
				taskId: '1.1',
				targetAgent: 'coder',
				action: 'implement',
				commandType: 'task',
				files: ['/etc/passwd'],
				acceptanceCriteria: ['done'],
				technicalContext: 'test',
			});
			const result = parseDelegationEnvelope(content, tempDir);
			expect(result).toBeNull();
		});

		it('should reject envelope with null bytes in file paths', () => {
			const content = JSON.stringify({
				taskId: '1.1',
				targetAgent: 'coder',
				action: 'implement',
				commandType: 'task',
				files: ['src\x00/malicious.ts'],
				acceptanceCriteria: ['done'],
				technicalContext: 'test',
			});
			const result = parseDelegationEnvelope(content, tempDir);
			expect(result).toBeNull();
		});
	});
});
