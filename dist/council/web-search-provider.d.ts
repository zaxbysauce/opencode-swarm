/**
 * Web search provider abstraction for the General Council Mode.
 *
 * Two concrete providers (Tavily, Brave) plus a factory that selects one
 * based on `GeneralCouncilConfig.searchProvider`. Pure HTTP layer — no tool
 * wiring or prompt rendering. Uses the native `fetch` API (Bun-compatible);
 * no external HTTP libraries.
 *
 * Errors are surfaced as typed exceptions:
 *   - WebSearchConfigError — missing API key (factory)
 *   - WebSearchError       — HTTP failure (4xx/5xx, network, timeout)
 * Malformed but successful responses produce an empty result array, never throw.
 */
import type { GeneralCouncilConfig, WebSearchResult } from './general-council-types.js';
export declare class WebSearchError extends Error {
    readonly cause?: unknown | undefined;
    constructor(message: string, cause?: unknown | undefined);
}
export declare class WebSearchConfigError extends Error {
    constructor(message: string);
}
export interface WebSearchProvider {
    search(query: string, maxResults: number): Promise<WebSearchResult[]>;
}
export declare class TavilyProvider implements WebSearchProvider {
    private readonly apiKey;
    constructor(apiKey: string);
    search(query: string, maxResults: number): Promise<WebSearchResult[]>;
}
export declare class BraveProvider implements WebSearchProvider {
    private readonly apiKey;
    constructor(apiKey: string);
    search(query: string, maxResults: number): Promise<WebSearchResult[]>;
}
export declare function createWebSearchProvider(config: GeneralCouncilConfig): WebSearchProvider;
