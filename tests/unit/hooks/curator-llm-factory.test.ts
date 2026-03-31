import { describe, expect, test, vi, beforeEach } from 'bun:test';
import { createCuratorLLMDelegate } from '../../../src/hooks/curator-llm-factory';
import { swarmState } from '../../../src/state';

// Mock swarmState so we can control opencodeClient and curator agent names
vi.mock('../../../src/state', () => ({
    swarmState: {
        opencodeClient: null,
        curatorInitAgentName: null,
        curatorPhaseAgentName: null,
    },
}));

const mockDelete = vi.fn().mockResolvedValue({ data: undefined });
const mockPrompt = vi.fn();
const mockCreate = vi.fn();

const mockClient = {
    session: {
        create: mockCreate,
        prompt: mockPrompt,
        delete: mockDelete,
    },
} as never;

beforeEach(() => {
    vi.clearAllMocks();
    (swarmState as { opencodeClient: unknown }).opencodeClient = null;
    (swarmState as { curatorInitAgentName: unknown }).curatorInitAgentName = null;
    (swarmState as { curatorPhaseAgentName: unknown }).curatorPhaseAgentName = null;
});

describe('createCuratorLLMDelegate', () => {
    test('returns undefined when opencodeClient is null', () => {
        (swarmState as { opencodeClient: unknown }).opencodeClient = null;
        const delegate = createCuratorLLMDelegate('/tmp/test');
        expect(delegate).toBeUndefined();
    });

    test('returns a delegate function when client is available', () => {
        (swarmState as { opencodeClient: unknown }).opencodeClient = mockClient;
        const delegate = createCuratorLLMDelegate('/tmp/test');
        expect(typeof delegate).toBe('function');
    });

    test('delegate uses curator_init agent name for init mode (default)', async () => {
        (swarmState as { opencodeClient: unknown }).opencodeClient = mockClient;
        (swarmState as { curatorInitAgentName: unknown }).curatorInitAgentName = 'curator_init';
        mockCreate.mockResolvedValue({ data: { id: 'sess-123' } });
        mockPrompt.mockResolvedValue({
            data: { info: {}, parts: [{ type: 'text', text: 'BRIEFING: test output' }] },
        });

        const delegate = createCuratorLLMDelegate('/tmp/test', 'init')!;
        const result = await delegate('SYSTEM_PROMPT', 'user input');

        expect(mockCreate).toHaveBeenCalledWith({ query: { directory: '/tmp/test' } });
        expect(mockPrompt).toHaveBeenCalledWith({
            path: { id: 'sess-123' },
            body: {
                agent: 'curator_init',
                system: 'SYSTEM_PROMPT',
                tools: { write: false, edit: false, patch: false },
                parts: [{ type: 'text', text: 'user input' }],
            },
        });
        expect(result).toBe('BRIEFING: test output');
    });

    test('delegate uses curator_phase agent name for phase mode', async () => {
        (swarmState as { opencodeClient: unknown }).opencodeClient = mockClient;
        (swarmState as { curatorPhaseAgentName: unknown }).curatorPhaseAgentName = 'curator_phase';
        mockCreate.mockResolvedValue({ data: { id: 'sess-phase' } });
        mockPrompt.mockResolvedValue({
            data: { info: {}, parts: [{ type: 'text', text: 'phase output' }] },
        });

        const delegate = createCuratorLLMDelegate('/tmp/test', 'phase')!;
        await delegate('PHASE_PROMPT', 'phase input');

        expect(mockPrompt).toHaveBeenCalledWith({
            path: { id: 'sess-phase' },
            body: {
                agent: 'curator_phase',
                system: 'PHASE_PROMPT',
                tools: { write: false, edit: false, patch: false },
                parts: [{ type: 'text', text: 'phase input' }],
            },
        });
    });

    test('delegate uses prefixed agent name for non-default swarms', async () => {
        (swarmState as { opencodeClient: unknown }).opencodeClient = mockClient;
        // Prefixed name as set by src/index.ts for a 'local' swarm
        (swarmState as { curatorInitAgentName: unknown }).curatorInitAgentName = 'local_curator_init';
        mockCreate.mockResolvedValue({ data: { id: 'sess-prefix' } });
        mockPrompt.mockResolvedValue({
            data: { info: {}, parts: [{ type: 'text', text: 'ok' }] },
        });

        const delegate = createCuratorLLMDelegate('/tmp/test', 'init')!;
        await delegate('SYS', 'input');

        expect(mockPrompt).toHaveBeenCalledWith({
            path: { id: 'sess-prefix' },
            body: expect.objectContaining({ agent: 'local_curator_init' }),
        });
    });

    test('delegate falls back to bare agent name when swarmState not populated', async () => {
        (swarmState as { opencodeClient: unknown }).opencodeClient = mockClient;
        // curatorInitAgentName left as null (e.g., if resolver ran before agents built)
        mockCreate.mockResolvedValue({ data: { id: 'sess-fallback' } });
        mockPrompt.mockResolvedValue({
            data: { info: {}, parts: [{ type: 'text', text: 'fallback ok' }] },
        });

        const delegate = createCuratorLLMDelegate('/tmp/test', 'init')!;
        await delegate('SYS', 'input');

        expect(mockPrompt).toHaveBeenCalledWith({
            path: { id: 'sess-fallback' },
            body: expect.objectContaining({ agent: 'curator_init' }),
        });
    });

    test('delegate deletes ephemeral session in finally block', async () => {
        (swarmState as { opencodeClient: unknown }).opencodeClient = mockClient;
        mockCreate.mockResolvedValue({ data: { id: 'sess-abc' } });
        mockPrompt.mockResolvedValue({
            data: { info: {}, parts: [{ type: 'text', text: 'ok' }] },
        });

        const delegate = createCuratorLLMDelegate('/tmp/test')!;
        await delegate('SYS', 'input');

        expect(mockDelete).toHaveBeenCalledWith({ path: { id: 'sess-abc' } });
    });

    test('delegate deletes session in finally even on prompt error', async () => {
        (swarmState as { opencodeClient: unknown }).opencodeClient = mockClient;
        mockCreate.mockResolvedValue({ data: { id: 'sess-err' } });
        mockPrompt.mockRejectedValue(new Error('LLM_FAILURE'));

        const delegate = createCuratorLLMDelegate('/tmp/test')!;
        await expect(delegate('SYS', 'input')).rejects.toThrow('LLM_FAILURE');

        expect(mockDelete).toHaveBeenCalledWith({ path: { id: 'sess-err' } });
    });

    test('delegate throws if session.create fails', async () => {
        (swarmState as { opencodeClient: unknown }).opencodeClient = mockClient;
        mockCreate.mockResolvedValue({ data: undefined, error: 'server error' });

        const delegate = createCuratorLLMDelegate('/tmp/test')!;
        await expect(delegate('SYS', 'input')).rejects.toThrow('Failed to create curator session');
    });

    test('multiple text parts are joined with newline', async () => {
        (swarmState as { opencodeClient: unknown }).opencodeClient = mockClient;
        mockCreate.mockResolvedValue({ data: { id: 'sess-multi' } });
        mockPrompt.mockResolvedValue({
            data: {
                info: {},
                parts: [
                    { type: 'text', text: 'part one' },
                    { type: 'tool', id: 'tool-1' },
                    { type: 'text', text: 'part two' },
                ],
            },
        });

        const delegate = createCuratorLLMDelegate('/tmp/test')!;
        const result = await delegate('SYS', 'input');

        expect(result).toBe('part one\npart two');
    });

    test('non-text parts are filtered out', async () => {
        (swarmState as { opencodeClient: unknown }).opencodeClient = mockClient;
        mockCreate.mockResolvedValue({ data: { id: 'sess-filter' } });
        mockPrompt.mockResolvedValue({
            data: {
                info: {},
                parts: [
                    { type: 'reasoning', text: 'internal thought' },
                    { type: 'text', text: 'final answer' },
                ],
            },
        });

        const delegate = createCuratorLLMDelegate('/tmp/test')!;
        const result = await delegate('SYS', 'input');

        expect(result).toBe('final answer');
    });
});
