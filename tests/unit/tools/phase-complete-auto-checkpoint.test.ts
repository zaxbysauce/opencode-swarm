import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';

import { resetSwarmState, ensureAgentSession } from '../../../src/state';

// Import tools after setting up environment
const { phase_complete } = await import('../../../src/tools/phase-complete');

describe('phase_complete auto-checkpoint trigger', () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		// Reset state before each test
		resetSwarmState();

		// Create temp directory
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-checkpoint-test-'));
		originalCwd = process.cwd();
		process.chdir(tempDir);

		// Initialize a git repo in temp directory
		execSync('git init', { encoding: 'utf-8' });
		execSync('git config user.email "test@test.com"', { encoding: 'utf-8' });
		execSync('git config user.name "Test"', { encoding: 'utf-8' });
		// Create initial commit
		fs.writeFileSync(path.join(tempDir, 'initial.txt'), 'initial');
		execSync('git add .', { encoding: 'utf-8' });
		execSync('git commit -m "initial"', { encoding: 'utf-8' });

		// Create .swarm directory and evidence directory structure
		fs.mkdirSync(path.join(tempDir, '.swarm'), { recursive: true });
		fs.mkdirSync(path.join(tempDir, '.swarm', 'evidence'), { recursive: true });

		// Create .opencode directory with config file
		fs.mkdirSync(path.join(tempDir, '.opencode'), { recursive: true });
		fs.writeFileSync(
			path.join(tempDir, '.opencode', 'opencode-swarm.json'),
			JSON.stringify({
				phase_complete: {
					enabled: true,
					required_agents: [],
					require_docs: false,
					policy: 'warn'
				}
			})
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

	// Helper function to write a valid retro bundle
	function writeRetroBundle(phaseNumber: number, verdict: 'pass' | 'fail' = 'pass'): void {
		const retroDir = path.join(tempDir, '.swarm', 'evidence', `retro-${phaseNumber}`);
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
			'utf-8',
		);
	}

	describe('auto-checkpoint creation', () => {
		test('Auto-checkpoint created with correct label format phase-N-complete', async () => {
			// Arrange: Create session and valid retro bundle for phase 1
			const sessionId = 'test-session-1';
			ensureAgentSession(sessionId);
			writeRetroBundle(1, 'pass');

			// Act: Call phase_complete for phase 1
			const result = await phase_complete.execute({ phase: 1, sessionID: sessionId });
			const parsed = JSON.parse(result);

			// Assert: Checkpoint log should contain the correct label
			const checkpointLogPath = path.join(tempDir, '.swarm', 'checkpoints.json');
			expect(fs.existsSync(checkpointLogPath)).toBe(true);

			const checkpointLog = JSON.parse(fs.readFileSync(checkpointLogPath, 'utf-8'));
			expect(checkpointLog.checkpoints).toHaveLength(1);
			expect(checkpointLog.checkpoints[0].label).toBe('phase-1-complete');
		});

		test('Checkpoint created before phase completes - checkpoint timestamp before event', async () => {
			// Arrange: Create session and valid retro bundle for phase 2
			const sessionId = 'test-session-2';
			ensureAgentSession(sessionId);
			writeRetroBundle(2, 'pass');

			// Act: Call phase_complete for phase 2
			const result = await phase_complete.execute({ phase: 2, sessionID: sessionId });
			const parsed = JSON.parse(result);

			// Assert: Phase should complete successfully
			expect(parsed.success).toBe(true);
			expect(parsed.phase).toBe(2);

			// Check checkpoint was created
			const checkpointLogPath = path.join(tempDir, '.swarm', 'checkpoints.json');
			expect(fs.existsSync(checkpointLogPath)).toBe(true);

			const checkpointLog = JSON.parse(fs.readFileSync(checkpointLogPath, 'utf-8'));
			const checkpointTime = new Date(checkpointLog.checkpoints[0].timestamp).getTime();

			// Check event was written
			const eventsPath = path.join(tempDir, '.swarm', 'events.jsonl');
			expect(fs.existsSync(eventsPath)).toBe(true);

			const events = fs.readFileSync(eventsPath, 'utf-8').trim().split('\n');
			const lastEvent = JSON.parse(events[events.length - 1]);
			const eventTime = new Date(lastEvent.timestamp).getTime();

			// Checkpoint should be created before or at the same time as the event
			expect(checkpointTime).toBeLessThanOrEqual(eventTime);
		});

		test('Checkpoint failure is non-fatal - phase completes even if checkpoint fails', async () => {
			// Arrange: Create session and valid retro bundle for phase 1 and phase 3
			const sessionId = 'test-session-3';
			ensureAgentSession(sessionId);
			writeRetroBundle(1, 'pass');
			writeRetroBundle(3, 'pass');

			// First complete phase 1 to create the first checkpoint
			const result1 = await phase_complete.execute({ phase: 1, sessionID: sessionId });
			const parsed1 = JSON.parse(result1);
			expect(parsed1.success).toBe(true);

			// Now try to complete phase 1 again - checkpoint will fail because phase-1-complete already exists
			// This tests that checkpoint failure doesn't block phase completion
			const result = await phase_complete.execute({ phase: 1, sessionID: sessionId });
			const parsed = JSON.parse(result);

			// Assert: Phase should complete successfully even though checkpoint fails (duplicate label)
			expect(parsed.success).toBe(true);
			expect(parsed.phase).toBe(1);
			expect(parsed.status).toBe('success');
		});

		test('Label format: phase-N-complete for different phase numbers', async () => {
			// Test multiple phase numbers to verify format consistency
			const phases = [1, 2, 5, 10, 100];

			for (const phaseNum of phases) {
				// Reset state for each iteration
				resetSwarmState();
				const sessionId = `test-session-${phaseNum}`;
				ensureAgentSession(sessionId);

				// Create valid retro bundle
				writeRetroBundle(phaseNum, 'pass');

				// Act
				const result = await phase_complete.execute({ phase: phaseNum, sessionID: sessionId });
				const parsed = JSON.parse(result);

				// Assert: Checkpoint label should follow the format
				const checkpointLogPath = path.join(tempDir, '.swarm', 'checkpoints.json');
				const checkpointLog = JSON.parse(fs.readFileSync(checkpointLogPath, 'utf-8'));

				// Get the last checkpoint (should be for this phase)
				const lastCheckpoint = checkpointLog.checkpoints[checkpointLog.checkpoints.length - 1];
				expect(lastCheckpoint.label).toBe(`phase-${phaseNum}-complete`);
			}
		});

		test('Non-git directory - checkpoint failure is non-fatal', async () => {
			// Arrange: Create a non-git directory
			const nonGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'non-git-test-'));
			try {
				// Create .swarm directory structure
				fs.mkdirSync(path.join(nonGitDir, '.swarm'), { recursive: true });
				fs.mkdirSync(path.join(nonGitDir, '.swarm', 'evidence'), { recursive: true });

				// Create .opencode directory with config file
				fs.mkdirSync(path.join(nonGitDir, '.opencode'), { recursive: true });
				fs.writeFileSync(
					path.join(nonGitDir, '.opencode', 'opencode-swarm.json'),
					JSON.stringify({
						phase_complete: {
							enabled: true,
							required_agents: [],
							require_docs: false,
							policy: 'warn'
						}
					})
				);

				// Create session and retro bundle
				const sessionId = 'test-session-non-git';
				ensureAgentSession(sessionId);

				// Write retro bundle to nonGitDir
				const retroDir = path.join(nonGitDir, '.swarm', 'evidence', 'retro-1');
				fs.mkdirSync(retroDir, { recursive: true });
				const retroBundle = {
					schema_version: '1.0.0',
					task_id: 'retro-1',
					entries: [
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
					'utf-8',
				);

				// Change to non-git directory
				process.chdir(nonGitDir);

				// Act: Call phase_complete in non-git directory
				const result = await phase_complete.execute({ phase: 1, sessionID: sessionId });
				const parsed = JSON.parse(result);

				// Assert: Phase should complete successfully despite checkpoint failure
				expect(parsed.success).toBe(true);
				expect(parsed.phase).toBe(1);
				expect(parsed.status).toBe('success');
			} finally {
				// Cleanup - change back to original dir first
				process.chdir(originalCwd);
				fs.rmSync(nonGitDir, { recursive: true, force: true });
			}
		});
	});
});
