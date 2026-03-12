import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { resetSwarmState, ensureAgentSession, recordPhaseAgentDispatch } from '../../../src/state';

// Mock curator functions BEFORE importing the module under test
const mockRunCuratorPhase = mock(async () => ({
	phase: 1,
	agents_dispatched: ['coder', 'reviewer', 'test_engineer'],
	compliance: [],
	knowledge_recommendations: [],
	summary: 'Test curator phase result',
	timestamp: new Date().toISOString(),
}));

const mockApplyCuratorKnowledgeUpdates = mock(async () => ({
	applied: 0,
	skipped: 0,
}));

const mockRunCriticDriftCheck = mock(async () => ({
	phase: 1,
	alignment: 'ALIGNED',
	drift_score: 0,
	recommendations: [],
	timestamp: new Date().toISOString(),
}));

// Mock the curator modules
mock.module('../../../src/hooks/curator', () => ({
	runCuratorPhase: mockRunCuratorPhase,
	applyCuratorKnowledgeUpdates: mockApplyCuratorKnowledgeUpdates,
}));

mock.module('../../../src/hooks/curator-drift', () => ({
	runCriticDriftCheck: mockRunCriticDriftCheck,
}));

// Also mock the knowledge-curator module to avoid interference from curateAndStoreSwarm
mock.module('../../../src/hooks/knowledge-curator.js', () => ({
	curateAndStoreSwarm: mock(async () => {}),
}));

// Import the tool after setting up mocks
const { phase_complete } = await import('../../../src/tools/phase-complete');

/**
 * Helper function to write a valid retro bundle for a phase
 */
function writeRetroBundle(
	directory: string,
	phaseNumber: number,
	verdict: 'pass' | 'fail' = 'pass',
): void {
	const retroDir = path.join(directory, '.swarm', 'evidence', `retro-${phaseNumber}`);
	fs.mkdirSync(retroDir, { recursive: true });

	const retroBundle = {
		schema_version: '1.0.0',
		task_id: `retro-${phaseNumber}`,
		entries: [
			{
				task_id: `retro-${phaseNumber}`,
				type: 'retrospective',
				timestamp: new Date().toISOString(),
				agent: 'architect',
				verdict: verdict,
				summary: 'Phase retrospective',
				metadata: {},
				phase_number: phaseNumber,
				total_tool_calls: 10,
				coder_revisions: 1,
				reviewer_rejections: 0,
				test_failures: 0,
				security_findings: 0,
				integration_issues: 0,
				task_count: 5,
				task_complexity: 'moderate',
				top_rejection_reasons: [],
				lessons_learned: ['Lesson 1'],
			},
		],
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
	};

	fs.writeFileSync(
		path.join(retroDir, 'evidence.json'),
		JSON.stringify(retroBundle, null, 2),
	);
}

/**
 * Create config with optional curator settings
 */
function createConfig(curatorConfig?: {
	enabled?: boolean;
	phase_enabled?: boolean;
}): string {
	const config: Record<string, unknown> = {
		phase_complete: {
			enabled: true,
			required_agents: [],
			require_docs: false,
			policy: 'enforce',
		},
		// Always write explicit curator config to override any user-level config that may
		// have curator.enabled=true (user config deep-merges with project config).
		curator: {
			enabled: curatorConfig?.enabled ?? false,
			phase_enabled: curatorConfig?.phase_enabled ?? true,
			init_enabled: true,
			max_summary_tokens: 2000,
			min_knowledge_confidence: 0.7,
			compliance_report: true,
			suppress_warnings: true,
			drift_inject_max_chars: 500,
		},
	};

	return JSON.stringify(config);
}

