/**
 * Adversarial security tests for maxSourcesPerMember wiring in src/tools/web-search.ts
 *
 * ONLY tests validation and boundary violations — malformed inputs, type mismatches,
 * boundary violations, and injection attempts. No happy paths.
 *
 * Attack vectors tested:
 *  1. max_results = 0 (below schema min of 1)
 *  2. max_results = -1 (negative)
 *  3. max_results = NaN (type confusion)
 *  4. max_results = Infinity (type confusion)
 *  5. max_results as string "10" (type mismatch)
 *  6. max_results = 21 (above schema max of 20)
 *  7. Config maxSourcesPerMember = 0 (below schema min of 1)
 *  8. Config maxSourcesPerMember = 21 (above schema max of 20)
 *  9. Very large query string (>500 chars)
 * 10. Empty query string
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'bun:test';
import type { GeneralCouncilConfig } from '../../../src/council/general-council-types.js';
import {
	WebSearchConfigError,
	WebSearchError,
	createWebSearchProvider,
} from '../../../src/council/web-search-provider.js';
import { loadPluginConfig } from '../../../src/config/loader.js';

// Mock the provider to prevent actual search calls
const mockSearch = vi.fn<[string, number], Promise<Array<{ title: string; url: string; snippet: string }>>>();
const mockCreateProvider = vi.fn(() => ({
	search: mockSearch,
}));

// Mock modules BEFORE importing web-search
vi.mock('../../../src/council/web-search-provider.js', () => ({
	createWebSearchProvider: mockCreateProvider,
	WebSearchConfigError,
	WebSearchError,
}));

vi.mock('../../../src/config/loader.js', () => ({
	loadPluginConfig: vi.fn(),
}));

const ORIGINAL_FETCH = globalThis.fetch;

const mockLoadPluginConfig = loadPluginConfig as ReturnType<typeof vi.fn>;

function buildConfig(overrides: Partial<GeneralCouncilConfig> = {}): { council?: { general?: GeneralCouncilConfig } } {
	return {
		council: {
			general: {
				enabled: true,
				searchProvider: 'tavily',
				members: [],
				presets: {},
				deliberate: true,
				moderator: false,
				maxSourcesPerMember: 5,
				...overrides,
			},
		},
	};
}

describe('Adversarial: max_results validation', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		globalThis.fetch = ORIGINAL_FETCH;
		mockSearch.mockResolvedValue([
			{ title: 'Result', url: 'https://example.com', snippet: 'Snippet' },
		]);
	});

	afterEach(() => {
		globalThis.fetch = ORIGINAL_FETCH;
	});

	test('1. max_results = 0 should fail Zod validation (below min of 1)', async () => {
		mockLoadPluginConfig.mockReturnValue(buildConfig());
		mockCreateProvider.mockReturnValue({ search: mockSearch });

		const { web_search } = await import('../../../src/tools/web-search.js');
		const wrapped = web_search as unknown as {
			execute: (args: unknown, dir: string) => Promise<string>;
		};

		const result = await wrapped.execute({ query: 'test', max_results: 0 }, '/tmp/test');
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(false);
		expect(parsed.reason).toBe('invalid_args');
		expect(parsed.message).toContain('max_results');
		// Should not reach provider
		expect(mockSearch).not.toHaveBeenCalled();
	});

	test('2. max_results = -1 should fail Zod validation (negative)', async () => {
		mockLoadPluginConfig.mockReturnValue(buildConfig());
		mockCreateProvider.mockReturnValue({ search: mockSearch });

		const { web_search } = await import('../../../src/tools/web-search.js');
		const wrapped = web_search as unknown as {
			execute: (args: unknown, dir: string) => Promise<string>;
		};

		const result = await wrapped.execute({ query: 'test', max_results: -1 }, '/tmp/test');
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(false);
		expect(parsed.reason).toBe('invalid_args');
		expect(mockSearch).not.toHaveBeenCalled();
	});

	test('3. max_results = NaN should fail Zod validation (type confusion)', async () => {
		mockLoadPluginConfig.mockReturnValue(buildConfig());
		mockCreateProvider.mockReturnValue({ search: mockSearch });

		const { web_search } = await import('../../../src/tools/web-search.js');
		const wrapped = web_search as unknown as {
			execute: (args: unknown, dir: string) => Promise<string>;
		};

		// NaN is technically a number type but fails .int() check
		const result = await wrapped.execute({ query: 'test', max_results: NaN }, '/tmp/test');
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(false);
		expect(parsed.reason).toBe('invalid_args');
		expect(mockSearch).not.toHaveBeenCalled();
	});

	test('4. max_results = Infinity should fail Zod validation (type confusion)', async () => {
		mockLoadPluginConfig.mockReturnValue(buildConfig());
		mockCreateProvider.mockReturnValue({ search: mockSearch });

		const { web_search } = await import('../../../src/tools/web-search.js');
		const wrapped = web_search as unknown as {
			execute: (args: unknown, dir: string) => Promise<string>;
		};

		const result = await wrapped.execute({ query: 'test', max_results: Infinity }, '/tmp/test');
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(false);
		expect(parsed.reason).toBe('invalid_args');
		expect(mockSearch).not.toHaveBeenCalled();
	});

	test('5. max_results as string "10" should fail Zod validation (type mismatch)', async () => {
		mockLoadPluginConfig.mockReturnValue(buildConfig());
		mockCreateProvider.mockReturnValue({ search: mockSearch });

		const { web_search } = await import('../../../src/tools/web-search.js');
		const wrapped = web_search as unknown as {
			execute: (args: unknown, dir: string) => Promise<string>;
		};

		// @ts-expect-error — intentionally passing wrong type to test runtime validation
		const result = await wrapped.execute({ query: 'test', max_results: '10' }, '/tmp/test');
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(false);
		expect(parsed.reason).toBe('invalid_args');
		expect(mockSearch).not.toHaveBeenCalled();
	});

	test('6. max_results = 21 should fail Zod validation (above schema max of 20)', async () => {
		mockLoadPluginConfig.mockReturnValue(buildConfig());
		mockCreateProvider.mockReturnValue({ search: mockSearch });

		const { web_search } = await import('../../../src/tools/web-search.js');
		const wrapped = web_search as unknown as {
			execute: (args: unknown, dir: string) => Promise<string>;
		};

		const result = await wrapped.execute({ query: 'test', max_results: 21 }, '/tmp/test');
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(false);
		expect(parsed.reason).toBe('invalid_args');
		expect(parsed.message).toContain('max_results');
		expect(mockSearch).not.toHaveBeenCalled();
	});
});

describe('Adversarial: config maxSourcesPerMember validation', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		globalThis.fetch = ORIGINAL_FETCH;
	});

	afterEach(() => {
		globalThis.fetch = ORIGINAL_FETCH;
	});

	test('7. Config maxSourcesPerMember = 0 should fail Zod validation at config load time', async () => {
		// This tests the schema validation in src/config/schema.ts
		// GeneralCouncilConfigSchema.safeParse rejects values below min(1)
		const { GeneralCouncilConfigSchema } = await import('../../../src/config/schema.js');

		const result = GeneralCouncilConfigSchema.safeParse({
			maxSourcesPerMember: 0,
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues.some(i => i.path.includes('maxSourcesPerMember'))).toBe(true);
		}
	});

	test('8. Config maxSourcesPerMember = 21 should fail Zod validation', async () => {
		const { GeneralCouncilConfigSchema } = await import('../../../src/config/schema.js');

		const result = GeneralCouncilConfigSchema.safeParse({
			maxSourcesPerMember: 21,
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues.some(i => i.path.includes('maxSourcesPerMember'))).toBe(true);
		}
	});
});

describe('Adversarial: query string validation', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		globalThis.fetch = ORIGINAL_FETCH;
		mockSearch.mockResolvedValue([
			{ title: 'Result', url: 'https://example.com', snippet: 'Snippet' },
		]);
	});

	afterEach(() => {
		globalThis.fetch = ORIGINAL_FETCH;
	});

	test('9. Very large query string (>500 chars) should fail validation', async () => {
		mockLoadPluginConfig.mockReturnValue(buildConfig());
		mockCreateProvider.mockReturnValue({ search: mockSearch });

		const { web_search } = await import('../../../src/tools/web-search.js');
		const wrapped = web_search as unknown as {
			execute: (args: unknown, dir: string) => Promise<string>;
		};

		// String of 501 characters (above max of 500)
		const largeQuery = 'a'.repeat(501);
		expect(largeQuery.length).toBe(501);

		const result = await wrapped.execute({ query: largeQuery }, '/tmp/test');
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(false);
		expect(parsed.reason).toBe('invalid_args');
		expect(parsed.message).toContain('query');
		expect(mockSearch).not.toHaveBeenCalled();
	});

	test('10. Empty query string should fail validation', async () => {
		mockLoadPluginConfig.mockReturnValue(buildConfig());
		mockCreateProvider.mockReturnValue({ search: mockSearch });

		const { web_search } = await import('../../../src/tools/web-search.js');
		const wrapped = web_search as unknown as {
			execute: (args: unknown, dir: string) => Promise<string>;
		};

		const result = await wrapped.execute({ query: '' }, '/tmp/test');
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(false);
		expect(parsed.reason).toBe('invalid_args');
		expect(parsed.message).toContain('query');
		expect(mockSearch).not.toHaveBeenCalled();
	});
});
