import type { ChangeCategory, ClassifiedChange, RiskLevel } from './semantic-classifier.js';
/**
 * Structured summary of classified semantic diff changes.
 * Provides multiple views for different review workflows.
 */
export interface SemanticDiffSummary {
    /** Number of files with changes */
    totalFiles: number;
    /** Total number of classified changes */
    totalChanges: number;
    /** Changes grouped by risk level */
    byRisk: Record<RiskLevel, ClassifiedChange[]>;
    /** Changes grouped by category */
    byCategory: Record<ChangeCategory, ClassifiedChange[]>;
    /** Quick access to Critical items for gate checks */
    criticalItems: ClassifiedChange[];
}
/**
 * Generates a structured summary from classified changes.
 * Provides by-risk and by-category groupings plus critical item quick access.
 *
 * @param changes - Array of classified changes to summarize
 * @returns SemanticDiffSummary with all grouping views
 */
export declare function generateSummary(changes: ClassifiedChange[]): SemanticDiffSummary;
/**
 * Generates reviewer-ready markdown summary from a SemanticDiffSummary.
 * Format groups by risk level with file:category annotations.
 *
 * @param summary - The structured summary to render as markdown
 * @returns Markdown-formatted string ready for PR review
 */
export declare function generateSummaryMarkdown(summary: SemanticDiffSummary): string;
