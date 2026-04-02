import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
	initTelemetry,
	resetTelemetryForTesting,
	telemetry,
} from '../../../src/telemetry';

describe('telemetry init and heartbeat (Task 3.9)', () => {
	let tempDir: string;

	beforeEach(() => {
		// Create fresh temp dir for each test
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'telemetry-init-test-'));
		// Reset telemetry state for isolation
		resetTelemetryForTesting();
	});

	afterEach(() => {
		// Clean up temp dir
		if (tempDir && fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	describe('initTelemetry', () => {
		test('creates .swarm directory when initialized with valid path', () => {
			initTelemetry(tempDir);

			const swarmDir = path.join(tempDir, '.swarm');
			expect(fs.existsSync(swarmDir)).toBe(true);
		});

		test('creates telemetry.jsonl file inside .swarm directory after emit', async () => {
			initTelemetry(tempDir);

			// File is created lazily when emit() writes data
			telemetry.heartbeat('init-file-test');
			await new Promise((resolve) => setTimeout(resolve, 100));

			const telemetryPath = path.join(tempDir, '.swarm', 'telemetry.jsonl');
			expect(fs.existsSync(telemetryPath)).toBe(true);
		});

		test('double init is a no-op (does not crash, file persists)', async () => {
			initTelemetry(tempDir);
			telemetry.heartbeat('double-init-test');
			await new Promise((resolve) => setTimeout(resolve, 100));

			const swarmDir = path.join(tempDir, '.swarm');
			const telemetryPath = path.join(swarmDir, 'telemetry.jsonl');

			// Get file content before second init
			const contentBefore = fs.existsSync(telemetryPath)
				? fs.readFileSync(telemetryPath, 'utf-8')
				: '';

			// Second init should be no-op
			initTelemetry(tempDir);

			// Content should be unchanged
			const contentAfter = fs.existsSync(telemetryPath)
				? fs.readFileSync(telemetryPath, 'utf-8')
				: '';
			expect(contentAfter).toBe(contentBefore);
		});

		test('init to non-existent nested path creates directories recursively', () => {
			const nestedPath = path.join(tempDir, 'nested', 'path', '.swarm');
			initTelemetry(nestedPath);

			expect(fs.existsSync(nestedPath)).toBe(true);
		});
	});

	describe('telemetry.heartbeat', () => {
		test('heartbeat emits event with sessionId', async () => {
			initTelemetry(tempDir);

			telemetry.heartbeat('session-abc-123');

			// Wait for async write to flush
			await new Promise((resolve) => setTimeout(resolve, 100));

			const telemetryPath = path.join(tempDir, '.swarm', 'telemetry.jsonl');
			const content = fs.readFileSync(telemetryPath, 'utf-8');
			const lines = content.trim().split('\n').filter(Boolean);

			// Find the heartbeat line
			const heartbeatLine = lines.find((l) =>
				l.includes('"event":"heartbeat"'),
			);
			expect(heartbeatLine).toBeDefined();

			const parsed = JSON.parse(heartbeatLine!);
			expect(parsed.event).toBe('heartbeat');
			expect(parsed.sessionId).toBe('session-abc-123');
		});

		test('heartbeat writes valid JSON with timestamp', async () => {
			initTelemetry(tempDir);

			telemetry.heartbeat('session-timestamp-test');

			await new Promise((resolve) => setTimeout(resolve, 100));

			const telemetryPath = path.join(tempDir, '.swarm', 'telemetry.jsonl');
			const content = fs.readFileSync(telemetryPath, 'utf-8');
			const lines = content.trim().split('\n').filter(Boolean);

			const heartbeatLine = lines.find((l) =>
				l.includes('session-timestamp-test'),
			);
			expect(heartbeatLine).toBeDefined();

			// Should parse without error
			const parsed = JSON.parse(heartbeatLine!);
			expect(parsed.timestamp).toBeDefined();
			expect(typeof parsed.timestamp).toBe('string');
			// Should be valid ISO date
			expect(new Date(parsed.timestamp).toISOString()).toBe(parsed.timestamp);
		});

		test('multiple heartbeats for same session emit multiple lines', async () => {
			initTelemetry(tempDir);

			telemetry.heartbeat('session-multi-1');
			telemetry.heartbeat('session-multi-1');
			telemetry.heartbeat('session-multi-1');

			await new Promise((resolve) => setTimeout(resolve, 100));

			const telemetryPath = path.join(tempDir, '.swarm', 'telemetry.jsonl');
			const content = fs.readFileSync(telemetryPath, 'utf-8');
			const lines = content.trim().split('\n').filter(Boolean);

			const heartbeatLines = lines.filter((l) =>
				l.includes('"event":"heartbeat"'),
			);
			expect(heartbeatLines.length).toBeGreaterThanOrEqual(3);
		});

		test('heartbeat does not throw when called', () => {
			initTelemetry(tempDir);

			expect(() => {
				telemetry.heartbeat('session-throw-test');
			}).not.toThrow();
		});

		test('heartbeat with empty sessionId does not crash', () => {
			initTelemetry(tempDir);

			expect(() => {
				telemetry.heartbeat('');
			}).not.toThrow();
		});
	});

	describe('resetTelemetryForTesting', () => {
		test('resets state allowing fresh init to new directory', async () => {
			// Init to first dir and emit to create file
			initTelemetry(tempDir);
			telemetry.heartbeat('before-reset');
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Create second temp dir
			const tempDir2 = fs.realpathSync(
				fs.mkdtempSync(path.join(os.tmpdir(), 'telemetry-init-test2-')),
			);

			// Reset should allow re-init to new dir
			resetTelemetryForTesting();
			initTelemetry(tempDir2);

			// Emit to create the file
			telemetry.heartbeat('after-reset');
			await new Promise((resolve) => setTimeout(resolve, 100));

			const telemetryPath2 = path.join(tempDir2, '.swarm', 'telemetry.jsonl');
			expect(fs.existsSync(telemetryPath2)).toBe(true);

			// Clean up second temp dir
			fs.rmSync(tempDir2, { recursive: true, force: true });
		});

		test('after reset, emit is functional in new init', async () => {
			initTelemetry(tempDir);
			telemetry.heartbeat('before-reset');

			await new Promise((resolve) => setTimeout(resolve, 100));

			resetTelemetryForTesting();
			initTelemetry(tempDir);
			telemetry.heartbeat('after-reset');

			await new Promise((resolve) => setTimeout(resolve, 100));

			const telemetryPath = path.join(tempDir, '.swarm', 'telemetry.jsonl');
			const content = fs.readFileSync(telemetryPath, 'utf-8');
			const lines = content.trim().split('\n').filter(Boolean);

			// Should have events from after reset
			const afterResetLines = lines.filter((l) => l.includes('after-reset'));
			expect(afterResetLines.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe('end-to-end: initTelemetry + heartbeat wiring', () => {
		test('complete flow: reset -> init -> heartbeat produces valid telemetry', async () => {
			// Simulate the wiring from src/index.ts:
			// 1. resetTelemetryForTesting() in beforeEach
			resetTelemetryForTesting();

			// 2. initTelemetry(ctx.directory) - simulating plugin startup after loadSnapshot
			initTelemetry(tempDir);

			// 3. telemetry.heartbeat(sessionID) - simulating what heartbeat handler does
			const sessionId = 'test-session-' + Date.now();
			telemetry.heartbeat(sessionId);

			// Verify the telemetry file exists and contains valid heartbeat event
			await new Promise((resolve) => setTimeout(resolve, 100));

			const telemetryPath = path.join(tempDir, '.swarm', 'telemetry.jsonl');
			expect(fs.existsSync(telemetryPath)).toBe(true);

			const content = fs.readFileSync(telemetryPath, 'utf-8');
			const lines = content.trim().split('\n').filter(Boolean);

			const heartbeatLine = lines.find((l) => l.includes(sessionId));
			expect(heartbeatLine).toBeDefined();

			const parsed = JSON.parse(heartbeatLine!);
			expect(parsed.event).toBe('heartbeat');
			expect(parsed.sessionId).toBe(sessionId);
			expect(parsed.timestamp).toBeDefined();
		});

		test('heartbeat event data structure matches expected shape', async () => {
			initTelemetry(tempDir);

			telemetry.heartbeat('session-shape-test');

			await new Promise((resolve) => setTimeout(resolve, 100));

			const telemetryPath = path.join(tempDir, '.swarm', 'telemetry.jsonl');
			const content = fs.readFileSync(telemetryPath, 'utf-8');
			const lines = content.trim().split('\n').filter(Boolean);

			const heartbeatLine = lines.find((l) => l.includes('session-shape-test'));
			const parsed = JSON.parse(heartbeatLine!);

			// Verify the shape of a heartbeat event
			expect(parsed).toEqual({
				timestamp: expect.stringMatching(
					/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
				),
				event: 'heartbeat',
				sessionId: 'session-shape-test',
			});
		});
	});
});
