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
		const result = await detectDebuggingSpiral('/tmp/test');
		expect(result).toBeNull();
	});

	test('detectDebuggingSpiral detects repeated tool calls', async () => {
		// Record 5+ identical tool calls
		for (let i = 0; i < 6; i++) {
			recordToolCall('bash', { command: 'npm test' });
		}
		const result = await detectDebuggingSpiral('/tmp/test');
		expect(result).not.toBeNull();
		expect(result!.matchedText).toContain('bash');
	});
});
