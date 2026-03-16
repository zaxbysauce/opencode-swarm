import type { QualityBudgetConfig } from '../config/schema';
import { type QualityMetrics, type QualityViolation } from '../quality/metrics';
export interface QualityBudgetInput {
    changed_files: string[];
    config?: Partial<QualityBudgetConfig>;
}
export interface QualityBudgetResult {
    verdict: 'pass' | 'fail';
    metrics: QualityMetrics;
    violations: QualityViolation[];
    summary: {
        files_analyzed: number;
        violations_count: number;
        errors_count: number;
        warnings_count: number;
    };
}
/**
 * Quality budget tool - enforces maintainability budgets for changed files
 *
 * Computes quality metrics (complexity, API, duplication, test ratio)
 * and compares against configured thresholds to ensure code quality.
 */
export declare function qualityBudget(input: QualityBudgetInput, directory: string): Promise<QualityBudgetResult>;
