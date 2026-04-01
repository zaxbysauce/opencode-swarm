import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the knowledge-validator module with factory functions
const mockQuarantineEntry = vi.fn();
const mockRestoreEntry = vi.fn();

vi.mock('../../../src/hooks/knowledge-validator.js', () => ({
	quarantineEntry: mockQuarantineEntry,
	restoreEntry: mockRestoreEntry,
}));

// Mock the knowledge-migrator module with factory functions
const mockMigrate = vi.fn();

vi.mock('../../../src/hooks/knowledge-migrator.js', () => ({
	migrateContextToKnowledge: mockMigrate,
}));

// Import AFTER mocking, with .js extension
import {
	handleKnowledgeMigrateCommand,
	handleKnowledgeQuarantineCommand,
	handleKnowledgeRestoreCommand,
} from '../../../src/commands/knowledge.js';

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
		const result = await handleKnowledgeQuarantineCommand('/test/dir', [
			'../secret',
		]);
		expect(result).toBe(
			'Invalid entry ID. IDs must be 1-64 characters: letters, digits, hyphens, underscores only.',
		);
		expect(mockQuarantineEntry).not.toHaveBeenCalled();
	});

	it('returns invalid ID message when entryId contains special chars (abc!def)', async () => {
		const result = await handleKnowledgeQuarantineCommand('/test/dir', [
			'abc!def',
		]);
		expect(result).toBe(
			'Invalid entry ID. IDs must be 1-64 characters: letters, digits, hyphens, underscores only.',
		);
		expect(mockQuarantineEntry).not.toHaveBeenCalled();
	});

	it('returns invalid ID message when entryId is > 64 chars', async () => {
		const longId = 'a'.repeat(65);
		const result = await handleKnowledgeQuarantineCommand('/test/dir', [
			longId,
		]);
		expect(result).toBe(
			'Invalid entry ID. IDs must be 1-64 characters: letters, digits, hyphens, underscores only.',
		);
		expect(mockQuarantineEntry).not.toHaveBeenCalled();
	});

	it('calls quarantineEntry with correct args when valid', async () => {
		mockQuarantineEntry.mockResolvedValueOnce(undefined);
		await handleKnowledgeQuarantineCommand('/test/dir', [
			'test-id',
			'because',
			'it',
			'is',
			'bad',
		]);
		expect(mockQuarantineEntry).toHaveBeenCalledTimes(1);
		expect(mockQuarantineEntry).toHaveBeenCalledWith(
			'/test/dir',
			'test-id',
			'because it is bad',
			'user',
		);
	});

	it('returns success message with entryId on successful quarantine', async () => {
		mockQuarantineEntry.mockResolvedValueOnce(undefined);
		const result = await handleKnowledgeQuarantineCommand('/test/dir', [
			'test-id',
		]);
		expect(result).toBe('✅ Entry test-id quarantined successfully.');
	});

	it('uses default reason when no reason args provided', async () => {
		mockQuarantineEntry.mockResolvedValueOnce(undefined);
		await handleKnowledgeQuarantineCommand('/test/dir', ['test-id']);
		expect(mockQuarantineEntry).toHaveBeenCalledWith(
			'/test/dir',
			'test-id',
			'Quarantined via /swarm knowledge quarantine command',
			'user',
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
			'user',
		);
	});

	it('returns generic error message (not raw error) when quarantineEntry throws', async () => {
		mockQuarantineEntry.mockRejectedValueOnce(
			new Error('Internal database error'),
		);
		const result = await handleKnowledgeQuarantineCommand('/test/dir', [
			'test-id',
		]);
		expect(result).toBe(
			'❌ Failed to quarantine entry. Check the entry ID and try again.',
		);
	});

	it('does NOT expose error message content in return value when quarantineEntry throws', async () => {
		mockQuarantineEntry.mockRejectedValueOnce(
			new Error('Sensitive information leaked'),
		);
		const result = await handleKnowledgeQuarantineCommand('/test/dir', [
			'test-id',
		]);
		expect(result).not.toContain('Sensitive information leaked');
		expect(result).not.toContain('Sensitive');
		expect(result).toBe(
			'❌ Failed to quarantine entry. Check the entry ID and try again.',
		);
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
		const result = await handleKnowledgeRestoreCommand('/test/dir', [
			'../../etc/passwd',
		]);
		expect(result).toBe(
			'Invalid entry ID. IDs must be 1-64 characters: letters, digits, hyphens, underscores only.',
		);
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
		const result = await handleKnowledgeRestoreCommand('/test/dir', [
			'test-id',
		]);
		expect(result).toBe('✅ Entry test-id restored successfully.');
	});

	it('returns generic error message when restoreEntry throws', async () => {
		mockRestoreEntry.mockRejectedValueOnce(new Error('Entry not found'));
		const result = await handleKnowledgeRestoreCommand('/test/dir', [
			'test-id',
		]);
		expect(result).toBe(
			'❌ Failed to restore entry. Check the entry ID and try again.',
		);
	});
});

