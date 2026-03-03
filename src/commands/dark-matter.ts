import type { DarkMatterOptions } from '../tools/co-change-analyzer.js';
import {
	detectDarkMatter,
	formatDarkMatterOutput,
} from '../tools/co-change-analyzer.js';

/**
 * Handles /swarm dark-matter command.
 * Detects hidden couplings (files that co-change without explicit import relationships).
 */
export async function handleDarkMatterCommand(
	directory: string,
	args: string[],
): Promise<string> {
	// Parse optional --threshold and --min-commits flags
	const options: DarkMatterOptions = {};

	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--threshold' && args[i + 1]) {
			const val = parseFloat(args[i + 1]);
			if (!Number.isNaN(val) && val >= 0 && val <= 1) {
				options.npmiThreshold = val;
			}
			i++;
		} else if (args[i] === '--min-commits' && args[i + 1]) {
			const val = parseInt(args[i + 1], 10);
			if (!Number.isNaN(val) && val > 0) {
				options.minCommits = val;
			}
			i++;
		}
	}

	const pairs = await detectDarkMatter(directory, options);
	return formatDarkMatterOutput(pairs);
}
