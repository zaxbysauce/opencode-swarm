import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { resetSwarmState, ensureAgentSession, recordPhaseAgentDispatch, swarmState } from '../../../src/state';

// Import the tool after setting up environment
const { phase_complete } = await import('../../../src/tools/phase-complete');

describe('phase_complete tool', () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		// Reset state before each test
		resetSwarmState();
		
		// Create temp directory
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-complete-test-'));
		originalCwd = process.cwd();
		process.chdir(tempDir);
		
		// Create .swarm directory for event file tests
		fs.mkdirSync(path.join(tempDir, '.swarm'), { recursive: true });
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

	describe('argument validation', () => {
		test('returns error for invalid phase (NaN)', async () => {
			ensureAgentSession('sess1');
			const result = await phase_complete.execute({ phase: NaN, sessionID: 'sess1' });
			const parsed = JSON.parse(result);
			
			expect(parsed.success).toBe(false);
			expect(parsed.message).toBe('Invalid phase number');
			expect(parsed.warnings).toContain('Phase must be a positive number');
		});

		test('returns error for invalid phase (0)', async () => {
			ensureAgentSession('sess1');
			const result = await phase_complete.execute({ phase: 0, sessionID: 'sess1' });
			const parsed = JSON.parse(result);
			
			expect(parsed.success).toBe(false);
			expect(parsed.message).toBe('Invalid phase number');
		});

		test('returns error for invalid phase (negative)', async () => {
			ensureAgentSession('sess1');
			const result = await phase_complete.execute({ phase: -1, sessionID: 'sess1' });
			const parsed = JSON.parse(result);
			
			expect(parsed.success).toBe(false);
			expect(parsed.message).toBe('Invalid phase number');
		});

		test('returns error when sessionID is missing', async () => {
			const result = await phase_complete.execute({ phase: 1 });
			const parsed = JSON.parse(result);
			
			expect(parsed.success).toBe(false);
			expect(parsed.message).toBe('Session ID is required');
		});
	});

	describe('enforcement disabled', () => {
		test('returns success with disabled status when enabled=false in config', async () => {
			// Create custom config with enabled: false
			fs.mkdirSync(path.join(tempDir, '.opencode'), { recursive: true });
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				JSON.stringify({
					phase_complete: {
						enabled: false,
						required_agents: ['coder'],
						require_docs: false,
						policy: 'enforce'
					}
				})
			);
			
			ensureAgentSession('sess1');
			recordPhaseAgentDispatch('sess1', 'coder');
			
			const result = await phase_complete.execute({ phase: 1, sessionID: 'sess1' });
			const parsed = JSON.parse(result);
			
			expect(parsed.success).toBe(true);
			expect(parsed.status).toBe('disabled');
			expect(parsed.message).toContain('enforcement disabled');
		});
	});

	describe('enforce mode with missing agents', () => {
		test('returns incomplete status when required agents missing in enforce mode', async () => {
			// Use default config which has required_agents: ['coder', 'reviewer', 'test_engineer']
			// and require_docs: true, policy: 'enforce'
			ensureAgentSession('sess1');
			// Only dispatch coder, missing reviewer, test_engineer, docs
			
			const result = await phase_complete.execute({ phase: 1, sessionID: 'sess1' });
			const parsed = JSON.parse(result);
			
			expect(parsed.success).toBe(false);
			expect(parsed.status).toBe('incomplete');
			expect(parsed.message).toContain('missing required agents');
			expect(parsed.agentsMissing).toContain('coder');
			expect(parsed.agentsMissing).toContain('reviewer');
			expect(parsed.agentsMissing).toContain('test_engineer');
			expect(parsed.agentsMissing).toContain('docs');
		});

		test('returns success when all required agents present in enforce mode', async () => {
			// Use permissive config for this test
			fs.mkdirSync(path.join(tempDir, '.opencode'), { recursive: true });
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				JSON.stringify({phase_complete: {
							enabled: true,
							required_agents: [],
							require_docs: false,
							policy: 'enforce'
						}})
			);
			
			ensureAgentSession('sess1');
			// No agents needed for empty required_agents
			
			const result = await phase_complete.execute({ phase: 1, sessionID: 'sess1' });
			const parsed = JSON.parse(result);
			
			expect(parsed.success).toBe(true);
			expect(parsed.status).toBe('success');
		});
	});

	describe('warn mode with missing agents', () => {
		test('returns warned status when required agents missing in warn mode', async () => {
			// Create config with warn policy
			fs.mkdirSync(path.join(tempDir, '.opencode'), { recursive: true });
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				JSON.stringify({
					phase_complete: {
						enabled: true,
						required_agents: ['coder'],
						require_docs: false,
						policy: 'warn'
					}
				})
			);
			
			ensureAgentSession('sess1');
			// Don't dispatch coder - will be warned but succeed
			
			const result = await phase_complete.execute({ phase: 1, sessionID: 'sess1' });
			const parsed = JSON.parse(result);
			
			expect(parsed.success).toBe(true);
			expect(parsed.status).toBe('warned');
			expect(parsed.warnings.length).toBeGreaterThan(0);
			expect(parsed.warnings[0]).toContain('missing required agents');
			expect(parsed.warnings[0]).toContain('coder');
		});
	});

	describe('custom required_agents', () => {
		test('only requires specified agents', async () => {
			fs.mkdirSync(path.join(tempDir, '.opencode'), { recursive: true });
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				JSON.stringify({phase_complete: {
							enabled: true,
							required_agents: ['coder'],
							require_docs: false,
							policy: 'enforce'
						}})
			);
			
			ensureAgentSession('sess1');
			recordPhaseAgentDispatch('sess1', 'coder');
			
			const result = await phase_complete.execute({ phase: 1, sessionID: 'sess1' });
			const parsed = JSON.parse(result);
			
			expect(parsed.success).toBe(true);
			expect(parsed.status).toBe('success');
			expect(parsed.agentsMissing).toEqual([]);
		});

		test('fails when custom required agent is missing', async () => {
			fs.mkdirSync(path.join(tempDir, '.opencode'), { recursive: true });
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				JSON.stringify({phase_complete: {
							enabled: true,
							required_agents: ['coder', 'reviewer'],
							require_docs: false,
							policy: 'enforce'
						}})
			);
			
			ensureAgentSession('sess1');
			recordPhaseAgentDispatch('sess1', 'coder');
			// Missing reviewer
			
			const result = await phase_complete.execute({ phase: 1, sessionID: 'sess1' });
			const parsed = JSON.parse(result);
			
			expect(parsed.success).toBe(false);
			expect(parsed.status).toBe('incomplete');
			expect(parsed.agentsMissing).toContain('reviewer');
		});
	});

	describe('require_docs behavior', () => {
		test('adds docs to required when require_docs=true', async () => {
			// Default config has require_docs: true
			ensureAgentSession('sess1');
			recordPhaseAgentDispatch('sess1', 'coder');
			recordPhaseAgentDispatch('sess1', 'reviewer');
			recordPhaseAgentDispatch('sess1', 'test_engineer');
			// Missing docs
			
			const result = await phase_complete.execute({ phase: 1, sessionID: 'sess1' });
			const parsed = JSON.parse(result);
			
			expect(parsed.success).toBe(false);
			expect(parsed.agentsMissing).toContain('docs');
		});

		test('does not add docs to required when require_docs=false', async () => {
			fs.mkdirSync(path.join(tempDir, '.opencode'), { recursive: true });
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				JSON.stringify({phase_complete: {
							enabled: true,
							required_agents: ['coder'],
							require_docs: false,
							policy: 'enforce'
						}})
			);
			
			ensureAgentSession('sess1');
			recordPhaseAgentDispatch('sess1', 'coder');
			// Missing docs should NOT cause failure
			
			const result = await phase_complete.execute({ phase: 1, sessionID: 'sess1' });
			const parsed = JSON.parse(result);
			
			expect(parsed.success).toBe(true);
			expect(parsed.agentsMissing).not.toContain('docs');
		});
	});

	describe('state reset on success', () => {
		test('resets phaseAgentsDispatched on successful completion', async () => {
			fs.mkdirSync(path.join(tempDir, '.opencode'), { recursive: true });
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				JSON.stringify({phase_complete: {
							enabled: true,
							required_agents: [],
							require_docs: false,
							policy: 'enforce'
						}})
			);
			
			ensureAgentSession('sess1');
			recordPhaseAgentDispatch('sess1', 'coder');
			recordPhaseAgentDispatch('sess1', 'reviewer');
			
			// Verify state before
			const sessionBefore = swarmState.agentSessions.get('sess1');
			expect(sessionBefore?.phaseAgentsDispatched.size).toBe(2);
			
			const result = await phase_complete.execute({ phase: 1, sessionID: 'sess1' });
			const parsed = JSON.parse(result);
			
			expect(parsed.success).toBe(true);
			
			// Verify state reset
			const sessionAfter = swarmState.agentSessions.get('sess1');
			expect(sessionAfter?.phaseAgentsDispatched.size).toBe(0);
		});

		test('sets lastPhaseCompleteTimestamp and lastPhaseCompletePhase on success', async () => {
			fs.mkdirSync(path.join(tempDir, '.opencode'), { recursive: true });
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				JSON.stringify({phase_complete: {
							enabled: true,
							required_agents: [],
							require_docs: false,
							policy: 'enforce'
						}})
			);
			
			ensureAgentSession('sess1');
			const beforeTime = Date.now();
			
			const result = await phase_complete.execute({ phase: 1, sessionID: 'sess1' });
			const parsed = JSON.parse(result);
			const afterTime = Date.now();
			
			expect(parsed.success).toBe(true);
			
			const session = swarmState.agentSessions.get('sess1');
			expect(session?.lastPhaseCompleteTimestamp).toBeGreaterThanOrEqual(beforeTime);
			expect(session?.lastPhaseCompleteTimestamp).toBeLessThanOrEqual(afterTime);
			expect(session?.lastPhaseCompletePhase).toBe(1);
		});

		test('does NOT reset state on failure', async () => {
			// Default config with enforce will fail with no agents
			ensureAgentSession('sess1');
			recordPhaseAgentDispatch('sess1', 'coder');
			recordPhaseAgentDispatch('sess1', 'reviewer');
			
			const result = await phase_complete.execute({ phase: 1, sessionID: 'sess1' });
			const parsed = JSON.parse(result);
			
			expect(parsed.success).toBe(false);
			
			// State should NOT be reset
			const session = swarmState.agentSessions.get('sess1');
			expect(session?.phaseAgentsDispatched.size).toBe(2);
			expect(session?.lastPhaseCompleteTimestamp).toBe(0);
		});
	});

	describe('prefix normalization', () => {
		test('mega_coder counts as coder', async () => {
			fs.mkdirSync(path.join(tempDir, '.opencode'), { recursive: true });
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				JSON.stringify({phase_complete: {
							enabled: true,
							required_agents: ['coder'],
							require_docs: false,
							policy: 'enforce'
						}})
			);
			
			ensureAgentSession('sess1');
			// Use prefixed agent name
			recordPhaseAgentDispatch('sess1', 'mega_coder');
			
			const result = await phase_complete.execute({ phase: 1, sessionID: 'sess1' });
			const parsed = JSON.parse(result);
			
			expect(parsed.success).toBe(true);
			expect(parsed.agentsDispatched).toContain('coder');
		});

		test('local_reviewer counts as reviewer', async () => {
			fs.mkdirSync(path.join(tempDir, '.opencode'), { recursive: true });
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				JSON.stringify({
					phase_complete: {
						enabled: true,
						required_agents: ['coder'],
						require_docs: false,
						policy: 'warn'
					}
				})
			);
			
			ensureAgentSession('sess1');
			recordPhaseAgentDispatch('sess1', 'local_reviewer');
			
			const result = await phase_complete.execute({ phase: 1, sessionID: 'sess1' });
			const parsed = JSON.parse(result);
			
			expect(parsed.success).toBe(true);
			expect(parsed.agentsDispatched).toContain('reviewer');
		});

		test('prefix normalization works with delegation chains', async () => {
			fs.mkdirSync(path.join(tempDir, '.opencode'), { recursive: true });
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				JSON.stringify({phase_complete: {
							enabled: true,
							required_agents: ['coder', 'reviewer'],
							require_docs: false,
							policy: 'enforce'
						}})
			);
			
			ensureAgentSession('sess1');
			// Set up delegation chain with prefixed agents
			swarmState.delegationChains.set('sess1', [
				{ from: 'architect', to: 'mega_coder', timestamp: Date.now() - 5000 },
				{ from: 'mega_coder', to: 'local_reviewer', timestamp: Date.now() - 3000 },
			]);
			
			const result = await phase_complete.execute({ phase: 1, sessionID: 'sess1' });
			const parsed = JSON.parse(result);
			
			expect(parsed.success).toBe(true);
			expect(parsed.agentsDispatched).toContain('coder');
			expect(parsed.agentsDispatched).toContain('reviewer');
		});
	});

	describe('summary truncation', () => {
		test('truncates summary to 500 characters', async () => {
			fs.mkdirSync(path.join(tempDir, '.opencode'), { recursive: true });
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				JSON.stringify({phase_complete: {
							enabled: true,
							required_agents: [],
							require_docs: false,
							policy: 'enforce'
						}})
			);
			
			ensureAgentSession('sess1');
			
			// Create a summary longer than 500 characters
			const longSummary = 'A'.repeat(600);
			
			const result = await phase_complete.execute({ phase: 1, sessionID: 'sess1', summary: longSummary });
			const parsed = JSON.parse(result);
			
			expect(parsed.message.length).toBeLessThanOrEqual(500 + 'Phase 1 completed: '.length);
		});

		test('summary is included in message when provided', async () => {
			fs.mkdirSync(path.join(tempDir, '.opencode'), { recursive: true });
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				JSON.stringify({phase_complete: {
							enabled: true,
							required_agents: [],
							require_docs: false,
							policy: 'enforce'
						}})
			);
			
			ensureAgentSession('sess1');
			
			const result = await phase_complete.execute({ phase: 1, sessionID: 'sess1', summary: 'Test summary' });
			const parsed = JSON.parse(result);
			
			expect(parsed.message).toContain('Test summary');
		});
	});

	describe('event file writing', () => {
		test('writes event to .swarm/events.jsonl', async () => {
			fs.mkdirSync(path.join(tempDir, '.opencode'), { recursive: true });
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				JSON.stringify({phase_complete: {
							enabled: true,
							required_agents: [],
							require_docs: false,
							policy: 'enforce'
						}})
			);
			
			ensureAgentSession('sess1');
			
			const result = await phase_complete.execute({ phase: 1, sessionID: 'sess1', summary: 'Test phase' });
			const parsed = JSON.parse(result);
			
			expect(parsed.success).toBe(true);
			
			const eventsPath = path.join(tempDir, '.swarm', 'events.jsonl');
			expect(fs.existsSync(eventsPath)).toBe(true);
			
			const eventContent = fs.readFileSync(eventsPath, 'utf-8');
			const event = JSON.parse(eventContent.trim());
			
			expect(event.event).toBe('phase_complete');
			expect(event.phase).toBe(1);
			expect(event.status).toBe('success');
			expect(event.summary).toBe('Test phase');
			expect(event.agents_dispatched).toEqual([]);
			expect(event.agents_missing).toEqual([]);
			expect(event.timestamp).toBeDefined();
		});

		test('adds warning when event file write fails', async () => {
			// Don't create .swarm directory to cause write failure
			// (we already created it in beforeEach, so remove it)
			fs.rmSync(path.join(tempDir, '.swarm'), { recursive: true });
			
			fs.mkdirSync(path.join(tempDir, '.opencode'), { recursive: true });
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				JSON.stringify({phase_complete: {
							enabled: true,
							required_agents: [],
							require_docs: false,
							policy: 'enforce'
						}})
			);
			
			ensureAgentSession('sess1');
			
			// This should NOT crash - just add a warning
			const result = await phase_complete.execute({ phase: 1, sessionID: 'sess1' });
			const parsed = JSON.parse(result);
			
			expect(parsed.success).toBe(true);
			expect(parsed.warnings.length).toBeGreaterThan(0);
			expect(parsed.warnings[0]).toContain('failed to write phase complete event');
		});
	});

	describe('empty delegation chain', () => {
		test('handles session with no agents dispatched', async () => {
			fs.mkdirSync(path.join(tempDir, '.opencode'), { recursive: true });
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				JSON.stringify({phase_complete: {
							enabled: true,
							required_agents: [],
							require_docs: false,
							policy: 'enforce'
						}})
			);
			
			ensureAgentSession('sess1');
			// No agents recorded
			
			const result = await phase_complete.execute({ phase: 1, sessionID: 'sess1' });
			const parsed = JSON.parse(result);
			
			expect(parsed.success).toBe(true);
			expect(parsed.agentsDispatched).toEqual([]);
		});
	});

	describe('sequential phase_complete calls', () => {
		test('second call only sees agents since last completion', async () => {
			fs.mkdirSync(path.join(tempDir, '.opencode'), { recursive: true });
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				JSON.stringify({phase_complete: {
							enabled: true,
							required_agents: ['coder'],
							require_docs: false,
							policy: 'enforce'
						}})
			);
			
			ensureAgentSession('sess1');
			
			// First completion - record coder
			recordPhaseAgentDispatch('sess1', 'coder');
			
			const result1 = await phase_complete.execute({ phase: 1, sessionID: 'sess1' });
			const parsed1 = JSON.parse(result1);
			expect(parsed1.success).toBe(true);
			
			// After success, state is reset, so add new agents for phase 2
			recordPhaseAgentDispatch('sess1', 'coder');
			
			const result2 = await phase_complete.execute({ phase: 2, sessionID: 'sess1' });
			const parsed2 = JSON.parse(result2);
			expect(parsed2.success).toBe(true);
		});

		test('phase scoping reset - different phases maintain separate state', async () => {
			fs.mkdirSync(path.join(tempDir, '.opencode'), { recursive: true });
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				JSON.stringify({phase_complete: {
							enabled: true,
							required_agents: [],
							require_docs: false,
							policy: 'enforce'
						}})
			);
			
			ensureAgentSession('sess1');
			
			// Complete phase 1
			const result1 = await phase_complete.execute({ phase: 1, sessionID: 'sess1' });
			const parsed1 = JSON.parse(result1);
			expect(parsed1.success).toBe(true);
			expect(parsed1.phase).toBe(1);
			
			// Verify phase tracking
			const session = swarmState.agentSessions.get('sess1');
			expect(session?.lastPhaseCompletePhase).toBe(1);
			
			// Complete phase 2
			const result2 = await phase_complete.execute({ phase: 2, sessionID: 'sess1' });
			const parsed2 = JSON.parse(result2);
			expect(parsed2.success).toBe(true);
			expect(parsed2.phase).toBe(2);
			
			// Phase should be updated
			expect(session?.lastPhaseCompletePhase).toBe(2);
		});
	});

	describe('delegation chains integration', () => {
		test('uses both delegation chains and phaseAgentsDispatched', async () => {
			fs.mkdirSync(path.join(tempDir, '.opencode'), { recursive: true });
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				JSON.stringify({phase_complete: {
							enabled: true,
							required_agents: ['coder', 'reviewer'],
							require_docs: false,
							policy: 'enforce'
						}})
			);
			
			ensureAgentSession('sess1');
			
			// Set up delegation chain for coder
			swarmState.delegationChains.set('sess1', [
				{ from: 'architect', to: 'coder', timestamp: Date.now() - 5000 },
			]);
			
			// Add reviewer via phaseAgentsDispatched
			recordPhaseAgentDispatch('sess1', 'reviewer');
			
			const result = await phase_complete.execute({ phase: 1, sessionID: 'sess1' });
			const parsed = JSON.parse(result);
			
			expect(parsed.success).toBe(true);
			expect(parsed.agentsDispatched).toContain('coder');
			expect(parsed.agentsDispatched).toContain('reviewer');
		});
	});

	describe('timestamp and duration', () => {
		test('includes timestamp in result', async () => {
			fs.mkdirSync(path.join(tempDir, '.opencode'), { recursive: true });
			fs.writeFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				JSON.stringify({phase_complete: {
							enabled: true,
							required_agents: [],
							require_docs: false,
							policy: 'enforce'
						}})
			);
			
			ensureAgentSession('sess1');
			
			const result = await phase_complete.execute({ phase: 1, sessionID: 'sess1' });
			const parsed = JSON.parse(result);
			
			expect(parsed.timestamp).toBeDefined();
			expect(parsed.duration_ms).toBeDefined();
		});
	});
});
