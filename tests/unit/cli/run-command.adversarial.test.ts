import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock console methods BEFORE importing
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

// Mock process.argv to prevent default 'install' command
const originalArgv = process.argv;
process.argv = ['node', 'cli.js', '--help'];

// Mock process.exit to prevent CLI from exiting
const mockProcessExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

// Mock factories - declare BEFORE vi.mock() calls
const mockHandleAgentsCommand = vi.fn();
const mockHandleAnalyzeCommand = vi.fn();
const mockHandleArchiveCommand = vi.fn();
const mockHandleBenchmarkCommand = vi.fn();
const mockHandleClarifyCommand = vi.fn();
const mockHandleConfigCommand = vi.fn();
const mockHandleDarkMatterCommand = vi.fn();
const mockHandleDiagnoseCommand = vi.fn();
const mockHandleDoctorCommand = vi.fn();
const mockHandleEvidenceCommand = vi.fn();
const mockHandleEvidenceSummaryCommand = vi.fn();
const mockHandleExportCommand = vi.fn();
const mockHandleHistoryCommand = vi.fn();
const mockHandleKnowledgeMigrateCommand = vi.fn();
const mockHandleKnowledgeQuarantineCommand = vi.fn();
const mockHandleKnowledgeRestoreCommand = vi.fn();
const mockHandlePlanCommand = vi.fn();
const mockHandlePreflightCommand = vi.fn();
const mockHandleResetCommand = vi.fn();
const mockHandleRetrieveCommand = vi.fn();
const mockHandleSpecifyCommand = vi.fn();
const mockHandleStatusCommand = vi.fn();
const mockHandleSyncPlanCommand = vi.fn();

// Mock all command handlers from commands/index.js
vi.mock('../../../src/commands/index.js', () => ({
	handleAgentsCommand: mockHandleAgentsCommand,
	handleAnalyzeCommand: mockHandleAnalyzeCommand,
	handleArchiveCommand: mockHandleArchiveCommand,
	handleBenchmarkCommand: mockHandleBenchmarkCommand,
	handleClarifyCommand: mockHandleClarifyCommand,
	handleConfigCommand: mockHandleConfigCommand,
	handleDarkMatterCommand: mockHandleDarkMatterCommand,
	handleDiagnoseCommand: mockHandleDiagnoseCommand,
	handleDoctorCommand: mockHandleDoctorCommand,
	handleEvidenceCommand: mockHandleEvidenceCommand,
	handleEvidenceSummaryCommand: mockHandleEvidenceSummaryCommand,
	handleExportCommand: mockHandleExportCommand,
	handleHistoryCommand: mockHandleHistoryCommand,
	handleKnowledgeMigrateCommand: mockHandleKnowledgeMigrateCommand,
	handleKnowledgeQuarantineCommand: mockHandleKnowledgeQuarantineCommand,
	handleKnowledgeRestoreCommand: mockHandleKnowledgeRestoreCommand,
	handlePlanCommand: mockHandlePlanCommand,
	handlePreflightCommand: mockHandlePreflightCommand,
	handleResetCommand: mockHandleResetCommand,
	handleRetrieveCommand: mockHandleRetrieveCommand,
	handleSpecifyCommand: mockHandleSpecifyCommand,
	handleStatusCommand: mockHandleStatusCommand,
	handleSyncPlanCommand: mockHandleSyncPlanCommand,
}));

// Import AFTER mocking is set up - use require for synchronous loading
// @ts-ignore - Bun supports require for .js extensions
const cliModule = require('../../../src/cli/index.js');
const run = cliModule.run;

