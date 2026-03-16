import { detectDarkMatter } from '../tools/co-change-analyzer';

/**
 * Handle /swarm simulate command
 * Performs read-only impact analysis using existing tools
 */
export async function handleSimulateCommand(
	directory: string,
	args: string[],
): Promise<string> {
	// Parse optional flags
	const thresholdIndex = args.indexOf('--threshold');
	const minCommitsIndex = args.indexOf('--min-commits');

	const options: {
		npmiThreshold?: number;
		minCommits?: number;
	} = {};

	if (thresholdIndex >= 0 && args[thresholdIndex + 1]) {
		const val = parseFloat(args[thresholdIndex + 1]);
		if (!Number.isNaN(val) && val >= 0 && val <= 1) {
			options.npmiThreshold = val;
		}
	}

	if (minCommitsIndex >= 0 && args[minCommitsIndex + 1]) {
		const val = parseInt(args[minCommitsIndex + 1], 10);
		if (!Number.isNaN(val) && val > 0) {
			options.minCommits = val;
		}
	}

	// Run dark matter detection directly
	const darkMatterPairs = await detectDarkMatter(directory, options);

	// Build simulate report
	const reportLines = [
		'# Simulate Report',
		'',
		`Generated: ${new Date().toISOString()}`,
		'',
		'## Dark Matter Analysis',
		`${darkMatterPairs.length} hidden coupling pairs detected:`,
		'',
		'| File A | File B | NPMI | Co-Changes | Lift |',
		'|--------|--------|------|------------|------|',
		...darkMatterPairs.map(
			(p) =>
				`| ${p.fileA} | ${p.fileB} | ${p.npmi.toFixed(3)} | ${p.coChangeCount} | ${p.lift.toFixed(2)} |`,
		),
		'',
		'## Recommendation',
		`${darkMatterPairs.length} hidden coupling pairs may cause unexpected side effects when modified.`,
	];

	const report = reportLines.filter(Boolean).join('\n');

	// Write report to .swarm/simulate-report.md
	const fs = await import('node:fs/promises');
	const path = await import('node:path');
	const reportPath = path.join(directory, '.swarm', 'simulate-report.md');
	await fs.mkdir(path.dirname(reportPath), { recursive: true });
	await fs.writeFile(reportPath, report, 'utf-8');

	// Return summary
	return `${darkMatterPairs.length} hidden coupling pairs detected`;
}
