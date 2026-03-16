import type { QualityBudgetConfig } from '../config/schema';
export interface QualityMetrics {
    complexity_delta: number;
    public_api_delta: number;
    duplication_ratio: number;
    test_to_code_ratio: number;
    files_analyzed: string[];
    thresholds: QualityBudgetConfig;
    violations: QualityViolation[];
}
export interface QualityViolation {
    type: 'complexity' | 'api' | 'duplication' | 'test_ratio';
    message: string;
    severity: 'error' | 'warning';
    files: string[];
}
/**
 * Compute quality metrics for changed files
 */
export declare function computeQualityMetrics(changedFiles: string[], thresholds: QualityBudgetConfig, workingDir: string): Promise<QualityMetrics>;
