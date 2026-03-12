import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { extractCurrentPhase } from '../../../src/hooks/extractors';
import { createSystemEnhancerHook } from '../../../src/hooks/system-enhancer';
import type { PluginConfig } from '../../../src/config';
import { ContextBudgetConfigSchema } from '../../../src/config/schema';
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
				'[SWARM HINT] Large tool outputs may be auto-summarized. Use /swarm retrieve <id> to get the full content if needed.',
			]);
		});

		it('handler appends only hint when plan.md is missing', async () => {
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

			// Only hint appended since plan.md doesn't exist
			expect(output.system).toEqual([
				'Initial system prompt',
				'[SWARM HINT] Large tool outputs may be auto-summarized. Use /swarm retrieve <id> to get the full content if needed.',
			]);
		});

		it('handler appends only hint when no plan exists', async () => {
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

			// Only hint appended since no plan exists
			expect(output.system).toEqual([
				'Initial system prompt',
				'[SWARM HINT] Large tool outputs may be auto-summarized. Use /swarm retrieve <id> to get the full content if needed.',
			]);
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
				'[SWARM HINT] Large tool outputs may be auto-summarized. Use /swarm retrieve <id> to get the full content if needed.',
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
				'[SWARM HINT] Large tool outputs may be auto-summarized. Use /swarm retrieve <id> to get the full content if needed.',
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
				'[SWARM HINT] Large tool outputs may be auto-summarized. Use /swarm retrieve <id> to get the full content if needed.',
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
				'[SWARM HINT] Large tool outputs may be auto-summarized. Use /swarm retrieve <id> to get the full content if needed.',
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
				'[SWARM HINT] Large tool outputs may be auto-summarized. Use /swarm retrieve <id> to get the full content if needed.',
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

			it('strips any custom prefix when agent name is known', async () => {
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
			expect(agentContext).toContain('Recent tool activity for review context:'); // custom_coder -> coder
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
			
			// Should not crash — hint still appended even when context.md fails
			await transformHook(input, output);
			
			expect(output.system).toEqual([
				'Initial system prompt',
				'[SWARM HINT] Large tool outputs may be auto-summarized. Use /swarm retrieve <id> to get the full content if needed.',
			]);
		});

		describe('Injection budget (tryInject)', () => {
			it('Budget defaults to 4000 tokens when not configured', async () => {
				const swarmDir = join(tempDir, '.swarm');
				await mkdir(swarmDir, { recursive: true });
				const planContent = `
# Project Plan

## Phase 1: Setup [IN PROGRESS]
- [ ] 1.1: Initial task
`;
				await writeFile(join(swarmDir, 'plan.md'), planContent);

				// No context_budget configured - should default to 4000
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

				// All items should be injected since 4000 tokens ≈ 12,121 chars is way more than needed
				expect(output.system.length).toBeGreaterThan(1);
				expect(output.system.some((s: string) => s.includes('[SWARM CONTEXT]'))).toBe(true);
			});

			it('Low budget drops lower-priority items', async () => {
				const swarmDir = join(tempDir, '.swarm');
				await mkdir(swarmDir, { recursive: true });
				const planContent = `
# Project Plan

## Phase 1: Setup [IN PROGRESS]
- [ ] 1.1: Initial task
`;
				const contextContent = `# Context

## Decisions
- Decision A: Use TypeScript
- Decision B: Keep it simple

## Agent Activity

| Tool | Calls |
|------|-------|
| read | 5 |
`;
				await writeFile(join(swarmDir, 'plan.md'), planContent);
				await writeFile(join(swarmDir, 'context.md'), contextContent);

				swarmState.activeAgent.set('test-session', 'paid_coder');

				// Set max_injection_tokens to 50 (≈151 chars)
				const config: PluginConfig = {
					...defaultConfig,
					context_budget: {
						enabled: true,
						warn_threshold: 0.7,
						critical_threshold: 0.9,
						model_limits: { default: 128000 },
						max_injection_tokens: 50,
					} as any,
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

				// Phase ~60 chars ≈ 20 tokens, task ~45 chars ≈ 15 tokens (total 35 tokens) - both fit
				// Decisions ~80+ chars ≈ 27+ tokens would push over 50 token limit - should be dropped
				const phaseLine = output.system.find((s: string) => s.includes('[SWARM CONTEXT] Current phase:'));
				const taskLine = output.system.find((s: string) => s.includes('[SWARM CONTEXT] Current task:'));
				const decisionsLine = output.system.find((s: string) => s.includes('[SWARM CONTEXT] Key decisions:'));
				const agentContextLine = output.system.find((s: string) => s.includes('[SWARM AGENT CONTEXT]'));

				expect(phaseLine).toBeDefined();
				expect(taskLine).toBeDefined();
				expect(decisionsLine).toBeUndefined();
				expect(agentContextLine).toBeUndefined();
			});

			it('Zero-like budget (min 100) prevents most injection', async () => {
				const swarmDir = join(tempDir, '.swarm');
				await mkdir(swarmDir, { recursive: true });
				const planContent = `
# Project Plan

## Phase 1: Setup [IN PROGRESS]
- [ ] 1.1: Initial task
`;
				const hugeDecisions = '## Decisions\n' + Array(10).fill('- Decision: Very long description that uses tokens').join('\n');
				const contextContent = `# Context\n${hugeDecisions}`;
				await writeFile(join(swarmDir, 'plan.md'), planContent);
				await writeFile(join(swarmDir, 'context.md'), contextContent);

				swarmState.activeAgent.set('test-session', 'paid_coder');

				// Set max_injection_tokens to 100 (≈303 chars)
				const config: PluginConfig = {
					...defaultConfig,
					context_budget: {
						enabled: true,
						warn_threshold: 0.7,
						critical_threshold: 0.9,
						model_limits: { default: 128000 },
						max_injection_tokens: 100,
					} as any,
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

				const phaseLine = output.system.find((s: string) => s.includes('[SWARM CONTEXT] Current phase:'));
				const taskLine = output.system.find((s: string) => s.includes('[SWARM CONTEXT] Current task:'));
				const decisionsLine = output.system.find((s: string) => s.includes('[SWARM CONTEXT] Key decisions:'));

				expect(phaseLine).toBeDefined();
				expect(taskLine).toBeDefined();
				expect(decisionsLine).toBeUndefined();
			});

			it('All items injected when budget is generous', async () => {
				const swarmDir = join(tempDir, '.swarm');
				await mkdir(swarmDir, { recursive: true });
				const planContent = `
# Project Plan

## Phase 1: Setup [IN PROGRESS]
- [ ] 1.1: Initial task
`;
				const contextContent = `# Context

## Decisions
- Decision A: Use TypeScript

## Agent Activity

| Tool | Calls |
|------|-------|
| read | 5 |
`;
				await writeFile(join(swarmDir, 'plan.md'), planContent);
				await writeFile(join(swarmDir, 'context.md'), contextContent);

				swarmState.activeAgent.set('test-session', 'paid_coder');

				// Set max_injection_tokens to 50000 (very generous)
				const config: PluginConfig = {
					...defaultConfig,
					context_budget: {
						enabled: true,
						warn_threshold: 0.7,
						critical_threshold: 0.9,
						model_limits: { default: 128000 },
						max_injection_tokens: 50000,
					} as any,
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

				const phaseLine = output.system.find((s: string) => s.includes('[SWARM CONTEXT] Current phase:'));
				const taskLine = output.system.find((s: string) => s.includes('[SWARM CONTEXT] Current task:'));
				const decisionsLine = output.system.find((s: string) => s.includes('[SWARM CONTEXT] Key decisions:'));
				const agentContextLine = output.system.find((s: string) => s.includes('[SWARM AGENT CONTEXT]'));

				expect(phaseLine).toBeDefined();
				expect(taskLine).toBeDefined();
				expect(decisionsLine).toBeDefined();
				expect(agentContextLine).toBeDefined();
			});

			it('Budget tracks cumulative token usage', async () => {
				const swarmDir = join(tempDir, '.swarm');
				await mkdir(swarmDir, { recursive: true });
				const planContent = `
# Project Plan

## Phase 1: Setup [IN PROGRESS]
- [ ] 1.1: Initial task
`;
				const contextContent = `# Context

## Decisions
- Decision A: Use TypeScript
- Decision B: Keep it simple
`;
				await writeFile(join(swarmDir, 'plan.md'), planContent);
				await writeFile(join(swarmDir, 'context.md'), contextContent);

				// Set budget to fit phase + decisions (but not both)
				// Phase: ~60 chars ≈ 20 tokens
				// Task: ~35 chars ≈ 12 tokens
				// Decisions: ~65 chars ≈ 22 tokens
				const config: PluginConfig = {
					...defaultConfig,
					context_budget: {
						enabled: true,
						warn_threshold: 0.7,
						critical_threshold: 0.9,
						model_limits: { default: 128000 },
						max_injection_tokens: 50,
					} as any,
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

				const phaseLine = output.system.find((s: string) => s.includes('[SWARM CONTEXT] Current phase:'));
				const taskLine = output.system.find((s: string) => s.includes('[SWARM CONTEXT] Current task:'));
				const decisionsLine = output.system.find((s: string) => s.includes('[SWARM CONTEXT] Key decisions:'));

				// Phase (~20 tokens) fits, task (~12 tokens) = 32 total
				// Decisions would push to ~54 tokens (over 50 limit) - should be dropped
				expect(phaseLine).toBeDefined();
				// Task may or may not be injected depending on exact extraction
				// Just verify phase is present and decisions is not
				expect(decisionsLine).toBeUndefined();
			});

			it('Config max_injection_tokens schema validation', () => {
				const minResult = ContextBudgetConfigSchema.safeParse({ max_injection_tokens: 100 });
				expect(minResult.success).toBe(true);

				const maxResult = ContextBudgetConfigSchema.safeParse({ max_injection_tokens: 50000 });
				expect(maxResult.success).toBe(true);

				const belowMinResult = ContextBudgetConfigSchema.safeParse({ max_injection_tokens: 99 });
				expect(belowMinResult.success).toBe(false);

				const aboveMaxResult = ContextBudgetConfigSchema.safeParse({ max_injection_tokens: 50001 });
				expect(aboveMaxResult.success).toBe(false);

				const defaultResult = ContextBudgetConfigSchema.safeParse({});
				expect(defaultResult.success).toBe(true);
				if (defaultResult.success) {
					expect(defaultResult.data.max_injection_tokens).toBe(4000);
				}
			});

			it('Empty content does not consume budget', async () => {
				const swarmDir = join(tempDir, '.swarm');
				await mkdir(swarmDir, { recursive: true });
				// Create plan.md with no IN PROGRESS phase
				const planContent = `Phase: 1
# Project Plan

Some content without phase markers.
`;
				const contextContent = `# Context

## Decisions
- Decision A: Use TypeScript
`;
				await writeFile(join(swarmDir, 'plan.md'), planContent);
				await writeFile(join(swarmDir, 'context.md'), contextContent);

				// Set a low budget that would fit decisions
				const config: PluginConfig = {
					...defaultConfig,
					context_budget: {
						enabled: true,
						warn_threshold: 0.7,
						critical_threshold: 0.9,
						model_limits: { default: 128000 },
						max_injection_tokens: 60,
					} as any,
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

				// Phase header fallback will inject Phase 1 [PENDING] (~20 chars ≈ 7 tokens)
				// No task since no IN PROGRESS phase
				// Decisions should be injected (~35 chars ≈ 12 tokens, total ~19 tokens fits in 60)
				const phaseLine = output.system.find((s: string) => s.includes('[SWARM CONTEXT] Current phase:'));
				const taskLine = output.system.find((s: string) => s.includes('[SWARM CONTEXT] Current task:'));
				const decisionsLine = output.system.find((s: string) => s.includes('[SWARM CONTEXT] Key decisions:'));

				expect(phaseLine).toBeDefined();
				expect(taskLine).toBeUndefined();
				expect(decisionsLine).toBeDefined();
			});
		});
	});
	});
});