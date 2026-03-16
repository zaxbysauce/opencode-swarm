import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	_clearEventWriterRegistry,
	EventWriter,
	getEventWriter,
} from './writer';

describe('EventWriter', () => {
	let tempDir: string;

	beforeEach(() => {
		// Create a temporary directory for each test
		tempDir = mkdtempSync(join(tmpdir(), 'event-writer-test-'));
		// Clear the registry before each test
		_clearEventWriterRegistry();
	});

	afterEach(() => {
		// Clean up the temporary directory after each test
		if (existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	describe('constructor', () => {
		it('creates the file and writes session_metadata event', () => {
			const sessionId = 'test-session-001';
			const writer = new EventWriter(tempDir, sessionId);

			// File should exist
			expect(existsSync(writer.path)).toBe(true);

			// File should contain session_metadata event
			const content = readFileSync(writer.path, 'utf-8');
			const lines = content.trim().split('\n');
			expect(lines.length).toBe(1);

			const event = JSON.parse(lines[0]);
			expect(event.type).toBe('session_metadata');
			expect(event.sessionId).toBe(sessionId);
			expect(event.swarmDir).toBe(tempDir);
			expect(event.timestamp).toBeDefined();
			expect(event.version).toBeDefined();
			expect(event.pid).toBeDefined();
			expect(event.platform).toBeDefined();
			expect(event.nodeVersion).toBeDefined();
		});
	});

	describe('emit()', () => {
		it('appends events as JSON lines', () => {
			const sessionId = 'test-session-002';
			const writer = new EventWriter(tempDir, sessionId);

			// Emit a custom event
			writer.emit({
				type: 'test_event',
				data: 'hello',
				number: 42,
			});

			const content = readFileSync(writer.path, 'utf-8');
			const lines = content.trim().split('\n');
			expect(lines.length).toBe(2); // session_metadata + test_event

			const event = JSON.parse(lines[1]);
			expect(event.type).toBe('test_event');
			expect(event.data).toBe('hello');
			expect(event.number).toBe(42);
		});

		it('multiple emit() calls produce multiple lines in the file', () => {
			const sessionId = 'test-session-003';
			const writer = new EventWriter(tempDir, sessionId);

			// Emit multiple events
			writer.emit({ type: 'event_1', value: 1 });
			writer.emit({ type: 'event_2', value: 2 });
			writer.emit({ type: 'event_3', value: 3 });

			const content = readFileSync(writer.path, 'utf-8');
			const lines = content.trim().split('\n');
			expect(lines.length).toBe(4); // session_metadata + 3 events

			expect(JSON.parse(lines[1]).type).toBe('event_1');
			expect(JSON.parse(lines[2]).type).toBe('event_2');
			expect(JSON.parse(lines[3]).type).toBe('event_3');
		});

		it('is error-safe (does not throw when file is unwritable)', () => {
			const sessionId = 'test-session-004';
			const writer = new EventWriter(tempDir, sessionId);

			// Make the file unwritable by removing write permissions (Unix) or read-only (Windows)
			// On Windows, we can try to make the parent directory read-only or use a different approach
			// For cross-platform testing, we'll test by passing an invalid path

			// Try to emit to an invalid path - should not throw
			const invalidWriter = new EventWriter(
				'/dev/null/does/not/exist',
				'invalid-session',
			);
			expect(() => {
				invalidWriter.emit({ type: 'should_not_crash' });
			}).not.toThrow();

			// Original writer should still work
			expect(() => {
				writer.emit({ type: 'still_works' });
			}).not.toThrow();
		});
	});

	describe('getEventWriter()', () => {
		it('returns the same instance for same (swarmDir, sessionId)', () => {
			const sessionId = 'test-session-005';

			const writer1 = getEventWriter(tempDir, sessionId);
			const writer2 = getEventWriter(tempDir, sessionId);

			expect(writer1).toBe(writer2);
			expect(writer1.path).toBe(writer2.path);
			expect(writer1.session).toBe(writer2.session);
		});

		it('returns different instances for different session IDs', () => {
			const writer1 = getEventWriter(tempDir, 'session-a');
			const writer2 = getEventWriter(tempDir, 'session-b');

			expect(writer1).not.toBe(writer2);
			expect(writer1.session).toBe('session-a');
			expect(writer2.session).toBe('session-b');
			expect(writer1.path).not.toBe(writer2.path);
		});

		it('returns different instances for different swarmDirs', () => {
			const tempDir2 = mkdtempSync(join(tmpdir(), 'event-writer-test2-'));

			try {
				const writer1 = getEventWriter(tempDir, 'same-session');
				const writer2 = getEventWriter(tempDir2, 'same-session');

				expect(writer1).not.toBe(writer2);
				expect(writer1.path).not.toBe(writer2.path);
			} finally {
				if (existsSync(tempDir2)) {
					rmSync(tempDir2, { recursive: true, force: true });
				}
			}
		});
	});

	describe('_clearEventWriterRegistry()', () => {
		it('clears the singleton registry', () => {
			const sessionId = 'test-session-006';

			const writer1 = getEventWriter(tempDir, sessionId);
			expect(writer1).toBeDefined();

			// Clear the registry
			_clearEventWriterRegistry();

			// Get a new writer for the same session - should be a new instance
			const writer2 = getEventWriter(tempDir, sessionId);
			expect(writer2).not.toBe(writer1);
		});
	});

	describe('path getter', () => {
		it('returns correct file path', () => {
			const sessionId = 'test-session-007';
			const writer = new EventWriter(tempDir, sessionId);

			const expectedPath = join(tempDir, `events-${sessionId}.jsonl`);
			expect(writer.path).toBe(expectedPath);
		});
	});

	describe('session getter', () => {
		it('returns correct session ID', () => {
			const sessionId = 'test-session-008';
			const writer = new EventWriter(tempDir, sessionId);

			expect(writer.session).toBe(sessionId);
		});
	});
});
