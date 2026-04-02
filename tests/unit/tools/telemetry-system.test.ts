import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
	addTelemetryListener,
	emit,
	initTelemetry,
	resetTelemetryForTesting,
	type TelemetryEvent,
	telemetry,
} from '../../../src/telemetry';

/**
 * System-level telemetry integration tests.
 * These tests verify the telemetry module's public API as a complete system,
 * including file I/O, event listeners, and data integrity across multiple emit calls.
 */
describe('telemetry system integration', () => {
	let tempDir: string;

	beforeEach(() => {
		// Create fresh temp dir for each test
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'telemetry-system-'));
		// Reset telemetry state for isolation
		resetTelemetryForTesting();
	});

	afterEach(() => {
		// Clean up temp dir
		if (tempDir && fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	describe('1. initTelemetry creates .swarm/telemetry.jsonl', () => {
		test('init creates .swarm directory and telemetry.jsonl after emit', async () => {
			// Initialize telemetry in temp dir (simulates src/index.ts startup)
			initTelemetry(tempDir);

			// Emit an event to trigger file creation
			telemetry.heartbeat('session-init-test');

			// Wait for async write to flush
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Verify .swarm directory exists
			const swarmDir = path.join(tempDir, '.swarm');
			expect(fs.existsSync(swarmDir)).toBe(true);

			// Verify telemetry.jsonl file was created
			const telemetryPath = path.join(swarmDir, 'telemetry.jsonl');
			expect(fs.existsSync(telemetryPath)).toBe(true);

			// Verify file contains the heartbeat event
			const content = fs.readFileSync(telemetryPath, 'utf-8');
			expect(content).toContain('session-init-test');
			expect(content).toContain('heartbeat');
		});

		test('init to nested path creates directories recursively', () => {
			const nestedDir = path.join(tempDir, 'nested', 'project', '.swarm');
			initTelemetry(nestedDir);

			expect(fs.existsSync(nestedDir)).toBe(true);
		});

		test('double init is a no-op - file persists without duplication', async () => {
			initTelemetry(tempDir);
			telemetry.sessionStarted('double-init-session', 'test-agent');
			await new Promise((resolve) => setTimeout(resolve, 100));

			const telemetryPath = path.join(tempDir, '.swarm', 'telemetry.jsonl');
			const contentBefore = fs.readFileSync(telemetryPath, 'utf-8');

			// Call init again - should be no-op
			initTelemetry(tempDir);

			const contentAfter = fs.readFileSync(telemetryPath, 'utf-8');
			expect(contentAfter).toBe(contentBefore);
		});
	});

	describe('2. budgetUpdated fires with correct data', () => {
		test('budgetUpdated emits event with correct sessionId, budgetPct, and agentName', () => {
			initTelemetry(tempDir);

			const receivedEvents: Array<{
				event: TelemetryEvent;
				data: Record<string, unknown>;
			}> = [];
			addTelemetryListener((event, data) => {
				receivedEvents.push({ event, data });
			});

			const sessionId = 'budget-session-123';
			const budgetPct = 75;
			const agentName = 'mega_coder';

			telemetry.budgetUpdated(sessionId, budgetPct, agentName);

			// Verify event was received by listener
			const budgetEvent = receivedEvents.find(
				(e) => e.event === 'budget_updated' && e.data.sessionId === sessionId,
			);
			expect(budgetEvent).toBeDefined();
			expect(budgetEvent!.data.sessionId).toBe(sessionId);
			expect(budgetEvent!.data.budgetPct).toBe(budgetPct);
			expect(budgetEvent!.data.agentName).toBe(agentName);
		});

		test('budgetUpdated at 50% emits correct percentage value', () => {
			initTelemetry(tempDir);

			const receivedData: Record<string, unknown>[] = [];
			addTelemetryListener((_, data) => receivedData.push(data));

			telemetry.budgetUpdated('session-50pct', 50, 'critic_agent');

			const ourData = receivedData.find((d) => d.sessionId === 'session-50pct');
			expect(ourData).toBeDefined();
			expect(ourData!.budgetPct).toBe(50);
			expect(ourData!.agentName).toBe('critic_agent');
		});

		test('budgetUpdated at 100% (critical) emits correct percentage', () => {
			initTelemetry(tempDir);

			const receivedData: Record<string, unknown>[] = [];
			addTelemetryListener((_, data) => receivedData.push(data));

			telemetry.budgetUpdated('session-critical', 100, 'mega_coder');

			const ourData = receivedData.find(
				(d) => d.sessionId === 'session-critical',
			);
			expect(ourData).toBeDefined();
			expect(ourData!.budgetPct).toBe(100);
		});
	});

	describe('3. Heartbeat at 30s intervals (system-level throttle behavior)', () => {
		test('heartbeat emits event with sessionId', () => {
			initTelemetry(tempDir);

			const receivedEvents: string[] = [];
			addTelemetryListener((event) => receivedEvents.push(event));

			telemetry.heartbeat('heartbeat-session-abc');

			// Verify heartbeat event was emitted
			const heartbeatEvents = receivedEvents.filter((e) => e === 'heartbeat');
			expect(heartbeatEvents.length).toBeGreaterThanOrEqual(1);
		});

		test('multiple heartbeat calls emit multiple events', () => {
			initTelemetry(tempDir);

			const receivedData: Record<string, unknown>[] = [];
			addTelemetryListener((_, data) => receivedData.push(data));

			// Simulate rapid heartbeat calls (like a tight loop calling heartbeat)
			telemetry.heartbeat('rapid-session');
			telemetry.heartbeat('rapid-session');
			telemetry.heartbeat('rapid-session');

			const heartbeatEvents = receivedData.filter(
				(d) => d.sessionId === 'rapid-session',
			);
			// Note: The actual 30s throttle is in src/index.ts, not telemetry.ts
			// telemetry.ts just emits - the throttle is a consumer concern
			expect(heartbeatEvents.length).toBe(3);
		});

		test('heartbeat event data structure is correct', async () => {
			initTelemetry(tempDir);
			const sessionId = 'heartbeat-struct-test';

			telemetry.heartbeat(sessionId);
			await new Promise((resolve) => setTimeout(resolve, 100));

			const telemetryPath = path.join(tempDir, '.swarm', 'telemetry.jsonl');
			const content = fs.readFileSync(telemetryPath, 'utf-8');
			const lines = content.trim().split('\n').filter(Boolean);

			const heartbeatLine = lines.find((l) => l.includes(sessionId));
			expect(heartbeatLine).toBeDefined();

			const parsed = JSON.parse(heartbeatLine!);
			expect(parsed.event).toBe('heartbeat');
			expect(parsed.sessionId).toBe(sessionId);
			expect(parsed.timestamp).toBeDefined();
			expect(typeof parsed.timestamp).toBe('string');
			// Verify ISO timestamp format
			expect(new Date(parsed.timestamp).toISOString()).toBe(parsed.timestamp);
		});

		test('heartbeat does not throw even with empty sessionId', () => {
			initTelemetry(tempDir);

			expect(() => {
				telemetry.heartbeat('');
			}).not.toThrow();
		});
	});

	describe('4. phaseChanged fires with correct data', () => {
		test('phaseChanged emits event with sessionId, oldPhase, and newPhase', () => {
			initTelemetry(tempDir);

			const receivedEvents: Array<{
				event: TelemetryEvent;
				data: Record<string, unknown>;
			}> = [];
			addTelemetryListener((event, data) => {
				receivedEvents.push({ event, data });
			});

			const sessionId = 'phase-session-456';
			const oldPhase = 1;
			const newPhase = 2;

			telemetry.phaseChanged(sessionId, oldPhase, newPhase);

			// Verify event was received
			const phaseEvent = receivedEvents.find(
				(e) => e.event === 'phase_changed' && e.data.sessionId === sessionId,
			);
			expect(phaseEvent).toBeDefined();
			expect(phaseEvent!.data.sessionId).toBe(sessionId);
			expect(phaseEvent!.data.oldPhase).toBe(oldPhase);
			expect(phaseEvent!.data.newPhase).toBe(newPhase);
		});

		test('phaseChanged from phase 2 to phase 3 emits correct values', () => {
			initTelemetry(tempDir);

			const receivedData: Record<string, unknown>[] = [];
			addTelemetryListener((_, data) => receivedData.push(data));

			telemetry.phaseChanged('session-phase-2-3', 2, 3);

			const ourData = receivedData.find(
				(d) => d.sessionId === 'session-phase-2-3',
			);
			expect(ourData).toBeDefined();
			expect(ourData!.oldPhase).toBe(2);
			expect(ourData!.newPhase).toBe(3);
		});

		test('phaseChanged with phase transition to 0 emits correct value', () => {
			initTelemetry(tempDir);

			const receivedData: Record<string, unknown>[] = [];
			addTelemetryListener((_, data) => receivedData.push(data));

			telemetry.phaseChanged('session-phase-reset', 1, 0);

			const ourData = receivedData.find(
				(d) => d.sessionId === 'session-phase-reset',
			);
			expect(ourData).toBeDefined();
			expect(ourData!.oldPhase).toBe(1);
			expect(ourData!.newPhase).toBe(0);
		});

		test('phaseChanged persists to file correctly', async () => {
			initTelemetry(tempDir);

			telemetry.phaseChanged('session-file-test', 1, 2);
			await new Promise((resolve) => setTimeout(resolve, 100));

			const telemetryPath = path.join(tempDir, '.swarm', 'telemetry.jsonl');
			const content = fs.readFileSync(telemetryPath, 'utf-8');
			const lines = content.trim().split('\n').filter(Boolean);

			const phaseLine = lines.find((l) => l.includes('session-file-test'));
			expect(phaseLine).toBeDefined();

			const parsed = JSON.parse(phaseLine!);
			expect(parsed.event).toBe('phase_changed');
			expect(parsed.oldPhase).toBe(1);
			expect(parsed.newPhase).toBe(2);
		});
	});

	describe('5. Valid JSONL after init+emit (end-to-end data integrity)', () => {
		test('multiple events produce valid JSONL with one JSON object per line', async () => {
			initTelemetry(tempDir);

			// Emit multiple different event types
			telemetry.sessionStarted('multi-event-session', 'test-agent');
			telemetry.phaseChanged('multi-event-session', 1, 2);
			telemetry.budgetUpdated('multi-event-session', 50, 'test-agent');
			telemetry.heartbeat('multi-event-session');

			await new Promise((resolve) => setTimeout(resolve, 100));

			const telemetryPath = path.join(tempDir, '.swarm', 'telemetry.jsonl');
			const content = fs.readFileSync(telemetryPath, 'utf-8');
			const lines = content.trim().split('\n').filter(Boolean);

			expect(lines.length).toBeGreaterThanOrEqual(4);

			// Each line should be valid JSON
			for (const line of lines) {
				expect(() => JSON.parse(line)).not.toThrow();
			}

			// Each parsed object should have required fields
			for (const line of lines) {
				const parsed = JSON.parse(line);
				expect(parsed.timestamp).toBeDefined();
				expect(parsed.event).toBeDefined();
			}
		});

		test('JSONL entries have correct structure (timestamp, event, data fields)', async () => {
			initTelemetry(tempDir);

			telemetry.sessionStarted('struct-verify-session', 'agent-x');

			await new Promise((resolve) => setTimeout(resolve, 100));

			const telemetryPath = path.join(tempDir, '.swarm', 'telemetry.jsonl');
			const content = fs.readFileSync(telemetryPath, 'utf-8');
			const lines = content.trim().split('\n').filter(Boolean);

			const ourLine = lines.find((l) => l.includes('struct-verify-session'));
			const parsed = JSON.parse(ourLine!);

			// Verify top-level structure
			expect(parsed.timestamp).toBeDefined();
			expect(parsed.event).toBe('session_started');
			expect(parsed.sessionId).toBe('struct-verify-session');
			expect(parsed.agentName).toBe('agent-x');
		});

		test('all 17 telemetry convenience methods emit valid events', () => {
			initTelemetry(tempDir);

			const receivedEvents: string[] = [];
			addTelemetryListener((event) => receivedEvents.push(event));

			// Call all 17 telemetry convenience methods
			telemetry.sessionStarted('s-all', 'agent');
			telemetry.sessionEnded('s-all', 'completed');
			telemetry.agentActivated('s-all', 'new-agent');
			telemetry.delegationBegin('s-all', 'agent', 'task-1');
			telemetry.delegationEnd('s-all', 'agent', 'task-1', 'success');
			telemetry.taskStateChanged('s-all', 'task-1', 'completed');
			telemetry.gatePassed('s-all', 'gate-1', 'task-1');
			telemetry.gateFailed('s-all', 'gate-1', 'task-1', 'reason');
			telemetry.phaseChanged('s-all', 1, 2);
			telemetry.budgetUpdated('s-all', 50, 'agent');
			telemetry.modelFallback('s-all', 'agent', 'gpt-4', 'gpt-3.5', 'cost');
			telemetry.hardLimitHit('s-all', 'agent', 'tokens', 100);
			telemetry.revisionLimitHit('s-all', 'agent');
			telemetry.loopDetected('s-all', 'agent', 'infinite');
			telemetry.scopeViolation('s-all', 'agent', 'file.ts', 'reason');
			telemetry.qaSkipViolation('s-all', 'agent', 3);
			telemetry.heartbeat('s-all');

			// All 17 event types should be present
			expect(receivedEvents.length).toBeGreaterThanOrEqual(17);

			const expectedEvents = [
				'session_started',
				'session_ended',
				'agent_activated',
				'delegation_begin',
				'delegation_end',
				'task_state_changed',
				'gate_passed',
				'gate_failed',
				'phase_changed',
				'budget_updated',
				'model_fallback',
				'hard_limit_hit',
				'revision_limit_hit',
				'loop_detected',
				'scope_violation',
				'qa_skip_violation',
				'heartbeat',
			];

			for (const expectedEvent of expectedEvents) {
				const found = receivedEvents.filter((e) => e === expectedEvent);
				expect(found.length).toBeGreaterThanOrEqual(1);
			}
		});

		test('JSONL timestamp is valid ISO 8601 format', async () => {
			initTelemetry(tempDir);

			telemetry.sessionStarted('timestamp-iso-test', 'agent');

			await new Promise((resolve) => setTimeout(resolve, 100));

			const telemetryPath = path.join(tempDir, '.swarm', 'telemetry.jsonl');
			const content = fs.readFileSync(telemetryPath, 'utf-8');
			const lines = content.trim().split('\n').filter(Boolean);

			const ourLine = lines.find((l) => l.includes('timestamp-iso-test'));
			const parsed = JSON.parse(ourLine!);

			// Should be valid ISO 8601
			const date = new Date(parsed.timestamp);
			expect(date.toISOString()).toBe(parsed.timestamp);
		});

		test('large payload (10KB string) is handled correctly', async () => {
			initTelemetry(tempDir);

			// Create a large payload to test buffer handling
			const largeData = 'x'.repeat(10 * 1024);

			// Use agentActivated which accepts oldName for large data test
			telemetry.agentActivated('large-payload-session', 'agent', largeData);

			await new Promise((resolve) => setTimeout(resolve, 100));

			const telemetryPath = path.join(tempDir, '.swarm', 'telemetry.jsonl');
			const content = fs.readFileSync(telemetryPath, 'utf-8');
			const lines = content.trim().split('\n').filter(Boolean);

			const ourLine = lines.find((l) => l.includes('large-payload-session'));
			expect(ourLine).toBeDefined();

			const parsed = JSON.parse(ourLine!);
			expect(parsed.agentName).toBe('agent');
			// The oldName field would contain the large string
			expect(parsed.oldName).toBe(largeData);
		});
	});

	describe('system-level wiring scenarios', () => {
		test('complete wiring: init -> budgetUpdated -> phaseChanged -> heartbeat produces valid JSONL', async () => {
			// Simulate the wiring from src/index.ts, src/hooks/system-enhancer.ts, src/tools/phase-complete.ts
			// Step 1: Initialize telemetry (like src/index.ts startup)
			initTelemetry(tempDir);

			// Step 2: budgetUpdated from system-enhancer (at 50% budget)
			telemetry.budgetUpdated('wired-session', 50, 'mega_coder');

			// Step 3: phaseChanged from phase-complete
			telemetry.phaseChanged('wired-session', 1, 2);

			// Step 4: heartbeat from system-enhancer
			telemetry.heartbeat('wired-session');

			await new Promise((resolve) => setTimeout(resolve, 100));

			// Verify all events are in the JSONL file
			const telemetryPath = path.join(tempDir, '.swarm', 'telemetry.jsonl');
			const content = fs.readFileSync(telemetryPath, 'utf-8');
			const lines = content.trim().split('\n').filter(Boolean);

			// 3 events: budgetUpdated, phaseChanged, heartbeat
			expect(lines.length).toBeGreaterThanOrEqual(3);

			// Verify each event type is present
			const events = lines.map((l) => JSON.parse(l).event);
			expect(events).toContain('budget_updated');
			expect(events).toContain('phase_changed');
			expect(events).toContain('heartbeat');
		});

		test('listener receives events in correct order', () => {
			initTelemetry(tempDir);

			const receivedEvents: Array<{
				event: TelemetryEvent;
				data: Record<string, unknown>;
			}> = [];
			addTelemetryListener((event, data) => {
				receivedEvents.push({ event, data });
			});

			telemetry.sessionStarted('order-session', 'agent');
			telemetry.phaseChanged('order-session', 1, 2);
			telemetry.budgetUpdated('order-session', 75, 'agent');
			telemetry.heartbeat('order-session');

			// Find our events
			const ourEvents = receivedEvents.filter(
				(e) => e.data.sessionId === 'order-session',
			);

			expect(ourEvents[0].event).toBe('session_started');
			expect(ourEvents[1].event).toBe('phase_changed');
			expect(ourEvents[2].event).toBe('budget_updated');
			expect(ourEvents[3].event).toBe('heartbeat');
		});

		test('emit before init does not crash (graceful degradation)', () => {
			// This tests the case where emit is called before initTelemetry
			// In the real system, this shouldn't happen, but telemetry handles it gracefully

			// We reset in beforeEach, so no init yet
			expect(() => {
				emit('session_started', {
					sessionId: 'pre-init-test',
					agentName: 'agent',
				});
			}).not.toThrow();
		});
	});
});
