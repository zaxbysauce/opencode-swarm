import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { PluginConfig } from '../config/schema';
import { resetSwarmState, swarmState } from '../state';
import { createAgentActivityHooks } from './agent-activity';

function makeConfig(): PluginConfig {
	return {
		max_iterations: 5,
		hooks: {
			agent_activity: true,
		},
	} as PluginConfig;
}

describe('agent-activity hook', () => {
	let tempDir: string;

	beforeEach(() => {
		resetSwarmState();
		tempDir = mkdtempSync(path.join(os.tmpdir(), 'agent-activity-'));
	});

	afterEach(() => {
		resetSwarmState();
		rmSync(tempDir, { recursive: true, force: true });
	});

	test('counts tool call as success when no explicit failure signal exists', async () => {
		const hooks = createAgentActivityHooks(makeConfig(), tempDir);

		await hooks.toolBefore(
			{ tool: 'context-mode_ctx_execute', sessionID: 's1', callID: 'c1' },
			{ args: {} },
		);
		await hooks.toolAfter(
			{ tool: 'context-mode_ctx_execute', sessionID: 's1', callID: 'c1' },
			{ output: undefined, metadata: { ok: true } },
		);

		expect(swarmState.toolAggregates.get('context-mode_ctx_execute')).toEqual({
			tool: 'context-mode_ctx_execute',
			count: 1,
			successCount: 1,
			failureCount: 0,
			totalDuration: expect.any(Number),
		});
	});

	test('counts explicit error as failure', async () => {
		const hooks = createAgentActivityHooks(makeConfig(), tempDir);

		await hooks.toolBefore(
			{ tool: 'bash', sessionID: 's1', callID: 'c2' },
			{ args: {} },
		);
		await hooks.toolAfter(
			{ tool: 'bash', sessionID: 's1', callID: 'c2' },
			{ output: undefined, error: new Error('boom') },
		);

		expect(swarmState.toolAggregates.get('bash')).toEqual({
			tool: 'bash',
			count: 1,
			successCount: 0,
			failureCount: 1,
			totalDuration: expect.any(Number),
		});
	});
});
