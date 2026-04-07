/**
 * Handle /swarm handoff command
 * Generates a handoff brief, writes to .swarm/handoff.md, triggers snapshot, and returns markdown.
 */
import crypto from 'node:crypto';
import { renameSync } from 'node:fs';
import { validateSwarmPath } from '../hooks/utils';
import {
	formatContinuationPrompt,
	formatHandoffMarkdown,
	getHandoffData,
} from '../services/handoff-service';
import {
	flushPendingSnapshot,
	writeSnapshot,
} from '../session/snapshot-writer';
import { swarmState } from '../state';

export async function handleHandoffCommand(
	directory: string,
	_args: string[],
): Promise<string> {
	// Get handoff data from service
	const handoffData = await getHandoffData(directory);

	// Format as markdown
	const markdown = formatHandoffMarkdown(handoffData);

	// Write to .swarm/handoff.md using atomic write (temp file + rename)
	const resolvedPath = validateSwarmPath(directory, 'handoff.md');
	const tempPath = `${resolvedPath}.tmp.${crypto.randomUUID()}`;
	await Bun.write(tempPath, markdown);
	renameSync(tempPath, resolvedPath);

	// Build continuation prompt from structured data
	const continuationPrompt = formatContinuationPrompt(handoffData);

	// Write continuation prompt as a dedicated artifact
	const promptPath = validateSwarmPath(directory, 'handoff-prompt.md');
	const promptTempPath = `${promptPath}.tmp.${crypto.randomUUID()}`;
	await Bun.write(promptTempPath, continuationPrompt);
	renameSync(promptTempPath, promptPath);

	// Trigger snapshot write
	await writeSnapshot(directory, swarmState);

	// v6.33.1: Also flush any debounced pending snapshot
	await flushPendingSnapshot(directory);

	// Return markdown response with copyable continuation block
	return `## Handoff Brief Written

Brief written to \`.swarm/handoff.md\`.
Continuation prompt written to \`.swarm/handoff-prompt.md\`.

${markdown}

---

## Continuation Prompt

Copy and paste the block below into your next session to resume cleanly:

${continuationPrompt}`;
}
