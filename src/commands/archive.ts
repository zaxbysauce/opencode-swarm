import { loadPluginConfig } from '../config/loader';
import {
	archiveEvidence,
	listEvidenceTaskIds,
	loadEvidence,
} from '../evidence/manager';

/**
 * Handles the /swarm archive command.
 * Archives old evidence bundles based on retention policy.
 */
export async function handleArchiveCommand(
	directory: string,
	args: string[],
): Promise<string> {
	// Load config to get retention settings
	const config = loadPluginConfig(directory);
	const maxAgeDays = config?.evidence?.max_age_days ?? 90;
	const maxBundles = config?.evidence?.max_bundles ?? 1000;

	// Check for --dry-run flag
	const dryRun = args.includes('--dry-run');

	// Get current evidence count
	const beforeTaskIds = await listEvidenceTaskIds(directory);

	if (beforeTaskIds.length === 0) {
		return 'No evidence bundles to archive.';
	}

	if (dryRun) {
		// In dry-run mode, just report what would be archived
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);
		const cutoffIso = cutoffDate.toISOString();

		const wouldArchiveAge: string[] = [];
		const remainingBundles: Array<{ taskId: string; updatedAt: string }> = [];
		for (const taskId of beforeTaskIds) {
			const bundle = await loadEvidence(directory, taskId);
			if (bundle && bundle.updated_at < cutoffIso) {
				wouldArchiveAge.push(taskId);
			} else if (bundle) {
				remainingBundles.push({ taskId, updatedAt: bundle.updated_at });
			}
		}

		// Check if maxBundles would trigger additional archival
		const wouldArchiveMaxBundles: string[] = [];
		const remainingAfterAge = beforeTaskIds.length - wouldArchiveAge.length;
		if (remainingAfterAge > maxBundles) {
			// Sort by updated_at ascending (oldest first)
			remainingBundles.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
			// Oldest bundles beyond the limit would be archived
			const excessCount = remainingAfterAge - maxBundles;
			wouldArchiveMaxBundles.push(
				...remainingBundles.slice(0, excessCount).map((b) => b.taskId),
			);
		}

		const totalWouldArchive =
			wouldArchiveAge.length + wouldArchiveMaxBundles.length;

		if (totalWouldArchive === 0) {
			return `No evidence bundles older than ${maxAgeDays} days found, and bundle count (${beforeTaskIds.length}) is within max_bundles limit (${maxBundles}).`;
		}

		const lines = [
			'## Archive Preview (dry run)',
			'',
			`**Retention**: ${maxAgeDays} days`,
			`**Max bundles**: ${maxBundles}`,
			`**Would archive**: ${totalWouldArchive} bundle(s)`,
		];

		if (wouldArchiveAge.length > 0) {
			lines.push(
				'',
				`**Age-based (${wouldArchiveAge.length})**:`,
				...wouldArchiveAge.map((id) => `- ${id}`),
			);
		}

		if (wouldArchiveMaxBundles.length > 0) {
			lines.push(
				'',
				`**Max bundles limit (${wouldArchiveMaxBundles.length})**:`,
				...wouldArchiveMaxBundles.map((id) => `- ${id}`),
			);
		}

		return lines.join('\n');
	}

	// Actually archive
	const archived = await archiveEvidence(directory, maxAgeDays, maxBundles);

	if (archived.length === 0) {
		return `No evidence bundles older than ${maxAgeDays} days found.`;
	}

	const lines = [
		'## Evidence Archived',
		'',
		`**Retention**: ${maxAgeDays} days`,
		`**Archived**: ${archived.length} bundle(s)`,
		'',
		...archived.map((id) => `- ${id}`),
	];
	return lines.join('\n');
}
