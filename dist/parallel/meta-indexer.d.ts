export interface MetaSummaryEntry {
    timestamp: string;
    phase?: number;
    taskId?: string;
    agent?: string;
    summary: string;
    source?: string;
}
/**
 * Extract meta.summary from event JSONL files
 */
export declare function extractMetaSummaries(eventsPath: string): MetaSummaryEntry[];
/**
 * Index meta summaries to external knowledge store
 */
export declare function indexMetaSummaries(directory: string, externalKnowledgeDir?: string): Promise<{
    indexed: number;
    path: string;
}>;
/**
 * Query indexed summaries
 */
export declare function querySummaries(directory: string, options?: {
    phase?: number;
    taskId?: string;
    agent?: string;
    since?: string;
}): MetaSummaryEntry[];
/**
 * Get latest summary for a task
 */
export declare function getLatestTaskSummary(directory: string, taskId: string): MetaSummaryEntry | undefined;
