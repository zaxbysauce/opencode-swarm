import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	handleKnowledgeQuarantineCommand,
	handleKnowledgeRestoreCommand,
} from '../../../src/commands/knowledge.js';

// Mock knowledge-validator hooks using local mock variable pattern
const mockQuarantineEntry = vi.fn();
const mockRestoreEntry = vi.fn();

vi.mock('../../../src/hooks/knowledge-validator.js', () => ({
	quarantineEntry: mockQuarantineEntry,
	restoreEntry: mockRestoreEntry,
}));

describe('Adversarial Security Tests for knowledge.ts', () => {
	const testDirectory = '/test/directory';

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Input injection attacks on entryId', () => {
		it('1. ANSI escape sequence in entryId should return invalid ID message', async () => {
			const result = await handleKnowledgeQuarantineCommand(testDirectory, [
				'\x1b[31mmalicious\x1b[0m',
			]);
			expect(result).toBe(
				'Invalid entry ID. IDs must be 1-64 characters: letters, digits, hyphens, underscores only.'
			);
			expect(mockQuarantineEntry).not.toHaveBeenCalled();
		});

		it('2. Null byte in entryId should return invalid ID message', async () => {
			const result = await handleKnowledgeQuarantineCommand(testDirectory, [
				'abc\x00def',
			]);
			expect(result).toBe(
				'Invalid entry ID. IDs must be 1-64 characters: letters, digits, hyphens, underscores only.'
			);
			expect(mockQuarantineEntry).not.toHaveBeenCalled();
		});

		it('3. Newline in entryId should return invalid ID message', async () => {
			const result = await handleKnowledgeRestoreCommand(testDirectory, [
				'abc\ndef',
			]);
			expect(result).toBe(
				'Invalid entry ID. IDs must be 1-64 characters: letters, digits, hyphens, underscores only.'
			);
			expect(mockRestoreEntry).not.toHaveBeenCalled();
		});

		it('4. Shell metacharacter should return invalid ID message', async () => {
			const result = await handleKnowledgeQuarantineCommand(testDirectory, [
				'abc;rm -rf',
			]);
			expect(result).toBe(
				'Invalid entry ID. IDs must be 1-64 characters: letters, digits, hyphens, underscores only.'
			);
			expect(mockQuarantineEntry).not.toHaveBeenCalled();
		});

		it('5. Path traversal (forward slash) should return invalid ID message', async () => {
			const result = await handleKnowledgeRestoreCommand(testDirectory, [
				'../../../etc/passwd',
			]);
			expect(result).toBe(
				'Invalid entry ID. IDs must be 1-64 characters: letters, digits, hyphens, underscores only.'
			);
			expect(mockRestoreEntry).not.toHaveBeenCalled();
		});

		it('6. Path traversal (backslash) should return invalid ID message', async () => {
			const result = await handleKnowledgeQuarantineCommand(testDirectory, [
				'..\\..\\Windows',
			]);
			expect(result).toBe(
				'Invalid entry ID. IDs must be 1-64 characters: letters, digits, hyphens, underscores only.'
			);
			expect(mockQuarantineEntry).not.toHaveBeenCalled();
		});

		it('7. Null-byte only should return invalid ID message', async () => {
			const result = await handleKnowledgeRestoreCommand(testDirectory, ['\x00']);
			expect(result).toBe(
				'Invalid entry ID. IDs must be 1-64 characters: letters, digits, hyphens, underscores only.'
			);
			expect(mockRestoreEntry).not.toHaveBeenCalled();
		});

		it('8. Whitespace only should return invalid ID message', async () => {
			const result = await handleKnowledgeQuarantineCommand(testDirectory, ['   ']);
			expect(result).toBe(
				'Invalid entry ID. IDs must be 1-64 characters: letters, digits, hyphens, underscores only.'
			);
			expect(mockQuarantineEntry).not.toHaveBeenCalled();
		});

		it('9. Empty string should return USAGE message', async () => {
			const result = await handleKnowledgeQuarantineCommand(testDirectory, ['']);
			expect(result).toBe('Usage: /swarm knowledge quarantine <id> [reason]');
			expect(mockQuarantineEntry).not.toHaveBeenCalled();
		});

		it('10. Maximum valid ID (exactly 64 chars) should SUCCEED', async () => {
			mockQuarantineEntry.mockResolvedValueOnce(undefined);
			const validId = 'a'.repeat(64);
			const result = await handleKnowledgeQuarantineCommand(testDirectory, [
				validId,
			]);
			expect(result).toBe(`✅ Entry ${validId} quarantined successfully.`);
			expect(mockQuarantineEntry).toHaveBeenCalledWith(
				testDirectory,
				validId,
				'Quarantined via /swarm knowledge quarantine command',
				'user'
			);
		});

		it('11. One character over limit (65 chars) should return invalid ID message', async () => {
			const result = await handleKnowledgeRestoreCommand(testDirectory, [
				'a'.repeat(65),
			]);
			expect(result).toBe(
				'Invalid entry ID. IDs must be 1-64 characters: letters, digits, hyphens, underscores only.'
			);
			expect(mockRestoreEntry).not.toHaveBeenCalled();
		});

		it('12. Unicode in entryId should return invalid ID message', async () => {
			const result = await handleKnowledgeQuarantineCommand(testDirectory, [
				'lesson-αβγ',
			]);
			expect(result).toBe(
				'Invalid entry ID. IDs must be 1-64 characters: letters, digits, hyphens, underscores only.'
			);
			expect(mockQuarantineEntry).not.toHaveBeenCalled();
		});

		it('13. HTML injection in entryId should return invalid ID message', async () => {
			const result = await handleKnowledgeRestoreCommand(testDirectory, [
				'<script>alert(1)</script>',
			]);
			expect(result).toBe(
				'Invalid entry ID. IDs must be 1-64 characters: letters, digits, hyphens, underscores only.'
			);
			expect(mockRestoreEntry).not.toHaveBeenCalled();
		});

		it('14. SQL injection in entryId should return invalid ID message', async () => {
			const result = await handleKnowledgeQuarantineCommand(testDirectory, [
				"'; DROP TABLE --",
			]);
			expect(result).toBe(
				'Invalid entry ID. IDs must be 1-64 characters: letters, digits, hyphens, underscores only.'
			);
			expect(mockQuarantineEntry).not.toHaveBeenCalled();
		});
	});

	describe('Information disclosure attacks', () => {
		it('15. quarantineEntry error should NOT expose file paths or error codes', async () => {
			// Simulate an error with sensitive information
			const error = new Error(
				'ENOENT: no such file or directory, open /home/user/.swarm/knowledge.jsonl'
			);
			mockQuarantineEntry.mockRejectedValueOnce(error);

			const result = await handleKnowledgeQuarantineCommand(testDirectory, [
				'valid-id',
			]);

			// Result should be a generic error message
			expect(result).toBe(
				'❌ Failed to quarantine entry. Check the entry ID and try again.'
			);
			// Should NOT contain the sensitive path or error code
			expect(result).not.toContain('/home/user/.swarm/knowledge.jsonl');
			expect(result).not.toContain('ENOENT');
		});

		it('16. restoreEntry error should NOT expose sensitive error messages', async () => {
			// Simulate an error with sensitive information
			const error = new Error(
				'EACCES: permission denied, open /etc/sensitive-config'
			);
			mockRestoreEntry.mockRejectedValueOnce(error);

			const result = await handleKnowledgeRestoreCommand(testDirectory, [
				'valid-id',
			]);

			// Result should be a generic error message
			expect(result).toBe(
				'❌ Failed to restore entry. Check the entry ID and try again.'
			);
			// Should NOT contain the sensitive path or error code
			expect(result).not.toContain('/etc/sensitive-config');
			expect(result).not.toContain('EACCES');
		});
	});

	describe('Reason parameter attacks (pass through tests)', () => {
		it('17. Extremely long reason (10000 chars) should pass to underlying function', async () => {
			mockQuarantineEntry.mockResolvedValueOnce(undefined);
			const longReason = 'x'.repeat(10000);
			const validId = 'valid-123';

			const result = await handleKnowledgeQuarantineCommand(testDirectory, [
				validId,
				longReason,
			]);

			// Should call the underlying function with the long reason
			expect(mockQuarantineEntry).toHaveBeenCalledWith(
				testDirectory,
				validId,
				longReason,
				'user'
			);
			expect(result).toBe(`✅ Entry ${validId} quarantined successfully.`);
		});

		it('18. Control characters in reason should pass to underlying function', async () => {
			mockQuarantineEntry.mockResolvedValueOnce(undefined);
			const reasonWithControls = 'reason\x1b[31m\x00with\x07controls\n\r';
			const validId = 'valid-123';

			const result = await handleKnowledgeQuarantineCommand(testDirectory, [
				validId,
				reasonWithControls,
			]);

			// Should call the underlying function with control characters intact
			expect(mockQuarantineEntry).toHaveBeenCalledWith(
				testDirectory,
				validId,
				reasonWithControls,
				'user'
			);
			expect(result).toBe(`✅ Entry ${validId} quarantined successfully.`);
		});
	});
});
