import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentDefinition } from '../../../src/agents';
import { handleStatusCommand } from '../../../src/commands/status';
import type { Plan } from '../../../src/config/plan-schema';

describe('handleStatusCommand', () => {
    const mockAgents: Record<string, AgentDefinition> = {
        architect: { name: 'architect', description: 'Architect', config: { model: 'gpt-4', temperature: 0.1 } },
        coder: { name: 'coder', description: 'Coder', config: { model: 'claude-3', temperature: 0.2 } },
    };

    let tempDir: string;

    beforeEach(async () => {
        // Create a temporary directory for each test
        tempDir = await mkdtemp(join(tmpdir(), 'swarm-test-'));
    });

    afterEach(async () => {
        // Clean up the temporary directory after each test
        await rm(tempDir, { recursive: true, force: true });
    });

    async function writePlanMd(dir: string, content: string) {
        // Create .swarm directory and write plan.md (legacy format)
        const swarmDir = join(dir, '.swarm');
        await mkdir(swarmDir, { recursive: true });
        await writeFile(join(swarmDir, 'plan.md'), content);
    }

    async function writePlanJson(dir: string, plan: Plan) {
        // Create .swarm directory and write plan.json (structured format)
        const swarmDir = join(dir, '.swarm');
        await mkdir(swarmDir, { recursive: true });
        await writeFile(join(swarmDir, 'plan.json'), JSON.stringify(plan, null, 2));
    }

    test('returns "No active swarm plan found." when plan.md is missing', async () => {
        const result = await handleStatusCommand(tempDir, mockAgents);
        expect(result).toBe('No active swarm plan found.');
    });

    test('shows correct phase when plan has IN PROGRESS phase', async () => {
        const plan: Plan = {
            schema_version: '1.0.0',
            title: 'Test Plan',
            swarm: 'test-swarm',
            current_phase: 2,
            phases: [
                { id: 1, name: 'Phase 1', status: 'complete', tasks: [] },
                { id: 2, name: 'Context Pruning', status: 'in_progress', tasks: [
                    { id: '2.1', phase: 2, status: 'completed', size: 'small', description: 'Task 1', depends: [], files_touched: [] },
                    { id: '2.2', phase: 2, status: 'pending', size: 'small', description: 'Task 2', depends: [], files_touched: [] },
                    { id: '2.3', phase: 2, status: 'pending', size: 'small', description: 'Task 3', depends: [], files_touched: [] },
                ]},
            ],
        };
        await writePlanJson(tempDir, plan);
        const result = await handleStatusCommand(tempDir, mockAgents);
        expect(result).toContain('Phase 2');
        expect(result).toContain('1/3 complete');
        expect(result).toContain('2 registered');
    });

    test('shows "Unknown" phase when no valid plan found', async () => {
        // No plan files - should return "No active swarm plan found"
        const result = await handleStatusCommand(tempDir, mockAgents);
        expect(result).toBe('No active swarm plan found.');
    });

    test('counts completed and incomplete tasks correctly', async () => {
        const plan: Plan = {
            schema_version: '1.0.0',
            title: 'Test Plan',
            swarm: 'test-swarm',
            current_phase: 2,
            phases: [
                { id: 1, name: 'Phase 1', status: 'complete', tasks: [
                    { id: '1.1', phase: 1, status: 'completed', size: 'small', description: 'A', depends: [], files_touched: [] },
                    { id: '1.2', phase: 1, status: 'completed', size: 'small', description: 'B', depends: [], files_touched: [] },
                    { id: '1.3', phase: 1, status: 'completed', size: 'small', description: 'C', depends: [], files_touched: [] },
                ]},
                { id: 2, name: 'Phase 2', status: 'in_progress', tasks: [
                    { id: '2.1', phase: 2, status: 'pending', size: 'small', description: 'D', depends: [], files_touched: [] },
                    { id: '2.2', phase: 2, status: 'pending', size: 'small', description: 'E', depends: [], files_touched: [] },
                ]},
            ],
        };
        await writePlanJson(tempDir, plan);
        const result = await handleStatusCommand(tempDir, mockAgents);
        expect(result).toContain('3/5 complete');
    });

    test('shows correct agent count', async () => {
        const singleAgent: Record<string, AgentDefinition> = {
            architect: { name: 'architect', config: { model: 'gpt-4' } },
        };
        const plan: Plan = {
            schema_version: '1.0.0',
            title: 'Test Plan',
            swarm: 'test-swarm',
            current_phase: 1,
            phases: [
                { id: 1, name: 'Phase 1', status: 'in_progress', tasks: [
                    { id: '1.1', phase: 1, status: 'pending', size: 'small', description: 'Task', depends: [], files_touched: [] },
                ]},
            ],
        };
        await writePlanJson(tempDir, plan);
        const result = await handleStatusCommand(tempDir, singleAgent);
        expect(result).toContain('1 registered');
    });

    test('returns proper markdown format', async () => {
        const plan: Plan = {
            schema_version: '1.0.0',
            title: 'Test Plan',
            swarm: 'test-swarm',
            current_phase: 1,
            phases: [
                { id: 1, name: 'Phase 1', status: 'in_progress', tasks: [
                    { id: '1.1', phase: 1, status: 'completed', size: 'small', description: 'A', depends: [], files_touched: [] },
                    { id: '1.2', phase: 1, status: 'pending', size: 'small', description: 'B', depends: [], files_touched: [] },
                ]},
            ],
        };
        await writePlanJson(tempDir, plan);
        const result = await handleStatusCommand(tempDir, mockAgents);
        expect(result).toStartWith('## Swarm Status');
        expect(result).toContain('**Current Phase**');
        expect(result).toContain('**Tasks**');
        expect(result).toContain('**Agents**');
    });

    test('handles empty plan.md file', async () => {
        await writePlanMd(tempDir, '');
        const result = await handleStatusCommand(tempDir, mockAgents);
        // Empty plan.md gets migrated with a default phase
        // The migration creates a minimal plan structure
        expect(result).toContain('0/0 complete');
        expect(result).toContain('2 registered');
    });

    test('shows all tasks complete when all tasks are completed', async () => {
        const plan: Plan = {
            schema_version: '1.0.0',
            title: 'Test Plan',
            swarm: 'test-swarm',
            current_phase: 1,
            phases: [
                { id: 1, name: 'Phase 1', status: 'complete', tasks: [
                    { id: '1.1', phase: 1, status: 'completed', size: 'small', description: 'Task 1', depends: [], files_touched: [] },
                    { id: '1.2', phase: 1, status: 'completed', size: 'small', description: 'Task 2', depends: [], files_touched: [] },
                    { id: '1.3', phase: 1, status: 'completed', size: 'small', description: 'Task 3', depends: [], files_touched: [] },
                ]},
            ],
        };
        await writePlanJson(tempDir, plan);
        const result = await handleStatusCommand(tempDir, mockAgents);
        expect(result).toContain('3/3 complete');
    });

    test('shows 0/0 complete for plan without tasks', async () => {
        const plan: Plan = {
            schema_version: '1.0.0',
            title: 'Test Plan',
            swarm: 'test-swarm',
            current_phase: 1,
            phases: [
                { id: 1, name: 'Planning', status: 'in_progress', tasks: [] },
            ],
        };
        await writePlanJson(tempDir, plan);
        const result = await handleStatusCommand(tempDir, mockAgents);
        expect(result).toContain('0/0 complete');
    });

    test('shows 0 registered for empty agents record', async () => {
        const plan: Plan = {
            schema_version: '1.0.0',
            title: 'Test Plan',
            swarm: 'test-swarm',
            current_phase: 1,
            phases: [
                { id: 1, name: 'Phase 1', status: 'in_progress', tasks: [
                    { id: '1.1', phase: 1, status: 'pending', size: 'small', description: 'Task', depends: [], files_touched: [] },
                ]},
            ],
        };
        await writePlanJson(tempDir, plan);
        const emptyAgents: Record<string, AgentDefinition> = {};
        const result = await handleStatusCommand(tempDir, emptyAgents);
        expect(result).toContain('0 registered');
    });
});