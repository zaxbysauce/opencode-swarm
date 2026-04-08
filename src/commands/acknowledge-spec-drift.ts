import { promises as fsPromises } from 'node:fs';
import { validateSwarmPath } from '../hooks/utils';
import type { SpecDriftAcknowledgedEvent } from '../types/events';

interface SpecStalenessPayload {
	planTitle: string;
	phase: number;
	specHash_plan: string;
	specHash_current: string | null;
	reason: string;
	timestamp: string;
}

/**
 * Handle /swarm acknowledge-spec-drift command
 * Acknowledges and clears a previously detected spec drift staleness warning
 */
export async function handleAcknowledgeSpecDriftCommand(
	directory: string,
	_args: string[],
): Promise<string> {
	const specStalenessPath = validateSwarmPath(directory, 'spec-staleness.json');

	let stalenessContent: string;
	try {
		stalenessContent = await fsPromises.readFile(specStalenessPath, 'utf-8');
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
			return 'No spec drift detected.';
		}
		throw error;
	}

	let stalenessData: SpecStalenessPayload;
	try {
		stalenessData = JSON.parse(stalenessContent);
	} catch {
		// If the file exists but is malformed, delete it and report
		await fsPromises.unlink(specStalenessPath).catch(() => {});
		return 'Spec staleness file was corrupted. It has been removed.';
	}

	const { planTitle, phase } = stalenessData;

	// Delete the spec-staleness.json file
	await fsPromises.unlink(specStalenessPath);

	// Append acknowledgment event to events.jsonl
	const eventsPath = validateSwarmPath(directory, 'events.jsonl');
	const acknowledgmentEvent: SpecDriftAcknowledgedEvent = {
		type: 'spec_drift_acknowledged',
		timestamp: new Date().toISOString(),
		phase,
		planTitle,
		acknowledgedBy: 'architect',
	};

	try {
		await fsPromises.appendFile(
			eventsPath,
			`${JSON.stringify(acknowledgmentEvent)}\n`,
			'utf-8',
		);
	} catch (appendError) {
		// Non-fatal: the spec drift was acknowledged but event logging failed
		console.error(
			'[acknowledge-spec-drift] Failed to write acknowledgment event:',
			appendError instanceof Error ? appendError.message : String(appendError),
		);
	}

	return `Spec drift acknowledged for plan "${planTitle}" (phase ${phase}).\n\n⚠️  Warning: Spec drift was acknowledged — verify that the implementation still matches the spec before proceeding.`;
}