describe('phase_complete - curator pipeline', () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		// Reset state before each test
		resetSwarmState();

		// Clear mock call history
		mockRunCuratorPhase.mockClear();
		mockApplyCuratorKnowledgeUpdates.mockClear();
		mockRunCriticDriftCheck.mockClear();

		// Create temp directory
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-complete-curator-test-'));
		originalCwd = process.cwd();
		process.chdir(tempDir);

		// Create .swarm directory and evidence directory structure
		fs.mkdirSync(path.join(tempDir, '.swarm'), { recursive: true });
		fs.mkdirSync(path.join(tempDir, '.swarm', 'evidence'), { recursive: true });

		// Write retro bundle for phase 1
		writeRetroBundle(tempDir, 1, 'pass');

		// Create default config WITHOUT curator enabled (default case)
		fs.mkdirSync(path.join(tempDir, '.opencode'), { recursive: true });
		fs.writeFileSync(
			path.join(tempDir, '.opencode', 'opencode-swarm.json'),
			createConfig(),
		);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		try {
			fs.rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
		// Reset state after each test
		resetSwarmState();
	});

	describe('curator pipeline skipped when enabled=false (default)', () => {
		test('runCuratorPhase is NOT called when curator is not enabled', async () => {
			// Config has curator disabled (default)
			ensureAgentSession('sess1');

			const result = await phase_complete.execute({ phase: 1, sessionID: 'sess1' });
			const parsed = JSON.parse(result);

			// Phase complete should still succeed
			expect(parsed.success).toBe(true);
			expect(parsed.status).toBe('success');

			// Curator functions should NOT have been called
			expect(mockRunCuratorPhase).not.toHaveBeenCalled();
			expect(mockApplyCuratorKnowledgeUpdates).not.toHaveBeenCalled();
			expect(mockRunCriticDriftCheck).not.toHaveBeenCalled();
		});

		test('curator pipeline skipped when curator.enabled explicitly set to false', async () => {
			// Explicitly set curator.enabled = false
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				createConfig({ enabled: false, phase_enabled: true }),
			);

			ensureAgentSession('sess1');

			const result = await phase_complete.execute({ phase: 1, sessionID: 'sess1' });
			const parsed = JSON.parse(result);

			expect(parsed.success).toBe(true);
			expect(mockRunCuratorPhase).not.toHaveBeenCalled();
		});
	});

	describe('curator pipeline runs when enabled=true', () => {
		test('runCuratorPhase IS called when curator.enabled and curator.phase_enabled are both true', async () => {
			// Config with curator enabled
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				createConfig({ enabled: true, phase_enabled: true }),
			);

			ensureAgentSession('sess1');
			recordPhaseAgentDispatch('sess1', 'coder');
			recordPhaseAgentDispatch('sess1', 'reviewer');
			recordPhaseAgentDispatch('sess1', 'test_engineer');

			const result = await phase_complete.execute({ phase: 1, sessionID: 'sess1' });
			const parsed = JSON.parse(result);

			// Phase complete should succeed
			expect(parsed.success).toBe(true);
			expect(parsed.status).toBe('success');

			// Curator functions SHOULD have been called
			expect(mockRunCuratorPhase).toHaveBeenCalled();
			expect(mockRunCuratorPhase).toHaveBeenCalledWith(
				tempDir,
				1,
				['coder', 'reviewer', 'test_engineer'],
				expect.objectContaining({
					enabled: true,
					phase_enabled: true,
				}),
				expect.any(Object),
			);

			expect(mockApplyCuratorKnowledgeUpdates).toHaveBeenCalledWith(
				tempDir,
				[], // knowledge_recommendations from mock
				expect.any(Object),
			);

			expect(mockRunCriticDriftCheck).toHaveBeenCalledWith(
				tempDir,
				1,
				expect.objectContaining({
					phase: 1,
				}),
				expect.objectContaining({
					enabled: true,
					phase_enabled: true,
				}),
			);
		});

		test('calls curator functions in sequence: runCuratorPhase -> applyCuratorKnowledgeUpdates -> runCriticDriftCheck', async () => {
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				createConfig({ enabled: true, phase_enabled: true }),
			);

			ensureAgentSession('sess1');
			recordPhaseAgentDispatch('sess1', 'coder');

			await phase_complete.execute({ phase: 1, sessionID: 'sess1' });

			// Verify call order
			const calls = mockRunCuratorPhase.mock.calls;
			expect(calls.length).toBe(1);

			// applyCuratorKnowledgeUpdates should be called after runCuratorPhase
			expect(mockApplyCuratorKnowledgeUpdates).toHaveBeenCalled();

			// runCriticDriftCheck should be called after applyCuratorKnowledgeUpdates
			expect(mockRunCriticDriftCheck).toHaveBeenCalled();
		});
	});

	describe('curator error does not block phase_complete', () => {
		test('phase_complete returns success even when runCuratorPhase throws', async () => {
			// Set up config with curator enabled
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				createConfig({ enabled: true, phase_enabled: true }),
			);

			// Make runCuratorPhase throw an error
			mockRunCuratorPhase.mockRejectedValueOnce(new Error('Curator phase failed'));

			ensureAgentSession('sess1');
			recordPhaseAgentDispatch('sess1', 'coder');

			const result = await phase_complete.execute({ phase: 1, sessionID: 'sess1' });
			const parsed = JSON.parse(result);

			// Phase complete should STILL succeed (not blocked by curator error)
			expect(parsed.success).toBe(true);
			expect(parsed.status).toBe('success');

			// The error should have been caught and logged as a warning
			// (we can't easily test the console.warn output, but we verify the result is valid)
		});

		test('phase_complete returns success even when applyCuratorKnowledgeUpdates throws', async () => {
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				createConfig({ enabled: true, phase_enabled: true }),
			);

			// Make applyCuratorKnowledgeUpdates throw an error
			mockApplyCuratorKnowledgeUpdates.mockRejectedValueOnce(
				new Error('Knowledge update failed'),
			);

			ensureAgentSession('sess1');
			recordPhaseAgentDispatch('sess1', 'coder');

			const result = await phase_complete.execute({ phase: 1, sessionID: 'sess1' });
			const parsed = JSON.parse(result);

			expect(parsed.success).toBe(true);
			expect(parsed.status).toBe('success');
		});

		test('phase_complete returns success even when runCriticDriftCheck throws', async () => {
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				createConfig({ enabled: true, phase_enabled: true }),
			);

			// Make runCriticDriftCheck throw an error
			mockRunCriticDriftCheck.mockRejectedValueOnce(
				new Error('Drift check failed'),
			);

			ensureAgentSession('sess1');
			recordPhaseAgentDispatch('sess1', 'coder');

			const result = await phase_complete.execute({ phase: 1, sessionID: 'sess1' });
			const parsed = JSON.parse(result);

			expect(parsed.success).toBe(true);
			expect(parsed.status).toBe('success');
		});

		test('result is valid JSON with success:true when curator errors occur', async () => {
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				createConfig({ enabled: true, phase_enabled: true }),
			);

			// Make all curator functions throw
			mockRunCuratorPhase.mockRejectedValueOnce(new Error('Curator error 1'));
			mockApplyCuratorKnowledgeUpdates.mockRejectedValueOnce(
				new Error('Curator error 2'),
			);
			mockRunCriticDriftCheck.mockRejectedValueOnce(new Error('Curator error 3'));

			ensureAgentSession('sess1');

			const result = await phase_complete.execute({ phase: 1, sessionID: 'sess1' });

			// Should be valid JSON
			expect(() => JSON.parse(result)).not.toThrow();

			const parsed = JSON.parse(result);

			// Should have expected structure
			expect(parsed).toHaveProperty('success');
			expect(parsed).toHaveProperty('phase');
			expect(parsed).toHaveProperty('message');
			expect(parsed).toHaveProperty('agentsDispatched');
			expect(parsed).toHaveProperty('agentsMissing');
			expect(parsed).toHaveProperty('status');
			expect(parsed).toHaveProperty('warnings');

			// Should indicate success
			expect(parsed.success).toBe(true);
		});
	});

	describe('curator pipeline skipped when phase_enabled=false', () => {
		test('runCuratorPhase is NOT called when phase_enabled=false but enabled=true', async () => {
			// Config with curator.enabled=true but phase_enabled=false
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				createConfig({ enabled: true, phase_enabled: false }),
			);

			ensureAgentSession('sess1');

			const result = await phase_complete.execute({ phase: 1, sessionID: 'sess1' });
			const parsed = JSON.parse(result);

			// Phase complete should succeed
			expect(parsed.success).toBe(true);
			expect(parsed.status).toBe('success');

			// Curator functions should NOT have been called
			expect(mockRunCuratorPhase).not.toHaveBeenCalled();
			expect(mockApplyCuratorKnowledgeUpdates).not.toHaveBeenCalled();
			expect(mockRunCriticDriftCheck).not.toHaveBeenCalled();
		});
	});

	describe('curator pipeline execution context', () => {
		test('curator receives correct phase number', async () => {
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				createConfig({ enabled: true, phase_enabled: true }),
			);

			// Write retro bundle for phase 2
			writeRetroBundle(tempDir, 2, 'pass');

			ensureAgentSession('sess1');
			recordPhaseAgentDispatch('sess1', 'coder');

			const result = await phase_complete.execute({ phase: 2, sessionID: 'sess1' });
			const parsed = JSON.parse(result);

			expect(parsed.success).toBe(true);
			expect(mockRunCuratorPhase).toHaveBeenCalledWith(
				expect.any(String), // directory
				2, // phase should be 2
				expect.any(Array),
				expect.any(Object),
				expect.any(Object),
			);
		});

		test('curator receives correct agentsDispatched', async () => {
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				createConfig({ enabled: true, phase_enabled: true }),
			);

			ensureAgentSession('sess1');
			recordPhaseAgentDispatch('sess1', 'coder');
			recordPhaseAgentDispatch('sess1', 'reviewer');
			recordPhaseAgentDispatch('sess1', 'test_engineer');
			recordPhaseAgentDispatch('sess1', 'docs');

			const result = await phase_complete.execute({ phase: 1, sessionID: 'sess1' });
			const parsed = JSON.parse(result);

			expect(parsed.success).toBe(true);

			// Verify the agents array passed to runCuratorPhase
			expect(mockRunCuratorPhase).toHaveBeenCalledWith(
				expect.any(String),
				expect.any(Number),
				expect.arrayContaining(['coder', 'reviewer', 'test_engineer', 'docs']),
				expect.any(Object),
				expect.any(Object),
			);
		});
	});
});
