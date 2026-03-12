import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createSystemEnhancerHook } from '../../../src/hooks/system-enhancer';
import type { PluginConfig } from '../../../src/config';
import { resetSwarmState, swarmState, ensureAgentSession } from '../../../src/state';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Helper to create tool aggregate (only uses fields that exist in ToolAggregate)
function createToolAggregate(count: number) {
	return { tool: 'bash', count, successCount: 0, failureCount: 0, totalDuration: 0 };
}

describe('v6.2 System Enhancer Compaction Advisory', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'swarm-compaction-test-'));
		resetSwarmState();
	});

	afterEach(async () => {
		try {
			await rm(tempDir, { recursive: true, force: true });
		} catch {}
	});

	async function createSwarmFiles(): Promise<void> {
		const swarmDir = join(tempDir, '.swarm');
		await mkdir(swarmDir, { recursive: true });
		await writeFile(join(swarmDir, 'plan.md'), '# Plan\n');
		await writeFile(join(swarmDir, 'context.md'), '# Context\n');
	}

	async function invokeHook(config: PluginConfig): Promise<string[]> {
		const hooks = createSystemEnhancerHook(config, tempDir);
		const transform = hooks['experimental.chat.system.transform'] as (
			input: { sessionID?: string },
			output: { system: string[] },
		) => Promise<void>;
		const input = { sessionID: 'test-session' };
		const output = { system: ['Initial system prompt'] };
		await transform(input, output);
		return output.system;
	}

	const defaultConfig: PluginConfig = {
		max_iterations: 5,
		qa_retry_limit: 3,
		inject_phase_reminders: true,
	};

	it('injects compaction hint at first threshold crossing (50 tool calls)', async () => {
		// 1. createSwarmFiles()
		await createSwarmFiles();

		// 2. ensureAgentSession('test-session', 'architect')
		ensureAgentSession('test-session', 'architect');

		// 3. Set session.lastCompactionHint = 0
		const session = swarmState.agentSessions.get('test-session')!;
		session.lastCompactionHint = 0;

		// 4. swarmState.toolAggregates.set('bash', createToolAggregate(52))
		swarmState.toolAggregates.set('bash', createToolAggregate(52));

		// 5. invokeHook(defaultConfig) — no compaction_advisory config (defaults apply)
		const systemOutput = await invokeHook(defaultConfig);

		// 6. Assert: systemOutput.some(s => s.includes('compact')) === true (compaction hint)
		expect(systemOutput.some((s) => s.includes('compact'))).toBe(true);

		// 7. Assert: systemOutput.some(s => s.includes('52')) === true (actual count in message)
		expect(systemOutput.some((s) => s.includes('52'))).toBe(true);
	});

	it('does not re-inject at same threshold (lastCompactionHint = 50, total = 52)', async () => {
		// 1. createSwarmFiles()
		await createSwarmFiles();

		// 2. ensureAgentSession('test-session', 'architect')
		ensureAgentSession('test-session', 'architect');

		// 3. Set session.lastCompactionHint = 50
		const session = swarmState.agentSessions.get('test-session')!;
		session.lastCompactionHint = 50;

		// 4. swarmState.toolAggregates.set('bash', createToolAggregate(52))
		swarmState.toolAggregates.set('bash', createToolAggregate(52));

		// 5. invokeHook(defaultConfig)
		const systemOutput = await invokeHook(defaultConfig);

		// 6. Assert: systemOutput.some(s => s.includes('[SWARM HINT]')) === false
		// Note: The default hint about summarization is still present, so we check for "compact" to exclude it
		expect(systemOutput.some((s) => s.includes('compact'))).toBe(false);
	});

	it('injects at next threshold when last hint was at prior threshold', async () => {
		// 1. createSwarmFiles()
		await createSwarmFiles();

		// 2. ensureAgentSession('test-session', 'architect')
		ensureAgentSession('test-session', 'architect');

		// 3. Set session.lastCompactionHint = 50
		const session = swarmState.agentSessions.get('test-session')!;
		session.lastCompactionHint = 50;

		// 4. swarmState.toolAggregates.set('bash', createToolAggregate(77)) — crosses 75 threshold
		swarmState.toolAggregates.set('bash', createToolAggregate(77));

		// 5. invokeHook(defaultConfig)
		const systemOutput = await invokeHook(defaultConfig);

		// 6. Assert: systemOutput.some(s => s.includes('compact')) === true (75 threshold triggered)
		expect(systemOutput.some((s) => s.includes('compact'))).toBe(true);

		// 7. Check session.lastCompactionHint is now 75
		expect(session.lastCompactionHint).toBe(75);
	});

	it('enabled:false skips compaction advisory entirely', async () => {
		// 1. createSwarmFiles()
		await createSwarmFiles();

		// 2. ensureAgentSession('test-session', 'architect')
		ensureAgentSession('test-session', 'architect');

		// 3. Set session.lastCompactionHint = 0
		const session = swarmState.agentSessions.get('test-session')!;
		session.lastCompactionHint = 0;

		// 4. swarmState.toolAggregates.set('bash', createToolAggregate(200))
		swarmState.toolAggregates.set('bash', createToolAggregate(200));

		// 5. config = { ...defaultConfig, compaction_advisory: { enabled: false } }
		const config = {
			...defaultConfig,
			compaction_advisory: { enabled: false } as PluginConfig['compaction_advisory'],
		};

		// 6. invokeHook(config)
		const systemOutput = await invokeHook(config);

		// 7. Assert: systemOutput.some(s => s.includes('compact')) === false (compaction disabled)
		expect(systemOutput.some((s) => s.includes('compact'))).toBe(false);
	});

	it('lastCompactionHint initializes to 0 (new session)', async () => {
		// 1. ensureAgentSession('test-session', 'architect')
		ensureAgentSession('test-session', 'architect');

		// 2. const session = swarmState.agentSessions.get('test-session')!
		const session = swarmState.agentSessions.get('test-session')!;

		// 3. Assert: session.lastCompactionHint === 0
		expect(session.lastCompactionHint).toBe(0);
	});

	it('custom thresholds accepted and used', async () => {
		// 1. createSwarmFiles()
		await createSwarmFiles();

		// 2. ensureAgentSession('test-session', 'architect')
		ensureAgentSession('test-session', 'architect');

		// 3. Set session.lastCompactionHint = 0
		const session = swarmState.agentSessions.get('test-session')!;
		session.lastCompactionHint = 0;

		// 4. swarmState.toolAggregates.set('bash', createToolAggregate(25))
		swarmState.toolAggregates.set('bash', createToolAggregate(25));

		// 5. config = { ...defaultConfig, compaction_advisory: { enabled: true, thresholds: [20, 40, 60] } }
		const config = {
			...defaultConfig,
			compaction_advisory: {
				enabled: true,
				thresholds: [20, 40, 60],
			} as PluginConfig['compaction_advisory'],
		};

		// 6. invokeHook(config)
		const systemOutput = await invokeHook(config);

		// 7. Assert: systemOutput.some(s => s.includes('compact')) === true (crosses 20 custom threshold)
		expect(systemOutput.some((s) => s.includes('compact'))).toBe(true);
	});
});
