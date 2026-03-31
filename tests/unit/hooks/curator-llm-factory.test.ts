import { describe, expect, test, vi, beforeEach } from 'bun:test';
import { createCuratorLLMDelegate } from '../../../src/hooks/curator-llm-factory';
import { swarmState } from '../../../src/state';

// Mock swarmState so we can control opencodeClient
vi.mock('../../../src/state', () => ({
    swarmState: {
        opencodeClient: null,
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

    test('delegate creates ephemeral session and calls prompt', async () => {
        (swarmState as { opencodeClient: unknown }).opencodeClient = mockClient;
        mockCreate.mockResolvedValue({ data: { id: 'sess-123' } });
        mockPrompt.mockResolvedValue({
            data: { info: {}, parts: [{ type: 'text', text: 'BRIEFING: test output' }] },
        });

        const delegate = createCuratorLLMDelegate('/tmp/test')!;
        const result = await delegate('SYSTEM_PROMPT', 'user input');

        expect(mockCreate).toHaveBeenCalledWith({ query: { directory: '/tmp/test' } });
        expect(mockPrompt).toHaveBeenCalledWith({
            path: { id: 'sess-123' },
            body: {
                system: 'SYSTEM_PROMPT',
                tools: { write: false, edit: false, patch: false },
                parts: [{ type: 'text', text: 'user input' }],
            },
        });
        expect(result).toBe('BRIEFING: test output');
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
