import { describe, it, expect, vi } from 'vitest';
import OpenCodeSwarm from '../../src/index';

// Mock the @opencode-ai/plugin types
// Since we only need the plugin to register commands, we can provide minimal mocks
const mockPluginInput = {
	client: {} as any,
	project: {} as any,
	directory: process.cwd(),
	worktree: process.cwd(),
	serverUrl: new URL('http://localhost:3000'),
	$: {} as any,
};

describe('Swarm subcommand registration', () => {
	it('should initialize plugin successfully', async () => {
		const plugin = await OpenCodeSwarm(mockPluginInput);
		expect(plugin).toBeDefined();
		// Plugin returns Hooks interface, which includes optional config function
		expect(plugin).toHaveProperty('config');
		expect(typeof plugin.config).toBe('function');
	});

	it('should register 19 individual subcommands plus catch-all', async () => {
		const plugin = await OpenCodeSwarm(mockPluginInput);
		const mockConfig: Record<string, unknown> = {};

		await plugin.config?.(mockConfig);
		const commands = mockConfig.command as Record<string, { template: string; description: string }>;

		expect(commands).toBeDefined();
		const commandKeys = Object.keys(commands);

		// Should have catch-all + 19 subcommands = 20 total
		expect(commandKeys.length).toBe(20);

		// Verify catch-all exists
		expect(commands.swarm).toBeDefined();
	});

	it('should have catch-all swarm command with correct template', async () => {
		const plugin = await OpenCodeSwarm(mockPluginInput);
		const mockConfig: Record<string, unknown> = {};

		await plugin.config?.(mockConfig);
		const commands = mockConfig.command as Record<string, { template: string; description: string }>;

		expect(commands.swarm).toBeDefined();
		expect(commands.swarm.template).toBe('/swarm $ARGUMENTS');
		expect(commands.swarm.description).toBe('Swarm management commands');
	});

	it('should register all 19 individual subcommands with correct keys', async () => {
		const plugin = await OpenCodeSwarm(mockPluginInput);
		const mockConfig: Record<string, unknown> = {};

		await plugin.config?.(mockConfig);
		const commands = mockConfig.command as Record<string, { template: string; description: string }>;

		const expectedSubcommands = [
			'swarm-status',
			'swarm-plan',
			'swarm-agents',
			'swarm-history',
			'swarm-config',
			'swarm-evidence',
			'swarm-archive',
			'swarm-diagnose',
			'swarm-preflight',
			'swarm-sync-plan',
			'swarm-benchmark',
			'swarm-export',
			'swarm-reset',
			'swarm-retrieve',
			'swarm-clarify',
			'swarm-analyze',
			'swarm-specify',
			'swarm-dark-matter',
			'swarm-knowledge',
		];

		// Verify all expected subcommands exist
		for (const subcommand of expectedSubcommands) {
			expect(commands[subcommand], `${subcommand} should be registered`).toBeDefined();
		}

		// Verify no extra swarm- commands beyond expected ones
		const swarmCommands = Object.keys(commands).filter((key) => key.startsWith('swarm-'));
		expect(swarmCommands.sort()).toEqual(expectedSubcommands.sort());
	});

	it('should have all subcommand templates starting with /swarm', async () => {
		const plugin = await OpenCodeSwarm(mockPluginInput);
		const mockConfig: Record<string, unknown> = {};

		await plugin.config?.(mockConfig);
		const commands = mockConfig.command as Record<string, { template: string; description: string }>;

		const swarmCommands = Object.keys(commands).filter((key) => key.startsWith('swarm-'));

		for (const commandKey of swarmCommands) {
			const cmd = commands[commandKey];
			expect(cmd.template).toMatch(/^\/swarm /, `${commandKey} template should start with /swarm`);
		}
	});

	it('should have non-empty descriptions for all subcommands', async () => {
		const plugin = await OpenCodeSwarm(mockPluginInput);
		const mockConfig: Record<string, unknown> = {};

		await plugin.config?.(mockConfig);
		const commands = mockConfig.command as Record<string, { template: string; description: string }>;

		// Check catch-all command
		expect(commands.swarm.description).toBeTruthy();
		expect(commands.swarm.description.length).toBeGreaterThan(0);

		// Check all swarm- subcommands
		const swarmCommands = Object.keys(commands).filter((key) => key.startsWith('swarm-'));

		for (const commandKey of swarmCommands) {
			const cmd = commands[commandKey];
			expect(cmd.description, `${commandKey} should have description`).toBeTruthy();
			expect(cmd.description.length, `${commandKey} description should not be empty`).toBeGreaterThan(0);
		}
	});

	it('should have one-line descriptions for subcommands', async () => {
		const plugin = await OpenCodeSwarm(mockPluginInput);
		const mockConfig: Record<string, unknown> = {};

		await plugin.config?.(mockConfig);
		const commands = mockConfig.command as Record<string, { template: string; description: string }>;

		const swarmCommands = Object.keys(commands).filter((key) => key.startsWith('swarm-'));

		for (const commandKey of swarmCommands) {
			const cmd = commands[commandKey];
			// One-line descriptions should not contain newlines
			expect(cmd.description).not.toContain('\n', `${commandKey} description should be one-line`);
		}
	});

	it('should not register simulate or rollback commands (Phase 3)', async () => {
		const plugin = await OpenCodeSwarm(mockPluginInput);
		const mockConfig: Record<string, unknown> = {};

		await plugin.config?.(mockConfig);
		const commands = mockConfig.command as Record<string, { template: string; description: string }>;

		// These commands should NOT exist yet
		expect(commands['swarm-simulate']).toBeUndefined();
		expect(commands['swarm-rollback']).toBeUndefined();
	});

	it('should have correct templates for specific subcommands', async () => {
		const plugin = await OpenCodeSwarm(mockPluginInput);
		const mockConfig: Record<string, unknown> = {};

		await plugin.config?.(mockConfig);
		const commands = mockConfig.command as Record<string, { template: string; description: string }>;

		// Test a few specific templates
		expect(commands['swarm-status'].template).toBe('/swarm status');
		expect(commands['swarm-plan'].template).toBe('/swarm plan $ARGUMENTS');
		expect(commands['swarm-agents'].template).toBe('/swarm agents');
		expect(commands['swarm-reset'].template).toBe('/swarm reset --confirm');
		expect(commands['swark-knowledge']).toBeUndefined(); // Typos should not exist
	});

	it('should have descriptions matching expected values', async () => {
		const plugin = await OpenCodeSwarm(mockPluginInput);
		const mockConfig: Record<string, unknown> = {};

		await plugin.config?.(mockConfig);
		const commands = mockConfig.command as Record<string, { template: string; description: string }>;

		// Verify some specific descriptions
		expect(commands['swarm-status'].description).toBe('Show current swarm status and active phase');
		expect(commands['swarm-plan'].description).toBe('View or filter the current execution plan');
		expect(commands['swarm-agents'].description).toBe('List registered swarm agents');
		expect(commands['swarm-reset'].description).toBe('Clear swarm state (requires --confirm)');
	});

	it('should preserve existing commands when merging', async () => {
		const plugin = await OpenCodeSwarm(mockPluginInput);
		const mockConfig: Record<string, unknown> = {
			command: {
				existing: {
					template: '/existing',
					description: 'Existing command',
				},
			},
		};

		await plugin.config?.(mockConfig);
		const commands = mockConfig.command as Record<string, { template: string; description: string }>;

		// Existing command should still be present
		expect(commands.existing).toBeDefined();
		expect(commands.existing.template).toBe('/existing');

		// Swarm commands should be added
		expect(commands.swarm).toBeDefined();
	});
});
