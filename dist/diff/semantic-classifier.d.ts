/**
 * Semantic classifier for AST changes.
 * Classifies AST changes into semantic categories with risk ranking.
 * @module diff/semantic-classifier
 */
import type { ASTDiffResult } from '../diff/ast-diff.js';
/**
 * Semantic categories for classified changes.
 * Describes the nature of the change from a code impact perspective.
 */
export type ChangeCategory = 'SIGNATURE_CHANGE' | 'API_CHANGE' | 'GUARD_REMOVED' | 'LOGIC_CHANGE' | 'DELETED_FUNCTION' | 'NEW_FUNCTION' | 'REFACTOR' | 'COSMETIC' | 'UNCLASSIFIED';
/**
 * Risk level associated with a classified change.
 * Indicates the potential impact severity of the change.
 */
export type RiskLevel = 'Critical' | 'High' | 'Medium' | 'Low';
/**
 * A classified AST change with semantic categorization and risk assessment.
 */
export interface ClassifiedChange {
    /** Semantic category of the change */
    category: ChangeCategory;
    /** Risk level indicating potential impact severity */
    riskLevel: RiskLevel;
    /** Path to the file containing this change */
    filePath: string;
    /** Name of the symbol (function, class, etc.) affected */
    symbolName: string;
    /** Type of change operation */
    changeType: 'added' | 'modified' | 'removed' | 'renamed';
    /** Starting line number of the change */
    lineStart: number;
    /** Ending line number of the change */
    lineEnd: number;
    /** Human-readable description of what was detected */
    description: string;
    /** Original AST change signature detail (if available) */
    signature?: string;
    /** Original name before rename, if this is a renamed symbol */
    renamedFrom?: string;
    /** Number of files that depend on this file (blast radius indicator) */
    consumersCount?: number;
}
/**
 * Classify an array of AST diff results into semantic categories with risk levels.
 *
 * @param astDiffs - Array of ASTDiffResult from the AST differ
 * @returns Array of ClassifiedChange with semantic categorization
 *
 * @example
 * ```typescript
 * const diffs = await astDiff(oldCode, newCode);
 * const classified = classifyChanges(diffs);
 * for (const change of classified) {
 *   console.log(`[${change.riskLevel}] ${change.category}: ${change.symbolName}`);
 * }
 * ```
 */
export declare function classifyChanges(astDiffs: ASTDiffResult[], fileConsumers?: Record<string, number>): ClassifiedChange[];
