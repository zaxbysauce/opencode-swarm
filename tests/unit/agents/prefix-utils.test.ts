import { describe, expect, it } from 'bun:test';
import { stripSwarmPrefix } from '../../../src/agents/index.ts';

describe('stripSwarmPrefix', () => {
	// Test case 1: Returns name unchanged when swarmPrefix is undefined
	it('returns name unchanged when swarmPrefix is undefined', () => {
		const result = stripSwarmPrefix('local_coder', undefined);
		expect(result).toBe('local_coder');
	});

	// Test case 2: Returns name unchanged when swarmPrefix is empty string ""
	it('returns name unchanged when swarmPrefix is empty string', () => {
		const result = stripSwarmPrefix('local_coder', '');
		expect(result).toBe('local_coder');
	});

	// Test case 3: Strips prefix correctly: "local_coder" with prefix "local" → "coder"
	it('strips prefix correctly: "local_coder" with prefix "local" → "coder"', () => {
		const result = stripSwarmPrefix('local_coder', 'local');
		expect(result).toBe('coder');
	});

	// Test case 4: Strips prefix correctly: "paid_explorer" with prefix "paid" → "explorer"
	it('strips prefix correctly: "paid_explorer" with prefix "paid" → "explorer"', () => {
		const result = stripSwarmPrefix('paid_explorer', 'paid');
		expect(result).toBe('explorer');
	});

	// Test case 5: Returns name unchanged when prefix doesn't match: "local_coder" with prefix "paid" → "local_coder"
	it('returns name unchanged when prefix doesn\'t match: "local_coder" with prefix "paid" → "local_coder"', () => {
		const result = stripSwarmPrefix('local_coder', 'paid');
		expect(result).toBe('local_coder');
	});

	// Test case 6: Handles empty agentName string: "" with prefix "local" → ""
	it('handles empty agentName string: "" with prefix "local" → ""', () => {
		const result = stripSwarmPrefix('', 'local');
		expect(result).toBe('');
	});

	// Test case 7: Handles agent name that starts with prefix but without underscore: "localthing" with prefix "local" → "localthing" (should NOT strip)
	it('handles agent name that starts with prefix but without underscore: "localthing" with prefix "local" → "localthing"', () => {
		const result = stripSwarmPrefix('localthing', 'local');
		expect(result).toBe('localthing');
	});

	// Test case 8: Handles prefix that is a substring: "mega_local_coder" with prefix "mega" → "local_coder"
	it('handles prefix that is a substring: "mega_local_coder" with prefix "mega" → "local_coder"', () => {
		const result = stripSwarmPrefix('mega_local_coder', 'mega');
		expect(result).toBe('local_coder');
	});
});
