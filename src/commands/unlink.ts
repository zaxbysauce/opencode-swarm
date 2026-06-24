/**
 * Handles the `/swarm unlink` command.
 *
 * Stops sharing this worktree's swarm knowledge with its link store and returns
 * it to a local `.swarm/knowledge.jsonl`. By default the shared lessons are
 * copied back into the local store (deduplicated) so the worktree keeps the
 * pooled knowledge it had access to; pass `--no-copy` to skip the copy-back.
 *
 * Usage:
 * - /swarm unlink              — unlink and copy shared lessons back to local.
 * - /swarm unlink --no-copy    — unlink without copying shared lessons back.
 */

import { existsSync } from 'node:fs';
import * as path from 'node:path';
import {
	readLinkPointer,
	removeLinkPointer,
	resolveLinkDir,
} from '../hooks/knowledge-link.js';
import {
	findNearDuplicate,
	readKnowledge,
	transactKnowledge,
} from '../hooks/knowledge-store.js';
import type { KnowledgeEntryBase } from '../hooks/knowledge-types.js';

const DEDUP_THRESHOLD = 0.6;

/**
 * Copy shared link knowledge back into the local worktree store, skipping
 * entries already present locally (exact id or near-duplicate lesson). The
 * dedup-and-write on the local store runs inside a single `transactKnowledge`
 * (locked read-modify-write) so it is atomic against a concurrent local writer.
 */
async function copySharedKnowledgeToLocal(
	linkDir: string,
	localSwarmDir: string,
): Promise<number> {
	const sharedPath = path.join(linkDir, 'knowledge.jsonl');
	const localPath = path.join(localSwarmDir, 'knowledge.jsonl');
	if (!existsSync(sharedPath)) return 0;

	const sharedEntries = await readKnowledge<KnowledgeEntryBase>(sharedPath);
	if (sharedEntries.length === 0) return 0;

	let copied = 0;
	await transactKnowledge<KnowledgeEntryBase>(localPath, (localEntries) => {
		const result = [...localEntries];
		const seenIds = new Set(result.map((e) => e.id));
		let changed = false;
		for (const entry of sharedEntries) {
			if (seenIds.has(entry.id)) continue;
			if (findNearDuplicate(entry.lesson, result, DEDUP_THRESHOLD)) continue;
			result.push(entry);
			seenIds.add(entry.id);
			copied++;
			changed = true;
		}
		return changed ? result : null;
	});
	return copied;
}

export async function handleUnlinkCommand(
	directory: string,
	args: string[],
): Promise<string> {
	const pointer = readLinkPointer(directory);
	if (!pointer) {
		return 'ℹ️ This worktree is not linked. Nothing to unlink.';
	}

	const copyBack = !args.includes('--no-copy');
	const linkDir = resolveLinkDir(pointer.linkId);

	// Copy shared lessons back to local BEFORE removing the pointer, so the
	// resolver still distinguishes the two stores by explicit path.
	let copied = 0;
	if (copyBack) {
		try {
			copied = await copySharedKnowledgeToLocal(
				linkDir,
				path.join(directory, '.swarm'),
			);
		} catch (error) {
			return `❌ Failed to copy shared knowledge back to local: ${
				error instanceof Error ? error.message : String(error)
			}`;
		}
	}

	try {
		await removeLinkPointer(directory);
	} catch (error) {
		return `❌ Failed to remove link pointer: ${
			error instanceof Error ? error.message : String(error)
		}`;
	}

	const copyNote = copyBack
		? `  copied ${copied} shared lesson(s) back into local \`.swarm/knowledge.jsonl\`.`
		: '  shared lessons were NOT copied back (--no-copy).';
	return [
		`🔓 Unlinked this worktree from shared knowledge store "${pointer.linkId}".`,
		copyNote,
		'This worktree now uses its local `.swarm/` knowledge again.',
	].join('\n');
}
