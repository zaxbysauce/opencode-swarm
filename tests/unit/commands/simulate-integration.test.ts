import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AgentDefinition } from '../../../src/agents';
import { createSwarmCommandHandler } from '../../../src/commands/index';
import * as simulateModule from '../../../src/commands/simulate';

describe('/swarm simulate command registration integration', () => {
	const testDir = '/test/project';
	const testAgents: Record<string, AgentDefinition> = {
		architect: {
			name: 'architect',
			config: { model: 'gpt-4', temperature: 0.1 },
		},
	};

	let handler: ReturnType<typeof createSwarmCommandHandler>;

	beforeEach(() => {
		handler = createSwarmCommandHandler(testDir, testAgents);
		vi.clearAllMocks();
	});

	describe('Command dispatcher routing', () => {
		it('should dispatch "simulate" to handleSimulateCommand', async () => {
			const handleSimulateSpy = vi.spyOn(
				simulateModule,
				'handleSimulateCommand',
			).mockResolvedValue('Test simulation result');

			const output = { parts: [] as unknown[] };
			await handler(
				{ command: 'swarm', sessionID: 's1', arguments: 'simulate' },
				output,
			);

			expect(handleSimulateSpy).toHaveBeenCalledTimes(1);
			expect(handleSimulateSpy).toHaveBeenCalledWith(testDir, []);
			expect(output.parts).toHaveLength(1);
			expect((output.parts[0] as any).type).toBe('text');
			expect((output.parts[0] as any).text).toBe('Test simulation result');
		});

		it('should dispatch "simulate" with arguments to handleSimulateCommand', async () => {
			const handleSimulateSpy = vi.spyOn(
				simulateModule,
				'handleSimulateCommand',
			).mockResolvedValue('Simulated with args');

			const output = { parts: [] as unknown[] };
			await handler(
				{
					command: 'swarm',
					sessionID: 's1',
					arguments: 'simulate --threshold 0.5',
				},
				output,
			);

			expect(handleSimulateSpy).toHaveBeenCalledTimes(1);
			expect(handleSimulateSpy).toHaveBeenCalledWith(testDir, [
				'--threshold',
				'0.5',
			]);
			expect(output.parts).toHaveLength(1);
		});

		it('should dispatch "simulate" with multiple arguments', async () => {
			const handleSimulateSpy = vi.spyOn(
				simulateModule,
				'handleSimulateCommand',
			).mockResolvedValue('Simulated with multiple args');

			const output = { parts: [] as unknown[] };
			await handler(
				{
					command: 'swarm',
					sessionID: 's1',
					arguments: 'simulate --threshold 0.8 --min-commits 5',
				},
				output,
			);

			expect(handleSimulateSpy).toHaveBeenCalledTimes(1);
			expect(handleSimulateSpy).toHaveBeenCalledWith(testDir, [
				'--threshold',
				'0.8',
				'--min-commits',
				'5',
			]);
		});

		it('should return text output from handleSimulateCommand', async () => {
			const mockResult = '3 hidden coupling pairs detected';
			vi.spyOn(simulateModule, 'handleSimulateCommand').mockResolvedValue(
				mockResult,
			);

			const output = { parts: [] as unknown[] };
			await handler(
				{ command: 'swarm', sessionID: 's1', arguments: 'simulate' },
				output,
			);

			expect(output.parts).toHaveLength(1);
			const part = output.parts[0] as any;
			expect(part.type).toBe('text');
			expect(part.text).toBe(mockResult);
		});
	});

	describe('HELP_TEXT content', () => {
		it('should have simulate in registry', () => {
			const source = readFileSync(
				new URL('../../../src/commands/registry.ts', import.meta.url),
				'utf-8',
			);
			expect(source).toContain('simulate:');
		});

		it('should include simulate description with optional target flag', () => {
			const source = readFileSync(
				new URL('../../../src/commands/registry.ts', import.meta.url),
				'utf-8',
			);
			expect(source).toContain('--target <glob>');
			expect(source).toContain('Dry-run impact analysis');
		});
	});

	describe('Export availability from commands/index.ts', () => {
		it('should export handleSimulateCommand from commands/index.ts', () => {
			const source = readFileSync(
				new URL('../../../src/commands/index.ts', import.meta.url),
				'utf-8',
			);
			expect(source).toContain("export { handleSimulateCommand } from './simulate'");
		});

		it('should have simulate in COMMAND_REGISTRY', () => {
			const source = readFileSync(
				new URL('../../../src/commands/registry.ts', import.meta.url),
				'utf-8',
			);
			expect(source).toContain('simulate:');
		});
	});

	describe('Edge cases', () => {
		it('should handle simulate with trailing spaces', async () => {
			const handleSimulateSpy = vi.spyOn(
				simulateModule,
				'handleSimulateCommand',
			).mockResolvedValue('Test');

			const output = { parts: [] as unknown[] };
			await handler(
				{ command: 'swarm', sessionID: 's1', arguments: 'simulate   ' },
				output,
			);

			expect(handleSimulateSpy).toHaveBeenCalledWith(testDir, []);
			expect(output.parts).toHaveLength(1);
		});

		it('should handle simulate with extra whitespace between args', async () => {
			const handleSimulateSpy = vi.spyOn(
				simulateModule,
				'handleSimulateCommand',
			).mockResolvedValue('Test');

			const output = { parts: [] as unknown[] };
			await handler(
				{
					command: 'swarm',
					sessionID: 's1',
					arguments: 'simulate  --threshold  0.5',
				},
				output,
			);

			// Note: split(/\s+/) collapses multiple spaces
			expect(handleSimulateSpy).toHaveBeenCalledWith(testDir, [
				'--threshold',
				'0.5',
			]);
		});
	});
});
