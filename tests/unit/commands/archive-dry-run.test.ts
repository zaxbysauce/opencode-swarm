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

		mockListEvidenceTaskIds.mockResolvedValue(['1.1']);
		mockLoadEvidence.mockResolvedValue({
			status: 'found',
			bundle: {
				schema_version: '1.0.0',
				task_id: '1.1',
				entries: [],
				created_at: oldIsoDate,
				updated_at: oldIsoDate,
			},
		});

		// Act
		const result = await handleArchiveCommand('/test/dir', ['--dry-run']);

		// Assert
		expect(result).toContain('Would archive');
		expect(result).toContain('1.1');
		expect(mockLoadEvidence).toHaveBeenCalledWith('/test/dir', '1.1');
	});

	it('should NOT include task in "would archive" when loadEvidence returns status: "not_found"', async () => {
		// Arrange
		mockListEvidenceTaskIds.mockResolvedValue(['1.2']);
		mockLoadEvidence.mockResolvedValue({
			status: 'not_found',
		});

		// Act
		const result = await handleArchiveCommand('/test/dir', ['--dry-run']);

		// Assert
		expect(result).not.toContain('1.2');
		expect(mockLoadEvidence).toHaveBeenCalledWith('/test/dir', '1.2');
		// Verify no bundles would be archived
		expect(result).toContain('No evidence bundles older than 90 days found');
	});

	it('should NOT include task in "would archive" when loadEvidence returns status: "invalid_schema"', async () => {
		// Arrange
		mockListEvidenceTaskIds.mockResolvedValue(['1.3']);
		mockLoadEvidence.mockResolvedValue({
			status: 'invalid_schema',
			errors: ['schema_version: Required', 'updated_at: Invalid date format'],
		});

		// Act
		const result = await handleArchiveCommand('/test/dir', ['--dry-run']);

		// Assert
		expect(result).not.toContain('1.3');
		expect(mockLoadEvidence).toHaveBeenCalledWith('/test/dir', '1.3');
		// Verify no bundles would be archived
		expect(result).toContain('No evidence bundles older than 90 days found');
	});

	it('should handle mixed scenarios correctly', async () => {
		// Arrange
		const oldDate = new Date();
		oldDate.setDate(oldDate.getDate() - 100);
		const oldIsoDate = oldDate.toISOString();

		mockListEvidenceTaskIds.mockResolvedValue([
			'1.1',
			'1.2',
			'1.3',
		]);

		// Return different results based on taskId
		mockLoadEvidence.mockImplementation((dir: string, taskId: string) => {
			if (taskId === '1.1') {
				return Promise.resolve({
					status: 'found',
					bundle: {
						schema_version: '1.0.0',
						task_id: '1.1',
						entries: [],
						created_at: oldIsoDate,
						updated_at: oldIsoDate,
					},
				});
			} else if (taskId === '1.2') {
				return Promise.resolve({ status: 'not_found' });
			} else if (taskId === '1.3') {
				return Promise.resolve({
					status: 'invalid_schema',
					errors: ['schema_version: Required'],
				});
			}
			return Promise.resolve({ status: 'not_found' });
		});

		// Act
		const result = await handleArchiveCommand('/test/dir', ['--dry-run']);

		// Assert - only 1.1 should appear in would archive
		expect(result).toContain('1.1');
		expect(result).not.toContain('1.2');
		expect(result).not.toContain('1.3');
		expect(result).toContain('Age-based (1)');
	});
});
