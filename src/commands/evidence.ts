import type {
	Evidence,
	ReviewEvidence,
	TestEvidence,
} from '../config/evidence-schema';
import { listEvidenceTaskIds, loadEvidence } from '../evidence/manager';

/**
 * Handles the /swarm evidence command.
 * Lists all evidence bundles or shows details for a specific task.
 */
export async function handleEvidenceCommand(
	directory: string,
	args: string[],
): Promise<string> {
	// Mode 1: List all evidence bundles
	if (args.length === 0) {
		const taskIds = await listEvidenceTaskIds(directory);

		if (taskIds.length === 0) {
			return 'No evidence bundles found.';
		}

		const tableLines = [
			'## Evidence Bundles',
			'',
			'| Task | Entries | Last Updated |',
			'|------|---------|-------------|',
		];

		for (const taskId of taskIds) {
			const bundle = await loadEvidence(directory, taskId);
			if (bundle) {
				const entryCount = bundle.entries.length;
				const lastUpdated = bundle.updated_at;
				tableLines.push(`| ${taskId} | ${entryCount} | ${lastUpdated} |`);
			} else {
				tableLines.push(`| ${taskId} | ? | unknown |`);
			}
		}

		return tableLines.join('\n');
	}

	// Mode 2: Show specific task evidence
	const taskId = args[0];
	const bundle = await loadEvidence(directory, taskId);

	if (!bundle) {
		return `No evidence found for task ${taskId}.`;
	}

	const lines = [
		`## Evidence for Task ${taskId}`,
		'',
		`**Created**: ${bundle.created_at}`,
		`**Updated**: ${bundle.updated_at}`,
		`**Entries**: ${bundle.entries.length}`,
	];

	if (bundle.entries.length > 0) {
		lines.push('');
	}

	for (let i = 0; i < bundle.entries.length; i++) {
		const entry = bundle.entries[i];
		lines.push(...formatEntry(i + 1, entry));
	}

	return lines.join('\n');
}

/**
 * Format a single evidence entry as markdown.
 */
function formatEntry(index: number, entry: Evidence): string[] {
	const lines: string[] = [];

	// Header with type and verdict
	const verdictEmoji = getVerdictEmoji(entry.verdict);
	lines.push(
		`### Entry ${index}: ${entry.type} (${entry.verdict}) ${verdictEmoji}`,
	);
	lines.push(`- **Agent**: ${entry.agent}`);
	lines.push(`- **Summary**: ${entry.summary}`);
	lines.push(`- **Time**: ${entry.timestamp}`);

	// Type-specific details
	if (entry.type === 'review') {
		const reviewEntry = entry as ReviewEvidence;
		lines.push(`- **Risk Level**: ${reviewEntry.risk}`);
		if (reviewEntry.issues && reviewEntry.issues.length > 0) {
			lines.push(`- **Issues**: ${reviewEntry.issues.length}`);
		}
	} else if (entry.type === 'test') {
		const testEntry = entry as TestEvidence;
		lines.push(
			`- **Tests**: ${testEntry.tests_passed} passed, ${testEntry.tests_failed} failed`,
		);
	}

	lines.push('');
	return lines;
}

/**
 * Get emoji for verdict type.
 */
function getVerdictEmoji(verdict: string): string {
	switch (verdict) {
		case 'pass':
		case 'approved':
			return '✅';
		case 'fail':
		case 'rejected':
			return '❌';
		case 'info':
			return 'ℹ️';
		default:
			return '';
	}
}
