/**
 * Adversarial security testing for loadEvidence discriminated union in benchmark.ts
 *
 * Tests attack vectors and edge cases that could compromise system stability:
 * 1. loadEvidence throwing instead of returning discriminated union
 * 2. bundle.entries being null/undefined/not an array
 * 3. status being unexpected string (not 'found'|'not_found'|'invalid_schema')
 * 4. directory argument being empty string, null, or path traversal
 * 5. listEvidenceTaskIds returning very large array (thousands of task IDs)
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

describe('handleBenchmarkCommand - Adversarial Security Tests', () => {
	beforeEach(() => {
		// Clear all mocks before each test
		mockLoadEvidence.mockClear();
		mockListEvidenceTaskIds.mockClear();
		mockIsValidEvidenceType.mockClear();

		// Default: all evidence types are valid
		mockIsValidEvidenceType.mockReturnValue(true);
	});

	describe('Attack vector: loadEvidence throws instead of returning discriminated union', () => {
		it('should handle synchronous throws from loadEvidence gracefully', async () => {
			// Arrange
			mockListEvidenceTaskIds.mockResolvedValue(['task-1']);
			mockLoadEvidence.mockImplementation(() => {
				throw new Error('loadEvidence internal failure');
			});

			// Act & Assert - should not crash, should propagate error
			await expect(
				handleBenchmarkCommand('/test/dir', ['--cumulative']),
			).rejects.toThrow('loadEvidence internal failure');
		});

		it('should handle asynchronous rejections from loadEvidence gracefully', async () => {
			// Arrange
			mockListEvidenceTaskIds.mockResolvedValue(['task-1']);
			mockLoadEvidence.mockRejectedValue(
				new Error('Async loadEvidence failure'),
			);

			// Act & Assert - should not crash, should propagate error
			await expect(
				handleBenchmarkCommand('/test/dir', ['--cumulative']),
			).rejects.toThrow('Async loadEvidence failure');
		});

		it('should handle partial failures when some loadEvidence calls throw', async () => {
			// Arrange
			const mockDate = new Date().toISOString();
			mockListEvidenceTaskIds.mockResolvedValue(['task-1', 'task-2', 'task-3']);
			mockLoadEvidence.mockImplementation((dir: string, taskId: string) => {
				if (taskId === 'task-1') {
					throw new Error('Task 1 failed catastrophically');
				} else if (taskId === 'task-2') {
					return Promise.resolve({
						status: 'found',
						bundle: {
							schema_version: '1.0.0',
							task_id: 'task-2',
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
				// task-3
				return Promise.resolve({
					status: 'found',
					bundle: {
						schema_version: '1.0.0',
						task_id: 'task-3',
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
			});

			// Act & Assert - should fail on first throw (sequential iteration)
			await expect(
				handleBenchmarkCommand('/test/dir', ['--cumulative']),
			).rejects.toThrow('Task 1 failed catastrophically');
		});
	});

	describe('Attack vector: bundle.entries is null/undefined/not an array', () => {
		it('should handle bundle.entries being null', async () => {
			// Arrange
			mockListEvidenceTaskIds.mockResolvedValue(['task-1']);
			mockLoadEvidence.mockResolvedValue({
				status: 'found',
				bundle: {
					schema_version: '1.0.0',
					task_id: 'task-1',
					entries: null,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				},
			});

			// Act & Assert - should crash on null entries (forbidden iteration)
			await expect(
				handleBenchmarkCommand('/test/dir', ['--cumulative']),
			).rejects.toThrow();
		});

		it('should handle bundle.entries being undefined', async () => {
			// Arrange
			mockListEvidenceTaskIds.mockResolvedValue(['task-1']);
			mockLoadEvidence.mockResolvedValue({
				status: 'found',
				bundle: {
					schema_version: '1.0.0',
					task_id: 'task-1',
					// entries is missing (undefined)
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				},
			});

			// Act & Assert - should crash on undefined entries (forbidden iteration)
			await expect(
				handleBenchmarkCommand('/test/dir', ['--cumulative']),
			).rejects.toThrow();
		});

		it('should handle bundle.entries being a non-array object', async () => {
			// Arrange
			mockListEvidenceTaskIds.mockResolvedValue(['task-1']);
			mockLoadEvidence.mockResolvedValue({
				status: 'found',
				bundle: {
					schema_version: '1.0.0',
					task_id: 'task-1',
					entries: { type: 'not-an-array', value: 42 } as unknown as unknown[],
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				},
			});

			// Act & Assert - should crash: plain objects are not iterable
			await expect(
				handleBenchmarkCommand('/test/dir', ['--cumulative']),
			).rejects.toThrow('{} is not iterable');
		});

		it('should handle bundle.entries being a string (security issue: iterates chars)', async () => {
			// Arrange
			mockListEvidenceTaskIds.mockResolvedValue(['task-1']);
			mockLoadEvidence.mockResolvedValue({
				status: 'found',
				bundle: {
					schema_version: '1.0.0',
					task_id: 'task-1',
					entries: 'not-an-array' as unknown as unknown[],
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				},
			});

			// Act - VULNERABLE: does NOT crash, iterates over string characters instead
			const result = await handleBenchmarkCommand('/test/dir', ['--cumulative']);

			// Assert - string 'not-an-array' has 12 characters, each treated as an "entry"
			// Each character has no .type property, so isValidEvidenceType returns false
			// Result is "No evidence data found" because all "entries" are skipped
			expect(result).toContain('No evidence data found');
		});

		it('should handle bundle.entries being a number (security issue: no iteration)', async () => {
			// Arrange
			mockListEvidenceTaskIds.mockResolvedValue(['task-1']);
			mockLoadEvidence.mockResolvedValue({
				status: 'found',
				bundle: {
					schema_version: '1.0.0',
					task_id: 'task-1',
					entries: 42 as unknown as unknown[],
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				},
			});

			// Act & Assert - should crash because numbers are not iterable
			await expect(
				handleBenchmarkCommand('/test/dir', ['--cumulative']),
			).rejects.toThrow();
		});

		it('should handle bundle.entries being an empty array (valid but edge case)', async () => {
			// Arrange
			mockListEvidenceTaskIds.mockResolvedValue(['task-1']);
			mockLoadEvidence.mockResolvedValue({
				status: 'found',
				bundle: {
					schema_version: '1.0.0',
					task_id: 'task-1',
					entries: [],
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				},
			});

			// Act
			const result = await handleBenchmarkCommand('/test/dir', ['--cumulative']);

			// Assert - should handle empty array gracefully
			expect(result).toContain('No evidence data found');
		});

		it('should handle bundle.entries array containing null elements', async () => {
			// Arrange
			mockListEvidenceTaskIds.mockResolvedValue(['task-1']);
			mockLoadEvidence.mockResolvedValue({
				status: 'found',
				bundle: {
					schema_version: '1.0.0',
					task_id: 'task-1',
					entries: [null, null] as unknown[],
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				},
			});

			// Act & Assert - should crash on null entry access
			await expect(
				handleBenchmarkCommand('/test/dir', ['--cumulative']),
			).rejects.toThrow();
		});

		it('should handle bundle.entries array containing undefined elements', async () => {
			// Arrange
			mockListEvidenceTaskIds.mockResolvedValue(['task-1']);
			mockLoadEvidence.mockResolvedValue({
				status: 'found',
				bundle: {
					schema_version: '1.0.0',
					task_id: 'task-1',
					entries: [undefined, undefined] as unknown[],
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				},
			});

			// Act & Assert - should crash on undefined entry access
			await expect(
				handleBenchmarkCommand('/test/dir', ['--cumulative']),
			).rejects.toThrow();
		});
	});

	describe('Attack vector: status is unexpected string (not found|not_found|invalid_schema)', () => {
		it('should handle status being an empty string', async () => {
			// Arrange
			mockListEvidenceTaskIds.mockResolvedValue(['task-1']);
			mockLoadEvidence.mockResolvedValue({
				status: '',
			} as any);

			// Act & Assert - the code checks `if (result.status !== 'found') continue`
			// So empty string should cause it to continue (skip)
			const result = await handleBenchmarkCommand('/test/dir', ['--cumulative']);

			// Assert - should skip the task since empty string !== 'found'
			expect(result).toContain('No evidence data found');
		});

		it('should handle status being a random malicious string', async () => {
			// Arrange
			mockListEvidenceTaskIds.mockResolvedValue(['task-1']);
			mockLoadEvidence.mockResolvedValue({
				status: '../../../etc/passwd',
			} as any);

			// Act
			const result = await handleBenchmarkCommand('/test/dir', ['--cumulative']);

			// Assert - should skip since status !== 'found'
			expect(result).toContain('No evidence data found');
		});

		it('should handle status being "FOUND" (case sensitivity attack)', async () => {
			// Arrange
			mockListEvidenceTaskIds.mockResolvedValue(['task-1']);
			mockLoadEvidence.mockResolvedValue({
				status: 'FOUND',
			} as any);

			// Act
			const result = await handleBenchmarkCommand('/test/dir', ['--cumulative']);

			// Assert - should skip since 'FOUND' !== 'found'
			expect(result).toContain('No evidence data found');
		});

		it('should handle status being "Found" (mixed case attack)', async () => {
			// Arrange
			mockListEvidenceTaskIds.mockResolvedValue(['task-1']);
			mockLoadEvidence.mockResolvedValue({
				status: 'Found',
			} as any);

			// Act
			const result = await handleBenchmarkCommand('/test/dir', ['--cumulative']);

			// Assert - should skip since 'Found' !== 'found'
			expect(result).toContain('No evidence data found');
		});

		it('should handle status being a long string (DoS attempt)', async () => {
			// Arrange
			mockListEvidenceTaskIds.mockResolvedValue(['task-1']);
			const longString = 'a'.repeat(10000);
			mockLoadEvidence.mockResolvedValue({
				status: longString,
			} as any);

			// Act
			const result = await handleBenchmarkCommand('/test/dir', ['--cumulative']);

			// Assert - should skip
			expect(result).toContain('No evidence data found');
		});

		it('should handle status being SQL injection attempt', async () => {
			// Arrange
			mockListEvidenceTaskIds.mockResolvedValue(['task-1']);
			mockLoadEvidence.mockResolvedValue({
				status: "found'; DROP TABLE tasks; --",
			} as any);

			// Act
			const result = await handleBenchmarkCommand('/test/dir', ['--cumulative']);

			// Assert - should skip (this is just a string comparison)
			expect(result).toContain('No evidence data found');
		});

		it('should handle status being JavaScript code injection attempt', async () => {
			// Arrange
			mockListEvidenceTaskIds.mockResolvedValue(['task-1']);
			mockLoadEvidence.mockResolvedValue({
				status: 'found; process.exit(1)',
			} as any);

			// Act
			const result = await handleBenchmarkCommand('/test/dir', ['--cumulative']);

			// Assert - should skip
			expect(result).toContain('No evidence data found');
		});
	});

	describe('Attack vector: directory argument is empty string, null, or path traversal', () => {
		it('should handle directory being empty string', async () => {
			// Arrange
			mockListEvidenceTaskIds.mockResolvedValue([]);
			mockLoadEvidence.mockResolvedValue({
				status: 'not_found',
			});

			// Act
			const result = await handleBenchmarkCommand('', ['--cumulative']);

			// Assert - should handle gracefully (empty task list)
			expect(result).toContain('No evidence data found');
			expect(mockListEvidenceTaskIds).toHaveBeenCalledWith('');
		});

		it('should handle directory being path traversal attack (../)', async () => {
			// Arrange
			mockListEvidenceTaskIds.mockResolvedValue([]);
			mockLoadEvidence.mockResolvedValue({
				status: 'not_found',
			});

			// Act
			const result = await handleBenchmarkCommand(
				'../../../etc/passwd',
				['--cumulative'],
			);

			// Assert - should pass through (validation not in benchmark.ts)
			expect(result).toContain('No evidence data found');
			expect(mockListEvidenceTaskIds).toHaveBeenCalledWith(
				'../../../etc/passwd',
			);
		});

		it('should handle directory being absolute path traversal attack', async () => {
			// Arrange
			mockListEvidenceTaskIds.mockResolvedValue([]);
			mockLoadEvidence.mockResolvedValue({
				status: 'not_found',
			});

			// Act
			const result = await handleBenchmarkCommand('/etc/passwd', ['--cumulative']);

			// Assert - should pass through
			expect(result).toContain('No evidence data found');
			expect(mockListEvidenceTaskIds).toHaveBeenCalledWith('/etc/passwd');
		});

		it('should handle directory being null (type error)', async () => {
			// Arrange
			mockListEvidenceTaskIds.mockResolvedValue([]);

			// Act & Assert - TypeScript should prevent null at compile time
			// But at runtime, if bypassed, it would use null as string "null"
			const result = await handleBenchmarkCommand(
				null as any,
				['--cumulative'],
			);

			expect(result).toContain('No evidence data found');
		});

		it('should handle directory being undefined (type error)', async () => {
			// Arrange
			mockListEvidenceTaskIds.mockResolvedValue([]);

			// Act & Assert
			const result = await handleBenchmarkCommand(
				undefined as any,
				['--cumulative'],
			);

			expect(result).toContain('No evidence data found');
		});

		it('should handle directory being very long string (buffer overflow attempt)', async () => {
			// Arrange
			mockListEvidenceTaskIds.mockResolvedValue([]);
			const longPath = 'a'.repeat(100000);
			mockLoadEvidence.mockResolvedValue({
				status: 'not_found',
			});

			// Act
			const result = await handleBenchmarkCommand(longPath, ['--cumulative']);

			// Assert
			expect(result).toContain('No evidence data found');
			expect(mockListEvidenceTaskIds).toHaveBeenCalledWith(longPath);
		});

		it('should handle directory containing null byte injection', async () => {
			// Arrange
			mockListEvidenceTaskIds.mockResolvedValue([]);
			mockLoadEvidence.mockResolvedValue({
				status: 'not_found',
			});

			// Act
			const result = await handleBenchmarkCommand(
				'/test\x00dir',
				['--cumulative'],
			);

			// Assert
			expect(result).toContain('No evidence data found');
			expect(mockListEvidenceTaskIds).toHaveBeenCalledWith('/test\x00dir');
		});
	});

	describe('Attack vector: listEvidenceTaskIds returns very large array (DoS)', () => {
		it('should handle 100 task IDs (normal load)', async () => {
			// Arrange
			const taskIds = Array.from({ length: 100 }, (_, i) => `task-${i}`);
			mockListEvidenceTaskIds.mockResolvedValue(taskIds);
			mockLoadEvidence.mockResolvedValue({
				status: 'not_found',
			});

			// Act
			const result = await handleBenchmarkCommand('/test/dir', ['--cumulative']);

			// Assert
			expect(result).toContain('No evidence data found');
			expect(mockLoadEvidence).toHaveBeenCalledTimes(100);
		});

		it('should handle 1000 task IDs (heavy load)', async () => {
			// Arrange
			const taskIds = Array.from({ length: 1000 }, (_, i) => `task-${i}`);
			mockListEvidenceTaskIds.mockResolvedValue(taskIds);
			mockLoadEvidence.mockResolvedValue({
				status: 'not_found',
			});

			// Act
			const result = await handleBenchmarkCommand('/test/dir', ['--cumulative']);

			// Assert
			expect(result).toContain('No evidence data found');
			expect(mockLoadEvidence).toHaveBeenCalledTimes(1000);
		});

		it('should handle 5000 task IDs (potential DoS)', async () => {
			// Arrange
			const taskIds = Array.from({ length: 5000 }, (_, i) => `task-${i}`);
			mockListEvidenceTaskIds.mockResolvedValue(taskIds);
			mockLoadEvidence.mockResolvedValue({
				status: 'not_found',
			});

			// Act
			const result = await handleBenchmarkCommand('/test/dir', ['--cumulative']);

			// Assert
			expect(result).toContain('No evidence data found');
			expect(mockLoadEvidence).toHaveBeenCalledTimes(5000);
		}, 15000); // Increase timeout for large array

		it('should handle 10000 task IDs (definite DoS if unbounded)', async () => {
			// Arrange
			const taskIds = Array.from({ length: 10000 }, (_, i) => `task-${i}`);
			mockListEvidenceTaskIds.mockResolvedValue(taskIds);
			mockLoadEvidence.mockResolvedValue({
				status: 'not_found',
			});

			// Act
			const result = await handleBenchmarkCommand('/test/dir', ['--cumulative']);

			// Assert
			expect(result).toContain('No evidence data found');
			expect(mockLoadEvidence).toHaveBeenCalledTimes(10000);
		}, 30000); // Increase timeout for very large array

		it('should handle task IDs being very long strings (memory exhaustion)', async () => {
			// Arrange
			const taskIds = Array.from({ length: 10 }, (_, i) =>
				'a'.repeat(100000),
			);
			mockListEvidenceTaskIds.mockResolvedValue(taskIds);
			mockLoadEvidence.mockResolvedValue({
				status: 'not_found',
			});

			// Act
			const result = await handleBenchmarkCommand('/test/dir', ['--cumulative']);

			// Assert
			expect(result).toContain('No evidence data found');
			expect(mockLoadEvidence).toHaveBeenCalledTimes(10);
		});

		it('should handle duplicate task IDs (idempotency check)', async () => {
			// Arrange
			const taskIds = ['task-1', 'task-1', 'task-1', 'task-1'];
			mockListEvidenceTaskIds.mockResolvedValue(taskIds);
			mockLoadEvidence.mockResolvedValue({
				status: 'not_found',
			});

			// Act
			const result = await handleBenchmarkCommand('/test/dir', ['--cumulative']);

			// Assert - should process all duplicates
			expect(result).toContain('No evidence data found');
			expect(mockLoadEvidence).toHaveBeenCalledTimes(4);
		});
	});

	describe('Attack vector: mixed adversarial conditions', () => {
		it('should handle large array with null entries', async () => {
			// Arrange
			const taskIds = Array.from({ length: 100 }, (_, i) => `task-${i}`);
			mockListEvidenceTaskIds.mockResolvedValue(taskIds);

			const mockDate = new Date().toISOString();
			mockLoadEvidence.mockResolvedValue({
				status: 'found',
				bundle: {
					schema_version: '1.0.0',
					task_id: 'task-1',
					entries: [null, null, null] as unknown[],
					created_at: mockDate,
					updated_at: mockDate,
				},
			});

			// Act & Assert - should crash on first null entry
			await expect(
				handleBenchmarkCommand('/test/dir', ['--cumulative']),
			).rejects.toThrow();
		});

		it('should handle path traversal with large array', async () => {
			// Arrange
			const taskIds = Array.from({ length: 100 }, (_, i) => `task-${i}`);
			mockListEvidenceTaskIds.mockResolvedValue(taskIds);
			mockLoadEvidence.mockResolvedValue({
				status: 'not_found',
			});

			// Act
			const result = await handleBenchmarkCommand(
				'../../../etc/passwd',
				['--cumulative'],
			);

			// Assert
			expect(result).toContain('No evidence data found');
			expect(mockLoadEvidence).toHaveBeenCalledTimes(100);
			// All calls should have the malicious path
			expect(mockLoadEvidence).toHaveBeenLastCalledWith(
				'../../../etc/passwd',
				'task-99',
			);
		});
	});

	describe('Attack vector: CI Gate with adversarial inputs', () => {
		it('should handle CI gate when loadEvidence throws', async () => {
			// Arrange
			mockListEvidenceTaskIds.mockResolvedValue(['task-1']);
			mockLoadEvidence.mockRejectedValue(
				new Error('loadEvidence failed'),
			);

			// Act & Assert - should propagate error
			await expect(
				handleBenchmarkCommand('/test/dir', ['--ci-gate']),
			).rejects.toThrow('loadEvidence failed');
		});

		it('should handle CI gate with large task array', async () => {
			// Arrange
			const taskIds = Array.from({ length: 1000 }, (_, i) => `task-${i}`);
			mockListEvidenceTaskIds.mockResolvedValue(taskIds);
			mockLoadEvidence.mockResolvedValue({
				status: 'not_found',
			});

			// Act
			const result = await handleBenchmarkCommand('/test/dir', ['--ci-gate']);

			// Assert - CI gate should still run (no evidence means checks pass by default)
			expect(result).toContain('CI Gate');
			expect(mockLoadEvidence).toHaveBeenCalledTimes(1000);
		}, 20000);
	});
});
