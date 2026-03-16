import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { resetSwarmState, ensureAgentSession, recordPhaseAgentDispatch } from '../../src/state';
import { executePhaseComplete, validatePhaseNumber } from '../../src/tools';

describe('phase_complete retrospective gate', () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		// Reset state before each test
		resetSwarmState();

		// Create temp directory
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-phase-test-'));
		originalCwd = process.cwd();
		process.chdir(tempDir);

		// Create .swarm directory and evidence directory structure
		fs.mkdirSync(path.join(tempDir, '.swarm'), { recursive: true });
		fs.mkdirSync(path.join(tempDir, '.swarm', 'evidence'), { recursive: true });
	});

	afterEach(() => {
		process.chdir(originalCwd);
		// Clean up temp directory
		fs.rmSync(tempDir, { recursive: true, force: true });
		// Reset state after each test
		resetSwarmState();
	});

	// Helper function to write a valid retro bundle
	function writeRetroBundle(
		taskId: string,
		phaseNumber: number,
		verdict: 'pass' | 'fail' = 'pass',
	): void {
		const retroDir = path.join(tempDir, '.swarm', 'evidence', taskId);
		fs.mkdirSync(retroDir, { recursive: true });

		const retroBundle = {
			schema_version: '1.0.0',
			task_id: taskId,
			entries: [
				{
					task_id: taskId,
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

	// Helper function to write a malformed bundle
	function writeMalformedBundle(taskId: string): void {
		const retroDir = path.join(tempDir, '.swarm', 'evidence', taskId);
		fs.mkdirSync(retroDir, { recursive: true });

		fs.writeFileSync(
			path.join(retroDir, 'evidence.json'),
			'this is not valid json {{{',
		);
	}

	describe('Test 1: missing retro blocks phase_complete', () => {
		test('returns blocked status when no retro bundle exists', async () => {
			// Create config with empty required_agents to bypass delegation check
			fs.mkdirSync(path.join(tempDir, '.opencode'), { recursive: true });
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				JSON.stringify({
					phase_complete: {
						enabled: true,
						required_agents: [],
						require_docs: false,
						policy: 'enforce',
					},
				}),
			);

			ensureAgentSession('sess1');

			// No retro bundle written - should be blocked
			const result = await executePhaseComplete({
				phase: 1,
				sessionID: 'sess1',
			});
			const parsed = JSON.parse(result);

			expect(parsed.success).toBe(false);
			expect(parsed.status).toBe('blocked');
			expect(parsed.reason).toBe('RETROSPECTIVE_MISSING');
			expect(parsed.message).toContain('no valid retrospective evidence found');
			expect(parsed.warnings[0]).toContain('Retrospective missing for phase 1');
		});
	});

	describe('Test 2: valid retro with verdict=pass allows phase_complete', () => {
		test('returns success when valid retro bundle with verdict=pass exists', async () => {
			// Create config with empty required_agents
			fs.mkdirSync(path.join(tempDir, '.opencode'), { recursive: true });
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				JSON.stringify({
					phase_complete: {
						enabled: true,
						required_agents: [],
						require_docs: false,
						policy: 'enforce',
					},
				}),
			);

			ensureAgentSession('sess1');

			// Write valid retro bundle for phase 1
			writeRetroBundle('retro-1', 1, 'pass');

			// Should succeed
			const result = await executePhaseComplete({
				phase: 1,
				sessionID: 'sess1',
			});
			const parsed = JSON.parse(result);

			expect(parsed.success).toBe(true);
			expect(parsed.status).toBe('success');
			expect(parsed.message).toContain('Phase 1 completed');
		});
	});

	describe('Test 3: retro with verdict=fail blocks', () => {
		test('returns blocked status when retro bundle has verdict=fail', async () => {
			// Create config with empty required_agents
			fs.mkdirSync(path.join(tempDir, '.opencode'), { recursive: true });
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				JSON.stringify({
					phase_complete: {
						enabled: true,
						required_agents: [],
						require_docs: false,
						policy: 'enforce',
					},
				}),
			);

			ensureAgentSession('sess1');

			// Write retro bundle with verdict=fail
			writeRetroBundle('retro-1', 1, 'fail');

			const result = await executePhaseComplete({
				phase: 1,
				sessionID: 'sess1',
			});
			const parsed = JSON.parse(result);

			expect(parsed.success).toBe(false);
			expect(parsed.status).toBe('blocked');
			expect(parsed.reason).toBe('RETROSPECTIVE_MISSING');
		});
	});

	describe('Test 4: retro with wrong phase_number blocks', () => {
		test('returns blocked status when retro phase_number does not match', async () => {
			// Create config with empty required_agents
			fs.mkdirSync(path.join(tempDir, '.opencode'), { recursive: true });
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				JSON.stringify({
					phase_complete: {
						enabled: true,
						required_agents: [],
						require_docs: false,
						policy: 'enforce',
					},
				}),
			);

			ensureAgentSession('sess1');

			// Write retro bundle for phase 2, but we're completing phase 1
			writeRetroBundle('retro-2', 2, 'pass');

			const result = await executePhaseComplete({
				phase: 1,
				sessionID: 'sess1',
			});
			const parsed = JSON.parse(result);

			expect(parsed.success).toBe(false);
			expect(parsed.status).toBe('blocked');
			expect(parsed.reason).toBe('RETROSPECTIVE_MISSING');
		});
	});

	describe('Test 5: fallback scan finds retro in non-standard task_id', () => {
		test('allows phase_complete when retro found in non-standard task_id via fallback scan', async () => {
			// Create config with empty required_agents
			fs.mkdirSync(path.join(tempDir, '.opencode'), { recursive: true });
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				JSON.stringify({
					phase_complete: {
						enabled: true,
						required_agents: [],
						require_docs: false,
						policy: 'enforce',
					},
				}),
			);

			ensureAgentSession('sess1');

			// Write retro bundle at non-standard location with phase_number=1
			writeRetroBundle('retro-phase1', 1, 'pass');

			// Direct lookup for retro-1 will fail, but fallback scan should find retro-phase1
			const result = await executePhaseComplete({
				phase: 1,
				sessionID: 'sess1',
			});
			const parsed = JSON.parse(result);

			expect(parsed.success).toBe(true);
			expect(parsed.status).toBe('success');
		});
	});

	describe('Test 6: loadEvidence null returns blocked', () => {
		test('returns blocked when no evidence directory exists at all', async () => {
			// Create config with empty required_agents
			fs.mkdirSync(path.join(tempDir, '.opencode'), { recursive: true });
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				JSON.stringify({
					phase_complete: {
						enabled: true,
						required_agents: [],
						require_docs: false,
						policy: 'enforce',
					},
				}),
			);

			ensureAgentSession('sess1');

			// Remove the evidence directory entirely
			fs.rmSync(path.join(tempDir, '.swarm', 'evidence'), {
				recursive: true,
				force: true,
			});

			const result = await executePhaseComplete({
				phase: 1,
				sessionID: 'sess1',
			});
			const parsed = JSON.parse(result);

			expect(parsed.success).toBe(false);
			expect(parsed.status).toBe('blocked');
			expect(parsed.reason).toBe('RETROSPECTIVE_MISSING');
		});
	});

	describe('Test 7: malformed bundle is ignored', () => {
		test('returns blocked when evidence.json contains invalid JSON', async () => {
			// Create config with empty required_agents
			fs.mkdirSync(path.join(tempDir, '.opencode'), { recursive: true });
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				JSON.stringify({
					phase_complete: {
						enabled: true,
						required_agents: [],
						require_docs: false,
						policy: 'enforce',
					},
				}),
			);

			ensureAgentSession('sess1');

			// Write malformed bundle - loadEvidence returns null for invalid JSON
			writeMalformedBundle('retro-1');

			const result = await executePhaseComplete({
				phase: 1,
				sessionID: 'sess1',
			});
			const parsed = JSON.parse(result);

			expect(parsed.success).toBe(false);
			expect(parsed.status).toBe('blocked');
			expect(parsed.reason).toBe('RETROSPECTIVE_MISSING');
		});
	});

	describe('Test 8: disabled config bypasses check', () => {
		test('returns success without retro when enabled=false in config', async () => {
			// Create config with enabled: false
			fs.mkdirSync(path.join(tempDir, '.opencode'), { recursive: true });
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				JSON.stringify({
					phase_complete: {
						enabled: false,
						required_agents: ['coder'],
						require_docs: false,
						policy: 'enforce',
					},
				}),
			);

			ensureAgentSession('sess1');
			recordPhaseAgentDispatch('sess1', 'coder');

			// No retro bundle written, but enforcement is disabled
			const result = await executePhaseComplete({
				phase: 1,
				sessionID: 'sess1',
			});
			const parsed = JSON.parse(result);

			expect(parsed.success).toBe(true);
			expect(parsed.status).toBe('disabled');
			expect(parsed.message).toContain('enforcement disabled');
		});
	});

	describe('Additional test: multiple retro entries with one valid', () => {
		test('allows phase_complete when bundle has multiple entries including a valid retro', async () => {
			// Create config with empty required_agents
			fs.mkdirSync(path.join(tempDir, '.opencode'), { recursive: true });
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				JSON.stringify({
					phase_complete: {
						enabled: true,
						required_agents: [],
						require_docs: false,
						policy: 'enforce',
					},
				}),
			);

			ensureAgentSession('sess1');

			// Write bundle with multiple entries including a valid retro for phase 1
			const retroDir = path.join(tempDir, '.swarm', 'evidence', 'retro-1');
			fs.mkdirSync(retroDir, { recursive: true });

			const retroBundle = {
				schema_version: '1.0.0',
				task_id: 'retro-1',
				entries: [
					{
						task_id: 'retro-1',
						type: 'note',
						timestamp: new Date().toISOString(),
						agent: 'architect',
						verdict: 'info',
						summary: 'Just a note',
					},
					{
						task_id: 'retro-1',
						type: 'retrospective',
						timestamp: new Date().toISOString(),
						agent: 'architect',
						verdict: 'pass',
						summary: 'Phase retrospective',
						metadata: {},
						phase_number: 1,
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

			const result = await executePhaseComplete({
				phase: 1,
				sessionID: 'sess1',
			});
			const parsed = JSON.parse(result);

			expect(parsed.success).toBe(true);
			expect(parsed.status).toBe('success');
		});
	});

	describe('Additional test: multiple phase retrospectives present', () => {
		test('correctly validates retro for specific phase when multiple phases have retros', async () => {
			// Create config with empty required_agents
			fs.mkdirSync(path.join(tempDir, '.opencode'), { recursive: true });
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				JSON.stringify({
					phase_complete: {
						enabled: true,
						required_agents: [],
						require_docs: false,
						policy: 'enforce',
					},
				}),
			);

			ensureAgentSession('sess1');

			// Write retros for multiple phases
			writeRetroBundle('retro-1', 1, 'pass');
			writeRetroBundle('retro-2', 2, 'pass');

			// Complete phase 2 - should use retro-2
			const result = await executePhaseComplete({
				phase: 2,
				sessionID: 'sess1',
			});
			const parsed = JSON.parse(result);

			expect(parsed.success).toBe(true);
			expect(parsed.status).toBe('success');
		});
	});
});
