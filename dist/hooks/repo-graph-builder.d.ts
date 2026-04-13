/**
 * Repo Graph Builder Hook
 *
 * Startup hook that builds or refreshes the repo dependency graph when a session starts.
 * Write-trigger hook that incrementally updates the graph when write tools are called.
 * Wrapped in try/catch — failures are logged but never block plugin initialization.
 */
export interface RepoGraphBuilderHook {
    init(): Promise<void>;
    toolAfter(input: {
        tool: string;
        sessionID: string;
        args?: unknown;
    }, output: {
        output?: unknown;
        args?: unknown;
    }): Promise<void>;
}
export interface RepoGraphDeps {
    buildWorkspaceGraph: (workspace: string, options?: any) => any;
    saveGraph: (workspace: string, graph: any) => Promise<void>;
    updateGraphForFiles: (workspace: string, files: string[], options?: any) => Promise<any>;
}
export declare function createRepoGraphBuilderHook(workspaceRoot: string, deps?: Partial<RepoGraphDeps>): RepoGraphBuilderHook;
