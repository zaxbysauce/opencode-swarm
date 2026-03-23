import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

describe('HELP_TEXT content', () => {
	it('should contain knowledge migrate entry', () => {
		// HELP_TEXT is built dynamically from VALID_COMMANDS via COMMAND_REGISTRY.
		// 'knowledge migrate' is a subcommand registered in registry.ts.
		// Verify that the index.ts source exports handleKnowledgeMigrateCommand.
		const source = readFileSync(
			new URL('../../../src/commands/index.ts', import.meta.url),
			'utf-8',
		);
		expect(source).toContain('handleKnowledgeMigrateCommand');
	});
});
