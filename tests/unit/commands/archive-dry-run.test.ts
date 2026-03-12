/**
 * Tests for archive.ts --dry-run mode (Task 1.5)
 *
 * Verifies that loadEvidence discriminated union is handled correctly:
 * 1. 'found' status with old bundle → appears in "would archive"
 * 2. 'not_found' status → does NOT appear in "would archive"
 * 3. 'invalid_schema' status → does NOT appear in "would archive"
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Local mock variables (NOT using vi.mocked())
const mockLoadEvidence = vi.fn();
const mockListEvidenceTaskIds = vi.fn();
const mockArchiveEvidence = vi.fn();
const mockLoadPluginConfig = vi.fn();

// Mock the evidence/manager module BEFORE importing handleArchiveCommand
vi.mock('../../../src/evidence/manager.js', () => ({
	loadEvidence: mockLoadEvidence,
	listEvidenceTaskIds: mockListEvidenceTaskIds,
	archiveEvidence: mockArchiveEvidence,
}));

// Mock the config/loader module
vi.mock('../../../src/config/loader.js', () => ({
	loadPluginConfig: mockLoadPluginConfig,
}));

// Import the function under test AFTER mocks are set up
import { handleArchiveCommand } from '../../../src/commands/archive.js';

describe('handleArchiveCommand --dry-run loadEvidence discriminated union', () => {
	beforeEach(() => {
		// Clear all mocks before each test
		mockLoadEvidence.mockClear();
		mockListEvidenceTaskIds.mockClear();
		mockArchiveEvidence.mockClear();
		mockLoadPluginConfig.mockClear();

		// Default config with standard retention settings
		mockLoadPluginConfig.mockReturnValue({
			evidence: {
				max_age_days: 90,
				max_bundles: 1000,
			},
		});
	});

	it('should include task in "would archive" when loadEvidence returns status: "found" with old bundle', async () => {
		// Arrange
		const oldDate = new Date();
		oldDate.setDate(oldDate.getDate() - 100); // 100 days ago (older than 90 day retention)
		const oldIsoDate = oldDate.toISOString();

		mockListEvidenceTaskIds.mockResolvedValue(['task-old']);
		mockLoadEvidence.mockResolvedValue({
			status: 'found',
			bundle: {
				schema_version: '1.0.0',
				task_id: 'task-old',
				entries: [],
				created_at: oldIsoDate,
				updated_at: oldIsoDate,
			},
		});

		// Act
		const result = await handleArchiveCommand('/test/dir', ['--dry-run']);

		// Assert
		expect(result).toContain('Would archive');
		expect(result).toContain('task-old');
		expect(mockLoadEvidence).toHaveBeenCalledWith('/test/dir', 'task-old');
	});

	it('should NOT include task in "would archive" when loadEvidence returns status: "not_found"', async () => {
		// Arrange
		mockListEvidenceTaskIds.mockResolvedValue(['task-not-found']);
		mockLoadEvidence.mockResolvedValue({
			status: 'not_found',
		});

		// Act
		const result = await handleArchiveCommand('/test/dir', ['--dry-run']);

		// Assert
		expect(result).not.toContain('task-not-found');
		expect(mockLoadEvidence).toHaveBeenCalledWith('/test/dir', 'task-not-found');
		// Verify no bundles would be archived
		expect(result).toContain('No evidence bundles older than 90 days found');
	});

	it('should NOT include task in "would archive" when loadEvidence returns status: "invalid_schema"', async () => {
		// Arrange
		mockListEvidenceTaskIds.mockResolvedValue(['task-invalid']);
		mockLoadEvidence.mockResolvedValue({
			status: 'invalid_schema',
			errors: ['schema_version: Required', 'updated_at: Invalid date format'],
		});

		// Act
		const result = await handleArchiveCommand('/test/dir', ['--dry-run']);

		// Assert
		expect(result).not.toContain('task-invalid');
		expect(mockLoadEvidence).toHaveBeenCalledWith('/test/dir', 'task-invalid');
		// Verify no bundles would be archived
		expect(result).toContain('No evidence bundles older than 90 days found');
	});

	it('should handle mixed scenarios correctly', async () => {
		// Arrange
		const oldDate = new Date();
		oldDate.setDate(oldDate.getDate() - 100);
		const oldIsoDate = oldDate.toISOString();

		mockListEvidenceTaskIds.mockResolvedValue([
			'task-old',
			'task-not-found',
			'task-invalid',
		]);

		// Return different results based on taskId
		mockLoadEvidence.mockImplementation((dir: string, taskId: string) => {
			if (taskId === 'task-old') {
				return Promise.resolve({
					status: 'found',
					bundle: {
						schema_version: '1.0.0',
						task_id: 'task-old',
						entries: [],
						created_at: oldIsoDate,
						updated_at: oldIsoDate,
					},
				});
			} else if (taskId === 'task-not-found') {
				return Promise.resolve({ status: 'not_found' });
			} else if (taskId === 'task-invalid') {
				return Promise.resolve({
					status: 'invalid_schema',
					errors: ['schema_version: Required'],
				});
			}
			return Promise.resolve({ status: 'not_found' });
		});

		// Act
		const result = await handleArchiveCommand('/test/dir', ['--dry-run']);

		// Assert - only task-old should appear in would archive
		expect(result).toContain('task-old');
		expect(result).not.toContain('task-not-found');
		expect(result).not.toContain('task-invalid');
		expect(result).toContain('Age-based (1)');
	});
});
