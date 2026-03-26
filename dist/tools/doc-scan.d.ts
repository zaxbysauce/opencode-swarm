import { createSwarmTool } from './create-tool.js';
export interface DocManifestFile {
    path: string;
    title: string;
    summary: string;
    lines: number;
    mtime: number;
}
export interface DocManifest {
    schema_version: 1;
    scanned_at: string;
    files: DocManifestFile[];
}
export declare function scanDocIndex(directory: string): Promise<{
    manifest: DocManifest;
    cached: boolean;
}>;
/**
 * Extract actionable constraints from project documentation relevant to a task.
 *
 * Algorithm:
 * 1. Read .swarm/doc-manifest.json (or generate via scanDocIndex if missing)
 * 2. Score each doc against task files + description using Jaccard bigram similarity
 * 3. For docs with score > RELEVANCE_THRESHOLD, read full content and extract constraints
 * 4. Dedup against existing knowledge entries before appending
 * 5. Return extraction statistics
 */
export declare function extractDocConstraints(directory: string, taskFiles: string[], taskDescription: string): Promise<{
    extracted: number;
    skipped: number;
    details: {
        path: string;
        score: number;
        constraints: string[];
    }[];
}>;
export declare const doc_scan: ReturnType<typeof createSwarmTool>;
export declare const doc_extract: ReturnType<typeof createSwarmTool>;
