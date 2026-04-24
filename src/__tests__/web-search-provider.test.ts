/**
 * Tests for src/council/web-search-provider.ts and src/tools/web-search.ts.
 *
 * All HTTP calls are mocked via globalThis.fetch — no real network traffic.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { AGENT_TOOL_MAP } from '../config/constants';
import type { GeneralCouncilConfig } from '../council/general-council-types.js';
import {
	BraveProvider,
	createWebSearchProvider,
	TavilyProvider,
	WebSearchConfigError,
	WebSearchError,
} from '../council/web-search-provider.js';

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = ORIGINAL_FETCH;
	delete process.env.TAVILY_API_KEY;
	delete process.env.BRAVE_SEARCH_API_KEY;
});

function mockFetchOk(body: unknown): void {
	globalThis.fetch = (async () =>
		new Response(JSON.stringify(body), {
			status: 200,
		})) as unknown as typeof fetch;
}

function mockFetchStatus(status: number): void {
	globalThis.fetch = (async () =>
		new Response('error', { status })) as unknown as typeof fetch;
}

function mockFetchNetworkError(): void {
	globalThis.fetch = (async () => {
		throw new TypeError('network down');
	}) as unknown as typeof fetch;
}

function mockFetchInvalidJSON(): void {
	globalThis.fetch = (async () =>
		new Response('not-json{', { status: 200 })) as unknown as typeof fetch;
}

describe('TavilyProvider', () => {
	test('happy path: maps results[].title/url/content correctly', async () => {
		mockFetchOk({
			results: [
				{ title: 'A', url: 'https://a.example', content: 'About A' },
				{ title: 'B', url: 'https://b.example', content: 'About B' },
			],
		});
		const p = new TavilyProvider('key');
		const results = await p.search('test query', 5);
		expect(results.length).toBe(2);
		expect(results[0]).toEqual({
			title: 'A',
			url: 'https://a.example',
			snippet: 'About A',
			query: 'test query',
		});
	});

	test('HTTP 401 → WebSearchError', async () => {
		mockFetchStatus(401);
		const p = new TavilyProvider('key');
		await expect(p.search('q', 5)).rejects.toBeInstanceOf(WebSearchError);
	});

	test('HTTP 429 → WebSearchError', async () => {
		mockFetchStatus(429);
		const p = new TavilyProvider('key');
		await expect(p.search('q', 5)).rejects.toBeInstanceOf(WebSearchError);
	});

	test('Network error → WebSearchError', async () => {
		mockFetchNetworkError();
		const p = new TavilyProvider('key');
		await expect(p.search('q', 5)).rejects.toBeInstanceOf(WebSearchError);
	});

	test('Malformed JSON body → WebSearchError', async () => {
		mockFetchInvalidJSON();
		const p = new TavilyProvider('key');
		await expect(p.search('q', 5)).rejects.toBeInstanceOf(WebSearchError);
	});

	test('Successful response with no results array → empty array, no throw', async () => {
		mockFetchOk({ unrelated: true });
		const p = new TavilyProvider('key');
		const results = await p.search('q', 5);
		expect(results).toEqual([]);
	});

	test('Successful response with malformed result entries → filtered out', async () => {
		mockFetchOk({
			results: [
				{ title: 'A', url: 'https://a.example', content: 'About A' },
				{ title: 123, url: null, content: undefined }, // garbage
				{ title: 'C', url: 'https://c.example' /* no content */ },
			],
		});
		const p = new TavilyProvider('key');
		const results = await p.search('q', 5);
		expect(results.length).toBe(1);
		expect(results[0].title).toBe('A');
	});
});

describe('BraveProvider', () => {
	test('happy path: maps web.results[].title/url/description correctly', async () => {
		mockFetchOk({
			web: {
				results: [
					{ title: 'B1', url: 'https://b1', description: 'D1' },
					{ title: 'B2', url: 'https://b2', description: 'D2' },
				],
			},
		});
		const p = new BraveProvider('key');
		const results = await p.search('q', 5);
		expect(results).toEqual([
			{ title: 'B1', url: 'https://b1', snippet: 'D1', query: 'q' },
			{ title: 'B2', url: 'https://b2', snippet: 'D2', query: 'q' },
		]);
	});

	test('HTTP 401 → WebSearchError', async () => {
		mockFetchStatus(401);
		const p = new BraveProvider('key');
		await expect(p.search('q', 5)).rejects.toBeInstanceOf(WebSearchError);
	});

	test('HTTP 429 → WebSearchError', async () => {
		mockFetchStatus(429);
		const p = new BraveProvider('key');
		await expect(p.search('q', 5)).rejects.toBeInstanceOf(WebSearchError);
	});

	test('Network error → WebSearchError', async () => {
		mockFetchNetworkError();
		const p = new BraveProvider('key');
		await expect(p.search('q', 5)).rejects.toBeInstanceOf(WebSearchError);
	});

	test('Malformed JSON → WebSearchError', async () => {
		mockFetchInvalidJSON();
		const p = new BraveProvider('key');
		await expect(p.search('q', 5)).rejects.toBeInstanceOf(WebSearchError);
	});

	test('Successful response with no web.results → empty array', async () => {
		mockFetchOk({ web: {} });
		const p = new BraveProvider('key');
		const results = await p.search('q', 5);
		expect(results).toEqual([]);
	});
});

