import * as fs from 'node:fs';
import * as path from 'node:path';
import { validateSwarmPath } from '../hooks/utils';

/**
 * Handle /swarm rollback command
 * Restores .swarm/ state from a checkpoint using direct overwrite
 */
export async function handleRollbackCommand(
	directory: string,
	args: string[],
): Promise<string> {
	// Parse phase number from args[0]
	const phaseArg = args[0];

	if (!phaseArg) {
		// List available checkpoints
		const manifestPath = validateSwarmPath(
			directory,
			'checkpoints/manifest.json',
		);
		if (!fs.existsSync(manifestPath)) {
			return 'No checkpoints found. Use `/swarm checkpoint` to create checkpoints.';
		}

		const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
		const checkpoints = manifest.checkpoints || [];

		if (checkpoints.length === 0) {
			return 'No checkpoints found in manifest.';
		}

		return [
			'## Available Checkpoints',
			'',
			...checkpoints.map(
				// biome-ignore lint/suspicious/noExplicitAny: checkpoint shape from JSON.parse is untyped
				(c: any) =>
					`- Phase ${c.phase}: ${c.label || 'no label'} (${new Date(c.timestamp).toLocaleString()})`,
			),
			'',
			`Run \`/swarm rollback <phase>\` to restore to a checkpoint.`,
		].join('\n');
	}

	const targetPhase = parseInt(phaseArg, 10);
	if (Number.isNaN(targetPhase) || targetPhase < 1) {
		return 'Error: Phase number must be a positive integer.';
	}

	// Validate checkpoint exists
	const manifestPath = validateSwarmPath(
		directory,
		'checkpoints/manifest.json',
	);
	if (!fs.existsSync(manifestPath)) {
		return `Error: No checkpoints found. Cannot rollback to phase ${targetPhase}.`;
	}

	const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
	const checkpoint = manifest.checkpoints?.find(
		// biome-ignore lint/suspicious/noExplicitAny: checkpoint shape from JSON.parse is untyped
		(c: any) => c.phase === targetPhase,
	);

	if (!checkpoint) {
		const available =
			// biome-ignore lint/suspicious/noExplicitAny: checkpoint shape from JSON.parse is untyped
			manifest.checkpoints?.map((c: any) => c.phase).join(', ') || 'none';
		return `Error: Checkpoint for phase ${targetPhase} not found. Available phases: ${available}`;
	}

	// Validate checkpoint directory exists and has content
	const checkpointDir = validateSwarmPath(
		directory,
		`checkpoints/phase-${targetPhase}`,
	);
	if (!fs.existsSync(checkpointDir)) {
		return `Error: Checkpoint directory for phase ${targetPhase} does not exist.`;
	}

	// Verify checkpoint has actual files
	const checkpointFiles = fs.readdirSync(checkpointDir);
	if (checkpointFiles.length === 0) {
		return `Error: Checkpoint for phase ${targetPhase} is empty. Cannot rollback.`;
	}

	// Get absolute paths
	const swarmDir = validateSwarmPath(directory, '');

	// Copy files directly from checkpoint to .swarm/
	const successes: string[] = [];
	const failures: { file: string; error: string }[] = [];

	for (const file of checkpointFiles) {
		const src = path.join(checkpointDir, file);
		const dest = path.join(swarmDir, file);

		try {
			fs.cpSync(src, dest, { recursive: true, force: true });
			successes.push(file);
		} catch (error) {
			failures.push({ file, error: (error as Error).message });
			// Continue processing remaining files
		}
	}

	if (failures.length > 0) {
		return `Rollback partially completed. Successfully restored ${successes.length} files: ${successes.join(', ') || 'none'}. Failed on ${failures.length} files: ${failures.map((f) => f.file).join(', ')}. Check permissions and disk space.`;
	}

	// Write rollback event to JSONL
	const eventsPath = validateSwarmPath(directory, 'events.jsonl');
	const rollbackEvent = {
		type: 'rollback',
		phase: targetPhase,
		label: checkpoint.label || '',
		timestamp: new Date().toISOString(),
	};

	try {
		fs.appendFileSync(eventsPath, `${JSON.stringify(rollbackEvent)}\n`);
	} catch (error) {
		console.error('Failed to write rollback event:', error);
	}

	return `Rolled back to phase ${targetPhase}: ${checkpoint.label || 'no label'}`;
}
