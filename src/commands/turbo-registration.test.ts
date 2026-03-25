/**
 * Tests for Task 3.12: Turbo Mode command registration in src/commands/index.ts
 * Verifies import, export, help text, and switch case routing for /swarm turbo
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as commandsIndex from '../commands/index';
import { handleTurboCommand } from '../commands/turbo';
import { getAgentSession, swarmState } from '../state';

// Test the switch case routing by creating a mock handler
describe('Task 3.12: Turbo Command Registration', () => {
	describe('Import Verification', () => {
		it('handleTurboCommand should be importable from ./turbo', () => {
			expect(typeof handleTurboCommand).toBe('function');
		});

		it('handleTurboCommand should accept directory, args, and sessionID parameters', () => {
			// Check the function has the correct arity (3 parameters)
			expect(handleTurboCommand.length).toBe(3);
		});
	});

	describe('Export Verification', () => {
		it('should export handleTurboCommand from commands/index', () => {
			// Verify the export exists in the commands index module
			expect(commandsIndex).toBeDefined();
			expect(
				typeof (commandsIndex as Record<string, unknown>).handleTurboCommand,
			).toBe('function');
		});

		it('exported handleTurboCommand should be the same function as imported', () => {
			const exported = (commandsIndex as Record<string, unknown>)
				.handleTurboCommand;
			expect(exported).toBe(handleTurboCommand);
		});
	});

	describe('Help Text Verification', () => {
		it('HELP_TEXT should contain turbo command documentation', () => {
			// We need to verify the help text includes the turbo command
			// Read the source file to check for the help text
			const source = require('node:fs').readFileSync(
				require('node:path').join(__dirname, '../commands/index.ts'),
				'utf-8',
			);

			// Check that help text includes turbo command
			expect(source).toContain('/swarm turbo');
			expect(source).toContain('Turbo Mode');
			expect(source).toContain('[on|off]');
		});

		it('HELP_TEXT should document toggle behavior', () => {
			const source = require('node:fs').readFileSync(
				require('node:path').join(__dirname, '../commands/index.ts'),
				'utf-8',
			);

			// Should document the default toggle behavior
			expect(source).toContain('toggle');
		});
	});

	describe('Switch Case Routing', () => {
		let testSessionId: string;

		beforeEach(() => {
			// Create a test session with turboMode = false
			testSessionId = `switch-test-${Date.now()}`;
			swarmState.agentSessions.set(testSessionId, {
				agentName: 'architect',
				lastToolCallTime: Date.now(),
				lastAgentEventTime: Date.now(),
				delegationActive: false,
				activeInvocationId: 0,
				lastInvocationIdByAgent: {},
				windows: {},
				lastCompactionHint: 0,
				architectWriteCount: 0,
				lastCoderDelegationTaskId: null,
				currentTaskId: null,
				gateLog: new Map(),
				reviewerCallCount: new Map(),
				lastGateFailure: null,
				partialGateWarningsIssuedForTask: new Set(),
				selfFixAttempted: false,
				selfCodingWarnedAtCount: 0,
				catastrophicPhaseWarnings: new Set(),
				qaSkipCount: 0,
				qaSkipTaskIds: [],
				taskWorkflowStates: new Map(),
				lastGateOutcome: null,
				declaredCoderScope: null,
				lastScopeViolation: null,
				modifiedFilesThisCoderTask: [],
				lastPhaseCompleteTimestamp: 0,
				lastPhaseCompletePhase: 0,
				phaseAgentsDispatched: new Set(),
				lastCompletedPhaseAgentsDispatched: new Set(),
				turboMode: false,
			});
		});

		afterEach(() => {
			swarmState.agentSessions.delete(testSessionId);
		});

		it('switch case should route "turbo" subcommand to handleTurboCommand', async () => {
			// Create the command handler
			const handler = commandsIndex.createSwarmCommandHandler(
				'/test-project',
				{},
			);

			// Mock output object
			const output = { parts: [] as unknown[] };

			// Call with 'turbo' subcommand and 'on' argument
			await handler(
				{
					command: 'swarm',
					arguments: 'turbo on',
					sessionID: testSessionId,
				},
				output,
			);

			// Verify output contains turbo mode enabled message
			expect(output.parts).toHaveLength(1);
			expect((output.parts[0] as { text: string }).text).toBe(
				'Turbo Mode enabled',
			);

			// Verify session state was updated
			const session = getAgentSession(testSessionId);
			expect(session?.turboMode).toBe(true);
		});

		it('switch case should route "turbo off" to disable turbo mode', async () => {
			// Enable turbo mode first
			const session = getAgentSession(testSessionId);
			session!.turboMode = true;

			const handler = commandsIndex.createSwarmCommandHandler(
				'/test-project',
				{},
			);
			const output = { parts: [] as unknown[] };

			await handler(
				{
					command: 'swarm',
					arguments: 'turbo off',
					sessionID: testSessionId,
				},
				output,
			);

			expect((output.parts[0] as { text: string }).text).toBe(
				'Turbo Mode disabled',
			);
			expect(session?.turboMode).toBe(false);
		});

		it('switch case should route "turbo" (no args) to toggle', async () => {
			const handler = commandsIndex.createSwarmCommandHandler(
				'/test-project',
				{},
			);
			const output = { parts: [] as unknown[] };

			// Initial turboMode is false, so toggle should enable it
			await handler(
				{
					command: 'swarm',
					arguments: 'turbo',
					sessionID: testSessionId,
				},
				output,
			);

			expect((output.parts[0] as { text: string }).text).toBe(
				'Turbo Mode enabled',
			);
			expect(getAgentSession(testSessionId)?.turboMode).toBe(true);
		});

		it('should return error when no active session', async () => {
			const handler = commandsIndex.createSwarmCommandHandler(
				'/test-project',
				{},
			);
			const output = { parts: [] as unknown[] };

			await handler(
				{
					command: 'swarm',
					arguments: 'turbo on',
					sessionID: 'non-existent-session',
				},
				output,
			);

			expect((output.parts[0] as { text: string }).text).toBe(
				'Error: No active session. Turbo Mode requires an active session to operate.',
			);
		});
	});

	describe('Command Registration Integration', () => {
		it('createSwarmCommandHandler should be exported', () => {
			expect(typeof commandsIndex.createSwarmCommandHandler).toBe('function');
		});

		it('turbo should be recognized as a valid subcommand in switch', () => {
			// This is implicitly tested by the switch case routing tests above
			// If 'turbo' wasn't in the switch, it would fall through to default HELP_TEXT
			const source = require('node:fs').readFileSync(
				require('node:path').join(__dirname, '../commands/index.ts'),
				'utf-8',
			);

			// Verify case 'turbo' exists in the switch statement
			expect(source).toContain("case 'turbo':");
			expect(source).toContain('handleTurboCommand');
		});
	});
});
