/**
 * Verification tests for loadEvidence discriminated union migration in benchmark.ts
 *
 * Verifies that handleBenchmarkCommand correctly handles the LoadEvidenceResult
 * discriminated union when aggregating quality metrics:
 * 1. 'found' status with valid bundle → entries are processed
 * 2. 'not_found' status → continues (entries are not processed)
 * 3. 'invalid_schema' status → continues (entries are not processed)
 * 4. Mixed scenarios with multiple tasks
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Local mock variables (NOT using vi.mocked())
const mockLoadEvidence = vi.fn();
const mockListEvidenceTaskIds = vi.fn();
const mockIsValidEvidenceType = vi.fn();

// Mock the evidence/manager module BEFORE importing handleBenchmarkCommand
vi.mock('../../../src/evidence/manager.js', () => ({
	loadEvidence: mockLoadEvidence,
	listEvidenceTaskIds: mockListEvidenceTaskIds,
	isValidEvidenceType: mockIsValidEvidenceType,
}));

// Import the function under test AFTER mocks are set up
import { handleBenchmarkCommand } from '../../../src/commands/benchmark.js';

describe('handleBenchmarkCommand loadEvidence discriminated union', () => {
	beforeEach(() => {
		// Clear all mocks before each test
		mockLoadEvidence.mockClear();
		mockListEvidenceTaskIds.mockClear();
		mockIsValidEvidenceType.mockClear();

		// Default: all evidence types are valid
		mockIsValidEvidenceType.mockReturnValue(true);
	});

	describe('Happy path: status "found" with valid bundle', () => {
		it('should aggregate review evidence when loadEvidence returns status: "found"', async () => {
			// Arrange
			const mockDate = new Date().toISOString();
			mockListEvidenceTaskIds.mockResolvedValue(['task-1']);
			mockLoadEvidence.mockResolvedValue({
				status: 'found',
				bundle: {
					schema_version: '1.0.0',
					task_id: 'task-1',
					entries: [
						{
							type: 'review',
							timestamp: mockDate,
							agent: 'reviewer',
							verdict: 'approved',
							summary: 'LGTM',
							risk: 'low',
							issues: [],
						},
					],
					created_at: mockDate,
					updated_at: mockDate,
				},
			});

			// Act
			const result = await handleBenchmarkCommand('/test/dir', ['--cumulative']);

			// Assert
			expect(result).toContain('Quality Signals');
			expect(result).toContain('Review pass rate: 100%');
			expect(mockLoadEvidence).toHaveBeenCalledWith('/test/dir', 'task-1');
		});

		it('should aggregate test evidence when loadEvidence returns status: "found"', async () => {
			// Arrange
			const mockDate = new Date().toISOString();
			mockListEvidenceTaskIds.mockResolvedValue(['task-1']);
			mockLoadEvidence.mockResolvedValue({
				status: 'found',
				bundle: {
					schema_version: '1.0.0',
					task_id: 'task-1',
					entries: [
						{
							type: 'test',
							timestamp: mockDate,
							agent: 'test_engineer',
							verdict: 'pass',
							summary: 'Tests passed',
							tests_passed: 80,
							tests_failed: 20,
							failures: [],
						},
					],
					created_at: mockDate,
					updated_at: mockDate,
				},
			});

			// Act
			const result = await handleBenchmarkCommand('/test/dir', ['--cumulative']);

			// Assert
			expect(result).toContain('Quality Signals');
			expect(result).toContain('Test pass rate: 80%');
			expect(mockLoadEvidence).toHaveBeenCalledWith('/test/dir', 'task-1');
		});

		it('should aggregate quality_budget evidence when loadEvidence returns status: "found"', async () => {
			// Arrange
			const mockDate = new Date().toISOString();
			mockListEvidenceTaskIds.mockResolvedValue(['task-1']);
			mockLoadEvidence.mockResolvedValue({
				status: 'found',
				bundle: {
					schema_version: '1.0.0',
					task_id: 'task-1',
					entries: [
						{
							type: 'quality_budget',
							timestamp: mockDate,
							agent: 'quality_budget',
							verdict: 'pass',
							summary: 'Quality budget passed',
							metrics: {
								complexity_delta: 3,
								public_api_delta: 5,
								duplication_ratio: 0.02,
								test_to_code_ratio: 0.4,
							},
							thresholds: {
								max_complexity_delta: 5,
								max_public_api_delta: 10,
								max_duplication_ratio: 0.05,
								min_test_to_code_ratio: 0.3,
							},
							violations: [],
							files_analyzed: ['src/test.ts'],
						},
					],
					created_at: mockDate,
					updated_at: mockDate,
				},
			});

			// Act
			const result = await handleBenchmarkCommand('/test/dir', ['--cumulative']);

			// Assert
			expect(result).toContain('Quality Metrics');
			expect(result).toContain('Complexity Delta: 3');
			expect(result).toContain('Public API Delta: 5');
			expect(result).toContain('Duplication Ratio: 2%');
			expect(result).toContain('Test-to-Code Ratio: 40%');
		});

		it('should aggregate diff evidence when loadEvidence returns status: "found"', async () => {
			// Arrange
			const mockDate = new Date().toISOString();
			mockListEvidenceTaskIds.mockResolvedValue(['task-1']);
			mockLoadEvidence.mockResolvedValue({
				status: 'found',
				bundle: {
					schema_version: '1.0.0',
					task_id: 'task-1',
					entries: [
						{
							type: 'diff',
							timestamp: mockDate,
							agent: 'coder',
							additions: 100,
							deletions: 50,
						},
					],
					created_at: mockDate,
					updated_at: mockDate,
				},
			});

			// Act
			const result = await handleBenchmarkCommand('/test/dir', ['--cumulative']);

			// Assert
			expect(result).toContain('Quality Signals');
			expect(result).toContain('Code churn: +100 / -50 lines');
		});
	});

	describe('Edge case: status "not_found"', () => {
		it('should skip task when loadEvidence returns status: "not_found"', async () => {
			// Arrange
			mockListEvidenceTaskIds.mockResolvedValue(['task-missing']);
			mockLoadEvidence.mockResolvedValue({ status: 'not_found' });

			// Act
			const result = await handleBenchmarkCommand('/test/dir', ['--cumulative']);

			// Assert
			expect(result).toContain('No evidence data found');
			expect(mockLoadEvidence).toHaveBeenCalledWith('/test/dir', 'task-missing');
			// Should not crash or include quality data from missing task
		});

		it('should aggregate only found evidence when some tasks return not_found', async () => {
			// Arrange
			const mockDate = new Date().toISOString();
			mockListEvidenceTaskIds.mockResolvedValue(['task-found', 'task-missing']);
			mockLoadEvidence.mockImplementation((dir: string, taskId: string) => {
				if (taskId === 'task-found') {
					return Promise.resolve({
						status: 'found',
						bundle: {
							schema_version: '1.0.0',
							task_id: 'task-found',
							entries: [
								{
									type: 'review',
									timestamp: mockDate,
									agent: 'reviewer',
									verdict: 'approved',
									summary: 'Good',
									risk: 'low',
									issues: [],
								},
							],
							created_at: mockDate,
							updated_at: mockDate,
						},
					});
				} else if (taskId === 'task-missing') {
					return Promise.resolve({ status: 'not_found' });
				}
				return Promise.resolve({ status: 'not_found' });
			});

			// Act
			const result = await handleBenchmarkCommand('/test/dir', ['--cumulative']);

			// Assert - only task-found's evidence should be counted
			expect(result).toContain('Review pass rate: 100%');
			expect(result).toContain('(1)');
		});

		it('should show "No evidence data found" when all tasks return not_found', async () => {
			// Arrange
			mockListEvidenceTaskIds.mockResolvedValue(['task-1', 'task-2']);
			mockLoadEvidence.mockResolvedValue({ status: 'not_found' });

			// Act
			const result = await handleBenchmarkCommand('/test/dir', ['--cumulative']);

			// Assert
			expect(result).toContain('No evidence data found');
			// Verify loadEvidence was called for each task
			expect(mockLoadEvidence).toHaveBeenCalledWith('/test/dir', 'task-1');
			expect(mockLoadEvidence).toHaveBeenCalledWith('/test/dir', 'task-2');
		});
	});

	describe('Edge case: status "invalid_schema"', () => {
		it('should skip task when loadEvidence returns status: "invalid_schema"', async () => {
			// Arrange
			mockListEvidenceTaskIds.mockResolvedValue(['task-invalid']);
			mockLoadEvidence.mockResolvedValue({
				status: 'invalid_schema',
				errors: ['schema_version: Required', 'updated_at: Invalid date format'],
			});

			// Act
			const result = await handleBenchmarkCommand('/test/dir', ['--cumulative']);

			// Assert
			expect(result).toContain('No evidence data found');
			expect(mockLoadEvidence).toHaveBeenCalledWith('/test/dir', 'task-invalid');
			// Should not crash or include quality data from invalid task
		});

		it('should aggregate only found evidence when some tasks return invalid_schema', async () => {
			// Arrange
			const mockDate = new Date().toISOString();
			mockListEvidenceTaskIds.mockResolvedValue([
				'task-valid',
				'task-invalid',
			]);
			mockLoadEvidence.mockImplementation((dir: string, taskId: string) => {
				if (taskId === 'task-valid') {
					return Promise.resolve({
						status: 'found',
						bundle: {
							schema_version: '1.0.0',
							task_id: 'task-valid',
							entries: [
								{
									type: 'review',
									timestamp: mockDate,
									agent: 'reviewer',
									verdict: 'approved',
									summary: 'Good',
									risk: 'low',
									issues: [],
								},
							],
							created_at: mockDate,
							updated_at: mockDate,
						},
					});
				} else if (taskId === 'task-invalid') {
					return Promise.resolve({
						status: 'invalid_schema',
						errors: ['schema_version: Required'],
					});
				}
				return Promise.resolve({ status: 'not_found' });
			});

			// Act
			const result = await handleBenchmarkCommand('/test/dir', ['--cumulative']);

			// Assert - only task-valid's evidence should be counted
			expect(result).toContain('Review pass rate: 100%');
			expect(result).toContain('(1)');
		});
	});

	describe('Mixed scenarios with multiple tasks', () => {
		it('should handle mixed found/not_found/invalid_schema results correctly', async () => {
			// Arrange
			const mockDate = new Date().toISOString();
			mockListEvidenceTaskIds.mockResolvedValue([
				'task-1-found',
				'task-2-not-found',
				'task-3-invalid',
				'task-4-found',
			]);

			mockLoadEvidence.mockImplementation((dir: string, taskId: string) => {
				if (taskId === 'task-1-found') {
					return Promise.resolve({
						status: 'found',
						bundle: {
							schema_version: '1.0.0',
							task_id: 'task-1-found',
							entries: [
								{
									type: 'review',
									timestamp: mockDate,
									agent: 'reviewer',
									verdict: 'approved',
									summary: 'Good',
									risk: 'low',
									issues: [],
								},
							],
							created_at: mockDate,
							updated_at: mockDate,
						},
					});
				} else if (taskId === 'task-2-not-found') {
					return Promise.resolve({ status: 'not_found' });
				} else if (taskId === 'task-3-invalid') {
					return Promise.resolve({
						status: 'invalid_schema',
						errors: ['schema_version: Required'],
					});
				} else if (taskId === 'task-4-found') {
					return Promise.resolve({
						status: 'found',
						bundle: {
							schema_version: '1.0.0',
							task_id: 'task-4-found',
							entries: [
								{
									type: 'review',
									timestamp: mockDate,
									agent: 'reviewer',
									verdict: 'approved',
									summary: 'Good',
									risk: 'low',
									issues: [],
								},
							],
							created_at: mockDate,
							updated_at: mockDate,
						},
					});
				}
				return Promise.resolve({ status: 'not_found' });
			});

			// Act
			const result = await handleBenchmarkCommand('/test/dir', ['--cumulative']);

			// Assert - only task-1-found and task-4-found should be counted
			expect(result).toContain('Review pass rate: 100%');
			expect(result).toContain('(2)');
		});

		it('should aggregate quality metrics from multiple found tasks', async () => {
			// Arrange
			const mockDate = new Date().toISOString();
			mockListEvidenceTaskIds.mockResolvedValue(['task-1', 'task-2']);

			mockLoadEvidence.mockImplementation((dir: string, taskId: string) => {
				if (taskId === 'task-1') {
					return Promise.resolve({
						status: 'found',
						bundle: {
							schema_version: '1.0.0',
							task_id: 'task-1',
							entries: [
								{
									type: 'quality_budget',
									timestamp: mockDate,
									agent: 'quality_budget',
									verdict: 'pass',
									summary: 'Quality passed',
									metrics: {
										complexity_delta: 2,
										public_api_delta: 4,
										duplication_ratio: 0.01,
										test_to_code_ratio: 0.3,
									},
									thresholds: {
										max_complexity_delta: 5,
										max_public_api_delta: 10,
										max_duplication_ratio: 0.05,
										min_test_to_code_ratio: 0.3,
									},
									violations: [],
									files_analyzed: ['src/test.ts'],
								},
							],
							created_at: mockDate,
							updated_at: mockDate,
						},
					});
				} else if (taskId === 'task-2') {
					return Promise.resolve({
						status: 'found',
						bundle: {
							schema_version: '1.0.0',
							task_id: 'task-2',
							entries: [
								{
									type: 'quality_budget',
									timestamp: mockDate,
									agent: 'quality_budget',
									verdict: 'pass',
									summary: 'Quality passed',
									metrics: {
										complexity_delta: 6,
										public_api_delta: 8,
										duplication_ratio: 0.03,
										test_to_code_ratio: 0.5,
									},
									thresholds: {
										max_complexity_delta: 5,
										max_public_api_delta: 10,
										max_duplication_ratio: 0.05,
										min_test_to_code_ratio: 0.3,
									},
									violations: [],
									files_analyzed: ['src/test2.ts'],
								},
							],
							created_at: mockDate,
							updated_at: mockDate,
						},
					});
				}
				return Promise.resolve({ status: 'not_found' });
			});

			// Act
			const result = await handleBenchmarkCommand('/test/dir', ['--cumulative']);

			// Assert - averages: (2+6)/2=4, (4+8)/2=6, (0.01+0.03)*100/2=2%, (0.3+0.5)*100/2=40%
			expect(result).toContain('Complexity Delta: 4');
			expect(result).toContain('Public API Delta: 6');
			expect(result).toContain('Duplication Ratio: 2%');
			expect(result).toContain('Test-to-Code Ratio: 40%');
		});

		it('should skip invalid evidence types within found bundles', async () => {
			// Arrange
			const mockDate = new Date().toISOString();
			mockListEvidenceTaskIds.mockResolvedValue(['task-1']);

			// First entry: valid type, second entry: invalid type
			mockLoadEvidence.mockResolvedValue({
				status: 'found',
				bundle: {
					schema_version: '1.0.0',
					task_id: 'task-1',
					entries: [
						{
							type: 'review',
							timestamp: mockDate,
							agent: 'reviewer',
							verdict: 'approved',
							summary: 'Good',
							risk: 'low',
							issues: [],
						},
						{
							type: 'unknown_type',
							timestamp: mockDate,
							agent: 'unknown',
						},
					],
					created_at: mockDate,
					updated_at: mockDate,
				},
			});

			// Mark only 'review' as valid
			mockIsValidEvidenceType.mockImplementation((type: string) => type === 'review');

			// Act
			const result = await handleBenchmarkCommand('/test/dir', ['--cumulative']);

			// Assert - only the valid review entry should be counted
			expect(result).toContain('Review pass rate: 100%');
			expect(result).toContain('(1)');
		});
	});

	describe('CI Gate with loadEvidence discriminated union', () => {
		it('should pass CI gate with found quality_budget evidence', async () => {
			// Arrange
			const mockDate = new Date().toISOString();
			mockListEvidenceTaskIds.mockResolvedValue(['task-1']);

			// Create passing review and test evidence
			mockLoadEvidence.mockImplementation((dir: string, taskId: string) => {
				if (taskId === 'task-1') {
					return Promise.resolve({
						status: 'found',
						bundle: {
							schema_version: '1.0.0',
							task_id: 'task-1',
							entries: [
								{
									type: 'review',
									timestamp: mockDate,
									agent: 'reviewer',
									verdict: 'approved',
									summary: 'Good',
									risk: 'low',
									issues: [],
								},
								{
									type: 'test',
									timestamp: mockDate,
									agent: 'test_engineer',
									verdict: 'pass',
									summary: 'Tests passed',
									tests_passed: 100,
									tests_failed: 0,
									failures: [],
								},
								{
									type: 'quality_budget',
									timestamp: mockDate,
									agent: 'quality_budget',
									verdict: 'pass',
									summary: 'Quality passed',
									metrics: {
										complexity_delta: 3,
										public_api_delta: 5,
										duplication_ratio: 0.02,
										test_to_code_ratio: 0.4,
									},
									thresholds: {
										max_complexity_delta: 5,
										max_public_api_delta: 10,
										max_duplication_ratio: 0.05,
										min_test_to_code_ratio: 0.3,
									},
									violations: [],
									files_analyzed: ['src/test.ts'],
								},
							],
							created_at: mockDate,
							updated_at: mockDate,
						},
					});
				}
				return Promise.resolve({ status: 'not_found' });
			});

			// Act
			const result = await handleBenchmarkCommand('/test/dir', ['--ci-gate']);

			// Assert
			expect(result).toContain('CI Gate');
			expect(result).toContain('✅ PASSED');
			expect(result).toContain('Complexity Delta: 3 <= 5 ✅');
		});

		it('should skip invalid evidence when checking CI gate (quality checks pass, review/test fail)', async () => {
			// Arrange
			mockListEvidenceTaskIds.mockResolvedValue(['task-invalid']);
			mockLoadEvidence.mockResolvedValue({
				status: 'invalid_schema',
				errors: ['schema_version: Required'],
			});

			// Act
			const result = await handleBenchmarkCommand('/test/dir', ['--ci-gate']);

			// Assert - CI gate fails on review/test checks but quality checks pass by default
			expect(result).toContain('CI Gate');
			expect(result).toContain('❌ FAILED');
			// Review and test checks fail with 0%
			expect(result).toContain('Review pass rate: 0% >= 70% ❌');
			expect(result).toContain('Test pass rate: 0% >= 80% ❌');
			// Quality checks should pass by default when no evidence
			expect(result).toContain('Complexity Delta: 0 <= 5 ✅');
			expect(result).toContain('Public API Delta: 0 <= 10 ✅');
			expect(result).toContain('Duplication Ratio: 0% <= 5% ✅');
			expect(result).toContain('Test-to-Code Ratio: 0% >= 30% ✅');
		});
	});

	describe('In-memory mode (no evidence loading)', () => {
		it('should not call loadEvidence in in-memory mode', async () => {
			// Act
			const result = await handleBenchmarkCommand('/test/dir', []);

			// Assert
			expect(mockLoadEvidence).not.toHaveBeenCalled();
			expect(result).toContain('mode: in-memory');
			// In-memory mode does NOT include Quality Signals section
			expect(result).not.toContain('Quality Signals');
			expect(result).not.toContain('No evidence data found');
		});
	});
});