describe('run() function - Adversarial Tests', () => {
	const cwd = process.cwd();

	beforeEach(() => {
		vi.clearAllMocks();
		// Default return values for mocked handlers
		mockHandleStatusCommand.mockResolvedValue('status result');
		mockHandlePlanCommand.mockResolvedValue('plan result');
		mockHandleAgentsCommand.mockReturnValue('agents result');
		mockHandleArchiveCommand.mockResolvedValue('archive result');
		mockHandleHistoryCommand.mockResolvedValue('history result');
		mockHandleConfigCommand.mockResolvedValue('config result');
		mockHandleDoctorCommand.mockResolvedValue('doctor result');
		mockHandleEvidenceCommand.mockResolvedValue('evidence result');
		mockHandleEvidenceSummaryCommand.mockResolvedValue('evidence-summary result');
		mockHandleDiagnoseCommand.mockResolvedValue('diagnose result');
		mockHandlePreflightCommand.mockResolvedValue('preflight result');
		mockHandleSyncPlanCommand.mockResolvedValue('sync-plan result');
		mockHandleBenchmarkCommand.mockResolvedValue('benchmark result');
		mockHandleExportCommand.mockResolvedValue('export result');
		mockHandleResetCommand.mockResolvedValue('reset result');
		mockHandleRetrieveCommand.mockResolvedValue('retrieve result');
		mockHandleClarifyCommand.mockResolvedValue('clarify result');
		mockHandleAnalyzeCommand.mockResolvedValue('analyze result');
		mockHandleSpecifyCommand.mockResolvedValue('specify result');
		mockHandleDarkMatterCommand.mockResolvedValue('dark-matter result');
		mockHandleKnowledgeMigrateCommand.mockResolvedValue('knowledge migrate result');
		mockHandleKnowledgeQuarantineCommand.mockResolvedValue('knowledge quarantine result');
		mockHandleKnowledgeRestoreCommand.mockResolvedValue('knowledge restore result');
	});

	// Attack vector 1: Handler throws an error → does run() propagate the throw, or handle gracefully?
	it('1. Should propagate error when handler throws', async () => {
		const mockError = new Error('Handler error');
		mockHandleStatusCommand.mockRejectedValueOnce(mockError);

		await expect(run(['status'])).rejects.toThrow('Handler error');

		// Verify console.log was not called for the result
		expect(mockConsoleLog).not.toHaveBeenCalled();
	});

	// Attack vector 2: Handler returns null instead of string → console.log(null) called, returns 0
	it('2. Should call console.log(null) when handler returns null', async () => {
		mockHandleStatusCommand.mockResolvedValueOnce(null as unknown as string);

		const result = await run(['status']);

		expect(result).toBe(0);
		expect(mockConsoleLog).toHaveBeenCalledWith(null);
	});

	// Attack vector 3: Handler returns undefined → console.log(undefined), returns 0
	it('3. Should call console.log(undefined) when handler returns undefined', async () => {
		mockHandleStatusCommand.mockResolvedValueOnce(undefined as unknown as string);

		const result = await run(['status']);

		expect(result).toBe(0);
		expect(mockConsoleLog).toHaveBeenCalledWith(undefined);
	});

	// Attack vector 4: 'knowledge' with empty second arg (args[1] is undefined) → falls to unknown knowledge error, returns 1
	it('4. Should return 1 for "knowledge" with no subcommand (args[1] is undefined)', async () => {
		const result = await run(['knowledge']);

		expect(result).toBe(1);
		expect(mockConsoleError).toHaveBeenCalledWith(
			'Usage: bunx opencode-swarm run knowledge <migrate|quarantine|restore>',
		);
	});

	// Attack vector 5: Args array with only whitespace string: `[' ']` → hits unknown command default, returns 1
	it('5. Should return 1 for args with only whitespace string', async () => {
		const result = await run([' ']);

		expect(result).toBe(1);
		expect(mockConsoleError).toHaveBeenCalledWith(
			'Unknown command:  \nRun "bunx opencode-swarm run" with no args for help.',
		);
	});

	// Attack vector 6: Args with exactly 2 elements for knowledge: `['knowledge']` (no subcmd) → error, returns 1
	it('6. Should return 1 for "knowledge" with only 1 element (no subcmd)', async () => {
		const result = await run(['knowledge']);

		expect(result).toBe(1);
		expect(mockConsoleError).toHaveBeenCalledWith(
			'Usage: bunx opencode-swarm run knowledge <migrate|quarantine|restore>',
		);
	});

	// Attack vector 7: 'config' with args[1] being 'Doctor' (wrong case) → handleConfigCommand (NOT handleDoctorCommand)
	it('7. Should call handleConfigCommand for "config Doctor" (wrong case)', async () => {
		const result = await run(['config', 'Doctor']);

		expect(result).toBe(0);
		expect(mockHandleDoctorCommand).not.toHaveBeenCalled();
		expect(mockHandleConfigCommand).toHaveBeenCalledWith(cwd, ['Doctor']);
	});

	// Attack vector 8: 'evidence' with args[1] being 'Summary' (wrong case) → handleEvidenceCommand (NOT handleEvidenceSummaryCommand)
	it('8. Should call handleEvidenceCommand for "evidence Summary" (wrong case)', async () => {
		const result = await run(['evidence', 'Summary']);

		expect(result).toBe(0);
		expect(mockHandleEvidenceSummaryCommand).not.toHaveBeenCalled();
		expect(mockHandleEvidenceCommand).toHaveBeenCalledWith(cwd, ['Summary']);
	});

	// Attack vector 9: 'knowledge' with args[1] being 'Migrate' (wrong case) → unknown subcmd error, returns 1
	it('9. Should return 1 for "knowledge Migrate" (wrong case)', async () => {
		const result = await run(['knowledge', 'Migrate']);

		expect(result).toBe(1);
		expect(mockHandleKnowledgeMigrateCommand).not.toHaveBeenCalled();
		expect(mockConsoleError).toHaveBeenCalledWith(
			'Usage: bunx opencode-swarm run knowledge <migrate|quarantine|restore>',
		);
	});

	// Attack vector 10: null in args array: `[null]` → TypeScript allows this at runtime; should hit unknown command default, returns 1
	it('10. Should return 1 for args array with null element', async () => {
		// @ts-expect-error - Testing runtime behavior with null in array
		const result = await run([null]);

		expect(result).toBe(1);
		expect(mockConsoleError).toHaveBeenCalledWith(
			'Unknown command: null\nRun "bunx opencode-swarm run" with no args for help.',
		);
	});

	// Additional edge cases

	// Test with empty args array
	it('Should return 1 for empty args array', async () => {
		const result = await run([]);

		expect(result).toBe(1);
		expect(mockConsoleError).toHaveBeenCalledWith(
			'Usage: bunx opencode-swarm run <command> [args]\nRun "bunx opencode-swarm --help" for a list of commands.',
		);
	});

	// Test sync handler (handleAgentsCommand)
	it('Should correctly handle sync handler (agents)', async () => {
		mockHandleAgentsCommand.mockReturnValueOnce('agents result');

		const result = await run(['agents']);

		expect(result).toBe(0);
		expect(mockConsoleLog).toHaveBeenCalledWith('agents result');
	});

	// Test sync handler returning null
	it('Should call console.log(null) when sync handler returns null', async () => {
		mockHandleAgentsCommand.mockReturnValueOnce(null as unknown as string);

		const result = await run(['agents']);

		expect(result).toBe(0);
		expect(mockConsoleLog).toHaveBeenCalledWith(null);
	});

	// Test sync handler returning undefined
	it('Should call console.log(undefined) when sync handler returns undefined', async () => {
		mockHandleAgentsCommand.mockReturnValueOnce(undefined as unknown as string);

		const result = await run(['agents']);

		expect(result).toBe(0);
		expect(mockConsoleLog).toHaveBeenCalledWith(undefined);
	});

	// Test knowledge quarantine with correct case
	it('Should call handleKnowledgeQuarantineCommand for "knowledge quarantine"', async () => {
		const result = await run(['knowledge', 'quarantine', '123', 'test reason']);

		expect(result).toBe(0);
		expect(mockHandleKnowledgeQuarantineCommand).toHaveBeenCalledWith(cwd, ['123', 'test reason']);
	});

	// Test knowledge restore with correct case
	it('Should call handleKnowledgeRestoreCommand for "knowledge restore"', async () => {
		const result = await run(['knowledge', 'restore', '123']);

		expect(result).toBe(0);
		expect(mockHandleKnowledgeRestoreCommand).toHaveBeenCalledWith(cwd, ['123']);
	});

	// Test knowledge migrate with correct case
	it('Should call handleKnowledgeMigrateCommand for "knowledge migrate"', async () => {
		const result = await run(['knowledge', 'migrate']);

		expect(result).toBe(0);
		expect(mockHandleKnowledgeMigrateCommand).toHaveBeenCalledWith(cwd, []);
	});

	// Test config doctor with correct case
	it('Should call handleDoctorCommand for "config doctor"', async () => {
		const result = await run(['config', 'doctor']);

		expect(result).toBe(0);
		expect(mockHandleDoctorCommand).toHaveBeenCalledWith(cwd, []);
		expect(mockHandleConfigCommand).not.toHaveBeenCalled();
	});

	// Test evidence summary with correct case
	it('Should call handleEvidenceSummaryCommand for "evidence summary"', async () => {
		const result = await run(['evidence', 'summary']);

		expect(result).toBe(0);
		expect(mockHandleEvidenceSummaryCommand).toHaveBeenCalledWith(cwd);
		expect(mockHandleEvidenceCommand).not.toHaveBeenCalled();
	});

	// Test unknown command
	it('Should return 1 for unknown command', async () => {
		const result = await run(['unknown']);

		expect(result).toBe(1);
		expect(mockConsoleError).toHaveBeenCalledWith(
			'Unknown command: unknown\nRun "bunx opencode-swarm run" with no args for help.',
		);
	});
});
