import { KnowledgeConfigSchema } from '../config/schema.js';
import { migrateContextToKnowledge } from '../hooks/knowledge-migrator.js';
import { quarantineEntry, restoreEntry } from '../hooks/knowledge-validator.js';

/**
 * Handles /swarm knowledge quarantine <id> [reason] command.
 * Moves a knowledge entry to quarantine with optional reason.
 */
export async function handleKnowledgeQuarantineCommand(
	directory: string,
	args: string[],
): Promise<string> {
	const entryId = args[0];
	if (!entryId) {
		return 'Usage: /swarm knowledge quarantine <id> [reason]';
	}

	if (!/^[a-zA-Z0-9_-]{1,64}$/.test(entryId)) {
		return 'Invalid entry ID. IDs must be 1-64 characters: letters, digits, hyphens, underscores only.';
	}

	const reason =
		args.slice(1).join(' ') ||
		'Quarantined via /swarm knowledge quarantine command';

	try {
		await quarantineEntry(directory, entryId, reason, 'user');
		return `✅ Entry ${entryId} quarantined successfully.`;
	} catch (error) {
		console.warn('[knowledge-command] quarantineEntry error:', error);
		return `❌ Failed to quarantine entry. Check the entry ID and try again.`;
	}
}

/**
 * Handles /swarm knowledge restore <id> command.
 * Restores a quarantined knowledge entry.
 */
export async function handleKnowledgeRestoreCommand(
	directory: string,
	args: string[],
): Promise<string> {
	const entryId = args[0];
	if (!entryId) {
		return 'Usage: /swarm knowledge restore <id>';
	}

	if (!/^[a-zA-Z0-9_-]{1,64}$/.test(entryId)) {
		return 'Invalid entry ID. IDs must be 1-64 characters: letters, digits, hyphens, underscores only.';
	}

	try {
		await restoreEntry(directory, entryId);
		return `✅ Entry ${entryId} restored successfully.`;
	} catch (error) {
		console.warn('[knowledge-command] restoreEntry error:', error);
		return `❌ Failed to restore entry. Check the entry ID and try again.`;
	}
}

/**
 * Handles /swarm knowledge migrate [directory] command.
 * Triggers one-time migration from .swarm/context.md to .swarm/knowledge.jsonl.
 */
export async function handleKnowledgeMigrateCommand(
	directory: string,
	args: string[],
): Promise<string> {
	const targetDir = args[0] || directory;

	try {
		const result = await migrateContextToKnowledge(
			targetDir,
			KnowledgeConfigSchema.parse({}),
		);

		if (result.skippedReason) {
			switch (result.skippedReason) {
				case 'sentinel-exists':
					return '⏭ Migration already completed for this project. Delete .swarm/.knowledge-migrated to re-run.';
				case 'no-context-file':
					return 'ℹ️ No .swarm/context.md found — nothing to migrate.';
				case 'empty-context':
					return 'ℹ️ .swarm/context.md is empty — nothing to migrate.';
				default:
					return '⚠️ Migration skipped for an unknown reason.';
			}
		}

		return `✅ Migration complete: ${result.entriesMigrated} entries added, ${result.entriesDropped} dropped (validation/dedup), ${result.entriesTotal} total processed.`;
	} catch (error) {
		console.warn('[knowledge-command] migrateContextToKnowledge error:', error);
		return '❌ Migration failed. Check .swarm/context.md is readable.';
	}
}
