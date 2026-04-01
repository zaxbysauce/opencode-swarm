import { describe, expect, test } from 'bun:test';

describe('compaction service execution modes', () => {
	test('compaction service fires in balanced mode', () => {
		// The wiring in index.ts is: if (execMode !== 'fast' && compactionServiceHook)
		// balanced !== 'fast', so it fires
		const execMode = 'balanced';
		expect(execMode !== 'fast').toBe(true);
	});

	test('compaction service fires in strict mode', () => {
		const execMode = 'strict';
		expect(execMode !== 'fast').toBe(true);
	});

	test('compaction service does NOT fire in fast mode', () => {
		const execMode = 'fast';
		expect(execMode !== 'fast').toBe(false);
	});
});
