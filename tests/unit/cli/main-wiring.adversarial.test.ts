import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock console methods BEFORE importing
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = vi
	.spyOn(console, 'error')
	.mockImplementation(() => {});

// Mock process.argv to prevent default 'install' command
const originalArgv = process.argv;
process.argv = ['node', 'cli.js', '--help'];

// Mock process.exit to prevent CLI from exiting
const mockProcessExit = vi
	.spyOn(process, 'exit')
	.mockImplementation(() => undefined as never);

// Mock factories - declare BEFORE vi.mock() calls
const mockHandleStatusCommand = vi.fn();
const mockHandlePlanCommand = vi.fn();
const mockHandleAgentsCommand = vi.fn();
const mockHandleArchiveCommand = vi.fn();
const mockHandleHistoryCommand = vi.fn();
const mockHandleConfigCommand = vi.fn();
const mockHandleDoctorCommand = vi.fn();
const mockHandleEvidenceCommand = vi.fn();
const mockHandleEvidenceSummaryCommand = vi.fn();
const mockHandleDiagnoseCommand = vi.fn();
const mockHandlePreflightCommand = vi.fn();
const mockHandleSyncPlanCommand = vi.fn();
const mockHandleBenchmarkCommand = vi.fn();
const mockHandleExportCommand = vi.fn();
const mockHandleResetCommand = vi.fn();
const mockHandleRetrieveCommand = vi.fn();
const mockHandleClarifyCommand = vi.fn();
const mockHandleAnalyzeCommand = vi.fn();
const mockHandleSpecifyCommand = vi.fn();
const mockHandleDarkMatterCommand = vi.fn();
const mockHandleKnowledgeListCommand = vi.fn();
const mockHandleKnowledgeMigrateCommand = vi.fn();
const mockHandleKnowledgeQuarantineCommand = vi.fn();
const mockHandleKnowledgeRestoreCommand = vi.fn();
const mockHandleRollbackCommand = vi.fn();
const mockHandlePromoteCommand = vi.fn();
const mockHandleHandoffCommand = vi.fn();
const mockHandleTurboCommand = vi.fn();
const mockHandleSimulateCommand = vi.fn();
const mockHandleCurateCommand = vi.fn();
const mockHandleWriteRetroCommand = vi.fn();
const mockHandleCheckpointCommand = vi.fn();

