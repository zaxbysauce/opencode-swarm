import { loadPluginConfig } from '../config/loader';
import { listEvidenceTaskIds } from '../evidence/manager';
import { readSwarmFileAsync } from '../hooks/utils';
import { loadPlanJsonOnly } from '../plan/manager';

/**
 * Handles the /swarm diagnose command.
 * Performs health checks on swarm state files and configuration.
 */
export async function handleDiagnoseCommand(
	directory: string,
	_args: string[],
): Promise<string> {
	const checks: Array<{
		name: string;
		status: '✅' | '❌';
		detail: string;
	}> = [];

	// Check 1: Try structured plan (only if plan.json exists, no auto-migration)
	const plan = await loadPlanJsonOnly(directory);

	if (plan) {
		// plan.json loaded and validated
		checks.push({
			name: 'plan.json',
			status: '✅',
			detail: 'Valid schema (v1.0.0)',
		});

		// Report migration status if present
		if (plan.migration_status === 'migrated') {
			checks.push({
				name: 'Migration',
				status: '✅',
				detail: 'Plan was migrated from legacy plan.md',
			});
		} else if (plan.migration_status === 'migration_failed') {
			checks.push({
				name: 'Migration',
				status: '❌',
				detail: 'Migration from plan.md failed — review manually',
			});
		}

		// Validate task DAG (check for missing dependencies)
		const allTaskIds = new Set<string>();
		for (const phase of plan.phases) {
			for (const task of phase.tasks) {
				allTaskIds.add(task.id);
			}
		}

		const missingDeps: string[] = [];
		for (const phase of plan.phases) {
			for (const task of phase.tasks) {
				for (const dep of task.depends) {
					if (!allTaskIds.has(dep)) {
						missingDeps.push(`${task.id} depends on missing ${dep}`);
					}
				}
			}
		}

		if (missingDeps.length > 0) {
			checks.push({
				name: 'Task DAG',
				status: '❌',
				detail: `Missing dependencies: ${missingDeps.join(', ')}`,
			});
		} else {
			checks.push({
				name: 'Task DAG',
				status: '✅',
				detail: 'All dependencies resolved',
			});
		}
	} else {
		// Fall back to checking plan.md (legacy behavior)
		const planContent = await readSwarmFileAsync(directory, 'plan.md');
		if (planContent) {
			const hasPhases = /^## Phase \d+/m.test(planContent);
			const hasTasks = /^- \[[ x]\]/m.test(planContent);
			if (hasPhases && hasTasks) {
				checks.push({
					name: 'plan.md',
					status: '✅',
					detail: 'Found with valid phase structure',
				});
			} else {
				checks.push({
					name: 'plan.md',
					status: '❌',
					detail: 'Found but missing phase/task structure',
				});
			}
		} else {
			checks.push({
				name: 'plan.md',
				status: '❌',
				detail: 'Not found',
			});
		}
	}

	// Check: context.md exists
	const contextContent = await readSwarmFileAsync(directory, 'context.md');
	if (contextContent) {
		checks.push({ name: 'context.md', status: '✅', detail: 'Found' });
	} else {
		checks.push({ name: 'context.md', status: '❌', detail: 'Not found' });
	}

	// Check: Plugin config
	try {
		const config = loadPluginConfig(directory);
		if (config) {
			checks.push({
				name: 'Plugin config',
				status: '✅',
				detail: 'Valid configuration loaded',
			});
		} else {
			checks.push({
				name: 'Plugin config',
				status: '✅',
				detail: 'Using defaults (no custom config)',
			});
		}
	} catch {
		checks.push({
			name: 'Plugin config',
			status: '❌',
			detail: 'Invalid configuration',
		});
	}

	// Check: Evidence completeness (only with structured plan)
	if (plan) {
		const completedTaskIds: string[] = [];
		for (const phase of plan.phases) {
			for (const task of phase.tasks) {
				if (task.status === 'completed') {
					completedTaskIds.push(task.id);
				}
			}
		}

		if (completedTaskIds.length > 0) {
			const evidenceTaskIds = new Set(await listEvidenceTaskIds(directory));
			const missingEvidence = completedTaskIds.filter(
				(id) => !evidenceTaskIds.has(id),
			);

			if (missingEvidence.length === 0) {
				checks.push({
					name: 'Evidence',
					status: '✅',
					detail: `All ${completedTaskIds.length} completed tasks have evidence`,
				});
			} else {
				checks.push({
					name: 'Evidence',
					status: '❌',
					detail: `${missingEvidence.length} completed task(s) missing evidence: ${missingEvidence.join(', ')}`,
				});
			}
		} else {
			checks.push({
				name: 'Evidence',
				status: '✅',
				detail: 'No completed tasks yet',
			});
		}
	}

	// Format output
	const passCount = checks.filter((c) => c.status === '✅').length;
	const totalCount = checks.length;
	const allPassed = passCount === totalCount;

	const lines = [
		'## Swarm Health Check',
		'',
		...checks.map((c) => `- ${c.status} **${c.name}**: ${c.detail}`),
		'',
		`**Result**: ${allPassed ? '✅ All checks passed' : `⚠️ ${passCount}/${totalCount} checks passed`}`,
	];

	return lines.join('\n');
}
