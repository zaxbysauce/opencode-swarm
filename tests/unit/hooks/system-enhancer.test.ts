import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { extractCurrentPhase } from '../../../src/hooks/extractors';
import { createSystemEnhancerHook } from '../../../src/hooks/system-enhancer';
import type { PluginConfig } from '../../../src/config';
import { swarmState, resetSwarmState } from '../../../src/state';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('System Enhancer Hook', () => {
	describe('extractCurrentPhase', () => {
		it('returns null for empty string', () => {
			const result = extractCurrentPhase('');
			expect(result).toBeNull();
		});

		it('returns null for falsy input (empty string)', () => {
			const result = extractCurrentPhase('');
			expect(result).toBeNull();
		});

		it('parses ## Phase 1: Hooks Pipeline Enhancement [IN PROGRESS] correctly', () => {
			const planContent = `
# Project Plan

## Phase 1: Hooks Pipeline Enhancement [IN PROGRESS]

This phase focuses on implementing the hooks pipeline.
`;
			const result = extractCurrentPhase(planContent);
			expect(result).toBe('Phase 1: Hooks Pipeline Enhancement [IN PROGRESS]');
		});

		it('parses ## Phase 2: Context Pruning [IN PROGRESS] correctly', () => {
			const planContent = `
# Project Plan

## Phase 2: Context Pruning [IN PROGRESS]

This phase focuses on context pruning.
`;
			const result = extractCurrentPhase(planContent);
			expect(result).toBe('Phase 2: Context Pruning [IN PROGRESS]');
		});

		it('ignores ## Phase 1 [COMPLETE] phases (not IN PROGRESS)', () => {
			const planContent = `
# Project Plan

## Phase 1 [COMPLETE]

This phase is done.
`;
			const result = extractCurrentPhase(planContent);
			expect(result).toBeNull();
		});

		it('ignores ## Phase 3 [PENDING] phases', () => {
			const planContent = `
# Project Plan

## Phase 3 [PENDING]

This phase is pending.
`;
			const result = extractCurrentPhase(planContent);
			expect(result).toBeNull();
		});

		it('handles case insensitive [in progress]', () => {
			const planContent = `
# Project Plan

## Phase 1: Feature Implementation [in progress]

This phase is working.
`;
			const result = extractCurrentPhase(planContent);
			expect(result).toBe('Phase 1: Feature Implementation [IN PROGRESS]');
		});

		it('falls back to header Phase: 2 [PENDING] from first 3 lines', () => {
			const planContent = `Phase: 2
# Project Plan

Some content here.
`;
			const result = extractCurrentPhase(planContent);
			expect(result).toBe('Phase 2 [PENDING]');
		});

		it('returns null when no phase info at all', () => {
			const planContent = `
# Project Plan

Some content without phase info.
`;
			const result = extractCurrentPhase(planContent);
			expect(result).toBeNull();
		});

		it('handles phase without colon', () => {
			const planContent = `
# Project Plan

## Phase 1 Hooks Pipeline Enhancement [IN PROGRESS]

This phase is working.
`;
			const result = extractCurrentPhase(planContent);
			expect(result).toBe('Phase 1: Hooks Pipeline Enhancement [IN PROGRESS]');
		});

		it('only searches first 20 lines for ## headers', () => {
			const lines: string[] = [];
			// Create content with IN PROGRESS phase on line 25 (beyond the 20 line limit)
			for (let i = 1; i <= 24; i++) {
				lines.push(`Line ${i}`);
			}
			lines.push('## Phase 5: Late Phase [IN PROGRESS]');
			const planContent = lines.join('\n');

			const result = extractCurrentPhase(planContent);
			expect(result).toBeNull();
		});

		it('header fallback works when phase is in first 3 lines', () => {
			const planContent = `Phase: 7
Some header info
More header info`;
			const result = extractCurrentPhase(planContent);
			expect(result).toBe('Phase 7 [PENDING]');
		});

		it('prefers IN PROGRESS match over header fallback', () => {
			const planContent = `Phase: 3
# Project Plan

## Phase 2: Actual Implementation [IN PROGRESS]

This should return the IN PROGRESS phase.
`;
			const result = extractCurrentPhase(planContent);
			expect(result).toBe('Phase 2: Actual Implementation [IN PROGRESS]');
		});
	});

	describe('createSystemEnhancerHook', () => {
		let tempDir: string;

		beforeEach(async () => {
			tempDir = await mkdtemp(join(tmpdir(), 'swarm-test-'));
			resetSwarmState();
		});

		afterEach(async () => {
			try {
				await rm(tempDir, { recursive: true, force: true });
			} catch (error) {
				// Ignore cleanup errors
			}
		});

		const defaultConfig: PluginConfig = {
			max_iterations: 5,
			qa_retry_limit: 3,
			inject_phase_reminders: true,
		};

		const disabledConfig: PluginConfig = {
			...defaultConfig,
			hooks: {
				system_enhancer: false,
				compaction: true,
				agent_activity: true,
				delegation_tracker: false,
				agent_awareness_max_chars: 300,
			},
		};

		it('returns empty object when config.hooks.system_enhancer === false', () => {
			const result = createSystemEnhancerHook(disabledConfig, tempDir);
			expect(result).toEqual({});
		});

		it('returns object with experimental.chat.system.transform key when enabled', () => {
			const config: PluginConfig = {
				...defaultConfig,
				hooks: {
					system_enhancer: true,
					compaction: true,
					agent_activity: true,
					delegation_tracker: false,
					agent_awareness_max_chars: 300,
				},
			};
			const result = createSystemEnhancerHook(config, tempDir);
			expect(Object.keys(result)).toContain('experimental.chat.system.transform');
		});

		it('returns object with hook key when config.hooks is undefined (default enabled)', () => {
			const result = createSystemEnhancerHook(defaultConfig, tempDir);
			expect(Object.keys(result)).toContain('experimental.chat.system.transform');
		});

		it('returns object with hook key when config.hooks.system_enhancer is true', () => {
			const config: PluginConfig = {
				...defaultConfig,
				hooks: {
					system_enhancer: true,
					compaction: true,
					agent_activity: true,
					delegation_tracker: false,
					agent_awareness_max_chars: 300,
				},
			};
			const result = createSystemEnhancerHook(config, tempDir);
			expect(Object.keys(result)).toContain('experimental.chat.system.transform');
		});

		it('handler appends context string to output.system when plan.md exists with IN PROGRESS phase', async () => {
			// Create .swarm directory and plan.md file
			const swarmDir = join(tempDir, '.swarm');
			await mkdir(swarmDir, { recursive: true });
			const planFile = join(swarmDir, 'plan.md');
			const planContent = `
# Project Plan

## Phase 1: Hooks Pipeline Enhancement [IN PROGRESS]

This phase is currently active.
`;
			await writeFile(planFile, planContent);

			const config: PluginConfig = {
				...defaultConfig,
				hooks: {
					system_enhancer: true,
					compaction: true,
					agent_activity: true,
					delegation_tracker: false,
					agent_awareness_max_chars: 300,
				},
			};
			const hook = createSystemEnhancerHook(config, tempDir);
			const transformHook = hook['experimental.chat.system.transform'] as any;

			const input = { sessionID: 'test-session' };
			const output = { system: ['Initial system prompt'] };

			await transformHook(input, output);

			expect(output.system).toEqual([
				'Initial system prompt',
				'[SWARM CONTEXT] Current phase: Phase 1: Hooks Pipeline Enhancement [IN PROGRESS]',
			]);
		});

		it('handler does not modify output.system when plan.md is missing', async () => {
			const config: PluginConfig = {
				...defaultConfig,
				hooks: {
					system_enhancer: true,
					compaction: true,
					agent_activity: true,
					delegation_tracker: false,
					agent_awareness_max_chars: 300,
				},
			};
			const hook = createSystemEnhancerHook(config, tempDir);
			const transformHook = hook['experimental.chat.system.transform'] as any;

			const input = { sessionID: 'test-session' };
			const output = { system: ['Initial system prompt'] };

			await transformHook(input, output);

			// Should remain unchanged since plan.md doesn't exist
			expect(output.system).toEqual(['Initial system prompt']);
		});

		it('handler does not modify output.system when no plan exists', async () => {
			// No plan files - should not modify output
			const config: PluginConfig = {
				...defaultConfig,
				hooks: {
					system_enhancer: true,
					compaction: true,
					agent_activity: true,
					delegation_tracker: false,
					agent_awareness_max_chars: 300,
				},
			};
			const hook = createSystemEnhancerHook(config, tempDir);
			const transformHook = hook['experimental.chat.system.transform'] as any;

			const input = { sessionID: 'test-session' };
			const output = { system: ['Initial system prompt'] };

			await transformHook(input, output);

			// Should remain unchanged since no plan exists
			expect(output.system).toEqual(['Initial system prompt']);
		});

		it('handler appends context with header fallback when no IN PROGRESS phase', async () => {
			// Create .swarm directory and plan.md file with header phase
			const swarmDir = join(tempDir, '.swarm');
			await mkdir(swarmDir, { recursive: true });
			const planFile = join(swarmDir, 'plan.md');
			const planContent = `Phase: 2
# Project Plan

This plan has header phase info but no IN PROGRESS phase.
`;
			await writeFile(planFile, planContent);

			const config: PluginConfig = {
				...defaultConfig,
				hooks: {
					system_enhancer: true,
					compaction: true,
					agent_activity: true,
					delegation_tracker: false,
					agent_awareness_max_chars: 300,
				},
			};
			const hook = createSystemEnhancerHook(config, tempDir);
			const transformHook = hook['experimental.chat.system.transform'] as any;

			const input = { sessionID: 'test-session' };
			const output = { system: ['Initial system prompt'] };

			await transformHook(input, output);

			expect(output.system).toEqual([
				'Initial system prompt',
				'[SWARM CONTEXT] Current phase: Phase 2 [PENDING]',
			]);
		});

		it('the appended string starts with [SWARM CONTEXT] Current phase:', async () => {
			// Create .swarm directory and plan.md file
			const swarmDir = join(tempDir, '.swarm');
			await mkdir(swarmDir, { recursive: true });
			const planFile = join(swarmDir, 'plan.md');
			const planContent = `Phase: 1
# Project Plan

## Phase 1: Testing Phase [IN PROGRESS]

Testing is underway.
`;
			await writeFile(planFile, planContent);

			const config: PluginConfig = {
				...defaultConfig,
				hooks: {
					system_enhancer: true,
					compaction: true,
					agent_activity: true,
					delegation_tracker: false,
					agent_awareness_max_chars: 300,
				},
			};
			const hook = createSystemEnhancerHook(config, tempDir);
			const transformHook = hook['experimental.chat.system.transform'] as any;

			const input = { sessionID: 'test-session' };
			const output = { system: [] };

			await transformHook(input, output);

			const addedContext = output.system[0];
			expect(addedContext).toStartWith('[SWARM CONTEXT] Current phase:');
		});

		it('handler injects current task when plan.md has incomplete tasks in IN PROGRESS phase', async () => {
			const swarmDir = join(tempDir, '.swarm');
			await mkdir(swarmDir, { recursive: true });
			const planFile = join(swarmDir, 'plan.md');
			const planContent = `
# Project Plan

## Phase 1: Setup [IN PROGRESS]
- [x] 1.1: Init project
- [ ] 1.2: Add config
- [ ] 1.3: Setup tests
`;
			await writeFile(planFile, planContent);

			const config: PluginConfig = {
				...defaultConfig,
				hooks: {
					system_enhancer: true,
					compaction: true,
					agent_activity: true,
					delegation_tracker: false,
					agent_awareness_max_chars: 300,
				},
			};
			const hook = createSystemEnhancerHook(config, tempDir);
			const transformHook = hook['experimental.chat.system.transform'] as any;

			const input = { sessionID: 'test-session' };
			const output = { system: ['Initial system prompt'] };

			await transformHook(input, output);

			expect(output.system).toEqual([
				'Initial system prompt',
				'[SWARM CONTEXT] Current phase: Phase 1: Setup [IN PROGRESS]',
				'[SWARM CONTEXT] Current task: - [ ] 1.2: Add config [SMALL]',
			]);
		});

		it('handler injects key decisions when context.md has decisions', async () => {
			const swarmDir = join(tempDir, '.swarm');
			await mkdir(swarmDir, { recursive: true });
			const contextFile = join(swarmDir, 'context.md');
			
			// No plan.md - only context.md for decisions
			
			const contextContent = `# Context

## Decisions
- **Decision A**: Use TypeScript for new code
- **Decision B**: Prefer composition over inheritance

## Patterns
- Pattern 1: Write comprehensive tests
`;
			await writeFile(contextFile, contextContent);

			const config: PluginConfig = {
				...defaultConfig,
				hooks: {
					system_enhancer: true,
					compaction: true,
					agent_activity: true,
					delegation_tracker: false,
					agent_awareness_max_chars: 300,
				},
			};
			const hook = createSystemEnhancerHook(config, tempDir);
			const transformHook = hook['experimental.chat.system.transform'] as any;

			const input = { sessionID: 'test-session' };
			const output = { system: ['Initial system prompt'] };

			await transformHook(input, output);

			expect(output.system).toEqual([
				'Initial system prompt',
				'[SWARM CONTEXT] Key decisions: - **Decision A**: Use TypeScript for new code\n- **Decision B**: Prefer composition over inheritance',
			]);
		});

		it('handler injects all three context strings when both files have data', async () => {
			const swarmDir = join(tempDir, '.swarm');
			await mkdir(swarmDir, { recursive: true });
			const planFile = join(swarmDir, 'plan.md');
			const contextFile = join(swarmDir, 'context.md');
			
			const planContent = `
# Project Plan

## Phase 1: Setup [IN PROGRESS]
- [x] 1.1: Init project
- [ ] 1.2: Add config
- [ ] 1.3: Setup tests
`;
			const contextContent = `# Context

## Decisions
- **Decision A**: Use TypeScript for new code
- **Decision B**: Prefer composition over inheritance

## Patterns
- Pattern 1: Write comprehensive tests
`;
			
			await writeFile(planFile, planContent);
			await writeFile(contextFile, contextContent);

			const config: PluginConfig = {
				...defaultConfig,
				hooks: {
					system_enhancer: true,
					compaction: true,
					agent_activity: true,
					delegation_tracker: false,
					agent_awareness_max_chars: 300,
				},
			};
			const hook = createSystemEnhancerHook(config, tempDir);
			const transformHook = hook['experimental.chat.system.transform'] as any;

			const input = { sessionID: 'test-session' };
			const output = { system: ['Initial system prompt'] };

			await transformHook(input, output);

			expect(output.system).toEqual([
				'Initial system prompt',
				'[SWARM CONTEXT] Current phase: Phase 1: Setup [IN PROGRESS]',
				'[SWARM CONTEXT] Current task: - [ ] 1.2: Add config [SMALL]',
				'[SWARM CONTEXT] Key decisions: - **Decision A**: Use TypeScript for new code\n- **Decision B**: Prefer composition over inheritance',
			]);
		});

		it('handler does not inject decisions when context.md is missing', async () => {
			const swarmDir = join(tempDir, '.swarm');
			await mkdir(swarmDir, { recursive: true });
			const planFile = join(swarmDir, 'plan.md');
			
			const planContent = `Phase: 1
# Project Plan

## Phase 1: Setup [IN PROGRESS]
- [x] 1.1: Init project
- [ ] 1.2: Add config
`;
			await writeFile(planFile, planContent);

			const config: PluginConfig = {
				...defaultConfig,
				hooks: {
					system_enhancer: true,
					compaction: true,
					agent_activity: true,
					delegation_tracker: false,
					agent_awareness_max_chars: 300,
				},
			};
			const hook = createSystemEnhancerHook(config, tempDir);
			const transformHook = hook['experimental.chat.system.transform'] as any;

			const input = { sessionID: 'test-session' };
			const output = { system: ['Initial system prompt'] };

			await transformHook(input, output);

			expect(output.system).toEqual([
				'Initial system prompt',
				'[SWARM CONTEXT] Current phase: Phase 1: Setup [IN PROGRESS]',
				'[SWARM CONTEXT] Current task: - [ ] 1.2: Add config [SMALL]',
				// No decisions since context.md is missing
			]);
		});

		describe('Cross-agent context injection', () => {
			it('injects agent context when activeAgent is set and context.md has Agent Activity section', async () => {
				const swarmDir = join(tempDir, '.swarm');
				await mkdir(swarmDir, { recursive: true });
				await writeFile(join(swarmDir, 'plan.md'), '');  // empty plan
				await writeFile(join(swarmDir, 'context.md'), `# Context

## Agent Activity

| Tool | Calls |
|------|-------|
| read | 5 |
`);
				
				swarmState.activeAgent.set('test-session', 'paid_coder');
				
				const config: PluginConfig = {
					...defaultConfig,
					hooks: { system_enhancer: true, compaction: true, agent_activity: true, delegation_tracker: false, agent_awareness_max_chars: 300 },
				};
				const hook = createSystemEnhancerHook(config, tempDir);
				const transformHook = hook['experimental.chat.system.transform'] as any;
				
				const input = { sessionID: 'test-session' };
				const output = { system: [] as string[] };
				await transformHook(input, output);
				
				const agentContext = output.system.find((s: string) => s.startsWith('[SWARM AGENT CONTEXT]'));
				expect(agentContext).toBeDefined();
				expect(agentContext).toContain('Recent tool activity for review context:');
			});

			it('uses correct label for reviewer agent', async () => {
				const swarmDir = join(tempDir, '.swarm');
				await mkdir(swarmDir, { recursive: true });
				await writeFile(join(swarmDir, 'plan.md'), '');
				await writeFile(join(swarmDir, 'context.md'), `# Context

## Agent Activity

| Tool | Calls |
|------|-------|
| read | 5 |
`);
				
				swarmState.activeAgent.set('test-session', 'paid_reviewer');
				
				const config: PluginConfig = {
					...defaultConfig,
					hooks: { system_enhancer: true, compaction: true, agent_activity: true, delegation_tracker: false, agent_awareness_max_chars: 300 },
				};
				const hook = createSystemEnhancerHook(config, tempDir);
				const transformHook = hook['experimental.chat.system.transform'] as any;
				
				const input = { sessionID: 'test-session' };
				const output = { system: [] as string[] };
				await transformHook(input, output);
				
				const agentContext = output.system.find((s: string) => s.startsWith('[SWARM AGENT CONTEXT]'));
				expect(agentContext).toBeDefined();
				expect(agentContext).toContain('Tool usage to review:');
			});

			it('uses correct label for test_engineer', async () => {
				const swarmDir = join(tempDir, '.swarm');
				await mkdir(swarmDir, { recursive: true });
				await writeFile(join(swarmDir, 'plan.md'), '');
				await writeFile(join(swarmDir, 'context.md'), `# Context

## Agent Activity

| Tool | Calls |
|------|-------|
| read | 5 |
`);
				
				swarmState.activeAgent.set('test-session', 'local_test_engineer');
				
				const config: PluginConfig = {
					...defaultConfig,
					hooks: { system_enhancer: true, compaction: true, agent_activity: true, delegation_tracker: false, agent_awareness_max_chars: 300 },
				};
				const hook = createSystemEnhancerHook(config, tempDir);
				const transformHook = hook['experimental.chat.system.transform'] as any;
				
				const input = { sessionID: 'test-session' };
				const output = { system: [] as string[] };
				await transformHook(input, output);
				
				const agentContext = output.system.find((s: string) => s.startsWith('[SWARM AGENT CONTEXT]'));
				expect(agentContext).toBeDefined();
				expect(agentContext).toContain('Tool activity for test context:');
			});

			it('uses default label for unknown agents', async () => {
				const swarmDir = join(tempDir, '.swarm');
				await mkdir(swarmDir, { recursive: true });
				await writeFile(join(swarmDir, 'plan.md'), '');
				await writeFile(join(swarmDir, 'context.md'), `# Context

## Agent Activity

| Tool | Calls |
|------|-------|
| read | 5 |
`);
				
				swarmState.activeAgent.set('test-session', 'explorer');
				
				const config: PluginConfig = {
					...defaultConfig,
					hooks: { system_enhancer: true, compaction: true, agent_activity: true, delegation_tracker: false, agent_awareness_max_chars: 300 },
				};
				const hook = createSystemEnhancerHook(config, tempDir);
				const transformHook = hook['experimental.chat.system.transform'] as any;
				
				const input = { sessionID: 'test-session' };
				const output = { system: [] as string[] };
				await transformHook(input, output);
				
				const agentContext = output.system.find((s: string) => s.startsWith('[SWARM AGENT CONTEXT]'));
				expect(agentContext).toBeDefined();
				expect(agentContext).toContain('Agent activity summary:');
			});

			it('does NOT inject when agent_activity is false', async () => {
				const swarmDir = join(tempDir, '.swarm');
				await mkdir(swarmDir, { recursive: true });
				await writeFile(join(swarmDir, 'plan.md'), '');
				await writeFile(join(swarmDir, 'context.md'), `# Context

## Agent Activity

| Tool | Calls |
|------|-------|
| read | 5 |
`);
				
				swarmState.activeAgent.set('test-session', 'paid_coder');
				
				const config: PluginConfig = {
					...defaultConfig,
					hooks: { system_enhancer: true, compaction: true, agent_activity: false, delegation_tracker: false, agent_awareness_max_chars: 300 },
				};
				const hook = createSystemEnhancerHook(config, tempDir);
				const transformHook = hook['experimental.chat.system.transform'] as any;
				
				const input = { sessionID: 'test-session' };
				const output = { system: [] as string[] };
				await transformHook(input, output);
				
				const agentContext = output.system.find((s: string) => s.startsWith('[SWARM AGENT CONTEXT]'));
				expect(agentContext).toBeUndefined();
			});

			it('does NOT inject when no sessionID', async () => {
				const swarmDir = join(tempDir, '.swarm');
				await mkdir(swarmDir, { recursive: true });
				await writeFile(join(swarmDir, 'plan.md'), '');
				await writeFile(join(swarmDir, 'context.md'), `# Context

## Agent Activity

| Tool | Calls |
|------|-------|
| read | 5 |
`);
				
				swarmState.activeAgent.set('test-session', 'paid_coder');
				
				const config: PluginConfig = {
					...defaultConfig,
					hooks: { system_enhancer: true, compaction: true, agent_activity: true, delegation_tracker: false, agent_awareness_max_chars: 300 },
				};
				const hook = createSystemEnhancerHook(config, tempDir);
				const transformHook = hook['experimental.chat.system.transform'] as any;
				
				const input = {}; // No sessionID
				const output = { system: [] as string[] };
				await transformHook(input, output);
				
				const agentContext = output.system.find((s: string) => s.startsWith('[SWARM AGENT CONTEXT]'));
				expect(agentContext).toBeUndefined();
			});

			it('does NOT inject when no activeAgent set', async () => {
				const swarmDir = join(tempDir, '.swarm');
				await mkdir(swarmDir, { recursive: true });
				await writeFile(join(swarmDir, 'plan.md'), '');
				await writeFile(join(swarmDir, 'context.md'), `# Context

## Agent Activity

| Tool | Calls |
|------|-------|
| read | 5 |
`);
				
				// Don't set activeAgent for the sessionID
				
				const config: PluginConfig = {
					...defaultConfig,
					hooks: { system_enhancer: true, compaction: true, agent_activity: true, delegation_tracker: false, agent_awareness_max_chars: 300 },
				};
				const hook = createSystemEnhancerHook(config, tempDir);
				const transformHook = hook['experimental.chat.system.transform'] as any;
				
				const input = { sessionID: 'test-session' };
				const output = { system: [] as string[] };
				await transformHook(input, output);
				
				const agentContext = output.system.find((s: string) => s.startsWith('[SWARM AGENT CONTEXT]'));
				expect(agentContext).toBeUndefined();
			});

			it('does NOT inject when Agent Activity section is missing from context.md', async () => {
				const swarmDir = join(tempDir, '.swarm');
				await mkdir(swarmDir, { recursive: true });
				await writeFile(join(swarmDir, 'plan.md'), '');
				await writeFile(join(swarmDir, 'context.md'), `# Context

No Agent Activity section here.
`);
				
				swarmState.activeAgent.set('test-session', 'paid_coder');
				
				const config: PluginConfig = {
					...defaultConfig,
					hooks: { system_enhancer: true, compaction: true, agent_activity: true, delegation_tracker: false, agent_awareness_max_chars: 300 },
				};
				const hook = createSystemEnhancerHook(config, tempDir);
				const transformHook = hook['experimental.chat.system.transform'] as any;
				
				const input = { sessionID: 'test-session' };
				const output = { system: [] as string[] };
				await transformHook(input, output);
				
				const agentContext = output.system.find((s: string) => s.startsWith('[SWARM AGENT CONTEXT]'));
				expect(agentContext).toBeUndefined();
			});

			it('does NOT inject when Agent Activity says "No tool activity recorded yet."', async () => {
				const swarmDir = join(tempDir, '.swarm');
				await mkdir(swarmDir, { recursive: true });
				await writeFile(join(swarmDir, 'plan.md'), '');
				await writeFile(join(swarmDir, 'context.md'), `# Context

## Agent Activity

No tool activity recorded yet.
`);
				
				swarmState.activeAgent.set('test-session', 'paid_coder');
				
				const config: PluginConfig = {
					...defaultConfig,
					hooks: { system_enhancer: true, compaction: true, agent_activity: true, delegation_tracker: false, agent_awareness_max_chars: 300 },
				};
				const hook = createSystemEnhancerHook(config, tempDir);
				const transformHook = hook['experimental.chat.system.transform'] as any;
				
				const input = { sessionID: 'test-session' };
				const output = { system: [] as string[] };
				await transformHook(input, output);
				
				const agentContext = output.system.find((s: string) => s.startsWith('[SWARM AGENT CONTEXT]'));
				expect(agentContext).toBeUndefined();
			});

			it('truncates to agent_awareness_max_chars', async () => {
				const swarmDir = join(tempDir, '.swarm');
				await mkdir(swarmDir, { recursive: true });
				await writeFile(join(swarmDir, 'plan.md'), '');
				
				// Create a very long activity section
				const longActivity = '| Tool | Calls |\n|------|-------|\n' + Array(20).fill('| read | 5 |').join('\n');
				await writeFile(join(swarmDir, 'context.md'), `# Context

## Agent Activity

${longActivity}
`);
				
				swarmState.activeAgent.set('test-session', 'paid_coder');
				
				const config: PluginConfig = {
					...defaultConfig,
					hooks: { system_enhancer: true, compaction: true, agent_activity: true, delegation_tracker: false, agent_awareness_max_chars: 50 },
				};
				const hook = createSystemEnhancerHook(config, tempDir);
				const transformHook = hook['experimental.chat.system.transform'] as any;
				
				const input = { sessionID: 'test-session' };
				const output = { system: [] as string[] };
				await transformHook(input, output);
				
				const agentContext = output.system.find((s: string) => s.startsWith('[SWARM AGENT CONTEXT]'));
				expect(agentContext).toBeDefined();
				expect(agentContext).toEndWith('...');
				expect(agentContext!.length).toBeLessThanOrEqual(50 + '[SWARM AGENT CONTEXT] '.length);
			});

			it('strips "paid_" prefix correctly', async () => {
				const swarmDir = join(tempDir, '.swarm');
				await mkdir(swarmDir, { recursive: true });
				await writeFile(join(swarmDir, 'plan.md'), '');
				await writeFile(join(swarmDir, 'context.md'), `# Context

## Agent Activity

| Tool | Calls |
|------|-------|
| read | 5 |
`);
				
				swarmState.activeAgent.set('test-session', 'paid_coder');
				
				const config: PluginConfig = {
					...defaultConfig,
					hooks: { system_enhancer: true, compaction: true, agent_activity: true, delegation_tracker: false, agent_awareness_max_chars: 300 },
				};
				const hook = createSystemEnhancerHook(config, tempDir);
				const transformHook = hook['experimental.chat.system.transform'] as any;
				
				const input = { sessionID: 'test-session' };
				const output = { system: [] as string[] };
				await transformHook(input, output);
				
				const agentContext = output.system.find((s: string) => s.startsWith('[SWARM AGENT CONTEXT]'));
				expect(agentContext).toBeDefined();
				expect(agentContext).toContain('Recent tool activity for review context:');
			});

			it('strips "local_" prefix correctly', async () => {
				const swarmDir = join(tempDir, '.swarm');
				await mkdir(swarmDir, { recursive: true });
				await writeFile(join(swarmDir, 'plan.md'), '');
				await writeFile(join(swarmDir, 'context.md'), `# Context

## Agent Activity

| Tool | Calls |
|------|-------|
| read | 5 |
`);
				
				swarmState.activeAgent.set('test-session', 'local_coder');
				
				const config: PluginConfig = {
					...defaultConfig,
					hooks: { system_enhancer: true, compaction: true, agent_activity: true, delegation_tracker: false, agent_awareness_max_chars: 300 },
				};
				const hook = createSystemEnhancerHook(config, tempDir);
				const transformHook = hook['experimental.chat.system.transform'] as any;
				
				const input = { sessionID: 'test-session' };
				const output = { system: [] as string[] };
				await transformHook(input, output);
				
				const agentContext = output.system.find((s: string) => s.startsWith('[SWARM AGENT CONTEXT]'));
				expect(agentContext).toBeDefined();
				expect(agentContext).toContain('Recent tool activity for review context:');
			});

			it('does NOT strip unknown prefix', async () => {
				const swarmDir = join(tempDir, '.swarm');
				await mkdir(swarmDir, { recursive: true });
				await writeFile(join(swarmDir, 'plan.md'), '');
				await writeFile(join(swarmDir, 'context.md'), `# Context

## Agent Activity

| Tool | Calls |
|------|-------|
| read | 5 |
`);
				
				swarmState.activeAgent.set('test-session', 'custom_coder');
				
				const config: PluginConfig = {
					...defaultConfig,
					hooks: { system_enhancer: true, compaction: true, agent_activity: true, delegation_tracker: false, agent_awareness_max_chars: 300 },
				};
				const hook = createSystemEnhancerHook(config, tempDir);
				const transformHook = hook['experimental.chat.system.transform'] as any;
				
				const input = { sessionID: 'test-session' };
				const output = { system: [] as string[] };
				await transformHook(input, output);
				
				const agentContext = output.system.find((s: string) => s.startsWith('[SWARM AGENT CONTEXT]'));
			expect(agentContext).toBeDefined();
			expect(agentContext).toContain('Agent activity summary:'); // Should use default label
		});

		it('strips "mega_" prefix correctly', async () => {
			const swarmDir = join(tempDir, '.swarm');
			await mkdir(swarmDir, { recursive: true });
			await writeFile(join(swarmDir, 'plan.md'), '');
			await writeFile(join(swarmDir, 'context.md'), `# Context

## Agent Activity

| Tool | Calls |
|------|-------|
| read | 5 |
`);
			
			swarmState.activeAgent.set('test-session', 'mega_coder');
			
			const config: PluginConfig = {
				...defaultConfig,
				hooks: { system_enhancer: true, compaction: true, agent_activity: true, delegation_tracker: false, agent_awareness_max_chars: 300 },
			};
			const hook = createSystemEnhancerHook(config, tempDir);
			const transformHook = hook['experimental.chat.system.transform'] as any;
			
			const input = { sessionID: 'test-session' };
			const output = { system: [] as string[] };
			await transformHook(input, output);
			
			const agentContext = output.system.find((s: string) => s.startsWith('[SWARM AGENT CONTEXT]'));
			expect(agentContext).toBeDefined();
			expect(agentContext).toContain('Recent tool activity for review context:');
		});

		it('strips "default_" prefix correctly', async () => {
			const swarmDir = join(tempDir, '.swarm');
			await mkdir(swarmDir, { recursive: true });
			await writeFile(join(swarmDir, 'plan.md'), '');
			await writeFile(join(swarmDir, 'context.md'), `# Context

## Agent Activity

| Tool | Calls |
|------|-------|
| read | 5 |
`);
			
			swarmState.activeAgent.set('test-session', 'default_reviewer');
			
			const config: PluginConfig = {
				...defaultConfig,
				hooks: { system_enhancer: true, compaction: true, agent_activity: true, delegation_tracker: false, agent_awareness_max_chars: 300 },
			};
			const hook = createSystemEnhancerHook(config, tempDir);
			const transformHook = hook['experimental.chat.system.transform'] as any;
			
			const input = { sessionID: 'test-session' };
			const output = { system: [] as string[] };
			await transformHook(input, output);
			
			const agentContext = output.system.find((s: string) => s.startsWith('[SWARM AGENT CONTEXT]'));
			expect(agentContext).toBeDefined();
			expect(agentContext).toContain('Tool usage to review:');
		});

		it('agent_awareness_max_chars defaults to 300 when not specified', async () => {
			const swarmDir = join(tempDir, '.swarm');
			await mkdir(swarmDir, { recursive: true });
			await writeFile(join(swarmDir, 'plan.md'), '');
			
			// Create a short activity section (less than 300 chars)
			const shortActivity = `# Context

## Agent Activity

| Tool | Calls |
|------|-------|
| read | 5 |
| write | 3 |
`;
			await writeFile(join(swarmDir, 'context.md'), shortActivity);
			
			swarmState.activeAgent.set('test-session', 'paid_coder');
			
			const config: PluginConfig = {
				...defaultConfig,
				hooks: { system_enhancer: true, compaction: true, agent_activity: true, delegation_tracker: false },
				// Note: NO agent_awareness_max_chars specified - should default to 300
			};
			const hook = createSystemEnhancerHook(config, tempDir);
			const transformHook = hook['experimental.chat.system.transform'] as any;
			
			const input = { sessionID: 'test-session' };
			const output = { system: [] as string[] };
			await transformHook(input, output);
			
			const agentContext = output.system.find((s: string) => s.startsWith('[SWARM AGENT CONTEXT]'));
			expect(agentContext).toBeDefined();
			// Should NOT be truncated since it's shorter than 300 chars
			expect(agentContext).not.toEndWith('...');
		});

		it('does NOT truncate when context is exactly at maxChars boundary', async () => {
			const swarmDir = join(tempDir, '.swarm');
			await mkdir(swarmDir, { recursive: true });
			await writeFile(join(swarmDir, 'plan.md'), '');
			
			// Create context summary that will be exactly at the maxChars boundary
			const baseSummary = 'Recent tool activity for review context:\n| Tool | Calls |\n|------|-------|\n| read | 5 |\n| write | 3 |';
			const maxChars = baseSummary.length; // Set maxChars to exact length
			
			const config: PluginConfig = {
				...defaultConfig,
				hooks: { system_enhancer: true, compaction: true, agent_activity: true, delegation_tracker: false, agent_awareness_max_chars: maxChars },
			};
			
			// Create activity section that will produce the exact summary we want
			const activityContent = `# Context

## Agent Activity

| Tool | Calls |
|------|-------|
| read | 5 |
| write | 3 |
`;
			await writeFile(join(swarmDir, 'context.md'), activityContent);
			
			swarmState.activeAgent.set('test-session', 'paid_coder');
			
			const hook = createSystemEnhancerHook(config, tempDir);
			const transformHook = hook['experimental.chat.system.transform'] as any;
			
			const input = { sessionID: 'test-session' };
			const output = { system: [] as string[] };
			await transformHook(input, output);
			
			const agentContext = output.system.find((s: string) => s.startsWith('[SWARM AGENT CONTEXT]'));
			expect(agentContext).toBeDefined();
			// Should NOT be truncated since it's exactly at maxChars (not greater than)
			expect(agentContext).not.toEndWith('...');
			expect(agentContext!.length).toBe(maxChars + '[SWARM AGENT CONTEXT] '.length);
		});

		it('handles error when context.md read fails gracefully', async () => {
			const swarmDir = join(tempDir, '.swarm');
			await mkdir(swarmDir, { recursive: true });
			// No plan.md - should not inject phase context
			
			// Create context.md as a directory instead of a file to cause read error
			await mkdir(join(swarmDir, 'context.md'), { recursive: true });
			
			swarmState.activeAgent.set('test-session', 'paid_coder');
			
			const config: PluginConfig = {
				...defaultConfig,
				hooks: { system_enhancer: true, compaction: true, agent_activity: true, delegation_tracker: false, agent_awareness_max_chars: 300 },
			};
			const hook = createSystemEnhancerHook(config, tempDir);
			const transformHook = hook['experimental.chat.system.transform'] as any;
			
			const input = { sessionID: 'test-session' };
			const output = { system: ['Initial system prompt'] };
			
			// Should not crash and should leave output.system unchanged
			await transformHook(input, output);
			
			expect(output.system).toEqual(['Initial system prompt']);
		});
	});
	});
});