describe('createWebSearchProvider', () => {
	const baseConfig: GeneralCouncilConfig = {
		enabled: true,
		searchProvider: 'tavily',
		members: [],
		presets: {},
		deliberate: true,
		moderator: false,
		maxSourcesPerMember: 5,
	};

	test('selects TavilyProvider when searchProvider is tavily', () => {
		const provider = createWebSearchProvider({
			...baseConfig,
			searchApiKey: 'inline-key',
		});
		expect(provider).toBeInstanceOf(TavilyProvider);
	});

	test('selects BraveProvider when searchProvider is brave', () => {
		const provider = createWebSearchProvider({
			...baseConfig,
			searchProvider: 'brave',
			searchApiKey: 'inline-key',
		});
		expect(provider).toBeInstanceOf(BraveProvider);
	});

	test('falls back to TAVILY_API_KEY env when no inline key', () => {
		process.env.TAVILY_API_KEY = 'env-tavily-key';
		const provider = createWebSearchProvider(baseConfig);
		expect(provider).toBeInstanceOf(TavilyProvider);
	});

	test('falls back to BRAVE_SEARCH_API_KEY env when no inline key', () => {
		process.env.BRAVE_SEARCH_API_KEY = 'env-brave-key';
		const provider = createWebSearchProvider({
			...baseConfig,
			searchProvider: 'brave',
		});
		expect(provider).toBeInstanceOf(BraveProvider);
	});

	test('throws WebSearchConfigError when no key (config or env)', () => {
		expect(() => createWebSearchProvider(baseConfig)).toThrow(
			WebSearchConfigError,
		);
	});

	test('inline key takes precedence over env', () => {
		process.env.TAVILY_API_KEY = 'env-key';
		// Doesn't fail even though env is set — uses inline key
		const provider = createWebSearchProvider({
			...baseConfig,
			searchApiKey: 'inline-key',
		});
		expect(provider).toBeInstanceOf(TavilyProvider);
	});
});

describe('AGENT_TOOL_MAP enforcement', () => {
	test('web_search is in council_member only', () => {
		expect(AGENT_TOOL_MAP.council_member).toContain('web_search');
	});

	test('web_search is NOT in architect', () => {
		expect(AGENT_TOOL_MAP.architect).not.toContain('web_search');
	});

	test('web_search is NOT in any other agent', () => {
		const otherAgents = Object.keys(AGENT_TOOL_MAP).filter(
			(a) => a !== 'council_member',
		);
		for (const agent of otherAgents) {
			expect(
				AGENT_TOOL_MAP[agent as keyof typeof AGENT_TOOL_MAP],
			).not.toContain('web_search');
		}
	});

	test('council_moderator has empty tool list (synthesis only)', () => {
		expect(AGENT_TOOL_MAP.council_moderator).toEqual([]);
	});
});

describe('web_search tool', () => {
	beforeEach(() => {
		// Clean fetch mock between tests
		globalThis.fetch = ORIGINAL_FETCH;
	});

	test('returns structured error when council.general not configured', async () => {
		const { web_search } = await import('../tools/web-search.js');
		// Re-import to get fresh instance; execute via the wrapped handler
		const wrapped = web_search as unknown as {
			execute: (args: unknown, dir: string) => Promise<string>;
		};
		// Use a temp-like dir; loadPluginConfig will return guardrail defaults (no council.general)
		const result = await wrapped.execute(
			{ query: 'test' },
			`/tmp/non-existent-${Date.now()}`,
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.reason).toBe('council_general_disabled');
	});

	test('returns structured error on invalid args (empty query)', async () => {
		const { web_search } = await import('../tools/web-search.js');
		const wrapped = web_search as unknown as {
			execute: (args: unknown, dir: string) => Promise<string>;
		};
		const result = await wrapped.execute(
			{ query: '' },
			`/tmp/non-existent-${Date.now()}`,
		);
		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.reason).toBe('invalid_args');
	});
});
