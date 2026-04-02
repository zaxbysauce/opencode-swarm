/**
 * cli-dispatch.test.ts
 *
 * Registry-level tests for the unified command dispatch system.
 * These tests verify the COMMAND_REGISTRY and resolveCommand() function
 * independently of the CLI or hook entry points.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock all individual command files so we can import the registry
// without triggering real I/O in handler modules
vi.mock('../../src/commands/status.js', () => ({
	handleStatusCommand: vi.fn(),
}));
vi.mock('../../src/commands/plan.js', () => ({ handlePlanCommand: vi.fn() }));
vi.mock('../../src/commands/agents.js', () => ({
	handleAgentsCommand: vi.fn(),
}));
vi.mock('../../src/commands/archive.js', () => ({
	handleArchiveCommand: vi.fn(),
}));
vi.mock('../../src/commands/history.js', () => ({
	handleHistoryCommand: vi.fn(),
}));
vi.mock('../../src/commands/config.js', () => ({
	handleConfigCommand: vi.fn(),
}));
vi.mock('../../src/commands/doctor.js', () => ({
	handleDoctorCommand: vi.fn(),
}));
vi.mock('../../src/commands/evidence.js', () => ({
	handleEvidenceCommand: vi.fn(),
	handleEvidenceSummaryCommand: vi.fn(),
}));
vi.mock('../../src/commands/diagnose.js', () => ({
	handleDiagnoseCommand: vi.fn(),
}));
vi.mock('../../src/commands/preflight.js', () => ({
	handlePreflightCommand: vi.fn(),
}));
vi.mock('../../src/commands/sync-plan.js', () => ({
	handleSyncPlanCommand: vi.fn(),
}));
vi.mock('../../src/commands/benchmark.js', () => ({
	handleBenchmarkCommand: vi.fn(),
}));
vi.mock('../../src/commands/export.js', () => ({
	handleExportCommand: vi.fn(),
}));
vi.mock('../../src/commands/reset.js', () => ({ handleResetCommand: vi.fn() }));
vi.mock('../../src/commands/retrieve.js', () => ({
	handleRetrieveCommand: vi.fn(),
}));
vi.mock('../../src/commands/clarify.js', () => ({
	handleClarifyCommand: vi.fn(),
}));
vi.mock('../../src/commands/analyze.js', () => ({
	handleAnalyzeCommand: vi.fn(),
}));
vi.mock('../../src/commands/specify.js', () => ({
	handleSpecifyCommand: vi.fn(),
}));
vi.mock('../../src/commands/dark-matter.js', () => ({
	handleDarkMatterCommand: vi.fn(),
}));
vi.mock('../../src/commands/knowledge.js', () => ({
	handleKnowledgeListCommand: vi.fn(),
	handleKnowledgeMigrateCommand: vi.fn(),
	handleKnowledgeQuarantineCommand: vi.fn(),
	handleKnowledgeRestoreCommand: vi.fn(),
}));
vi.mock('../../src/commands/rollback.js', () => ({
	handleRollbackCommand: vi.fn(),
}));
vi.mock('../../src/commands/promote.js', () => ({
	handlePromoteCommand: vi.fn(),
}));
vi.mock('../../src/commands/handoff.js', () => ({
	handleHandoffCommand: vi.fn(),
}));
vi.mock('../../src/commands/turbo.js', () => ({ handleTurboCommand: vi.fn() }));
vi.mock('../../src/commands/simulate.js', () => ({
	handleSimulateCommand: vi.fn(),
}));
vi.mock('../../src/commands/curate.js', () => ({
	handleCurateCommand: vi.fn(),
}));
vi.mock('../../src/commands/write_retro.js', () => ({
	handleWriteRetroCommand: vi.fn(),
}));
vi.mock('../../src/commands/checkpoint.js', () => ({
	handleCheckpointCommand: vi.fn(),
}));

import {
	COMMAND_REGISTRY,
	resolveCommand,
	VALID_COMMANDS,
} from '../../src/commands/registry.js';

describe('COMMAND_REGISTRY', () => {
	describe('1. Registry coverage — keys and VALID_COMMANDS are in sync', () => {
		it('every key in COMMAND_REGISTRY appears in VALID_COMMANDS', () => {
			const registryKeys = Object.keys(COMMAND_REGISTRY);
			for (const key of registryKeys) {
				expect(VALID_COMMANDS).toContain(key);
			}
		});

		it('every entry in VALID_COMMANDS appears in COMMAND_REGISTRY', () => {
			for (const cmd of VALID_COMMANDS) {
				expect(COMMAND_REGISTRY).toHaveProperty(cmd);
			}
		});

		it('VALID_COMMANDS length matches COMMAND_REGISTRY key count', () => {
			expect(VALID_COMMANDS.length).toBe(Object.keys(COMMAND_REGISTRY).length);
		});
	});

	describe('2. All valid commands resolve non-null via resolveCommand', () => {
		for (const cmd of Object.keys(COMMAND_REGISTRY)) {
			it(`resolveCommand(['${cmd}']) is non-null`, () => {
				// Split compound keys into tokens (e.g. "evidence summary" → ["evidence", "summary"])
				const tokens = cmd.split(' ');
				const result = resolveCommand(tokens);
				expect(result).not.toBeNull();
			});
		}
	});
});

describe('resolveCommand()', () => {
	describe('3. Compound command resolution', () => {
		it('["evidence", "summary"] resolves to the "evidence summary" entry, not bare "evidence"', () => {
			const result = resolveCommand(['evidence', 'summary']);
			expect(result).not.toBeNull();
			// The resolved entry description should match "evidence summary", not plain "evidence"
			expect(result!.entry.description).toBe(
				COMMAND_REGISTRY['evidence summary'].description,
			);
			expect(result!.entry.description).not.toBe(
				COMMAND_REGISTRY['evidence'].description,
			);
			expect(result!.remainingArgs).toEqual([]);
		});

		it('["config", "doctor"] resolves to the "config doctor" entry, not bare "config"', () => {
			const result = resolveCommand(['config', 'doctor']);
			expect(result).not.toBeNull();
			expect(result!.entry.description).toBe(
				COMMAND_REGISTRY['config doctor'].description,
			);
			expect(result!.entry.description).not.toBe(
				COMMAND_REGISTRY['config'].description,
			);
			expect(result!.remainingArgs).toEqual([]);
		});

		it('["knowledge", "migrate"] resolves to "knowledge migrate", not bare "knowledge"', () => {
			const result = resolveCommand(['knowledge', 'migrate']);
			expect(result).not.toBeNull();
			expect(result!.entry.description).toBe(
				COMMAND_REGISTRY['knowledge migrate'].description,
			);
			expect(result!.remainingArgs).toEqual([]);
		});

		it('compound resolution passes remaining args correctly', () => {
			const result = resolveCommand([
				'evidence',
				'summary',
				'--verbose',
				'--json',
			]);
			expect(result).not.toBeNull();
			expect(result!.entry.description).toBe(
				COMMAND_REGISTRY['evidence summary'].description,
			);
			expect(result!.remainingArgs).toEqual(['--verbose', '--json']);
		});
	});

	describe('4. Single-token resolution falls back when compound does not match', () => {
		it('["evidence", "list"] resolves to bare "evidence" (not a compound key)', () => {
			const result = resolveCommand(['evidence', 'list']);
			expect(result).not.toBeNull();
			expect(result!.entry.description).toBe(
				COMMAND_REGISTRY['evidence'].description,
			);
			expect(result!.remainingArgs).toEqual(['list']);
		});

		it('["knowledge"] resolves to bare "knowledge"', () => {
			const result = resolveCommand(['knowledge']);
			expect(result).not.toBeNull();
			expect(result!.entry.description).toBe(
				COMMAND_REGISTRY['knowledge'].description,
			);
			expect(result!.remainingArgs).toEqual([]);
		});

		it('single-token resolution passes remaining args correctly', () => {
			const result = resolveCommand(['diagnose', '--verbose']);
			expect(result).not.toBeNull();
			expect(result!.entry.description).toBe(
				COMMAND_REGISTRY['diagnose'].description,
			);
			expect(result!.remainingArgs).toEqual(['--verbose']);
		});
	});

	describe('5. Unknown command returns null', () => {
		it('resolveCommand(["foobar"]) returns null', () => {
			expect(resolveCommand(['foobar'])).toBeNull();
		});

		it('resolveCommand([]) returns null', () => {
			expect(resolveCommand([])).toBeNull();
		});

		it('resolveCommand(["unknown", "subcommand"]) returns null when neither compound nor single key exists', () => {
			expect(resolveCommand(['unknown', 'subcommand'])).toBeNull();
		});

		it('resolveCommand(["evidence", "summary"]) does NOT return null (sanity)', () => {
			expect(resolveCommand(['evidence', 'summary'])).not.toBeNull();
		});
	});
});
