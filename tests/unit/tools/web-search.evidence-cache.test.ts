import { afterEach, beforeEach, describe, expect, test, vi } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadPluginConfig } from '../../../src/config/loader.js';
import type { GeneralCouncilConfig } from '../../../src/council/general-council-types.js';
import {
	createWebSearchProvider,
	WebSearchConfigError,
	WebSearchError,
} from '../../../src/council/web-search-provider.js';

const mockSearch = vi.fn<
	[string, number],
	Promise<Array<{ title: string; url: string; snippet: string }>>
>();
const mockCreateProvider = vi.fn(() => ({
	search: mockSearch,
}));

vi.mock('../../../src/council/web-search-provider.js', () => ({
	createWebSearchProvider: mockCreateProvider,
	WebSearchConfigError,
	WebSearchError,
}));

vi.mock('../../../src/config/loader.js', () => ({
	loadPluginConfig: vi.fn(),
}));

const mockLoadPluginConfig = loadPluginConfig as ReturnType<typeof vi.fn>;

function buildConfig(overrides: Partial<GeneralCouncilConfig> = {}): {
	council?: { general?: GeneralCouncilConfig };
} {
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

describe('web_search evidence cache integration', () => {
	let tmpDir: string;

	beforeEach(async () => {
		vi.clearAllMocks();
		tmpDir = await fs.realpath(
			await fs.mkdtemp(path.join(os.tmpdir(), 'web-search-evidence-')),
		);
		mockLoadPluginConfig.mockReturnValue(buildConfig());
		mockSearch.mockResolvedValue([
			{
				title: 'Vitest Docs',
				url: 'https://example.test/vitest',
				snippet: 'Vitest is a frontend unit test runner.',
			},
		]);
		mockCreateProvider.mockReturnValue({ search: mockSearch });
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	test('stores search results as evidence records and returns citeable refs', async () => {
		const { web_search } = await import('../../../src/tools/web-search.js');
		const wrapped = web_search as unknown as {
			execute: (args: unknown, ctx: { directory: string }) => Promise<string>;
		};

		const result = await wrapped.execute(
			{ query: 'vitest docs' },
			{ directory: tmpDir },
		);
		const parsed = JSON.parse(result);

		expect(parsed.success).toBe(true);
		expect(parsed.evidence.stored).toBe(true);
		expect(parsed.evidence.path).toBe('.swarm/evidence-cache/documents.jsonl');
		expect(parsed.evidence.refs[0]).toMatch(
			/^evidence-cache:evd_[a-f0-9]{16}$/,
		);
		expect(parsed.results[0].evidenceRef).toBe(parsed.evidence.refs[0]);

		const cachePath = path.join(
			tmpDir,
			'.swarm',
			'evidence-cache',
			'documents.jsonl',
		);
		const row = JSON.parse((await fs.readFile(cachePath, 'utf-8')).trim());
		expect(row).toMatchObject({
			ref: parsed.evidence.refs[0],
			sourceType: 'web_search',
			query: 'vitest docs',
			title: 'Vitest Docs',
			url: 'https://example.test/vitest',
			text: 'Vitest is a frontend unit test runner.',
			createdBy: 'web_search',
		});
	});
});
