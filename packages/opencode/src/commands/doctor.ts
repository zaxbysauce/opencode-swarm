import { loadPluginConfig } from '../config/loader';
import {
	type ConfigDoctorResult,
	runConfigDoctor,
} from '../services/config-doctor';

/**
 * Format config doctor result as markdown for command output.
 */
function formatDoctorMarkdown(result: ConfigDoctorResult): string {
	const lines = [
		'## Config Doctor Report',
		'',
		`**Config Source**: ${result.configSource}`,
		'',
		'### Summary',
		`- **Info**: ${result.summary.info}`,
		`- **Warnings**: ${result.summary.warn}`,
		`- **Errors**: ${result.summary.error}`,
		'',
	];

	if (result.findings.length === 0) {
		lines.push('No issues found. Your configuration looks good!');
	} else {
		lines.push('### Findings', '');

		// Group findings by severity
		const errors = result.findings.filter((f) => f.severity === 'error');
		const warnings = result.findings.filter((f) => f.severity === 'warn');
		const infos = result.findings.filter((f) => f.severity === 'info');

		for (const finding of [...errors, ...warnings, ...infos]) {
			const icon =
				finding.severity === 'error'
					? '❌'
					: finding.severity === 'warn'
						? '⚠️'
						: 'ℹ️';
			lines.push(
				`${icon} **${finding.severity.toUpperCase()}**: ${finding.description}`,
			);
			if (finding.autoFixable) {
				lines.push(`   - 🔧 Auto-fixable`);
			}
			lines.push('');
		}
	}

	if (result.hasAutoFixableIssues) {
		lines.push('---');
		lines.push('');
		lines.push(
			'Tip: Some issues can be auto-fixed. Run `/swarm config doctor --fix` to apply fixes.',
		);
	}

	return lines.join('\n');
}

/**
 * Handle /swarm config doctor command.
 * Maps to: config doctor service (runConfigDoctor)
 */
export async function handleDoctorCommand(
	directory: string,
	args: string[],
): Promise<string> {
	const enableAutoFix = args.includes('--fix') || args.includes('-f');

	const config = loadPluginConfig(directory);
	const result = runConfigDoctor(config, directory);

	// If auto-fix is requested and there are auto-fixable issues
	if (enableAutoFix && result.hasAutoFixableIssues) {
		// Lazy load to avoid circular dependency
		const { runConfigDoctorWithFixes } = await import(
			'../services/config-doctor'
		);
		const fixResult = await runConfigDoctorWithFixes(directory, config, true);
		return formatDoctorMarkdown(fixResult.result);
	}

	return formatDoctorMarkdown(result);
}
