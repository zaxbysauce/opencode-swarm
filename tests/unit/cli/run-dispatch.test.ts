import { beforeEach, describe, expect, it, vi } from 'vitest';

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
const mockHandleResetCommandAlt = vi.fn();
const mockHandlePromoteCommand = vi.fn();
const mockHandleHandoffCommand = vi.fn();
const mockHandleTurboCommand = vi.fn();
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

// Import AFTER mocking is set up - use require for synchronous loading
// @ts-ignore - Bun supports require for .js extensions
const cliModule = require('../../../src/cli/index.js');
const run = cliModule.run;

describe('run() dispatch function', () => {
	const cwd = process.cwd();

	beforeEach(() => {
		vi.clearAllMocks();
		// Default return values for mocked handlers
		mockHandleStatusCommand.mockResolvedValue('status output');
		mockHandlePlanCommand.mockResolvedValue('plan output');
		mockHandleAgentsCommand.mockReturnValue('agents output');
		mockHandleArchiveCommand.mockResolvedValue('archive output');
		mockHandleHistoryCommand.mockResolvedValue('history output');
		mockHandleConfigCommand.mockResolvedValue('config output');
		mockHandleDoctorCommand.mockResolvedValue('doctor output');
		mockHandleEvidenceCommand.mockResolvedValue('evidence output');
		mockHandleEvidenceSummaryCommand.mockResolvedValue(
			'evidence summary output',
		);
		mockHandleDiagnoseCommand.mockResolvedValue('diagnose output');
		mockHandlePreflightCommand.mockResolvedValue('preflight output');
		mockHandleSyncPlanCommand.mockResolvedValue('sync-plan output');
		mockHandleBenchmarkCommand.mockResolvedValue('benchmark output');
		mockHandleExportCommand.mockResolvedValue('export output');
		mockHandleResetCommand.mockResolvedValue('reset output');
		mockHandleRetrieveCommand.mockResolvedValue('retrieve output');
		mockHandleClarifyCommand.mockResolvedValue('clarify output');
		mockHandleAnalyzeCommand.mockResolvedValue('analyze output');
		mockHandleSpecifyCommand.mockResolvedValue('specify output');
		mockHandleDarkMatterCommand.mockResolvedValue('dark-matter output');
		mockHandleKnowledgeListCommand.mockResolvedValue('knowledge list output');
		mockHandleKnowledgeMigrateCommand.mockResolvedValue(
			'knowledge migrate output',
		);
		mockHandleKnowledgeQuarantineCommand.mockResolvedValue(
			'knowledge quarantine output',
		);
		mockHandleKnowledgeRestoreCommand.mockResolvedValue(
			'knowledge restore output',
		);
		mockHandleHandoffCommand.mockResolvedValue('handoff output');
		mockHandleTurboCommand.mockResolvedValue('turbo output');
		mockHandleCheckpointCommand.mockResolvedValue('checkpoint output');
	});

	describe('1. Empty args', () => {
		it('should return 1 for empty args array', async () => {
			const result = await run([]);

			expect(result).toBe(1);
			expect(mockConsoleError).toHaveBeenCalledWith(
				expect.stringContaining('Usage: bunx opencode-swarm run <command>'),
			);
		});
	});

	describe('2. Unknown command', () => {
		it('should return 1 for unknown command', async () => {
			const result = await run(['unknown-xyz']);

			expect(result).toBe(1);
			expect(mockConsoleError).toHaveBeenCalledWith(
				expect.stringContaining('Unknown command: unknown-xyz'),
			);
		});
	});

	describe('3. Single-word commands', () => {
		it('dark-matter: calls handleDarkMatterCommand with cwd and empty args', async () => {
			const result = await run(['dark-matter']);

			expect(result).toBe(0);
			expect(mockHandleDarkMatterCommand).toHaveBeenCalledWith(cwd, []);
			expect(mockConsoleLog).toHaveBeenCalledWith('dark-matter output');
		});

		it('status: calls handleStatusCommand with cwd and empty agents', async () => {
			const result = await run(['status']);

			expect(result).toBe(0);
			expect(mockHandleStatusCommand).toHaveBeenCalledWith(cwd, {});
			expect(mockConsoleLog).toHaveBeenCalledWith('status output');
		});

		it('plan: calls handlePlanCommand with cwd and empty args', async () => {
			const result = await run(['plan']);

			expect(result).toBe(0);
			expect(mockHandlePlanCommand).toHaveBeenCalledWith(cwd, []);
			expect(mockConsoleLog).toHaveBeenCalledWith('plan output');
		});

		it('archive: calls handleArchiveCommand with cwd and empty args', async () => {
			const result = await run(['archive']);

			expect(result).toBe(0);
			expect(mockHandleArchiveCommand).toHaveBeenCalledWith(cwd, []);
			expect(mockConsoleLog).toHaveBeenCalledWith('archive output');
		});

		it('history: calls handleHistoryCommand with cwd and empty args', async () => {
			const result = await run(['history']);

			expect(result).toBe(0);
			expect(mockHandleHistoryCommand).toHaveBeenCalledWith(cwd, []);
			expect(mockConsoleLog).toHaveBeenCalledWith('history output');
		});
	});

	describe('4. agents command (sync, no directory)', () => {
		it('agents: calls handleAgentsCommand with {} and undefined (sync)', async () => {
			const result = await run(['agents']);

			expect(result).toBe(0);
			expect(mockHandleAgentsCommand).toHaveBeenCalledWith({}, undefined);
			expect(mockConsoleLog).toHaveBeenCalledWith('agents output');
		});
	});

	describe('5. Multi-word dispatch: config', () => {
		it('config doctor: calls handleDoctorCommand (not handleConfigCommand)', async () => {
			const result = await run(['config', 'doctor']);

			expect(result).toBe(0);
			expect(mockHandleDoctorCommand).toHaveBeenCalledWith(cwd, []);
			expect(mockHandleConfigCommand).not.toHaveBeenCalled();
			expect(mockConsoleLog).toHaveBeenCalledWith('doctor output');
		});

		it('config: calls handleConfigCommand with args.slice(1)', async () => {
			const result = await run(['config']);

			expect(result).toBe(0);
			expect(mockHandleConfigCommand).toHaveBeenCalledWith(cwd, []);
			expect(mockHandleDoctorCommand).not.toHaveBeenCalled();
			expect(mockConsoleLog).toHaveBeenCalledWith('config output');
		});

		it('config with subcommand (non-doctor): calls handleConfigCommand', async () => {
			const result = await run(['config', 'some-other-subcmd']);

			expect(result).toBe(0);
			expect(mockHandleConfigCommand).toHaveBeenCalledWith(cwd, [
				'some-other-subcmd',
			]);
			expect(mockHandleDoctorCommand).not.toHaveBeenCalled();
			expect(mockConsoleLog).toHaveBeenCalledWith('config output');
		});

		it('config doctor with additional args: passes args.slice(2)', async () => {
			const result = await run(['config', 'doctor', '--verbose']);

			expect(result).toBe(0);
			expect(mockHandleDoctorCommand).toHaveBeenCalledWith(cwd, ['--verbose']);
			expect(mockConsoleLog).toHaveBeenCalledWith('doctor output');
		});
	});

	describe('6. Multi-word dispatch: evidence', () => {
		it('evidence summary: calls handleEvidenceSummaryCommand (not handleEvidenceCommand)', async () => {
			const result = await run(['evidence', 'summary']);

			expect(result).toBe(0);
			expect(mockHandleEvidenceSummaryCommand).toHaveBeenCalledWith(cwd);
			expect(mockHandleEvidenceCommand).not.toHaveBeenCalled();
			expect(mockConsoleLog).toHaveBeenCalledWith('evidence summary output');
		});

		it('evidence: calls handleEvidenceCommand with args.slice(1)', async () => {
			const result = await run(['evidence']);

			expect(result).toBe(0);
			expect(mockHandleEvidenceCommand).toHaveBeenCalledWith(cwd, []);
			expect(mockHandleEvidenceSummaryCommand).not.toHaveBeenCalled();
			expect(mockConsoleLog).toHaveBeenCalledWith('evidence output');
		});

		it('evidence with subcommand (non-summary): calls handleEvidenceCommand', async () => {
			const result = await run(['evidence', 'list']);

			expect(result).toBe(0);
			expect(mockHandleEvidenceCommand).toHaveBeenCalledWith(cwd, ['list']);
			expect(mockHandleEvidenceSummaryCommand).not.toHaveBeenCalled();
			expect(mockConsoleLog).toHaveBeenCalledWith('evidence output');
		});
	});

	describe('7. Multi-word dispatch: knowledge', () => {
		it('knowledge migrate: calls handleKnowledgeMigrateCommand with cwd and args.slice(2)', async () => {
			const result = await run(['knowledge', 'migrate']);

			expect(result).toBe(0);
			expect(mockHandleKnowledgeMigrateCommand).toHaveBeenCalledWith(cwd, []);
			expect(mockConsoleLog).toHaveBeenCalledWith('knowledge migrate output');
		});

		it('knowledge quarantine: calls handleKnowledgeQuarantineCommand', async () => {
			const result = await run(['knowledge', 'quarantine']);

			expect(result).toBe(0);
			expect(mockHandleKnowledgeQuarantineCommand).toHaveBeenCalledWith(
				cwd,
				[],
			);
			expect(mockConsoleLog).toHaveBeenCalledWith(
				'knowledge quarantine output',
			);
		});

		it('knowledge restore: calls handleKnowledgeRestoreCommand', async () => {
			const result = await run(['knowledge', 'restore']);

			expect(result).toBe(0);
			expect(mockHandleKnowledgeRestoreCommand).toHaveBeenCalledWith(cwd, []);
			expect(mockConsoleLog).toHaveBeenCalledWith('knowledge restore output');
		});

		it('knowledge with unknown subcommand: calls handleKnowledgeListCommand (consistent with hook)', async () => {
			const result = await run(['knowledge', 'unknown']);

			expect(result).toBe(0);
			expect(mockHandleKnowledgeListCommand).toHaveBeenCalledWith(cwd, [
				'unknown',
			]);
			expect(mockConsoleLog).toHaveBeenCalledWith('knowledge list output');
		});

		it('knowledge with no subcommand: calls handleKnowledgeListCommand', async () => {
			const result = await run(['knowledge']);

			expect(result).toBe(0);
			expect(mockHandleKnowledgeListCommand).toHaveBeenCalledWith(cwd, []);
			expect(mockConsoleLog).toHaveBeenCalledWith('knowledge list output');
		});

		it('knowledge migrate with additional args: passes args.slice(2)', async () => {
			const result = await run(['knowledge', 'migrate', '--verbose']);

			expect(result).toBe(0);
			expect(mockHandleKnowledgeMigrateCommand).toHaveBeenCalledWith(cwd, [
				'--verbose',
			]);
			expect(mockConsoleLog).toHaveBeenCalledWith('knowledge migrate output');
		});
	});

	describe('8. Other single-word commands', () => {
		it('diagnose: calls handleDiagnoseCommand', async () => {
			const result = await run(['diagnose']);

			expect(result).toBe(0);
			expect(mockHandleDiagnoseCommand).toHaveBeenCalledWith(cwd, []);
			expect(mockConsoleLog).toHaveBeenCalledWith('diagnose output');
		});

		it('preflight: calls handlePreflightCommand', async () => {
			const result = await run(['preflight']);

			expect(result).toBe(0);
			expect(mockHandlePreflightCommand).toHaveBeenCalledWith(cwd, []);
			expect(mockConsoleLog).toHaveBeenCalledWith('preflight output');
		});

		it('sync-plan: calls handleSyncPlanCommand', async () => {
			const result = await run(['sync-plan']);

			expect(result).toBe(0);
			expect(mockHandleSyncPlanCommand).toHaveBeenCalledWith(cwd, []);
			expect(mockConsoleLog).toHaveBeenCalledWith('sync-plan output');
		});

		it('benchmark: calls handleBenchmarkCommand', async () => {
			const result = await run(['benchmark']);

			expect(result).toBe(0);
			expect(mockHandleBenchmarkCommand).toHaveBeenCalledWith(cwd, []);
			expect(mockConsoleLog).toHaveBeenCalledWith('benchmark output');
		});

		it('export: calls handleExportCommand', async () => {
			const result = await run(['export']);

			expect(result).toBe(0);
			expect(mockHandleExportCommand).toHaveBeenCalledWith(cwd, []);
			expect(mockConsoleLog).toHaveBeenCalledWith('export output');
		});

		it('reset: calls handleResetCommand', async () => {
			const result = await run(['reset']);

			expect(result).toBe(0);
			expect(mockHandleResetCommand).toHaveBeenCalledWith(cwd, []);
			expect(mockConsoleLog).toHaveBeenCalledWith('reset output');
		});

		it('retrieve: calls handleRetrieveCommand', async () => {
			const result = await run(['retrieve']);

			expect(result).toBe(0);
			expect(mockHandleRetrieveCommand).toHaveBeenCalledWith(cwd, []);
			expect(mockConsoleLog).toHaveBeenCalledWith('retrieve output');
		});

		it('clarify: calls handleClarifyCommand', async () => {
			const result = await run(['clarify']);

			expect(result).toBe(0);
			expect(mockHandleClarifyCommand).toHaveBeenCalledWith(cwd, []);
			expect(mockConsoleLog).toHaveBeenCalledWith('clarify output');
		});

		it('analyze: calls handleAnalyzeCommand', async () => {
			const result = await run(['analyze']);

			expect(result).toBe(0);
			expect(mockHandleAnalyzeCommand).toHaveBeenCalledWith(cwd, []);
			expect(mockConsoleLog).toHaveBeenCalledWith('analyze output');
		});

		it('specify: calls handleSpecifyCommand', async () => {
			const result = await run(['specify']);

			expect(result).toBe(0);
			expect(mockHandleSpecifyCommand).toHaveBeenCalledWith(cwd, []);
			expect(mockConsoleLog).toHaveBeenCalledWith('specify output');
		});

		it('checkpoint: calls handleCheckpointCommand', async () => {
			const result = await run(['checkpoint']);

			expect(result).toBe(0);
			expect(mockHandleCheckpointCommand).toHaveBeenCalledWith(cwd, []);
			expect(mockConsoleLog).toHaveBeenCalledWith('checkpoint output');
		});
	});

	describe('9. Args propagation', () => {
		it('passes args.slice(1) to single-word commands', async () => {
			const result = await run([
				'dark-matter',
				'--verbose',
				'--output',
				'file.json',
			]);

			expect(result).toBe(0);
			expect(mockHandleDarkMatterCommand).toHaveBeenCalledWith(cwd, [
				'--verbose',
				'--output',
				'file.json',
			]);
		});

		it('passes args.slice(2) to multi-word commands (knowledge)', async () => {
			const result = await run([
				'knowledge',
				'migrate',
				'--verbose',
				'--dry-run',
			]);

			expect(result).toBe(0);
			expect(mockHandleKnowledgeMigrateCommand).toHaveBeenCalledWith(cwd, [
				'--verbose',
				'--dry-run',
			]);
		});

		it('passes args.slice(2) to multi-word commands (config doctor)', async () => {
			const result = await run(['config', 'doctor', '--fix', '--verbose']);

			expect(result).toBe(0);
			expect(mockHandleDoctorCommand).toHaveBeenCalledWith(cwd, [
				'--fix',
				'--verbose',
			]);
		});
	});
});