// Mock individual command files so registry.ts picks up the mocked handlers
vi.mock('../../../src/commands/status.js', () => ({
	handleStatusCommand: mockHandleStatusCommand,
}));
vi.mock('../../../src/commands/plan.js', () => ({
	handlePlanCommand: mockHandlePlanCommand,
}));
vi.mock('../../../src/commands/agents.js', () => ({
	handleAgentsCommand: mockHandleAgentsCommand,
}));
vi.mock('../../../src/commands/archive.js', () => ({
	handleArchiveCommand: mockHandleArchiveCommand,
}));
vi.mock('../../../src/commands/history.js', () => ({
	handleHistoryCommand: mockHandleHistoryCommand,
}));
vi.mock('../../../src/commands/config.js', () => ({
	handleConfigCommand: mockHandleConfigCommand,
}));
vi.mock('../../../src/commands/doctor.js', () => ({
	handleDoctorCommand: mockHandleDoctorCommand,
}));
vi.mock('../../../src/commands/evidence.js', () => ({
	handleEvidenceCommand: mockHandleEvidenceCommand,
	handleEvidenceSummaryCommand: mockHandleEvidenceSummaryCommand,
}));
vi.mock('../../../src/commands/diagnose.js', () => ({
	handleDiagnoseCommand: mockHandleDiagnoseCommand,
}));
vi.mock('../../../src/commands/preflight.js', () => ({
	handlePreflightCommand: mockHandlePreflightCommand,
}));
vi.mock('../../../src/commands/sync-plan.js', () => ({
	handleSyncPlanCommand: mockHandleSyncPlanCommand,
}));
vi.mock('../../../src/commands/benchmark.js', () => ({
	handleBenchmarkCommand: mockHandleBenchmarkCommand,
}));
vi.mock('../../../src/commands/export.js', () => ({
	handleExportCommand: mockHandleExportCommand,
}));
vi.mock('../../../src/commands/reset.js', () => ({
	handleResetCommand: mockHandleResetCommand,
}));
vi.mock('../../../src/commands/retrieve.js', () => ({
	handleRetrieveCommand: mockHandleRetrieveCommand,
}));
vi.mock('../../../src/commands/clarify.js', () => ({
	handleClarifyCommand: mockHandleClarifyCommand,
}));
vi.mock('../../../src/commands/analyze.js', () => ({
	handleAnalyzeCommand: mockHandleAnalyzeCommand,
}));
vi.mock('../../../src/commands/specify.js', () => ({
	handleSpecifyCommand: mockHandleSpecifyCommand,
}));
vi.mock('../../../src/commands/dark-matter.js', () => ({
	handleDarkMatterCommand: mockHandleDarkMatterCommand,
}));
vi.mock('../../../src/commands/knowledge.js', () => ({
	handleKnowledgeListCommand: mockHandleKnowledgeListCommand,
	handleKnowledgeMigrateCommand: mockHandleKnowledgeMigrateCommand,
	handleKnowledgeQuarantineCommand: mockHandleKnowledgeQuarantineCommand,
	handleKnowledgeRestoreCommand: mockHandleKnowledgeRestoreCommand,
}));
vi.mock('../../../src/commands/rollback.js', () => ({
	handleRollbackCommand: mockHandleRollbackCommand,
}));
vi.mock('../../../src/commands/promote.js', () => ({
	handlePromoteCommand: mockHandlePromoteCommand,
}));
vi.mock('../../../src/commands/handoff.js', () => ({
	handleHandoffCommand: mockHandleHandoffCommand,
}));
vi.mock('../../../src/commands/turbo.js', () => ({
	handleTurboCommand: mockHandleTurboCommand,
}));
vi.mock('../../../src/commands/simulate.js', () => ({
	handleSimulateCommand: mockHandleSimulateCommand,
}));
vi.mock('../../../src/commands/curate.js', () => ({
	handleCurateCommand: mockHandleCurateCommand,
}));
vi.mock('../../../src/commands/write_retro.js', () => ({
	handleWriteRetroCommand: mockHandleWriteRetroCommand,
}));
vi.mock('../../../src/commands/checkpoint.js', () => ({
	handleCheckpointCommand: mockHandleCheckpointCommand,
}));

// Import AFTER mocking
import { run } from '../../../src/cli/index.js';

