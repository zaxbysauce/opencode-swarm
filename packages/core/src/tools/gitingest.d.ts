export interface GitingestArgs {
    url: string;
    maxFileSize?: number;
    pattern?: string;
    patternType?: 'include' | 'exclude';
}
export declare const GITINGEST_TIMEOUT_MS = 10000;
export declare const GITINGEST_MAX_RESPONSE_BYTES = 5242880;
export declare const GITINGEST_MAX_RETRIES = 2;
/**
 * Fetch repository content via gitingest.com API with timeout, size guard, and retry logic
 */
export declare function fetchGitingest(args: GitingestArgs): Promise<string>;
