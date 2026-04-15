import { type ChangeCategory, type RiskLevel } from '../diff/semantic-classifier.js';
import { createSwarmTool } from './create-tool';
export interface DiffSummaryArgs {
    files: string[];
    classification?: ChangeCategory;
    riskLevel?: RiskLevel;
}
/**
 * Standalone tool that wraps the semantic classifier + summary generator
 * to produce a filtered SemanticDiffSummary.
 */
export declare const diff_summary: ReturnType<typeof createSwarmTool>;
