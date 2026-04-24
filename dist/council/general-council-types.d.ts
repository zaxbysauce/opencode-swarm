/**
 * General Council Mode — data contracts.
 *
 * Distinct from the Work Complete Council (`./types.ts`). The general council
 * is an advisory deliberation system: user-selected models each independently
 * web-search and answer a question, then optionally engage in a single
 * disagreement-targeted reconciliation round. A moderator agent synthesizes
 * the final user-facing answer.
 *
 * No business logic, no I/O. Only types, interfaces, and defaults.
 */
export type GeneralCouncilMemberRole = 'generalist' | 'skeptic' | 'domain_expert' | 'devil_advocate' | 'synthesizer';
export interface WebSearchResult {
    title: string;
    url: string;
    snippet: string;
    query: string;
}
export interface GeneralCouncilMemberConfig {
    memberId: string;
    model: string;
    role: GeneralCouncilMemberRole;
    persona?: string;
}
export interface GeneralCouncilMemberResponse {
    memberId: string;
    model: string;
    role: GeneralCouncilMemberRole;
    response: string;
    sources: WebSearchResult[];
    searchQueries: string[];
    /** Self-reported confidence (0.0–1.0) — feeds Quadratic Voting weighted consensus */
    confidence: number;
    areasOfUncertainty: string[];
    durationMs: number;
}
export interface GeneralCouncilDisagreementPosition {
    memberId: string;
    claim: string;
    evidence: string;
}
export interface GeneralCouncilDisagreement {
    topic: string;
    positions: GeneralCouncilDisagreementPosition[];
}
export interface GeneralCouncilDeliberationResponse extends GeneralCouncilMemberResponse {
    /** Topics the member addressed in Round 2 (subset of Round 1 disagreements). */
    disagreementTopics: string[];
}
export interface GeneralCouncilResult {
    question: string;
    mode: 'general' | 'spec_review';
    round1Responses: GeneralCouncilMemberResponse[];
    disagreements: GeneralCouncilDisagreement[];
    round2Responses: GeneralCouncilDeliberationResponse[];
    /** Structural synthesis markdown (sections: consensus / disagreements / sources). */
    synthesis: string;
    consensusPoints: string[];
    persistingDisagreements: string[];
    allSources: WebSearchResult[];
    /**
     * Final moderator output (when council.general.moderator: true and a moderator
     * model is configured). Populated by `convene-general-council.ts` after the
     * architect delegates the moderator prompt to `council_moderator`. Undefined
     * when no moderator pass is configured.
     */
    moderatorOutput?: string;
    timestamp: string;
}
/**
 * Config shape — matched in schema.ts via GeneralCouncilConfigSchema.
 *
 * `enabled` defaults to false (feature gate). The moderator pass requires
 * a configured `moderatorModel`; when set, the architect delegates the
 * moderator prompt produced by `convene_general_council` to the dedicated
 * `council_moderator` agent (no `web_search` access — synthesis only).
 */
export interface GeneralCouncilConfig {
    enabled: boolean;
    searchProvider: 'tavily' | 'brave';
    /**
     * Optional API key. When omitted, falls back to `TAVILY_API_KEY` or
     * `BRAVE_SEARCH_API_KEY` env vars depending on `searchProvider`.
     */
    searchApiKey?: string;
    members: GeneralCouncilMemberConfig[];
    /** Named groups of members for `/swarm council --preset <name>`. */
    presets: Record<string, GeneralCouncilMemberConfig[]>;
    /** When true, after Round 1 the architect routes disagreements back to disputing members. */
    deliberate: boolean;
    /** When true, the architect delegates a moderator pass to `council_moderator` after synthesis. */
    moderator: boolean;
    /** Required when `moderator: true` — model identifier for the council_moderator delegation. */
    moderatorModel?: string;
    /** Hard cap on results returned per member per search call (1–20). Defaults to 5. */
    maxSourcesPerMember: number;
}
export declare const GENERAL_COUNCIL_DEFAULTS: GeneralCouncilConfig;
