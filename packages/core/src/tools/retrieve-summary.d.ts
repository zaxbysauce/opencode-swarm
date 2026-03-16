/**
 * Validate summary ID format
 */
export declare function sanitizeSummaryId(id: string): string;
/**
 * Retrieve summary - retrieves paginated content from stored summaries
 */
export declare function retrieveSummary(args: {
    id: string;
    offset?: number;
    limit?: number;
}, directory: string): Promise<string>;
