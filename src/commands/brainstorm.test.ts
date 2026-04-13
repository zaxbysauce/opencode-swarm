import { describe, expect, test } from 'bun:test';
import { handleBrainstormCommand } from './brainstorm.js';

describe('handleBrainstormCommand', () => {
	test('returns default prompt when no args', async () => {
		const result = await handleBrainstormCommand('/tmp', []);
		expect(result).toContain('[MODE: BRAINSTORM]');
		expect(result).toContain('CONTEXT SCAN');
		expect(result).toContain('QA GATE SELECTION');
	});

	test('includes user topic verbatim when args provided', async () => {
		const result = await handleBrainstormCommand('/tmp', [
			'design',
			'a',
			'rate',
			'limiter',
		]);
		expect(result.startsWith('[MODE: BRAINSTORM]')).toBe(true);
		expect(result).toContain('design a rate limiter');
	});

	test('handles single-word topic', async () => {
		const result = await handleBrainstormCommand('/tmp', ['auth']);
		expect(result).toContain('[MODE: BRAINSTORM] auth');
	});

	test('is registered in COMMAND_REGISTRY', async () => {
		const { COMMAND_REGISTRY } = await import('./registry.js');
		expect('brainstorm' in COMMAND_REGISTRY).toBe(true);
		const entry = (
			COMMAND_REGISTRY as Record<string, { description: string }>
		).brainstorm;
		expect(entry.description.toLowerCase()).toContain('brainstorm');
	});
});
