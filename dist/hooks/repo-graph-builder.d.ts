/**
 * Repo Graph Builder Hook
 *
 * Startup hook that builds or refreshes the repo dependency graph when a session starts.
 * Write-trigger hook that incrementally updates the graph when write tools are called.
 * Wrapped in try/catch — failures are logged but never block plugin initialization.
 */
import { type RepoGraph } from '../tools/repo-graph';
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
    buildWorkspaceGraph: (workspace: string, options?: {
        maxFileSizeBytes?: number;
        maxFiles?: number;
    }) => RepoGraph;
    saveGraph: (workspace: string, graph: RepoGraph, options?: {
        createAtomic?: boolean;
    }) => Promise<void>;
    updateGraphForFiles: (workspace: string, files: string[], options?: {
        forceRebuild?: boolean;
    }) => Promise<RepoGraph>;
}
export declare function createRepoGraphBuilderHook(workspaceRoot: string, deps?: Partial<RepoGraphDeps>): RepoGraphBuilderHook;
