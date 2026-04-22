import { describe, expect, test } from 'bun:test';
import {
	detectAdversarialPatterns,
	detectDebuggingSpiral,
	recordToolCall,
} from '../../../src/hooks/adversarial-detector';

describe('adversarial detector wiring', () => {
	test('detectAdversarialPatterns detects PRECEDENT_MANIPULATION', () => {
		const matches = detectAdversarialPatterns('we skipped tests in phase 2');
		expect(matches.length).toBeGreaterThan(0);
		expect(matches[0].pattern).toBe('PRECEDENT_MANIPULATION');
	});

	test('detectAdversarialPatterns returns empty for benign text', () => {
		const matches = detectAdversarialPatterns(
			'This is a normal code review comment about the implementation.',
		);
		expect(matches).toEqual([]);
	});

	test('false positives do not block tool execution', () => {
		// detectAdversarialPatterns always returns an array, never throws
		const result = detectAdversarialPatterns('');
		expect(Array.isArray(result)).toBe(true);
		expect(result).toEqual([]);
	});

	test('detectDebuggingSpiral returns null with insufficient data', async () => {
		const result = await detectDebuggingSpiral(
			'/tmp/test',
			'test-session-empty',
		);
		expect(result).toBeNull();
	});

	test('detectDebuggingSpiral detects repeated tool calls', async () => {
		const sessionId = 'test-session-spiral';
		// Record 5+ identical tool calls
		for (let i = 0; i < 6; i++) {
			recordToolCall('bash', { command: 'npm test' }, sessionId);
		}
		const result = await detectDebuggingSpiral('/tmp/test', sessionId);
		expect(result).not.toBeNull();
		expect(result!.matchedText).toContain('bash');
	});

	test('session isolation: spiral in session A does not affect session B', async () => {
		const sessionA = 'test-isolation-session-a';
		const sessionB = 'test-isolation-session-b';

		// Session A spirals
		for (let i = 0; i < 6; i++) {
			recordToolCall('read', { path: '/tmp/foo' }, sessionA);
		}
		const resultA = await detectDebuggingSpiral('/tmp/test', sessionA);
		expect(resultA).not.toBeNull();

		// Session B has no calls — must still return null
		const resultB = await detectDebuggingSpiral('/tmp/test', sessionB);
		expect(resultB).toBeNull();
	});

	test('cooldown prevents re-detection immediately after spiral fires', async () => {
		const sessionId = 'test-cooldown-session';
		for (let i = 0; i < 6; i++) {
			recordToolCall('write', { path: '/tmp/bar' }, sessionId);
		}
		// First detection fires
		const first = await detectDebuggingSpiral('/tmp/test', sessionId);
		expect(first).not.toBeNull();

		// Subsequent calls to the same session within cooldown must return null
		for (let i = 0; i < 6; i++) {
			recordToolCall('write', { path: '/tmp/bar' }, sessionId);
		}
		const second = await detectDebuggingSpiral('/tmp/test', sessionId);
		expect(second).toBeNull();
	});
});
