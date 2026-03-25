import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { handleResetSessionCommand } from '../../../src/commands/reset-session';
import { resetSwarmState, swarmState, startAgentSession } from '../../../src/state';

let testDir: string;

beforeEach(() => {
	resetSwarmState();
	testDir = mkdtempSync(path.join(os.tmpdir(), 'reset-session-test-'));
	mkdirSync(path.join(testDir, '.swarm', 'session'), { recursive: true });
});

afterEach(() => {
	try {
		rmSync(testDir, { recursive: true, force: true });
	} catch {
		// Ignore cleanup errors
	}
});

describe('handleResetSessionCommand', () => {
	it('deletes state.json when it exists', async () => {
		const stateFile = path.join(testDir, '.swarm', 'session', 'state.json');
		writeFileSync(stateFile, JSON.stringify({ test: 'data' }));
		expect(existsSync(stateFile)).toBe(true);

		const result = await handleResetSessionCommand(testDir, []);

		expect(existsSync(stateFile)).toBe(false);
		expect(result).toContain('Deleted .swarm/session/state.json');
	});

	it('handles missing state.json gracefully', async () => {
		const stateFile = path.join(testDir, '.swarm', 'session', 'state.json');
		expect(existsSync(stateFile)).toBe(false);

		const result = await handleResetSessionCommand(testDir, []);

		expect(result).toContain('state.json not found');
	});

	it('clears in-memory sessions', async () => {
		// Pre-populate agent sessions
		startAgentSession('session-1', 'coder');
		startAgentSession('session-2', 'reviewer');
		expect(swarmState.agentSessions.size).toBe(2);

		const result = await handleResetSessionCommand(testDir, []);

		expect(swarmState.agentSessions.size).toBe(0);
		expect(result).toContain('Cleared 2 in-memory agent session(s)');
	});

	it('clears in-memory sessions even when state.json does not exist', async () => {
		startAgentSession('session-1', 'coder');
		startAgentSession('session-2', 'architect');
		startAgentSession('session-3', 'reviewer');
		expect(swarmState.agentSessions.size).toBe(3);

		const result = await handleResetSessionCommand(testDir, []);

		expect(swarmState.agentSessions.size).toBe(0);
		expect(result).toContain('Cleared 3 in-memory agent session(s)');
		expect(result).toContain('state.json not found');
	});
});
