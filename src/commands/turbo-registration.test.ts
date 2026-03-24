/**
 * Tests for Task 3.12: Turbo Mode command registration in src/commands/index.ts
 * Verifies import, export, help text, and registry routing for /swarm turbo
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as commandsIndex from '../commands/index';
import {
	COMMAND_REGISTRY,
	resolveCommand,
	VALID_COMMANDS,
} from '../commands/registry';
import { handleTurboCommand } from '../commands/turbo';
import { getAgentSession, swarmState } from '../state';

// Test the command handler routing via registry pattern
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
		it('turbo should be registered in COMMAND_REGISTRY', () => {
			// Verify turbo is a valid registered command
			expect(VALID_COMMANDS).toContain('turbo');
			expect(COMMAND_REGISTRY.turbo).toBeDefined();
		});

		it('turbo command should have proper description', () => {
			// Check that description contains Turbo Mode documentation
			expect(COMMAND_REGISTRY.turbo.description).toContain('Turbo Mode');
			expect(COMMAND_REGISTRY.turbo.description).toContain('[on|off]');
		});

		it('turbo description should document toggle behavior', () => {
			// Should document the default toggle behavior
			expect(COMMAND_REGISTRY.turbo.description.toLowerCase()).toContain(
				'toggle',
			);
		});
	});

	describe('Command Handler Routing', () => {
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
				availableCoderSymbols: null,
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

		it('should route "turbo" subcommand to handleTurboCommand', async () => {
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

		it('should route "turbo off" to disable turbo mode', async () => {
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

		it('should route "turbo" (no args) to toggle', async () => {
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

		it('turbo should be recognized as a valid subcommand via resolveCommand', () => {
			// Verify resolveCommand correctly routes 'turbo' to the registry entry
			const resolved = resolveCommand(['turbo']);
			expect(resolved).not.toBeNull();
			expect(resolved?.entry.handler).toBe(COMMAND_REGISTRY.turbo.handler);
			expect(resolved?.entry.description).toContain('Turbo Mode');
		});
	});
});
