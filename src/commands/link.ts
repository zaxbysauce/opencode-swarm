/**
 * Handles the `/swarm link` command.
 *
 * Ties this worktree's swarm knowledge store to a shared "link" store so that
 * several swarms working on the same project (typically separate git worktrees)
 * — or on deliberately "similar" projects — pool their lessons instead of each
 * keeping an isolated `.swarm/knowledge.jsonl`.
 *
 * Usage:
 * - /swarm link                — link using the project hash (ties all worktrees
 *                                of the same repo to one shared store).
 * - /swarm link <name>         — link using an explicit shared name (use the same
 *                                name in each worktree/repo to tie them together).
 * - /swarm link status         — show the current link state for this worktree.
 *
 * On link, this worktree's existing local lessons are merged (deduplicated) into
 * the shared store so nothing already learned is lost.
 */

import { existsSync } from 'node:fs';
import * as path from 'node:path';
import {
	type LinkPointer,
	readLinkPointer,
	resolveLinkDir,
	sanitizeLinkId,
	writeLinkPointer,
} from '../hooks/knowledge-link.js';
import {
	findNearDuplicate,
	transactKnowledge,
} from '../hooks/knowledge-store.js';
import type { KnowledgeEntryBase } from '../hooks/knowledge-types.js';
import { deriveProjectHash } from '../knowledge/identity.js';

const DEDUP_THRESHOLD = 0.6;

interface MergeResult {
	merged: number;
	skipped: number;
}

/**
 * Merge the local worktree's knowledge.jsonl into the shared link store,
 * skipping entries that already exist there (exact id or near-duplicate lesson).
 * Reads/writes explicit paths so it does not depend on the active link pointer.
 *
 * CRITICAL: both local and shared entries are read INSIDE the shared-store lock
 * to prevent concurrent-merge races. If worktrees A and B link simultaneously,
 * both must dedupe against the current shared-store state (not stale local reads),
 * ensuring near-duplicates cannot slip through due to read-time ordering.
 */
async function mergeLocalKnowledgeIntoLink(
	localSwarmDir: string,
	linkDir: string,
): Promise<MergeResult> {
	const localPath = path.join(localSwarmDir, 'knowledge.jsonl');
	const sharedPath = path.join(linkDir, 'knowledge.jsonl');
	if (!existsSync(localPath)) return { merged: 0, skipped: 0 };

	let merged = 0;
	let skipped = 0;

	// Use transactFile directly to ensure both reads happen inside the lock.
	// The mutate callback reads the shared entries; we read local entries
	// synchronously inside the mutate callback so they're synchronized with
	// the shared store state at lock-acquisition time.
	const { readFileSync } = await import('node:fs');
	let changed = false;

	await transactKnowledge<KnowledgeEntryBase>(sharedPath, (sharedEntries) => {
		// Read local entries inside the lock to ensure synchronization with shared state.
		const localEntries: KnowledgeEntryBase[] = [];
		try {
			const content = readFileSync(localPath, 'utf-8');
			for (const line of content.split('\n')) {
				if (line.trim()) {
					try {
						localEntries.push(JSON.parse(line));
					} catch {
						// Skip malformed entries
					}
				}
			}
		} catch {
			// Local file doesn't exist or can't be read; no-op
			return null;
		}

		if (localEntries.length === 0) return null;

		const result = [...sharedEntries];
		const seenIds = new Set(result.map((e) => e.id));
		changed = false;

		for (const entry of localEntries) {
			if (seenIds.has(entry.id)) {
				skipped++;
				continue;
			}
			// findNearDuplicate normalizes both sides internally; pass the raw
			// lesson to match every other caller in the codebase.
			if (findNearDuplicate(entry.lesson, result, DEDUP_THRESHOLD)) {
				skipped++;
				continue;
			}
			result.push(entry);
			seenIds.add(entry.id);
			merged++;
			changed = true;
		}
		return changed ? result : null;
	});
	return { merged, skipped };
}