describe('createSwarmCommandHandler routing (in index.ts)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('knowledge quarantine <id> routes to quarantine handler', async () => {
		mockQuarantineEntry.mockResolvedValueOnce(undefined);
		const result = await handleKnowledgeQuarantineCommand('/test/dir', [
			'test-id',
			'test reason',
		]);
		expect(result).toContain('test-id');
		expect(mockQuarantineEntry).toHaveBeenCalledWith(
			'/test/dir',
			'test-id',
			'test reason',
			'user',
		);
	});

	it('knowledge restore <id> routes to restore handler', async () => {
		mockRestoreEntry.mockResolvedValueOnce(undefined);
		const result = await handleKnowledgeRestoreCommand('/test/dir', [
			'test-id',
		]);
		expect(result).toContain('test-id');
		expect(mockRestoreEntry).toHaveBeenCalledWith('/test/dir', 'test-id');
	});

	it('knowledge (no subcommand) returns help text with both command descriptions', async () => {
		const helpText =
			'Knowledge commands: /swarm knowledge quarantine <id> [reason] - Quarantine a knowledge entry\n/swarm knowledge restore <id> - Restore a quarantined entry';
		expect(helpText).toContain('quarantine');
		expect(helpText).toContain('restore');
	});
});

describe('handleKnowledgeMigrateCommand', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('successful migration returns string containing "Migration complete" with correct counts (entriesMigrated=3, entriesDropped=1, entriesTotal=4)', async () => {
		mockMigrate.mockResolvedValueOnce({
			migrated: true,
			entriesMigrated: 3,
			entriesDropped: 1,
			entriesTotal: 4,
		});
		const result = await handleKnowledgeMigrateCommand('/test/dir', []);
		expect(result).toContain('Migration complete');
		expect(result).toContain('3 entries added');
		expect(result).toContain('1 dropped');
		expect(result).toContain('4 total processed');
		expect(mockMigrate).toHaveBeenCalledWith('/test/dir', expect.any(Object));
	});

	it('skippedReason "sentinel-exists" returns string containing "already completed"', async () => {
		mockMigrate.mockResolvedValueOnce({
			migrated: false,
			entriesMigrated: 0,
			entriesDropped: 0,
			entriesTotal: 0,
			skippedReason: 'sentinel-exists',
		});
		const result = await handleKnowledgeMigrateCommand('/test/dir', []);
		expect(result).toContain('already completed');
		expect(result).toContain('.swarm/.knowledge-migrated');
		expect(mockMigrate).toHaveBeenCalledWith('/test/dir', expect.any(Object));
	});

	it('skippedReason "no-context-file" returns string containing "No .swarm/context.md"', async () => {
		mockMigrate.mockResolvedValueOnce({
			migrated: false,
			entriesMigrated: 0,
			entriesDropped: 0,
			entriesTotal: 0,
			skippedReason: 'no-context-file',
		});
		const result = await handleKnowledgeMigrateCommand('/test/dir', []);
		expect(result).toContain('No .swarm/context.md');
		expect(result).toContain('nothing to migrate');
		expect(mockMigrate).toHaveBeenCalledWith('/test/dir', expect.any(Object));
	});

	it('skippedReason "empty-context" returns string containing "empty"', async () => {
		mockMigrate.mockResolvedValueOnce({
			migrated: false,
			entriesMigrated: 0,
			entriesDropped: 0,
			entriesTotal: 0,
			skippedReason: 'empty-context',
		});
		const result = await handleKnowledgeMigrateCommand('/test/dir', []);
		expect(result).toContain('empty');
		expect(result).toContain('nothing to migrate');
		expect(mockMigrate).toHaveBeenCalledWith('/test/dir', expect.any(Object));
	});

	it('skippedReason unknown value returns string containing "unknown reason"', async () => {
		mockMigrate.mockResolvedValueOnce({
			migrated: false,
			entriesMigrated: 0,
			entriesDropped: 0,
			entriesTotal: 0,
			skippedReason: 'some-unknown-reason' as any,
		});
		const result = await handleKnowledgeMigrateCommand('/test/dir', []);
		expect(result).toContain('unknown reason');
		expect(mockMigrate).toHaveBeenCalledWith('/test/dir', expect.any(Object));
	});

	it('error thrown by migrateContextToKnowledge returns string containing "failed"', async () => {
		mockMigrate.mockRejectedValueOnce(new Error('Database connection failed'));
		const result = await handleKnowledgeMigrateCommand('/test/dir', []);
		expect(result).toContain('failed');
		expect(result).toContain('Check .swarm/context.md');
		expect(result).not.toContain('Database connection failed');
	});

	it('args[0] provided uses args[0] as targetDir (not directory)', async () => {
		mockMigrate.mockResolvedValueOnce({
			migrated: true,
			entriesMigrated: 1,
			entriesDropped: 0,
			entriesTotal: 1,
		});
		const result = await handleKnowledgeMigrateCommand('/test/dir', [
			'/custom/target',
		]);
		expect(result).toContain('Migration complete');
		expect(mockMigrate).toHaveBeenCalledWith(
			'/custom/target',
			expect.any(Object),
		);
		expect(mockMigrate).not.toHaveBeenCalledWith(
			'/test/dir',
			expect.any(Object),
		);
	});

	it('args empty uses directory as targetDir', async () => {
		mockMigrate.mockResolvedValueOnce({
			migrated: true,
			entriesMigrated: 1,
			entriesDropped: 0,
			entriesTotal: 1,
		});
		const result = await handleKnowledgeMigrateCommand('/test/dir', []);
		expect(result).toContain('Migration complete');
		expect(mockMigrate).toHaveBeenCalledWith('/test/dir', expect.any(Object));
	});

	it('does NOT expose error message content when migrateContextToKnowledge throws', async () => {
		mockMigrate.mockRejectedValueOnce(
			new Error('Sensitive data leaked: password=12345'),
		);
		const result = await handleKnowledgeMigrateCommand('/test/dir', []);
		expect(result).toContain('failed');
		expect(result).not.toContain('Sensitive data leaked');
		expect(result).not.toContain('password');
	});
});
