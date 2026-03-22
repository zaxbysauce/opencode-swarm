import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

describe('HELP_TEXT content', () => {
	it('should contain knowledge migrate entry in VALID_COMMANDS', () => {
		const source = readFileSync(
			new URL('../../../src/commands/registry.ts', import.meta.url),
			'utf-8',
		);
		expect(source).toContain("'knowledge migrate'");
	});
});
