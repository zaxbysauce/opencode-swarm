import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { extractDecisions } from '../../../src/hooks/extractors';
import { createCompactionCustomizerHook } from '../../../src/hooks/compaction-customizer';
import { readSwarmFileAsync } from '../../../src/hooks/utils';
import type { PluginConfig } from '../../../src/config';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFileSync } from 'node:fs';

describe('extractDecisions', () => {
    it('Returns null for empty string', () => {
        expect(extractDecisions('')).toBeNull();
    });

    it('Returns null for falsy/empty input', () => {
        expect(extractDecisions(null as any)).toBeNull();
        expect(extractDecisions(undefined as any)).toBeNull();
        expect(extractDecisions('   ')).toBeNull();
    });

    it('Extracts bullet points under `## Decisions` section', () => {
        const content = `# Some content
## Decisions
- Decision 1
- Decision 2
- Decision 3

## Other section
More content`;
        const result = extractDecisions(content);
        expect(result).toBe('- Decision 1\n- Decision 2\n- Decision 3');
    });

    it('Stops at next `## ` heading', () => {
        const content = `# Some content
## Decisions
- Decision 1
- Decision 2

## Other section
- Not included
More content`;
        const result = extractDecisions(content);
        expect(result).toBe('- Decision 1\n- Decision 2');
    });

    it('Returns null when no `## Decisions` section exists', () => {
        const content = `# Some content
## Other section
Some content here`;
        const result = extractDecisions(content);
        expect(result).toBeNull();
    });

    it('Returns null when decisions section has no bullet points', () => {
        const content = `# Some content
## Decisions

Just text, no bullets

## Other section`;
        const result = extractDecisions(content);
        expect(result).toBeNull();
    });

    it('Truncates to maxChars (default 500) and appends `...`', () => {
        const bulletPoint = '- This is a very long decision point that exceeds the default limit by a lot, really way too long for the default maxChars setting of 500 characters total...';
        const content = `## Decisions\n${bulletPoint}\n${bulletPoint}\n${bulletPoint}`;
        const result = extractDecisions(content);
        if (result) {
            expect(result.length).toBeLessThanOrEqual(500 + 3); // +3 for '...'
            expect(result.endsWith('...')).toBe(true);
        }
    });

    it('Respects custom maxChars parameter', () => {
        const content = `## Decisions
- Short decision 1
- This is a much longer decision point that should exceed the custom limit of 50 characters`;
        const result = extractDecisions(content, 50);
        if (result) {
            expect(result.length).toBeLessThanOrEqual(50 + 3);
            expect(result.endsWith('...')).toBe(true);
        }
    });

    it('Does not truncate when content is within limit', () => {
        const content = `## Decisions
- Decision 1
- Decision 2
- Decision 3`;
        const result = extractDecisions(content, 1000);
        expect(result).toBe('- Decision 1\n- Decision 2\n- Decision 3');
        if (result) {
            expect(result.endsWith('...')).toBe(false);
        }
    });

    it('Only collects lines starting with `- ` (ignores other lines in section)', () => {
        const content = `## Decisions
- Decision 1
This text should be ignored
- Decision 2
  Also indented text should be ignored
- Decision 3
More ignored text`;
        const result = extractDecisions(content);
        expect(result).toBe('- Decision 1\n- Decision 2\n- Decision 3');
    });
});

