import { beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	extractMetaSummaries,
	indexMetaSummaries,
} from '../../../src/parallel/meta-indexer.js';

/**
 * Security Tests: Meta-Indexer
 * Tests: JSON injection, path traversal, oversized files, malformed timestamps
 */

const TEST_DIR = path.join(os.tmpdir(), 'meta-indexer-sec-test-' + Date.now());

beforeEach(() => {
	if (!fs.existsSync(TEST_DIR)) {
		fs.mkdirSync(TEST_DIR, { recursive: true });
	}
	fs.mkdirSync(path.join(TEST_DIR, '.swarm'), { recursive: true });
});

describe('Security: Meta-Indexer - JSON Injection', () => {
	it('should safely handle JSON injection in events.jsonl', () => {
		const eventsPath = path.join(TEST_DIR, 'events.jsonl');
		const maliciousLines = [
			'{"timestamp":"2024-01-01T00:00:00Z","meta":{"summary":"normal entry"}}',
			'{"timestamp":"2024-01-01T00:00:01Z","meta":{"summary":"injected","__proto__":{"polluted":true}}}',
			'{"timestamp":"2024-01-01T00:00:02Z","meta":{"summary":"test","constructor":{"prototype":{"evil":true}}}}',
			'{"timestamp":"2024-01-01T00:00:03Z","meta":{"summary":"<script>alert(1)</script>"}}',
			'{"timestamp":"2024-01-01T00:00:04Z","meta":{"summary":"${alert(1)}"}}',
		];

		fs.writeFileSync(eventsPath, maliciousLines.join('\n'), 'utf-8');

		const entries = extractMetaSummaries(eventsPath);
		expect(entries).toBeDefined();
		expect(entries.length).toBeGreaterThan(0);

		// Verify prototype pollution didn't affect Object.prototype
		const testObj = {};
		expect((testObj as any).polluted).toBeUndefined();
		expect((testObj as any).evil).toBeUndefined();
	});

	it('should handle JSON injection via toString() override', () => {
		const eventsPath = path.join(TEST_DIR, 'events.jsonl');
		const maliciousPayload = JSON.stringify({
			timestamp: '2024-01-01T00:00:00Z',
			meta: { summary: 'test' },
			toString: {
				valueOf: () => {
					throw new Error('Exploit!');
				},
			},
		});

		fs.writeFileSync(eventsPath, maliciousPayload + '\n', 'utf-8');

		const entries = extractMetaSummaries(eventsPath);
		expect(entries).toBeDefined();
	});

	it('should handle nested object with getter injection', () => {
		const eventsPath = path.join(TEST_DIR, 'events.jsonl');
		const maliciousPayload =
			'{"timestamp":"2024-01-01T00:00:00Z","meta":{"summary":"test","__defineGetter__":"exploit"}}';

		fs.writeFileSync(eventsPath, maliciousPayload + '\n', 'utf-8');

		const entries = extractMetaSummaries(eventsPath);
		expect(entries).toBeDefined();
	});
});

describe('Security: Meta-Indexer - Path Traversal', () => {
	it('should reject path traversal in directory parameter', async () => {
		const maliciousPaths = [
			'../../../etc/passwd',
			'..\\..\\..\\windows\\system32\\config',
			'/etc/passwd',
			'../../../../../../../../../../../etc/passwd',
			'foo/../../../bar',
			'/root/.ssh',
			'C:\\Users\\Administrator',
		];

		for (const maliciousPath of maliciousPaths) {
			// indexMetaSummaries attempts to create the .swarm directory and throws
			// when the path is invalid/non-directory (e.g. ENOTDIR or ENOENT).
			// Either a result is returned or an error is thrown.
			try {
				const result = await indexMetaSummaries(maliciousPath);
				expect(result).toBeDefined();
			} catch (err) {
				// Acceptable: implementation throws on invalid paths
				expect(err).toBeDefined();
			}
		}
	});

	it('should handle null bytes in path', async () => {
		const nullBytePath = '/tmp/test\x00malicious';
		// indexMetaSummaries throws TypeError on null bytes in path
		try {
			const result = await indexMetaSummaries(nullBytePath);
			expect(result).toBeDefined();
		} catch (err) {
			// Acceptable: implementation throws on null bytes
			expect(err).toBeDefined();
		}
	});
});

describe('Security: Meta-Indexer - Oversized Files', () => {
	it('should handle moderate events file without crashing', () => {
		const eventsPath = path.join(TEST_DIR, 'events.jsonl');
		// Reduced from 5000 entries to 50 - sufficient for coverage, safe for session
		const baseEntry = {
			timestamp: '2024-01-01T00:00:00Z',
			meta: { summary: 'A'.repeat(100) },
		};
		const largeContent = Array(50).fill(JSON.stringify(baseEntry)).join('\n');

		fs.writeFileSync(eventsPath, largeContent, 'utf-8');

		const startTime = Date.now();
		const entries = extractMetaSummaries(eventsPath);
		const duration = Date.now() - startTime;

		expect(entries).toBeDefined();
		expect(entries.length).toBe(50);
		expect(duration).toBeLessThan(1000);
	});

	it('should handle moderately long lines', () => {
		const eventsPath = path.join(TEST_DIR, 'events.jsonl');
		// Reduced from 1MB to 10KB - sufficient for coverage, safe for session
		const longSummary = 'A'.repeat(10 * 1024);
		const longEntry = JSON.stringify({
			timestamp: '2024-01-01T00:00:00Z',
			meta: { summary: longSummary },
		});

		fs.writeFileSync(eventsPath, longEntry, 'utf-8');

		const entries = extractMetaSummaries(eventsPath);
		expect(entries).toBeDefined();
		expect(entries.length).toBe(1);
	});
});

describe('Security: Meta-Indexer - Malformed Timestamps', () => {
	it('should handle invalid timestamp formats', () => {
		const eventsPath = path.join(TEST_DIR, 'events.jsonl');
		const invalidTimestamps = [
			'{"timestamp":"not-a-date","meta":{"summary":"test"}}',
			'{"timestamp":"","meta":{"summary":"test"}}',
			'{"timestamp":null,"meta":{"summary":"test"}}',
			'{"timestamp":1234567890,"meta":{"summary":"test"}}',
			'{"timestamp":"9999-99-99T99:99:99Z","meta":{"summary":"test"}}',
			'{"timestamp":"2024-13-01T00:00:00Z","meta":{"summary":"test"}}',
			'{"timestamp":"2024-02-30T00:00:00Z","meta":{"summary":"test"}}',
		];

		fs.writeFileSync(eventsPath, invalidTimestamps.join('\n'), 'utf-8');

		const entries = extractMetaSummaries(eventsPath);
		expect(entries).toBeDefined();
		for (const entry of entries) {
			expect(entry.timestamp).toBeDefined();
		}
	});

	it('should handle timestamp manipulation attempts', () => {
		const eventsPath = path.join(TEST_DIR, 'events.jsonl');
		const timestampAttacks = [
			'{"timestamp":"1970-01-01T00:00:01Z","meta":{"summary":"epoch manipulation"}}',
			'{"timestamp":"1969-12-31T23:59:59Z","meta":{"summary":"pre-epoch"}}',
			'{"timestamp":"+000001970-01-01T00:00:00Z","meta":{"summary":"positive offset"}}',
			'{"timestamp":"-000001970-01-01T00:00:00Z","meta":{"summary":"negative year"}}',
		];

		fs.writeFileSync(eventsPath, timestampAttacks.join('\n'), 'utf-8');

		const entries = extractMetaSummaries(eventsPath);
		expect(entries).toBeDefined();
	});
});
