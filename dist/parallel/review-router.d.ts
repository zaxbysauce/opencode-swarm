export type ReviewDepth = 'single' | 'double';
export interface ReviewRouting {
    reviewerCount: number;
    testEngineerCount: number;
    depth: ReviewDepth;
    reason: string;
}
export interface ComplexityMetrics {
    fileCount: number;
    functionCount: number;
    astChangeCount: number;
    maxFileComplexity: number;
}
/**
 * Compute complexity metrics for a set of files
 */
export declare function computeComplexity(directory: string, changedFiles: string[]): Promise<ComplexityMetrics>;
/**
 * Determine review routing based on complexity
 */
export declare function routeReview(metrics: ComplexityMetrics): ReviewRouting;
/**
 * Route review with full analysis
 */
export declare function routeReviewForChanges(directory: string, changedFiles: string[]): Promise<ReviewRouting>;
/**
 * Check if review should be parallelized
 */
export declare function shouldParallelizeReview(routing: ReviewRouting): boolean;
