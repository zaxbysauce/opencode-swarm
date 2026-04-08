import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

// Create mock functions
const mockLoadPlan = mock<() => Promise<{ current_phase?: number } | null>>();
const mockRunPreflight =
	mock<
		(
			dir: string,
			phase: number,
		) => Promise<{
			id: string;
			timestamp: number;
			phase: number;
			overall: 'pass' | 'fail' | 'skipped';
			checks: Array<{ type: string; status: string; message: string }>;
			totalDurationMs: number;
			message: string;
		}>
	>();

// Mock the plan manager module BEFORE importing preflight-service
mock.module('../plan/manager', () => ({
	loadPlan: mockLoadPlan,
}));

// Mock the preflight-service module to replace runPreflight with our mock
mock.module('../services/preflight-service', () => ({
	runPreflight: mockRunPreflight,
}));

// Import after mocking - this gets the mocked version
import { handlePreflightCommand } from '../services/preflight-service';

describe('handlePreflightCommand phase derivation', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = path.join(
			tmpdir(),
			'preflight-phase-test-' +
				Date.now() +
				'-' +
				Math.random().toString(36).slice(2),
		);
		// Create .swarm directory to pass validateDirectoryPath check in runPreflight
		await fs.promises.mkdir(path.join(tempDir, '.swarm'), { recursive: true });

		// Reset mocks before each test
		mockLoadPlan.mockReset();
		mockRunPreflight.mockReset();
	});

	afterEach(async () => {
		try {
			await fs.promises.rm(tempDir, { force: true, recursive: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	test('runPreflight is called with phase 3 when loadPlan returns plan with current_phase = 3', async () => {
		mockLoadPlan.mockResolvedValueOnce({ current_phase: 3 });
		mockRunPreflight.mockResolvedValueOnce({
			id: 'test-report',
			timestamp: Date.now(),
			phase: 3,
			overall: 'pass',
			checks: [],
			totalDurationMs: 10,
			message: 'test',
		});

		await handlePreflightCommand(tempDir, []);

		expect(mockLoadPlan).toHaveBeenCalledTimes(1);
		expect(mockRunPreflight).toHaveBeenCalledTimes(1);
		expect(mockRunPreflight).toHaveBeenCalledWith(tempDir, 3);
	});

	test('runPreflight is called with phase 1 when loadPlan returns null', async () => {
		mockLoadPlan.mockResolvedValueOnce(null);
		mockRunPreflight.mockResolvedValueOnce({
			id: 'test-report',
			timestamp: Date.now(),
			phase: 1,
			overall: 'pass',
			checks: [],
			totalDurationMs: 10,
			message: 'test',
		});

		await handlePreflightCommand(tempDir, []);

		expect(mockLoadPlan).toHaveBeenCalledTimes(1);
		expect(mockRunPreflight).toHaveBeenCalledTimes(1);
		expect(mockRunPreflight).toHaveBeenCalledWith(tempDir, 1);
	});

	test('runPreflight is called with phase 1 when loadPlan returns plan with current_phase = undefined', async () => {
		mockLoadPlan.mockResolvedValueOnce({});
		mockRunPreflight.mockResolvedValueOnce({
			id: 'test-report',
			timestamp: Date.now(),
			phase: 1,
			overall: 'pass',
			checks: [],
			totalDurationMs: 10,
			message: 'test',
		});

		await handlePreflightCommand(tempDir, []);

		expect(mockLoadPlan).toHaveBeenCalledTimes(1);
		expect(mockRunPreflight).toHaveBeenCalledTimes(1);
		expect(mockRunPreflight).toHaveBeenCalledWith(tempDir, 1);
	});
});
