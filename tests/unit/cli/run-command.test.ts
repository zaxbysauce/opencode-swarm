import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
const mockHandleHandoffCommand = vi.fn();
const mockHandleTurboCommand = vi.fn();
const mockHandleRollbackCommand = vi.fn();
const mockHandlePromoteCommand = vi.fn();
const mockHandleSimulateCommand = vi.fn();
const mockHandleCurateCommand = vi.fn();
const mockHandleWriteRetroCommand = vi.fn();
const mockHandleCheckpointCommand = vi.fn();
const mockHandleDoctorToolsCommand = vi.fn();

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
	handleDoctorToolsCommand: mockHandleDoctorToolsCommand,
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
vi.mock('../../../src/commands/handoff.js', () => ({
	handleHandoffCommand: mockHandleHandoffCommand,
}));
vi.mock('../../../src/commands/turbo.js', () => ({
	handleTurboCommand: mockHandleTurboCommand,
}));
vi.mock('../../../src/commands/rollback.js', () => ({
	handleRollbackCommand: mockHandleRollbackCommand,
}));
vi.mock('../../../src/commands/promote.js', () => ({
	handlePromoteCommand: mockHandlePromoteCommand,
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

// Import AFTER mocking is set up - use require for synchronous loading
// @ts-ignore - Bun supports require for .js extensions
const cliModule = require('../../../src/cli/index.js');
const run = cliModule.run;

describe('run() - CLI entry point', () => {
	const cwd = process.cwd();

	beforeEach(() => {
		vi.clearAllMocks();

		// Set up default mock return values
		// handleAgentsCommand is NOT async - returns string directly
		mockHandleAgentsCommand.mockReturnValue('agents mock output');

		// All other handlers are async
		mockHandleStatusCommand.mockResolvedValue('status mock output');
		mockHandlePlanCommand.mockResolvedValue('plan mock output');
		mockHandleArchiveCommand.mockResolvedValue('archive mock output');
		mockHandleHistoryCommand.mockResolvedValue('history mock output');
		mockHandleConfigCommand.mockResolvedValue('config mock output');
		mockHandleDoctorCommand.mockResolvedValue('doctor mock output');
		mockHandleEvidenceCommand.mockResolvedValue('evidence mock output');
		mockHandleEvidenceSummaryCommand.mockResolvedValue(
			'evidence summary mock output',
		);
		mockHandleDiagnoseCommand.mockResolvedValue('diagnose mock output');
		mockHandlePreflightCommand.mockResolvedValue('preflight mock output');
		mockHandleSyncPlanCommand.mockResolvedValue('sync-plan mock output');
		mockHandleBenchmarkCommand.mockResolvedValue('benchmark mock output');
		mockHandleExportCommand.mockResolvedValue('export mock output');
		mockHandleResetCommand.mockResolvedValue('reset mock output');
		mockHandleRetrieveCommand.mockResolvedValue('retrieve mock output');
		mockHandleClarifyCommand.mockResolvedValue('clarify mock output');
		mockHandleAnalyzeCommand.mockResolvedValue('analyze mock output');
		mockHandleSpecifyCommand.mockResolvedValue('specify mock output');
		mockHandleDarkMatterCommand.mockResolvedValue('dark-matter mock output');
		mockHandleKnowledgeListCommand.mockResolvedValue(
			'knowledge list mock output',
		);
		mockHandleKnowledgeMigrateCommand.mockResolvedValue(
			'knowledge migrate mock output',
		);
		mockHandleKnowledgeQuarantineCommand.mockResolvedValue(
			'knowledge quarantine mock output',
		);
		mockHandleKnowledgeRestoreCommand.mockResolvedValue(
			'knowledge restore mock output',
		);
	});

	afterAll(() => {
		// Restore process.argv and process.exit
		process.argv = originalArgv;
		mockProcessExit.mockRestore();
		mockConsoleLog.mockRestore();
		mockConsoleError.mockRestore();
	});

	it('empty args → returns 1, console.error called with usage message', async () => {
		const result = await run([]);
		expect(result).toBe(1);
		expect(mockConsoleError).toHaveBeenCalledWith(
			expect.stringContaining('Usage: bunx opencode-swarm run <command>'),
		);
	});

	it('status → handleStatusCommand called with (cwd, {}), returns 0', async () => {
		const result = await run(['status']);
		expect(result).toBe(0);
		expect(mockHandleStatusCommand).toHaveBeenCalledWith(
			expect.any(String),
			{},
		);
		expect(mockConsoleLog).toHaveBeenCalledWith('status mock output');
	});

	it('plan with extra args → handlePlanCommand called with (cwd, ["--phase", "2"]), returns 0', async () => {
		const result = await run(['plan', '--phase', '2']);
		expect(result).toBe(0);
		expect(mockHandlePlanCommand).toHaveBeenCalledWith(expect.any(String), [
			'--phase',
			'2',
		]);
		expect(mockConsoleLog).toHaveBeenCalledWith('plan mock output');
	});

	it('agents → handleAgentsCommand called with ({}, undefined), returns 0, NOT awaited', async () => {
		const result = await run(['agents']);
		expect(result).toBe(0);
		expect(mockHandleAgentsCommand).toHaveBeenCalledWith({}, undefined);
		expect(mockConsoleLog).toHaveBeenCalledWith('agents mock output');
	});

	it('archive → handleArchiveCommand called, returns 0', async () => {
		const result = await run(['archive']);
		expect(result).toBe(0);
		expect(mockHandleArchiveCommand).toHaveBeenCalledWith(
			expect.any(String),
			[],
		);
		expect(mockConsoleLog).toHaveBeenCalledWith('archive mock output');
	});

	it('history → handleHistoryCommand called, returns 0', async () => {
		const result = await run(['history']);
		expect(result).toBe(0);
		expect(mockHandleHistoryCommand).toHaveBeenCalledWith(
			expect.any(String),
			[],
		);
		expect(mockConsoleLog).toHaveBeenCalledWith('history mock output');
	});

	it('config without doctor → handleConfigCommand called, returns 0', async () => {
		const result = await run(['config']);
		expect(result).toBe(0);
		expect(mockHandleConfigCommand).toHaveBeenCalledWith(
			expect.any(String),
			[],
		);
		expect(mockHandleDoctorCommand).not.toHaveBeenCalled();
		expect(mockConsoleLog).toHaveBeenCalledWith('config mock output');
	});

	it('config doctor → handleDoctorCommand called (not handleConfigCommand), returns 0', async () => {
		const result = await run(['config', 'doctor']);
		expect(result).toBe(0);
		expect(mockHandleDoctorCommand).toHaveBeenCalledWith(
			expect.any(String),
			[],
		);
		expect(mockHandleConfigCommand).not.toHaveBeenCalled();
		expect(mockConsoleLog).toHaveBeenCalledWith('doctor mock output');
	});

	it('evidence without summary → handleEvidenceCommand called, returns 0', async () => {
		const result = await run(['evidence']);
		expect(result).toBe(0);
		expect(mockHandleEvidenceCommand).toHaveBeenCalledWith(
			expect.any(String),
			[],
		);
		expect(mockHandleEvidenceSummaryCommand).not.toHaveBeenCalled();
		expect(mockConsoleLog).toHaveBeenCalledWith('evidence mock output');
	});

	it('evidence summary → handleEvidenceSummaryCommand called (not handleEvidenceCommand), returns 0', async () => {
		const result = await run(['evidence', 'summary']);
		expect(result).toBe(0);
		expect(mockHandleEvidenceSummaryCommand).toHaveBeenCalledWith(
			expect.any(String),
		);
		expect(mockHandleEvidenceCommand).not.toHaveBeenCalled();
		expect(mockConsoleLog).toHaveBeenCalledWith('evidence summary mock output');
	});

	it('diagnose → handleDiagnoseCommand called, returns 0', async () => {
		const result = await run(['diagnose']);
		expect(result).toBe(0);
		expect(mockHandleDiagnoseCommand).toHaveBeenCalledWith(
			expect.any(String),
			[],
		);
		expect(mockConsoleLog).toHaveBeenCalledWith('diagnose mock output');
	});

	it('preflight → handlePreflightCommand called, returns 0', async () => {
		const result = await run(['preflight']);
		expect(result).toBe(0);
		expect(mockHandlePreflightCommand).toHaveBeenCalledWith(
			expect.any(String),
			[],
		);
		expect(mockConsoleLog).toHaveBeenCalledWith('preflight mock output');
	});

	it('sync-plan → handleSyncPlanCommand called, returns 0', async () => {
		const result = await run(['sync-plan']);
		expect(result).toBe(0);
		expect(mockHandleSyncPlanCommand).toHaveBeenCalledWith(
			expect.any(String),
			[],
		);
		expect(mockConsoleLog).toHaveBeenCalledWith('sync-plan mock output');
	});

	it('benchmark → handleBenchmarkCommand called, returns 0', async () => {
		const result = await run(['benchmark']);
		expect(result).toBe(0);
		expect(mockHandleBenchmarkCommand).toHaveBeenCalledWith(
			expect.any(String),
			[],
		);
		expect(mockConsoleLog).toHaveBeenCalledWith('benchmark mock output');
	});

	it('export → handleExportCommand called, returns 0', async () => {
		const result = await run(['export']);
		expect(result).toBe(0);
		expect(mockHandleExportCommand).toHaveBeenCalledWith(
			expect.any(String),
			[],
		);
		expect(mockConsoleLog).toHaveBeenCalledWith('export mock output');
	});

	it('reset → handleResetCommand called, returns 0', async () => {
		const result = await run(['reset']);
		expect(result).toBe(0);
		expect(mockHandleResetCommand).toHaveBeenCalledWith(expect.any(String), []);
		expect(mockConsoleLog).toHaveBeenCalledWith('reset mock output');
	});

	it('retrieve → handleRetrieveCommand called, returns 0', async () => {
		const result = await run(['retrieve']);
		expect(result).toBe(0);
		expect(mockHandleRetrieveCommand).toHaveBeenCalledWith(
			expect.any(String),
			[],
		);
		expect(mockConsoleLog).toHaveBeenCalledWith('retrieve mock output');
	});

	it('clarify → handleClarifyCommand called, returns 0', async () => {
		const result = await run(['clarify']);
		expect(result).toBe(0);
		expect(mockHandleClarifyCommand).toHaveBeenCalledWith(
			expect.any(String),
			[],
		);
		expect(mockConsoleLog).toHaveBeenCalledWith('clarify mock output');
	});

	it('analyze → handleAnalyzeCommand called, returns 0', async () => {
		const result = await run(['analyze']);
		expect(result).toBe(0);
		expect(mockHandleAnalyzeCommand).toHaveBeenCalledWith(
			expect.any(String),
			[],
		);
		expect(mockConsoleLog).toHaveBeenCalledWith('analyze mock output');
	});

	it('specify → handleSpecifyCommand called, returns 0', async () => {
		const result = await run(['specify']);
		expect(result).toBe(0);
		expect(mockHandleSpecifyCommand).toHaveBeenCalledWith(
			expect.any(String),
			[],
		);
		expect(mockConsoleLog).toHaveBeenCalledWith('specify mock output');
	});

	it('dark-matter → handleDarkMatterCommand called, returns 0', async () => {
		const result = await run(['dark-matter']);
		expect(result).toBe(0);
		expect(mockHandleDarkMatterCommand).toHaveBeenCalledWith(
			expect.any(String),
			[],
		);
		expect(mockConsoleLog).toHaveBeenCalledWith('dark-matter mock output');
	});

	it('knowledge migrate → handleKnowledgeMigrateCommand called with (cwd, []), returns 0', async () => {
		const result = await run(['knowledge', 'migrate']);
		expect(result).toBe(0);
		expect(mockHandleKnowledgeMigrateCommand).toHaveBeenCalledWith(
			expect.any(String),
			[],
		);
		expect(mockConsoleLog).toHaveBeenCalledWith(
			'knowledge migrate mock output',
		);
	});

	it('knowledge quarantine with id → handleKnowledgeQuarantineCommand called with (cwd, ["entry-1"]), returns 0', async () => {
		const result = await run(['knowledge', 'quarantine', 'entry-1']);
		expect(result).toBe(0);
		expect(mockHandleKnowledgeQuarantineCommand).toHaveBeenCalledWith(
			expect.any(String),
			['entry-1'],
		);
		expect(mockConsoleLog).toHaveBeenCalledWith(
			'knowledge quarantine mock output',
		);
	});

	it('knowledge restore → handleKnowledgeRestoreCommand called, returns 0', async () => {
		const result = await run(['knowledge', 'restore']);
		expect(result).toBe(0);
		expect(mockHandleKnowledgeRestoreCommand).toHaveBeenCalledWith(
			expect.any(String),
			[],
		);
		expect(mockConsoleLog).toHaveBeenCalledWith(
			'knowledge restore mock output',
		);
	});

	it('knowledge with unknown subcmd → calls handleKnowledgeListCommand (consistent with hook behavior)', async () => {
		const result = await run(['knowledge', 'unknown']);
		expect(result).toBe(0);
		expect(mockHandleKnowledgeListCommand).toHaveBeenCalledWith(
			expect.any(String),
			['unknown'],
		);
		expect(mockHandleKnowledgeMigrateCommand).not.toHaveBeenCalled();
		expect(mockHandleKnowledgeQuarantineCommand).not.toHaveBeenCalled();
		expect(mockHandleKnowledgeRestoreCommand).not.toHaveBeenCalled();
	});

	it('unknown command → returns 1, console.error called with unknown command message', async () => {
		const result = await run(['unknown-cmd']);
		expect(result).toBe(1);
		expect(mockConsoleError).toHaveBeenCalledWith(
			expect.stringContaining('Unknown command: unknown-cmd'),
		);
	});

	it('status console.log called with handler output', async () => {
		await run(['status']);
		expect(mockConsoleLog).toHaveBeenCalledWith('status mock output');
	});

	it('handler output is logged via console.log (spot check: plan command)', async () => {
		const customOutput = 'custom plan output';
		mockHandlePlanCommand.mockResolvedValue(customOutput);
		await run(['plan', '--phase', '2']);
		expect(mockConsoleLog).toHaveBeenCalledWith(customOutput);
	});

	// Additional edge cases
	it('doctor standalone → unknown command (only accessible as "config doctor"), returns 1', async () => {
		const result = await run(['doctor', '--verbose']);
		expect(result).toBe(1);
		expect(mockHandleDoctorCommand).not.toHaveBeenCalled();
		expect(mockConsoleError).toHaveBeenCalledWith(
			expect.stringContaining('Unknown command: doctor'),
		);
	});

	it('knowledge migrate with extra args → passes extra args correctly', async () => {
		const result = await run(['knowledge', 'migrate', '--dry-run']);
		expect(result).toBe(0);
		expect(mockHandleKnowledgeMigrateCommand).toHaveBeenCalledWith(
			expect.any(String),
			['--dry-run'],
		);
		expect(mockConsoleLog).toHaveBeenCalledWith(
			'knowledge migrate mock output',
		);
	});

	it('evidence summary with extra args → ignores extra args (only takes cwd)', async () => {
		const result = await run(['evidence', 'summary', '--json']);
		expect(result).toBe(0);
		expect(mockHandleEvidenceSummaryCommand).toHaveBeenCalledWith(
			expect.any(String),
		);
		expect(mockHandleEvidenceCommand).not.toHaveBeenCalled();
		expect(mockConsoleLog).toHaveBeenCalledWith('evidence summary mock output');
	});
});
