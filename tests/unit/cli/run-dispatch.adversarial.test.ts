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

describe('run() dispatch function - ADVERSARIAL SECURITY & BOUNDARY TESTS', () => {
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

	describe('1. Null/undefined input attacks', () => {
		it('should handle null instead of array gracefully', async () => {
			// @ts-expect-error - Testing with null (type violation)
			const result = await run(null);

			// Should treat null as falsy and return usage error
			expect(result).toBe(1);
			expect(mockConsoleError).toHaveBeenCalledWith(
				expect.stringContaining('Usage: bunx opencode-swarm run <command>'),
			);
		});

		it('should handle undefined instead of array gracefully', async () => {
			// @ts-expect-error - Testing with undefined (type violation)
			const result = await run(undefined);

			// Should treat undefined as falsy and return usage error
			expect(result).toBe(1);
			expect(mockConsoleError).toHaveBeenCalledWith(
				expect.stringContaining('Usage: bunx opencode-swarm run <command>'),
			);
		});
	});

	describe('2. Empty/whitespace input attacks', () => {
		it('should handle empty string subcommand', async () => {
			const result = await run(['']);

			// Should treat empty string as unknown command
			expect(result).toBe(1);
			expect(mockConsoleError).toHaveBeenCalledWith(
				expect.stringContaining('Unknown command: '),
			);
		});

		it('should handle whitespace-only subcommand', async () => {
			const result = await run(['   ']);

			// Should treat whitespace as unknown command
			expect(result).toBe(1);
			expect(mockConsoleError).toHaveBeenCalledWith(
				expect.stringContaining('Unknown command:    '),
			);
		});
	});

	describe('3. Null byte injection attacks', () => {
		it('should handle null byte in command name', async () => {
			const result = await run(['\x00']);

			// Should handle null byte gracefully, not crash
			expect(result).toBe(1);
			expect(mockConsoleError).toHaveBeenCalledWith(
				expect.stringContaining('Unknown command: \x00'),
			);
		});

		it('should handle command with embedded null bytes', async () => {
			const result = await run(['status\x00evil']);

			// Should handle embedded null bytes gracefully
			expect(result).toBe(1);
			expect(mockConsoleError).toHaveBeenCalledWith(
				expect.stringContaining('Unknown command:'),
			);
		});
	});

	describe('4. Knowledge sub-subcommand boundary violations', () => {
		it('should handle knowledge with no sub-subcommand (calls handleKnowledgeListCommand)', async () => {
			const result = await run(['knowledge']);

			// Registry falls through to knowledge list entry
			expect(result).toBe(0);
			expect(mockHandleKnowledgeListCommand).toHaveBeenCalledWith(cwd, []);
		});

		it('should handle knowledge with empty sub-subcommand (calls handleKnowledgeListCommand)', async () => {
			const result = await run(['knowledge', '']);

			// Compound key 'knowledge ' not in registry → falls to 'knowledge'
			expect(result).toBe(0);
			expect(mockHandleKnowledgeListCommand).toHaveBeenCalledWith(cwd, ['']);
		});

		it('should handle knowledge with unknown sub-subcommand (calls handleKnowledgeListCommand)', async () => {
			const result = await run(['knowledge', 'unknown-sub']);

			// Compound key 'knowledge unknown-sub' not in registry → falls to 'knowledge'
			expect(result).toBe(0);
			expect(mockHandleKnowledgeListCommand).toHaveBeenCalledWith(cwd, [
				'unknown-sub',
			]);
		});

		it('should handle knowledge with whitespace sub-subcommand (calls handleKnowledgeListCommand)', async () => {
			const result = await run(['knowledge', '   ']);

			// Falls through to knowledge list
			expect(result).toBe(0);
			expect(mockHandleKnowledgeListCommand).toHaveBeenCalledWith(cwd, ['   ']);
		});

		it('should handle knowledge with case-sensitive mismatch (calls handleKnowledgeListCommand)', async () => {
			const result = await run(['knowledge', 'MIGRATE']);

			// 'knowledge MIGRATE' not in registry → falls to 'knowledge'
			expect(result).toBe(0);
			expect(mockHandleKnowledgeListCommand).toHaveBeenCalledWith(cwd, [
				'MIGRATE',
			]);
		});
	});

	describe('5. Config subcommand boundary violations', () => {
		it('should handle config with no sub-subcommand (calls handleConfigCommand)', async () => {
			const result = await run(['config']);

			// Should call handleConfigCommand, not crash
			expect(result).toBe(0);
			expect(mockHandleConfigCommand).toHaveBeenCalledWith(cwd, []);
			expect(mockHandleDoctorCommand).not.toHaveBeenCalled();
		});

		it('should handle config with empty sub-subcommand', async () => {
			const result = await run(['config', '']);

			// Should call handleConfigCommand with empty string, not crash
			expect(result).toBe(0);
			expect(mockHandleConfigCommand).toHaveBeenCalledWith(cwd, ['']);
			expect(mockHandleDoctorCommand).not.toHaveBeenCalled();
		});

		it('should handle config with unknown sub-subcommand', async () => {
			const result = await run(['config', 'unknown']);

			// Should call handleConfigCommand with unknown sub-subcommand, not crash
			expect(result).toBe(0);
			expect(mockHandleConfigCommand).toHaveBeenCalledWith(cwd, ['unknown']);
			expect(mockHandleDoctorCommand).not.toHaveBeenCalled();
		});
	});

	describe('6. Evidence subcommand boundary violations', () => {
		it('should handle evidence with no sub-subcommand (calls handleEvidenceCommand)', async () => {
			const result = await run(['evidence']);

			// Should call handleEvidenceCommand, not crash
			expect(result).toBe(0);
			expect(mockHandleEvidenceCommand).toHaveBeenCalledWith(cwd, []);
			expect(mockHandleEvidenceSummaryCommand).not.toHaveBeenCalled();
		});

		it('should handle evidence with empty sub-subcommand', async () => {
			const result = await run(['evidence', '']);

			// Should call handleEvidenceCommand with empty string, not crash
			expect(result).toBe(0);
			expect(mockHandleEvidenceCommand).toHaveBeenCalledWith(cwd, ['']);
			expect(mockHandleEvidenceSummaryCommand).not.toHaveBeenCalled();
		});

		it('should handle evidence with unknown sub-subcommand', async () => {
			const result = await run(['evidence', 'unknown']);

			// Should call handleEvidenceCommand with unknown sub-subcommand, not crash
			expect(result).toBe(0);
			expect(mockHandleEvidenceCommand).toHaveBeenCalledWith(cwd, ['unknown']);
			expect(mockHandleEvidenceSummaryCommand).not.toHaveBeenCalled();
		});
	});

	describe('7. Oversized payload attacks', () => {
		it('should handle very long command name (1000 chars)', async () => {
			const longCommand = Array(1000).fill('a').join('');
			const result = await run([longCommand]);

			// Should handle long command name gracefully, not crash
			expect(result).toBe(1);
			expect(mockConsoleError).toHaveBeenCalledWith(
				expect.stringContaining('Unknown command:'),
			);
		});

		it('should handle extremely long command name (10000 chars)', async () => {
			const longCommand = Array(10000).fill('b').join('');
			const result = await run([longCommand]);

			// Should handle extremely long command name gracefully, not crash
			expect(result).toBe(1);
			expect(mockConsoleError).toHaveBeenCalledWith(
				expect.stringContaining('Unknown command:'),
			);
		});

		it('should handle very long args array', async () => {
			const longArgs = Array(1000).fill('arg').join(' ').split(' ');
			const result = await run(longArgs);

			// Should handle long args array gracefully, not crash
			expect(result).toBe(1);
			expect(mockConsoleError).toHaveBeenCalledWith(
				expect.stringContaining('Unknown command:'),
			);
		});
	});

	describe('8. Special character injection attacks', () => {
		it('should handle command with control characters', async () => {
			const result = await run(['\n\r\t']);

			// Should handle control characters gracefully
			expect(result).toBe(1);
			expect(mockConsoleError).toHaveBeenCalledWith(
				expect.stringContaining('Unknown command:'),
			);
		});

		it('should handle command with unicode surrogate pairs', async () => {
			const result = await run(['status\uD83D\uDE00']);

			// Should handle unicode gracefully (may or may not be valid command)
			expect(result).toBe(1);
			expect(mockConsoleError).toHaveBeenCalledWith(
				expect.stringContaining('Unknown command:'),
			);
		});

		it('should handle command with path traversal pattern', async () => {
			const result = await run(['../../etc/passwd']);

			// Should treat as unknown command, not execute path traversal
			expect(result).toBe(1);
			expect(mockConsoleError).toHaveBeenCalledWith(
				expect.stringContaining('Unknown command: ../../etc/passwd'),
			);
		});

		it('should handle command with shell metacharacters', async () => {
			const result = await run(['status; rm -rf /']);

			// Should treat as unknown command, not execute shell injection
			expect(result).toBe(1);
			expect(mockConsoleError).toHaveBeenCalledWith(
				expect.stringContaining('Unknown command: status; rm -rf /'),
			);
		});

		it('should handle command with command substitution', async () => {
			const result = await run(['$(whoami)']);

			// Should treat as unknown command, not execute command substitution
			expect(result).toBe(1);
			expect(mockConsoleError).toHaveBeenCalledWith(
				expect.stringContaining('Unknown command: $(whoami)'),
			);
		});
	});

	describe('9. Type coercion attacks', () => {
		it('should handle numeric command', async () => {
			// @ts-expect-error - Testing with numeric (type violation)
			const result = await run([123]);

			// Should handle numeric command (coerced to string)
			expect(result).toBe(1);
			expect(mockConsoleError).toHaveBeenCalledWith(
				expect.stringContaining('Unknown command: 123'),
			);
		});

		it('should handle boolean command', async () => {
			// @ts-expect-error - Testing with boolean (type violation)
			const result = await run([true]);

			// Should handle boolean command (coerced to string)
			expect(result).toBe(1);
			expect(mockConsoleError).toHaveBeenCalledWith(
				expect.stringContaining('Unknown command: true'),
			);
		});
	});

	describe('10. Malformed multi-word command attacks', () => {
		it('should handle knowledge with null byte in sub-subcommand (calls handleKnowledgeListCommand)', async () => {
			const result = await run(['knowledge', '\x00']);

			// 'knowledge \x00' not in registry → falls to 'knowledge'
			expect(result).toBe(0);
			expect(mockHandleKnowledgeListCommand).toHaveBeenCalledWith(cwd, [
				'\x00',
			]);
		});

		it('should handle config doctor with very long subcommand', async () => {
			const longSubcmd = Array(1000).fill('x').join('');
			const result = await run(['config', 'doctor', longSubcmd]);

			// Should pass long subcommand to handler, not crash
			expect(result).toBe(0);
			expect(mockHandleDoctorCommand).toHaveBeenCalledWith(cwd, [longSubcmd]);
		});

		it('should handle evidence summary with additional unexpected args', async () => {
			const result = await run(['evidence', 'summary', 'unexpected', 'args']);

			// Should ignore unexpected args for summary, not crash
			expect(result).toBe(0);
			expect(mockHandleEvidenceSummaryCommand).toHaveBeenCalledWith(cwd);
		});
	});
});