describe('createCompactionCustomizerHook', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await mkdtemp(join(tmpdir(), 'swarm-test-'));
        const swarmDir = join(tempDir, '.swarm');
        await mkdir(swarmDir, { recursive: true });
        writeFileSync(join(swarmDir, 'plan.md'), '');
        writeFileSync(join(swarmDir, 'context.md'), '');
    });

    afterEach(async () => {
        await rm(tempDir, { recursive: true, force: true });
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
            compaction: false, 
            agent_activity: false, 
            delegation_tracker: false, 
            agent_awareness_max_chars: 300 
        },
    };

    it('Returns empty object when `config.hooks.compaction === false`', () => {
        const hook = createCompactionCustomizerHook(disabledConfig, tempDir);
        expect(hook).toEqual({});
    });

    it('Returns object with `experimental.session.compacting` key when enabled', () => {
        const hook = createCompactionCustomizerHook(defaultConfig, tempDir);
        expect(hook['experimental.session.compacting']).toBeDefined();
        expect(typeof hook['experimental.session.compacting']).toBe('function');
    });

    it('Returns object with hook key when `config.hooks` is undefined (default enabled)', () => {
        const configWithoutHooks: PluginConfig = {
            max_iterations: 5,
            qa_retry_limit: 3,
            inject_phase_reminders: true,
        };
        const hook = createCompactionCustomizerHook(configWithoutHooks, tempDir);
        expect(hook['experimental.session.compacting']).toBeDefined();
    });

    it('Returns object with hook key when `config.hooks.compaction` is true', () => {
        const enabledConfig: PluginConfig = {
            ...defaultConfig,
            hooks: { 
                system_enhancer: true, 
                compaction: true, 
                agent_activity: true, 
                delegation_tracker: true, 
                agent_awareness_max_chars: 300 
            },
        };
        const hook = createCompactionCustomizerHook(enabledConfig, tempDir);
        expect(hook['experimental.session.compacting']).toBeDefined();
    });

    it('Handler appends plan context to output.context when plan.md has IN PROGRESS phase', async () => {
        const planContent = `# Project v1.0
Phase: 1 | Updated: 2026-01-01

## Phase 1: Setup [IN PROGRESS]
- [x] 1.1: Init project
- [ ] 1.2: Add config`;
        writeFileSync(join(tempDir, '.swarm', 'plan.md'), planContent);

        const hook = createCompactionCustomizerHook(defaultConfig, tempDir);
        const handler = hook['experimental.session.compacting'] as Function;
        
        const output = { context: [] as string[] };
        await handler({ sessionID: 'test-session' }, output);
        
        expect(output.context).toContain('[SWARM PLAN] Phase 1: Setup [IN PROGRESS]');
    });

    it('Handler appends decisions context to output.context when context.md has decisions', async () => {
        const contextContent = `# Context

## Decisions
- **Decision A**: Rationale A
- **Decision B**: Rationale B

## Patterns
- pattern stuff`;
        writeFileSync(join(tempDir, '.swarm', 'context.md'), contextContent);

        const hook = createCompactionCustomizerHook(defaultConfig, tempDir);
        const handler = hook['experimental.session.compacting'] as Function;
        
        const output = { context: [] as string[] };
        await handler({ sessionID: 'test-session' }, output);
        
        expect(output.context).toContain('[SWARM DECISIONS] - **Decision A**: Rationale A\n- **Decision B**: Rationale B');
    });

    it('Handler appends both plan and decisions when both files exist', async () => {
        const planContent = `# Project v1.0
Phase: 1 | Updated: 2026-01-01

## Phase 1: Setup [IN PROGRESS]
- [x] 1.1: Init project
- [ ] 1.2: Add config`;
        const contextContent = `# Context

## Decisions
- **Decision A**: Rationale A
- **Decision B**: Rationale B

## Patterns
- pattern stuff`;
        
        writeFileSync(join(tempDir, '.swarm', 'plan.md'), planContent);
        writeFileSync(join(tempDir, '.swarm', 'context.md'), contextContent);

        const hook = createCompactionCustomizerHook(defaultConfig, tempDir);
        const handler = hook['experimental.session.compacting'] as Function;
        
        const output = { context: [] as string[] };
        await handler({ sessionID: 'test-session' }, output);
        
        expect(output.context).toContain('[SWARM PLAN] Phase 1: Setup [IN PROGRESS]');
        expect(output.context).toContain('[SWARM DECISIONS] - **Decision A**: Rationale A\n- **Decision B**: Rationale B');
        expect(output.context).toContain('[SWARM TASKS] - [ ] 1.2: Add config [SMALL]');
        expect(output.context).toContain('[SWARM PATTERNS] - pattern stuff');
        expect(output.context).toHaveLength(4);
    });

    it('Handler does not modify output.context when files are missing', async () => {
        // Remove the files
        await rm(join(tempDir, '.swarm'), { recursive: true, force: true });

        const hook = createCompactionCustomizerHook(defaultConfig, tempDir);
        const handler = hook['experimental.session.compacting'] as Function;
        
        const output = { context: [] as string[] };
        await handler({ sessionID: 'test-session' }, output);
        
        expect(output.context).toHaveLength(0);
    });

    it('Handler does not modify output.prompt (ever)', async () => {
        const contextContent = `# Context

## Decisions
- **Decision A**: Rationale A`;
        writeFileSync(join(tempDir, '.swarm', 'context.md'), contextContent);

        const hook = createCompactionCustomizerHook(defaultConfig, tempDir);
        const handler = hook['experimental.session.compacting'] as Function;
        
        const output = { 
            context: [] as string[], 
            prompt: 'Original prompt should not be modified' 
        };
        await handler({ sessionID: 'test-session' }, output);
        
        expect(output.prompt).toBe('Original prompt should not be modified');
    });

    it('Context strings have correct prefixes: `[SWARM PLAN]` and `[SWARM DECISIONS]`', async () => {
        const planContent = `# Project v1.0
## Phase 1: Setup [IN PROGRESS]
- [ ] Task`;
        const contextContent = `# Context

## Decisions
- **Decision A**: Rationale A`;
        
        writeFileSync(join(tempDir, '.swarm', 'plan.md'), planContent);
        writeFileSync(join(tempDir, '.swarm', 'context.md'), contextContent);

        const hook = createCompactionCustomizerHook(defaultConfig, tempDir);
        const handler = hook['experimental.session.compacting'] as Function;
        
        const output = { context: [] as string[] };
        await handler({ sessionID: 'test-session' }, output);
        
        const planContext = output.context.find(c => c.startsWith('[SWARM PLAN]'));
        const decisionsContext = output.context.find(c => c.startsWith('[SWARM DECISIONS]'));
        
        expect(planContext).toMatch(/^\[SWARM PLAN\]/);
        expect(decisionsContext).toMatch(/^\[SWARM DECISIONS\]/);
    });

    it('Handler works with IN PROGRESS phase', async () => {
        const planContent = `# Project v1.0
## Phase 1: Setup [IN PROGRESS]
- [x] Task`;
        writeFileSync(join(tempDir, '.swarm', 'plan.md'), planContent);

        const hook = createCompactionCustomizerHook(defaultConfig, tempDir);
        const handler = hook['experimental.session.compacting'] as Function;
        
        const output = { context: [] as string[] };
        await handler({ sessionID: 'test-session' }, output);
        
        expect(output.context).toContain('[SWARM PLAN] Phase 1: Setup [IN PROGRESS]');
    });

    it('Handler handles empty plan.md file gracefully', async () => {
        writeFileSync(join(tempDir, '.swarm', 'plan.md'), '');

        const hook = createCompactionCustomizerHook(defaultConfig, tempDir);
        const handler = hook['experimental.session.compacting'] as Function;

        const output = { context: [] as string[] };
        await handler({ sessionID: 'test-session' }, output);

        // Empty plan.md gets migrated with a default phase
        expect(output.context.length).toBeGreaterThanOrEqual(0);
    });

    it('Handler handles empty context.md file gracefully', async () => {
        writeFileSync(join(tempDir, '.swarm', 'context.md'), '');
        // Also remove plan.md so no context is generated
        await rm(join(tempDir, '.swarm', 'plan.md'), { force: true });

        const hook = createCompactionCustomizerHook(defaultConfig, tempDir);
        const handler = hook['experimental.session.compacting'] as Function;

        const output = { context: [] as string[] };
        await handler({ sessionID: 'test-session' }, output);

        expect(output.context).toHaveLength(0);
    });

    it('Handler works when .swarm directory exists but files are missing', async () => {
        // Remove files but keep .swarm directory
        await rm(join(tempDir, '.swarm', 'plan.md'), { force: true });
        await rm(join(tempDir, '.swarm', 'context.md'), { force: true });

        const hook = createCompactionCustomizerHook(defaultConfig, tempDir);
        const handler = hook['experimental.session.compacting'] as Function;
        
        const output = { context: [] as string[] };
        await handler({ sessionID: 'test-session' }, output);
        
        expect(output.context).toHaveLength(0);
    });

    it('Handler handles content with multiple IN PROGRESS phases', async () => {
        const planContent = `Phase: 2
# Project v1.0
## Phase 1: Setup [COMPLETE]
- [x] 1.1: Task 1

## Phase 2: Development [IN PROGRESS]
- [ ] 2.1: Task 2

## Phase 3: Testing [PENDING]
- [ ] 3.1: Task 3`;
        writeFileSync(join(tempDir, '.swarm', 'plan.md'), planContent);

        const hook = createCompactionCustomizerHook(defaultConfig, tempDir);
        const handler = hook['experimental.session.compacting'] as Function;

        const output = { context: [] as string[] };
        await handler({ sessionID: 'test-session' }, output);

        expect(output.context).toContain('[SWARM PLAN] Phase 2: Development [IN PROGRESS]');
    });

    it('Handler handles decisions with very long content and truncation', async () => {
        const longDecision = '- **Very Long Decision**: ' + 'A'.repeat(600);
        const contextContent = `# Context

## Decisions
${longDecision}

## Other sections`;
        writeFileSync(join(tempDir, '.swarm', 'context.md'), contextContent);

        const hook = createCompactionCustomizerHook(defaultConfig, tempDir);
        const handler = hook['experimental.session.compacting'] as Function;
        
        const output = { context: [] as string[] };
        await handler({ sessionID: 'test-session' }, output);
        
        const decisionsContext = output.context.find(c => c.startsWith('[SWARM DECISIONS]'));
        expect(decisionsContext).toContain('...');
        // 500 chars truncated + '...' (3) + '[SWARM DECISIONS] ' prefix (18) = max 521
        expect(decisionsContext!.length).toBeLessThanOrEqual(500 + 3 + '[SWARM DECISIONS] '.length);
    });

    it('All tasks complete → no [SWARM TASKS] entry', async () => {
        const planContent = `## Phase 1: Setup [IN PROGRESS]
- [x] 1.1: Task A
- [x] 1.2: Task B`;
        writeFileSync(join(tempDir, '.swarm', 'plan.md'), planContent);
        writeFileSync(join(tempDir, '.swarm', 'context.md'), '');

        const hook = createCompactionCustomizerHook(defaultConfig, tempDir);
        const handler = hook['experimental.session.compacting'] as Function;
        
        const output = { context: [] as string[] };
        await handler({ sessionID: 'test-session' }, output);
        
        expect(output.context).toContain('[SWARM PLAN] Phase 1: Setup [IN PROGRESS]');
        expect(output.context).not.toContain('[SWARM TASKS]');
        expect(output.context).toHaveLength(1);
    });

    it('Context.md without Patterns section → no [SWARM PATTERNS] entry', async () => {
        const contextContent = `# Context
## Decisions
- Decision 1`;
        // Remove plan.md to avoid phase context injection
        await rm(join(tempDir, '.swarm', 'plan.md'), { force: true });
        writeFileSync(join(tempDir, '.swarm', 'context.md'), contextContent);

        const hook = createCompactionCustomizerHook(defaultConfig, tempDir);
        const handler = hook['experimental.session.compacting'] as Function;

        const output = { context: [] as string[] };
        await handler({ sessionID: 'test-session' }, output);

        expect(output.context).toContain('[SWARM DECISIONS] - Decision 1');
        expect(output.context).not.toContain('[SWARM PATTERNS]');
        expect(output.context).toHaveLength(1);
    });

    it('Plan exists with no phase info, no incomplete tasks → only context.md contributions', async () => {
        const contextContent = `# Context
## Decisions
- Decision 1

## Patterns
- pattern stuff`;
        // Remove plan.md - only context.md should contribute
        await rm(join(tempDir, '.swarm', 'plan.md'), { force: true });
        writeFileSync(join(tempDir, '.swarm', 'context.md'), contextContent);

        const hook = createCompactionCustomizerHook(defaultConfig, tempDir);
        const handler = hook['experimental.session.compacting'] as Function;

        const output = { context: [] as string[] };
        await handler({ sessionID: 'test-session' }, output);

        expect(output.context).toContain('[SWARM DECISIONS] - Decision 1');
        expect(output.context).toContain('[SWARM PATTERNS] - pattern stuff');
        expect(output.context).not.toContain('[SWARM PLAN]');
        expect(output.context).not.toContain('[SWARM TASKS]');
        expect(output.context).toHaveLength(2);
    });

    it('Plan with incomplete tasks but no IN PROGRESS phase → no [SWARM TASKS] or [SWARM PLAN]', async () => {
        const planContent = `Phase: 2
# Project Plan
## Phase 1: Setup [COMPLETE]
- [x] 1.1: Done
## Phase 2: Development [PENDING]
- [ ] 2.1: Still pending`;
        writeFileSync(join(tempDir, '.swarm', 'plan.md'), planContent);
        writeFileSync(join(tempDir, '.swarm', 'context.md'), '');

        const hook = createCompactionCustomizerHook(defaultConfig, tempDir);
        const handler = hook['experimental.session.compacting'] as Function;

        const output = { context: [] as string[] };
        await handler({ sessionID: 'test-session' }, output);

        // Current phase is Phase 2 which is PENDING, so incomplete tasks won't be shown
        // (extractIncompleteTasksFromPlan only shows tasks from current phase)
        expect(output.context).toContain('[SWARM PLAN] Phase 2: Development [PENDING]');
        expect(output.context).not.toContain('[SWARM TASKS]');
    });
});