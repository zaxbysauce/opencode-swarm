import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// Import the handlers
import { handlePromoteCommand } from '../../../src/commands/promote';
import { createSwarmCommandHandler } from '../../../src/commands/index';
import type { AgentDefinition } from '../../../src/agents';

// Test utilities
function createTempDir(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promote-test-'));
	return dir;
}

function cleanupDir(dir: string): void {
	if (fs.existsSync(dir)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

describe('/swarm promote Command Registration', () => {
	let tempDir: string;
	let agents: Record<string, AgentDefinition>;
	let handler: (
		input: { command: string; sessionID: string; arguments: string },
		output: { parts: unknown[] },
	) => Promise<void>;

	beforeEach(() => {
		tempDir = createTempDir();
		agents = {
			coder: {
				name: 'coder',
				config: { model: 'gpt-4' },
			},
		};
		handler = createSwarmCommandHandler(tempDir, agents);
	});

	afterEach(() => {
		cleanupDir(tempDir);
	});

	describe('Task 2.1.1: Command Import and Export', () => {
		it('should import handlePromoteCommand from ./promote', async () => {
			// Verify the import exists by checking that we can import it
			// This test passes if the import statement at the top of this file succeeds
			expect(typeof handlePromoteCommand).toBe('function');
		});

		it('should export handlePromoteCommand from index.ts', async () => {
			// Read the index.ts file to verify export exists
			const indexPath = path.join(tempDir, '..', 'src', 'commands', 'index.ts');
			// Since we're testing from the current workspace, read the actual file
			const actualIndexPath = path.join(process.cwd(), 'src', 'commands', 'index.ts');
			const indexContent = fs.readFileSync(actualIndexPath, 'utf-8');

			expect(indexContent).toContain("export { handlePromoteCommand } from './promote'");
		});
	});

	describe('Task 2.1.2: Switch Case Registration', () => {
		it('should handle promote subcommand in switch case', async () => {
			const output: { parts: unknown[] } = { parts: [] };

			await handler(
				{ command: 'swarm', sessionID: 'test-123', arguments: 'promote "test lesson"' },
				output,
			);

			expect(output.parts.length).toBeGreaterThan(0);
			const result = output.parts[0] as { type: string; text: string };
			expect(result.type).toBe('text');
			expect(result.text).toContain('Promoting to hive');
		});

		it('should not interfere with other commands', async () => {
			const output: { parts: unknown[] } = { parts: [] };

			await handler({ command: 'swarm', sessionID: 'test-123', arguments: 'status' }, output);

			expect(output.parts.length).toBeGreaterThan(0);
			const result = output.parts[0] as { type: string; text: string };
			expect(result.type).toBe('text');
		});
	});

	describe('Task 2.1.3: Help Text Documentation', () => {
		it('should include promote command in HELP_TEXT', async () => {
			const actualIndexPath = path.join(process.cwd(), 'src', 'commands', 'index.ts');
			const indexContent = fs.readFileSync(actualIndexPath, 'utf-8');

			expect(indexContent).toContain('/swarm promote');
			expect(indexContent).toContain('--category');
			expect(indexContent).toContain('--from-swarm');
		});

		it('should show help when no arguments provided', async () => {
			const output: { parts: unknown[] } = { parts: [] };

			await handler({ command: 'swarm', sessionID: 'test-123', arguments: 'promote' }, output);

			expect(output.parts.length).toBeGreaterThan(0);
			const result = output.parts[0] as { type: string; text: string };
			expect(result.type).toBe('text');
			// Should show usage error
			expect(result.text).toContain('Usage:');
		});
	});

	describe('Task 2.1.4: Direct Text Mode', () => {
		it('should promote direct lesson text', async () => {
			const result = await handlePromoteCommand(tempDir, ['This is a lesson text']);

			expect(result).toContain('Promoting to hive');
			expect(result).toContain('This is a lesson text');
			expect(result).toContain('(manual promotion)');
		});

		it('should handle multi-word lesson text', async () => {
			const result = await handlePromoteCommand(tempDir, ['This is a lesson with multiple words']);

			expect(result).toContain('Promoting to hive');
			expect(result).toContain('multiple words');
		});

		it('should truncate long lesson text in output', async () => {
			const longText = 'a'.repeat(100);
			const result = await handlePromoteCommand(tempDir, [longText]);

			expect(result).toContain('...');
			expect(result.length).toBeLessThan(longText.length + 100);
		});
	});

	describe('Task 2.1.5: --category Flag Parsing', () => {
		it('should parse --category flag with lesson text', async () => {
			const result = await handlePromoteCommand(tempDir, [
				'--category',
				'bugfix',
				'This is a lesson',
			]);

			expect(result).toContain('Promoting to hive');
			expect(result).toContain('category "bugfix"');
			expect(result).toContain('This is a lesson');
		});

		it('should handle --category before lesson text', async () => {
			const result = await handlePromoteCommand(tempDir, [
				'--category',
				'performance',
				'Optimize database queries',
			]);

			expect(result).toContain('category "performance"');
			expect(result).toContain('Optimize');
		});

		it('should handle --category with multi-word category', async () => {
			const result = await handlePromoteCommand(tempDir, [
				'--category',
				'best practice',
				'Use type hints',
			]);

			// Note: Current implementation takes only next arg for category
			// This test documents current behavior
			expect(result).toContain('category "best');
		});
	});

	describe('Task 2.1.6: --from-swarm Flag Parsing', () => {
		it('should parse --from-swarm flag', async () => {
			const result = await handlePromoteCommand(tempDir, ['--from-swarm', 'lesson-123']);

			expect(result).toContain('Promoting lesson lesson-123');
			expect(result).toContain('from swarm to hive');
		});

		it('should not show lesson text when using --from-swarm', async () => {
			const result = await handlePromoteCommand(tempDir, ['--from-swarm', 'lesson-456']);

			expect(result).toContain('Promoting lesson lesson-456');
			expect(result).not.toContain('Promoting to hive:');
		});

		it('should handle --from-swarm with valid lesson ID', async () => {
			const result = await handlePromoteCommand(tempDir, ['--from-swarm', 'abc123def']);

			expect(result).toContain('Promoting lesson abc123def');
		});
	});

	describe('Task 2.1.7: Error Handling', () => {
		it('should handle empty input gracefully', async () => {
			const result = await handlePromoteCommand(tempDir, []);

			expect(result).toContain('Usage:');
			expect(result).toContain('/swarm promote');
		});

		it('should handle only flags without values', async () => {
			const result = await handlePromoteCommand(tempDir, ['--category', '--from-swarm']);

			// Should show usage since no lesson text or lesson id provided
			expect(result).toContain('Usage:');
		});

		it('should handle --category without lesson text', async () => {
			const result = await handlePromoteCommand(tempDir, ['--category', 'bugfix']);

			expect(result).toContain('Usage:');
		});

		it('should handle --from-swarm without value', async () => {
			const result = await handlePromoteCommand(tempDir, ['--from-swarm']);

			// Should show usage since no lesson id provided
			expect(result).toContain('Usage:');
		});
	});

	describe('Task 2.1.8: Combined Flag Usage', () => {
		it('should handle --from-swarm without --category', async () => {
			const result = await handlePromoteCommand(tempDir, ['--from-swarm', 'lesson-789']);

			expect(result).toContain('Promoting lesson lesson-789');
		});

		it('should prioritize --from-swarm over direct text', async () => {
			const result = await handlePromoteCommand(tempDir, [
				'--from-swarm',
				'lesson-999',
				'extra text',
			]);

			// --from-swarm takes precedence, extra text ignored
			expect(result).toContain('Promoting lesson lesson-999');
			expect(result).not.toContain('extra text');
		});
	});
});
