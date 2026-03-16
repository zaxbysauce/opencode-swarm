/**
 * Distribution Import Tests
 *
 * Tests that verify EventWriter and getEventWriter are properly exported
 * from the @opencode-swarm/core package for npm distribution.
 *
 * These tests verify:
 * 1. getEventWriter is importable from @opencode-swarm/core barrel
 * 2. EventWriter is importable from @opencode-swarm/core barrel
 * 3. getEventWriter is importable from @opencode-swarm/core/telemetry subpath
 * 4. getEventWriter is a function
 * 5. EventWriter is a class/constructor
 * 6. EventWriter has an emit method and works correctly
 */

import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

// Test 1: Verify getEventWriter is importable from @opencode-swarm/core barrel
const coreExports = await import('@opencode-swarm/core');
const { getEventWriter: getEventWriterFromCore } = coreExports;

// Test 2: Verify EventWriter is importable from @opencode-swarm/core barrel
const { EventWriter: EventWriterFromCore } = coreExports;

// Test 3: Verify getEventWriter is importable from @opencode-swarm/core/telemetry subpath
const telemetryExports = await import('@opencode-swarm/core/telemetry');
const { getEventWriter: getEventWriterFromTelemetry } = telemetryExports;

// Test 4: Verify the imported getEventWriter is a function
function isFunction(fn: unknown): fn is (...args: unknown[]) => unknown {
	return typeof fn === 'function';
}

// Test 5: Verify the imported EventWriter is a class/constructor
function isConstructor(fn: unknown): fn is new (...args: unknown[]) => object {
	return (
		typeof fn === 'function' && typeof fn.prototype?.constructor === 'function'
	);
}

// Test 6: Run a real call - create an EventWriter and verify it has an emit method
const testSessionId = 'test-distribution-imports';
const testSwarmDir = path.join(tmpdir(), `swarm-test-${Date.now()}`);

// Cleanup helper
function cleanupTestDir(dir: string) {
	try {
		if (existsSync(dir)) {
			rmSync(dir, { recursive: true, force: true });
		}
	} catch {
		// Ignore cleanup errors
	}
}

describe('Distribution imports', () => {
	describe('getEventWriter from @opencode-swarm/core barrel', () => {
		test('is importable', () => {
			expect(getEventWriterFromCore).toBeDefined();
		});

		test('is a function', () => {
			expect(isFunction(getEventWriterFromCore)).toBe(true);
		});
	});

	describe('EventWriter from @opencode-swarm/core barrel', () => {
		test('is importable', () => {
			expect(EventWriterFromCore).toBeDefined();
		});

		test('is a class/constructor', () => {
			expect(isConstructor(EventWriterFromCore)).toBe(true);
		});
	});

	describe('getEventWriter from @opencode-swarm/core/telemetry subpath', () => {
		test('is importable', () => {
			expect(getEventWriterFromTelemetry).toBeDefined();
		});

		test('is a function', () => {
			expect(isFunction(getEventWriterFromTelemetry)).toBe(true);
		});

		test('is the same function as from barrel', () => {
			expect(getEventWriterFromTelemetry).toBe(getEventWriterFromCore);
		});
	});

	describe('EventWriter functionality', () => {
		test('can create an EventWriter instance', () => {
			// Ensure test directory exists
			if (!existsSync(testSwarmDir)) {
				mkdirSync(testSwarmDir, { recursive: true });
			}

			const writer = getEventWriterFromCore(testSwarmDir, testSessionId);
			expect(writer).toBeDefined();
			expect(typeof writer.emit).toBe('function');
			expect(writer.session).toBe(testSessionId);
		});

		test('emit writes to file', () => {
			// Use the same writer instance (singleton)
			const writer = getEventWriterFromCore(testSwarmDir, testSessionId);

			const eventFilePath = writer.path;
			expect(existsSync(eventFilePath)).toBe(true);

			// Read the file - it should contain at least the session_metadata event from construction
			const fileContent = readFileSync(eventFilePath, 'utf-8');
			const lines = fileContent.trim().split('\n').filter(Boolean);

			expect(lines.length).toBeGreaterThan(0);

			// Parse and verify first event is session_metadata
			const firstEvent = JSON.parse(lines[0]);
			expect(firstEvent.type).toBe('session_metadata');
			expect(firstEvent.sessionId).toBe(testSessionId);
		});

		test('emit adds new events to file', () => {
			const writer = getEventWriterFromCore(testSwarmDir, testSessionId);

			const eventFilePath = writer.path;
			const fileContentBefore = readFileSync(eventFilePath, 'utf-8');
			const linesBefore = fileContentBefore.trim().split('\n').filter(Boolean);
			const countBefore = linesBefore.length;

			// Emit a custom event
			writer.emit({
				type: 'test_event',
				timestamp: new Date().toISOString(),
				data: 'test-data',
			});

			const fileContentAfter = readFileSync(eventFilePath, 'utf-8');
			const linesAfter = fileContentAfter.trim().split('\n').filter(Boolean);

			// Should have one more line
			expect(linesAfter.length).toBe(countBefore + 1);

			// Last event should be our custom event
			const lastEvent = JSON.parse(linesAfter[linesAfter.length - 1]);
			expect(lastEvent.type).toBe('test_event');
			expect(lastEvent.data).toBe('test-data');
		});

		// Cleanup after all tests in this describe block
		afterAll(() => {
			cleanupTestDir(testSwarmDir);
		});
	});
});
