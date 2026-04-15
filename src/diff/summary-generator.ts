import type {
	ChangeCategory,
	ClassifiedChange,
	RiskLevel,
} from './semantic-classifier.js';

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

/** All risk levels in evaluation order */
const RISK_LEVELS: RiskLevel[] = ['Critical', 'High', 'Medium', 'Low'];

/** All change categories */
const CHANGE_CATEGORIES: ChangeCategory[] = [
	'SIGNATURE_CHANGE',
	'API_CHANGE',
	'GUARD_REMOVED',
	'LOGIC_CHANGE',
	'DELETED_FUNCTION',
	'NEW_FUNCTION',
	'REFACTOR',
	'COSMETIC',
	'UNCLASSIFIED',
];

/**
 * Generates a structured summary from classified changes.
 * Provides by-risk and by-category groupings plus critical item quick access.
 *
 * @param changes - Array of classified changes to summarize
 * @returns SemanticDiffSummary with all grouping views
 */
export function generateSummary(
	changes: ClassifiedChange[],
): SemanticDiffSummary {
	const byRisk = RISK_LEVELS.reduce<Record<RiskLevel, ClassifiedChange[]>>(
		(acc, level) => {
			acc[level] = [];
			return acc;
		},
		{} as Record<RiskLevel, ClassifiedChange[]>,
	);

	const byCategory = CHANGE_CATEGORIES.reduce<
		Record<ChangeCategory, ClassifiedChange[]>
	>(
		(acc, cat) => {
			acc[cat] = [];
			return acc;
		},
		{} as Record<ChangeCategory, ClassifiedChange[]>,
	);

	for (const change of changes) {
		byRisk[change.riskLevel].push(change);
		byCategory[change.category].push(change);
	}

	const uniqueFiles = new Set(changes.map((c) => c.filePath));

	return {
		totalFiles: uniqueFiles.size,
		totalChanges: changes.length,
		byRisk,
		byCategory,
		criticalItems: byRisk.Critical,
	};
}

/**
 * Generates reviewer-ready markdown summary from a SemanticDiffSummary.
 * Format groups by risk level with file:category annotations.
 *
 * @param summary - The structured summary to render as markdown
 * @returns Markdown-formatted string ready for PR review
 */
export function generateSummaryMarkdown(summary: SemanticDiffSummary): string {
	const lines: string[] = [];
	const totalFiles = summary.totalFiles;
	const totalChanges = summary.totalChanges;

	lines.push(
		`## Change Summary (${totalFiles} files, ${totalChanges} changes)`,
	);

	const riskLabels: Record<RiskLevel, string> = {
		Critical: 'Critical (review first)',
		High: 'High',
		Medium: 'Medium',
		Low: 'Low (skim)',
	};

	for (const riskLevel of RISK_LEVELS) {
		const changes = summary.byRisk[riskLevel];
		const header = riskLabels[riskLevel];

		lines.push(`### ${header}`);

		if (changes.length === 0) {
			lines.push('- (none)');
		} else {
			for (const change of changes) {
				lines.push(
					`- ${change.filePath}: ${change.category} — ${change.description}`,
				);
			}
		}
	}

	return lines.join('\n');
}
