export interface SelfReviewConfig {
    enabled: boolean;
    skip_in_turbo: boolean;
}
export declare function createSelfReviewHook(config: Partial<SelfReviewConfig>, injectAdvisory: (sessionId: string, message: string) => void): {
    toolAfter: (input: {
        tool: string;
        sessionID: string;
        callID: string;
    }, output: {
        args?: Record<string, unknown>;
        output?: unknown;
    }) => Promise<void>;
};
