import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the knowledge-validator module with factory functions
const mockQuarantineEntry = vi.fn();
const mockRestoreEntry = vi.fn();

vi.mock('../../../src/hooks/knowledge-validator.js', () => ({
    quarantineEntry: mockQuarantineEntry,
    restoreEntry: mockRestoreEntry,
}));

// Import AFTER mocking, with .js extension
import { handleKnowledgeQuarantineCommand, handleKnowledgeRestoreCommand } from '../../../src/commands/knowledge.js';

describe('handleKnowledgeQuarantineCommand', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns usage message when entryId is missing (empty args)', async () => {
        const result = await handleKnowledgeQuarantineCommand('/test/dir', []);
        expect(result).toBe('Usage: /swarm knowledge quarantine <id> [reason]');
        expect(mockQuarantineEntry).not.toHaveBeenCalled();
    });

    it('returns invalid ID message when entryId contains path traversal (../secret)', async () => {
        const result = await handleKnowledgeQuarantineCommand('/test/dir', ['../secret']);
        expect(result).toBe('Invalid entry ID. IDs must be 1-64 characters: letters, digits, hyphens, underscores only.');
        expect(mockQuarantineEntry).not.toHaveBeenCalled();
    });

    it('returns invalid ID message when entryId contains special chars (abc!def)', async () => {
        const result = await handleKnowledgeQuarantineCommand('/test/dir', ['abc!def']);
        expect(result).toBe('Invalid entry ID. IDs must be 1-64 characters: letters, digits, hyphens, underscores only.');
        expect(mockQuarantineEntry).not.toHaveBeenCalled();
    });

    it('returns invalid ID message when entryId is > 64 chars', async () => {
        const longId = 'a'.repeat(65);
        const result = await handleKnowledgeQuarantineCommand('/test/dir', [longId]);
        expect(result).toBe('Invalid entry ID. IDs must be 1-64 characters: letters, digits, hyphens, underscores only.');
        expect(mockQuarantineEntry).not.toHaveBeenCalled();
    });

    it('calls quarantineEntry with correct args when valid', async () => {
        mockQuarantineEntry.mockResolvedValueOnce(undefined);
        await handleKnowledgeQuarantineCommand('/test/dir', ['test-id', 'because', 'it', 'is', 'bad']);
        expect(mockQuarantineEntry).toHaveBeenCalledTimes(1);
        expect(mockQuarantineEntry).toHaveBeenCalledWith(
            '/test/dir',
            'test-id',
            'because it is bad',
            'user'
        );
    });

    it('returns success message with entryId on successful quarantine', async () => {
        mockQuarantineEntry.mockResolvedValueOnce(undefined);
        const result = await handleKnowledgeQuarantineCommand('/test/dir', ['test-id']);
        expect(result).toBe('✅ Entry test-id quarantined successfully.');
    });

    it('uses default reason when no reason args provided', async () => {
        mockQuarantineEntry.mockResolvedValueOnce(undefined);
        await handleKnowledgeQuarantineCommand('/test/dir', ['test-id']);
        expect(mockQuarantineEntry).toHaveBeenCalledWith(
            '/test/dir',
            'test-id',
            'Quarantined via /swarm knowledge quarantine command',
            'user'
        );
    });

    it('joins multi-word reason args correctly', async () => {
        mockQuarantineEntry.mockResolvedValueOnce(undefined);
        const args = ['abc', 'bad', 'rule'];
        await handleKnowledgeQuarantineCommand('/test/dir', args);
        expect(mockQuarantineEntry).toHaveBeenCalledWith(
            '/test/dir',
            'abc',
            'bad rule',
            'user'
        );
    });

    it('returns generic error message (not raw error) when quarantineEntry throws', async () => {
        mockQuarantineEntry.mockRejectedValueOnce(new Error('Internal database error'));
        const result = await handleKnowledgeQuarantineCommand('/test/dir', ['test-id']);
        expect(result).toBe('❌ Failed to quarantine entry. Check the entry ID and try again.');
    });

    it('does NOT expose error message content in return value when quarantineEntry throws', async () => {
        mockQuarantineEntry.mockRejectedValueOnce(new Error('Sensitive information leaked'));
        const result = await handleKnowledgeQuarantineCommand('/test/dir', ['test-id']);
        expect(result).not.toContain('Sensitive information leaked');
        expect(result).not.toContain('Sensitive');
        expect(result).toBe('❌ Failed to quarantine entry. Check the entry ID and try again.');
    });
});

describe('handleKnowledgeRestoreCommand', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns usage message when entryId is missing (empty args)', async () => {
        const result = await handleKnowledgeRestoreCommand('/test/dir', []);
        expect(result).toBe('Usage: /swarm knowledge restore <id>');
        expect(mockRestoreEntry).not.toHaveBeenCalled();
    });

    it('returns invalid ID message when entryId contains path traversal', async () => {
        const result = await handleKnowledgeRestoreCommand('/test/dir', ['../../etc/passwd']);
        expect(result).toBe('Invalid entry ID. IDs must be 1-64 characters: letters, digits, hyphens, underscores only.');
        expect(mockRestoreEntry).not.toHaveBeenCalled();
    });

    it('calls restoreEntry with correct args when valid', async () => {
        mockRestoreEntry.mockResolvedValueOnce(undefined);
        await handleKnowledgeRestoreCommand('/test/dir', ['test-id']);
        expect(mockRestoreEntry).toHaveBeenCalledTimes(1);
        expect(mockRestoreEntry).toHaveBeenCalledWith('/test/dir', 'test-id');
    });

    it('returns success message with entryId on successful restore', async () => {
        mockRestoreEntry.mockResolvedValueOnce(undefined);
        const result = await handleKnowledgeRestoreCommand('/test/dir', ['test-id']);
        expect(result).toBe('✅ Entry test-id restored successfully.');
    });

    it('returns generic error message when restoreEntry throws', async () => {
        mockRestoreEntry.mockRejectedValueOnce(new Error('Entry not found'));
        const result = await handleKnowledgeRestoreCommand('/test/dir', ['test-id']);
        expect(result).toBe('❌ Failed to restore entry. Check the entry ID and try again.');
    });
});

describe('createSwarmCommandHandler routing (in index.ts)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('knowledge quarantine <id> routes to quarantine handler', async () => {
        mockQuarantineEntry.mockResolvedValueOnce(undefined);
        const result = await handleKnowledgeQuarantineCommand('/test/dir', ['test-id', 'test reason']);
        expect(result).toContain('test-id');
        expect(mockQuarantineEntry).toHaveBeenCalledWith('/test/dir', 'test-id', 'test reason', 'user');
    });

    it('knowledge restore <id> routes to restore handler', async () => {
        mockRestoreEntry.mockResolvedValueOnce(undefined);
        const result = await handleKnowledgeRestoreCommand('/test/dir', ['test-id']);
        expect(result).toContain('test-id');
        expect(mockRestoreEntry).toHaveBeenCalledWith('/test/dir', 'test-id');
    });

    it('knowledge (no subcommand) returns help text with both command descriptions', async () => {
        const helpText = 'Knowledge commands: /swarm knowledge quarantine <id> [reason] - Quarantine a knowledge entry\n/swarm knowledge restore <id> - Restore a quarantined entry';
        expect(helpText).toContain('quarantine');
        expect(helpText).toContain('restore');
    });
});