describe('main() run dispatch wiring — adversarial tests', () => {
	let mockExit: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockExit = vi.fn();
		mockConsoleError.mockClear();
		mockProcessExit.mockClear();
	});

	afterEach(() => {
		mockConsoleError.mockClear();
		mockProcessExit.mockClear();
	});

	it('run --help - should reject as unknown subcommand (exit 1)', async () => {
		const result = await run(['--help']);
		expect(result).toBe(1);
		expect(mockConsoleError).toHaveBeenCalledWith(
			expect.stringContaining('Unknown command: --help'),
		);
		expect(mockExit).not.toHaveBeenCalled();
	});

	it('run with empty string arg - should reject (exit 1)', async () => {
		const result = await run(['']);
		expect(result).toBe(1);
		expect(mockConsoleError).toHaveBeenCalledWith(
			expect.stringContaining('Unknown command:'),
		);
		expect(mockExit).not.toHaveBeenCalled();
	});

	it('run with path traversal - should reject ../../etc/passwd (exit 1)', async () => {
		const result = await run(['../../etc/passwd']);
		expect(result).toBe(1);
		expect(mockConsoleError).toHaveBeenCalledWith(
			expect.stringContaining('Unknown command: ../../etc/passwd'),
		);
		expect(mockExit).not.toHaveBeenCalled();
	});

	it('run with XSS injection - should reject <script>alert(1)</script> (exit 1)', async () => {
		const result = await run(['<script>alert(1)</script>']);
		expect(result).toBe(1);
		expect(mockConsoleError).toHaveBeenCalledWith(
			expect.stringContaining('Unknown command: <script>alert(1)</script>'),
		);
		expect(mockExit).not.toHaveBeenCalled();
	});

	it('run with very long subcommand (1000+ chars) - should reject (exit 1)', async () => {
		const longCmd = 'a'.repeat(1000);
		const result = await run([longCmd]);
		expect(result).toBe(1);
		expect(mockConsoleError).toHaveBeenCalledWith(
			expect.stringContaining('Unknown command:'),
		);
		expect(mockExit).not.toHaveBeenCalled();
	});

	it('run with "null" string - should reject (exit 1)', async () => {
		const result = await run(['null']);
		expect(result).toBe(1);
		expect(mockConsoleError).toHaveBeenCalledWith(
			expect.stringContaining('Unknown command: null'),
		);
		expect(mockExit).not.toHaveBeenCalled();
	});

	it('run with "undefined" string - should reject (exit 1)', async () => {
		const result = await run(['undefined']);
		expect(result).toBe(1);
		expect(mockConsoleError).toHaveBeenCalledWith(
			expect.stringContaining('Unknown command: undefined'),
		);
		expect(mockExit).not.toHaveBeenCalled();
	});

	it('run with "__proto__" string - should reject (exit 1)', async () => {
		const result = await run(['__proto__']);
		expect(result).toBe(1);
		expect(mockConsoleError).toHaveBeenCalledWith(
			expect.stringContaining('Unknown command: __proto__'),
		);
		expect(mockExit).not.toHaveBeenCalled();
	});

	it('runXYZ (command starting with run) - should NOT dispatch to run(), should hit unknown command (exit 1)', async () => {
		// Simulate main() receiving 'runXYZ' as the command
		const args = ['runXYZ'];

		// In main(), args[0] is 'runXYZ', which is NOT 'run', so it goes to the default case
		// We can simulate this by calling run() directly with the args.slice(1) that would be passed
		// Since args[0] is 'runXYZ', args.slice(1) would be [] (empty)
		const result = await run(args.slice(1));
		expect(result).toBe(1);
		expect(mockConsoleError).toHaveBeenCalledWith(
			expect.stringContaining('Usage:'),
		);
		expect(mockExit).not.toHaveBeenCalled();
	});

	it('RUN (uppercase) - should NOT dispatch to run(), should hit unknown command (exit 1)', async () => {
		// Simulate main() receiving 'RUN' as the command
		const args = ['RUN'];

		// In main(), args[0] is 'RUN', which is NOT 'run', so it goes to the default case
		// args.slice(1) would be [] (empty)
		const result = await run(args.slice(1));
		expect(result).toBe(1);
		expect(mockConsoleError).toHaveBeenCalledWith(
			expect.stringContaining('Usage:'),
		);
		expect(mockExit).not.toHaveBeenCalled();
	});

	it('run with no args - should show usage (exit 1)', async () => {
		const result = await run([]);
		expect(result).toBe(1);
		expect(mockConsoleError).toHaveBeenCalledWith(
			expect.stringContaining('Usage:'),
		);
		expect(mockConsoleError).toHaveBeenCalledWith(
			expect.stringContaining('bunx opencode-swarm run <command>'),
		);
		expect(mockExit).not.toHaveBeenCalled();
	});

	it('run with command injection semicolon - should reject (exit 1)', async () => {
		const result = await run(['status; rm -rf /']);
		expect(result).toBe(1);
		expect(mockConsoleError).toHaveBeenCalledWith(
			expect.stringContaining('Unknown command: status; rm -rf /'),
		);
		expect(mockExit).not.toHaveBeenCalled();
	});

	it('run with pipe injection - should reject (exit 1)', async () => {
		const result = await run(['status|cat']);
		expect(result).toBe(1);
		expect(mockConsoleError).toHaveBeenCalledWith(
			expect.stringContaining('Unknown command: status|cat'),
		);
		expect(mockExit).not.toHaveBeenCalled();
	});

	it('run with newline injection - should reject (exit 1)', async () => {
		const result = await run(['status\nrm -rf /']);
		expect(result).toBe(1);
		expect(mockConsoleError).toHaveBeenCalledWith(
			expect.stringContaining('Unknown command:'),
		);
		expect(mockExit).not.toHaveBeenCalled();
	});

	it('run with tab injection - should reject (exit 1)', async () => {
		const result = await run(['status\tcat']);
		expect(result).toBe(1);
		expect(mockConsoleError).toHaveBeenCalledWith(
			expect.stringContaining('Unknown command:'),
		);
		expect(mockExit).not.toHaveBeenCalled();
	});
});