function formatStatus(directory: string): string {
	const pointer = readLinkPointer(directory);
	if (!pointer) {
		return [
			'ℹ️ This worktree is NOT linked. Its swarm knowledge is local to `.swarm/`.',
			'Run `/swarm link` to share knowledge across worktrees of this repo,',
			'or `/swarm link <name>` to share with deliberately similar projects.',
		].join('\n');
	}
	const linkDir = resolveLinkDir(pointer.linkId);
	const lines = [
		'🔗 Linked — swarm knowledge is shared.',
		`  link id:   ${pointer.linkId}`,
	];
	if (pointer.name) lines.push(`  name:      ${pointer.name}`);
	lines.push(`  shared at: ${linkDir}`);
	lines.push(`  since:     ${pointer.createdAt}`);
	lines.push('Run `/swarm unlink` to stop sharing (keeps a local copy).');
	return lines.join('\n');
}

export async function handleLinkCommand(
	directory: string,
	args: string[],
): Promise<string> {
	const first = args[0];
	if (first === 'status') {
		return formatStatus(directory);
	}

	// First non-flag token (if any) is an explicit shared name.
	const nameArg = args.find((a) => !a.startsWith('--'));

	let linkId: string;
	let displayName: string | undefined;
	if (nameArg) {
		const sanitized = sanitizeLinkId(nameArg);
		if (!sanitized) {
			return `❌ Invalid link name "${nameArg}". Use letters, digits, '.', '-', or '_'.`;
		}
		linkId = sanitized;
		displayName = nameArg;
	} else {
		try {
			linkId = deriveProjectHash(directory);
		} catch (error) {
			return `❌ Failed to derive project hash: ${
				error instanceof Error ? error.message : String(error)
			}`;
		}
	}

	const existing = readLinkPointer(directory);
	if (existing && existing.linkId === linkId) {
		return `ℹ️ Already linked to "${linkId}".\n${formatStatus(directory)}`;
	}

	const linkDir = resolveLinkDir(linkId);
	let merge: MergeResult;
	try {
		merge = await mergeLocalKnowledgeIntoLink(
			path.join(directory, '.swarm'),
			linkDir,
		);
	} catch (error) {
		return `❌ Failed to merge local knowledge into the link store: ${
			error instanceof Error ? error.message : String(error)
		}`;
	}

	const pointer: LinkPointer = {
		version: 1,
		linkId,
		name: displayName,
		createdAt: new Date().toISOString(),
		source: 'manual',
	};
	// Ordering is deliberate: merge BEFORE writing the pointer. The merge is
	// idempotent and deduped, so if writeLinkPointer fails the worktree stays
	// unlinked while the local lessons are safely already in the shared store —
	// re-running `/swarm link` simply skips the duplicates and writes the pointer.
	// The reverse order (pointer first) would, on a merge failure, leave the
	// worktree linked to a shared store missing its local lessons, which is worse.
	try {
		await writeLinkPointer(directory, pointer);
	} catch (error) {
		return `❌ Failed to write link pointer: ${
			error instanceof Error ? error.message : String(error)
		}`;
	}

	const relinkNote = existing
		? `\n(Re-linked from previous link "${existing.linkId}".)`
		: '';
	// Finding A (known limitation): only the lessons themselves migrate on link;
	// each merged lesson's accumulated outcome counters (shown/applied/violated)
	// start fresh in the shared store and re-accrue as the linked swarms run.
	const historyNote =
		merge.merged > 0
			? '\n  note: merged lessons keep their text; their outcome-history counters re-accrue in the shared store.'
			: '';
	return [
		`🔗 Linked this worktree to shared knowledge store "${linkId}".`,
		`  merged ${merge.merged} local lesson(s) into the shared store` +
			(merge.skipped > 0 ? ` (${merge.skipped} already present)` : '') +
			'.',
		`  shared at: ${linkDir}`,
		'All swarms linked to this id now read and write the same knowledge.' +
			relinkNote +
			historyNote,
	].join('\n');
}
