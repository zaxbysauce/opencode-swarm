import * as path from 'node:path';
import {
	type Phase,
	type Plan,
	PlanSchema,
	type Task,
	type TaskStatus,
} from '../config/plan-schema';
import { readSwarmFileAsync } from '../hooks/utils';
import { warn } from '../utils';

/**
 * Load plan.json ONLY without auto-migration from plan.md.
 * Returns null if plan.json doesn't exist or is invalid.
 * Use this when you want to check for structured plans without triggering migration.
 */
export async function loadPlanJsonOnly(
	directory: string,
): Promise<Plan | null> {
	const planJsonContent = await readSwarmFileAsync(directory, 'plan.json');
	if (planJsonContent !== null) {
		try {
			const parsed = JSON.parse(planJsonContent);
			const validated = PlanSchema.parse(parsed);
			return validated;
		} catch (error) {
			warn(
				`Plan validation failed for .swarm/plan.json: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
	return null;
}

/**
 * Load and validate plan from .swarm/plan.json with 4-step precedence:
 * 1. .swarm/plan.json exists AND validates → return parsed Plan
 * 2. .swarm/plan.json exists but FAILS validation → log warning, fall to step 3
 * 3. .swarm/plan.md exists → call migrateLegacyPlan(), save result, return it
 * 4. Neither exists → return null
 */
export async function loadPlan(directory: string): Promise<Plan | null> {
	// Step 1: Try to load and validate plan.json
	const planJsonContent = await readSwarmFileAsync(directory, 'plan.json');
	if (planJsonContent !== null) {
		try {
			const parsed = JSON.parse(planJsonContent);
			const validated = PlanSchema.parse(parsed);
			return validated;
		} catch (error) {
			// Step 2: Validation failed, log warning and fall through to legacy
			warn(
				`Plan validation failed for .swarm/plan.json: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	// Step 3: Try to migrate from legacy plan.md
	const planMdContent = await readSwarmFileAsync(directory, 'plan.md');
	if (planMdContent !== null) {
		const migrated = migrateLegacyPlan(planMdContent);
		// Save the migrated plan
		await savePlan(directory, migrated);
		return migrated;
	}

	// Step 4: Neither exists
	return null;
}

/**
 * Validate against PlanSchema (throw on invalid), write to .swarm/plan.json via atomic temp+rename pattern,
 * then derive and write .swarm/plan.md
 */
export async function savePlan(directory: string, plan: Plan): Promise<void> {
	// Validate against schema
	const validated = PlanSchema.parse(plan);

	const swarmDir = path.resolve(directory, '.swarm');
	const planPath = path.join(swarmDir, 'plan.json');
	const tempPath = path.join(swarmDir, `plan.json.tmp.${Date.now()}`);

	// Write to temp
	await Bun.write(tempPath, JSON.stringify(validated, null, 2));

	// Atomic rename
	const { renameSync } = await import('node:fs');
	renameSync(tempPath, planPath);

	// Derive and write markdown
	const markdown = derivePlanMarkdown(validated);
	await Bun.write(path.join(swarmDir, 'plan.md'), markdown);
}

/**
 * Load plan → find task by ID → update status → save → return updated plan.
 * Throw if plan not found or task not found.
 */
export async function updateTaskStatus(
	directory: string,
	taskId: string,
	status: TaskStatus,
): Promise<Plan> {
	const plan = await loadPlan(directory);
	if (plan === null) {
		throw new Error(`Plan not found in directory: ${directory}`);
	}

	// Find task by ID
	let taskFound = false;
	const updatedPhases: Phase[] = plan.phases.map((phase) => {
		const updatedTasks: Task[] = phase.tasks.map((task) => {
			if (task.id === taskId) {
				taskFound = true;
				return { ...task, status };
			}
			return task;
		});
		return { ...phase, tasks: updatedTasks };
	});

	if (!taskFound) {
		throw new Error(`Task not found: ${taskId}`);
	}

	const updatedPlan: Plan = { ...plan, phases: updatedPhases };
	await savePlan(directory, updatedPlan);
	return updatedPlan;
}

/**
 * Generate markdown view from plan object
 */
export function derivePlanMarkdown(plan: Plan): string {
	const statusMap: Record<string, string> = {
		pending: 'PENDING',
		in_progress: 'IN PROGRESS',
		complete: 'COMPLETE',
		blocked: 'BLOCKED',
	};

	const now = new Date().toISOString();
	const phaseStatus =
		statusMap[plan.phases[plan.current_phase - 1]?.status] || 'PENDING';

	let markdown = `# ${plan.title}\nSwarm: ${plan.swarm}\nPhase: ${plan.current_phase} [${phaseStatus}] | Updated: ${now}\n`;

	for (const phase of plan.phases) {
		const phaseStatusText = statusMap[phase.status] || 'PENDING';
		markdown += `\n## Phase ${phase.id}: ${phase.name} [${phaseStatusText}]\n`;

		// Find the first in_progress task in the current phase to mark as CURRENT
		let currentTaskMarked = false;

		for (const task of phase.tasks) {
			let taskLine = '';
			let suffix = '';

			// Determine checkbox state and prefix
			if (task.status === 'completed') {
				taskLine = `- [x] ${task.id}: ${task.description}`;
			} else if (task.status === 'blocked') {
				taskLine = `- [BLOCKED] ${task.id}: ${task.description}`;
				if (task.blocked_reason) {
					taskLine += ` - ${task.blocked_reason}`;
				}
			} else {
				taskLine = `- [ ] ${task.id}: ${task.description}`;
			}

			// Add size
			taskLine += ` [${task.size.toUpperCase()}]`;

			// Add dependencies if present
			if (task.depends.length > 0) {
				suffix += ` (depends: ${task.depends.join(', ')})`;
			}

			// Mark as CURRENT if it's the first in_progress task in current phase
			if (
				phase.id === plan.current_phase &&
				task.status === 'in_progress' &&
				!currentTaskMarked
			) {
				suffix += ' ← CURRENT';
				currentTaskMarked = true;
			}

			markdown += `${taskLine}${suffix}\n`;
		}
	}

	// Separate phases with ---
	const phaseSections = markdown.split('\n## ');
	if (phaseSections.length > 1) {
		// Reconstruct with --- separators between phases
		const header = phaseSections[0];
		const phases = phaseSections.slice(1).map((p) => `## ${p}`);
		markdown = `${header}\n---\n${phases.join('\n---\n')}`;
	}

	return `${markdown.trim()}\n`;
}

/**
 * Convert existing plan.md to plan.json. PURE function — no I/O.
 */
export function migrateLegacyPlan(planContent: string, swarmId?: string): Plan {
	const lines = planContent.split('\n');
	let title = 'Untitled Plan';
	let swarm = swarmId || 'default-swarm';
	let currentPhaseNum = 1;
	const phases: Phase[] = [];

	let currentPhase: Phase | null = null;

	for (const line of lines) {
		const trimmed = line.trim();

		// Extract title from first # line
		if (trimmed.startsWith('# ') && title === 'Untitled Plan') {
			title = trimmed.substring(2).trim();
			continue;
		}

		// Extract swarm from "Swarm:" line
		if (trimmed.startsWith('Swarm:')) {
			swarm = trimmed.substring(6).trim();
			continue;
		}

		// Extract current phase from "Phase:" line
		if (trimmed.startsWith('Phase:')) {
			const match = trimmed.match(/Phase:\s*(\d+)/i);
			if (match) {
				currentPhaseNum = parseInt(match[1], 10);
			}
			continue;
		}

		// Parse phase headers: ## Phase N: Name [STATUS] or ## Phase N [STATUS]
		const phaseMatch = trimmed.match(
			/^##\s*Phase\s+(\d+)(?::\s*([^[]+))?\s*(?:\[([^\]]+)\])?/i,
		);
		if (phaseMatch) {
			// Save previous phase if exists
			if (currentPhase !== null) {
				phases.push(currentPhase);
			}

			const phaseId = parseInt(phaseMatch[1], 10);
			const phaseName = phaseMatch[2]?.trim() || `Phase ${phaseId}`;
			const statusText = phaseMatch[3]?.toLowerCase() || 'pending';

			const statusMap: Record<string, Phase['status']> = {
				complete: 'complete',
				completed: 'complete',
				'in progress': 'in_progress',
				in_progress: 'in_progress',
				inprogress: 'in_progress',
				pending: 'pending',
				blocked: 'blocked',
			};

			currentPhase = {
				id: phaseId,
				name: phaseName,
				status: statusMap[statusText] || 'pending',
				tasks: [],
			};
			continue;
		}

		// Parse task lines
		// Completed: - [x] N.M: Description [SIZE]
		// Pending: - [ ] N.M: Description [SIZE]
		// Blocked: - [BLOCKED] N.M: Description - reason
		const taskMatch = trimmed.match(
			/^-\s*\[([^\]]+)\]\s+(\d+\.\d+):\s*(.+?)(?:\s*\[(\w+)\])?(?:\s*-\s*(.+))?$/i,
		);
		if (taskMatch && currentPhase !== null) {
			const checkbox = taskMatch[1].toLowerCase();
			const taskId = taskMatch[2];
			let description = taskMatch[3].trim();
			const sizeText = taskMatch[4]?.toLowerCase() || 'small';
			let blockedReason: string | undefined;

			// Check for dependencies in description: (depends: X.Y, X.Z)
			const dependsMatch = description.match(/\s*\(depends:\s*([^)]+)\)$/i);
			const depends: string[] = [];
			if (dependsMatch) {
				const depsText = dependsMatch[1];
				depends.push(...depsText.split(',').map((d) => d.trim()));
				description = description.substring(0, dependsMatch.index).trim();
			}

			// Parse status from checkbox
			let status: Task['status'] = 'pending';
			if (checkbox === 'x') {
				status = 'completed';
			} else if (checkbox === 'blocked') {
				status = 'blocked';
				// Check if blocked reason is in the description suffix
				const blockedReasonMatch = taskMatch[5];
				if (blockedReasonMatch) {
					blockedReason = blockedReasonMatch.trim();
				}
			}

			// Parse size
			const sizeMap: Record<string, Task['size']> = {
				small: 'small',
				medium: 'medium',
				large: 'large',
			};

			const task: Task = {
				id: taskId,
				phase: currentPhase.id,
				status,
				size: sizeMap[sizeText] || 'small',
				description,
				depends,
				acceptance: undefined,
				files_touched: [],
				evidence_path: undefined,
				blocked_reason: blockedReason,
			};

			currentPhase.tasks.push(task);
		}
	}

	// Add final phase
	if (currentPhase !== null) {
		phases.push(currentPhase);
	}

	// Determine migration status
	let migrationStatus: Plan['migration_status'] = 'migrated';
	if (phases.length === 0) {
		// Zero phases parsed - migration failed
		migrationStatus = 'migration_failed';
		phases.push({
			id: 1,
			name: 'Migration Failed',
			status: 'blocked',
			tasks: [
				{
					id: '1.1',
					phase: 1,
					status: 'blocked',
					size: 'large',
					description: 'Review and restructure plan manually',
					depends: [],
					files_touched: [],
					blocked_reason: 'Legacy plan could not be parsed automatically',
				},
			],
		});
	}

	// Sort phases by ID
	phases.sort((a, b) => a.id - b.id);

	const plan: Plan = {
		schema_version: '1.0.0',
		title,
		swarm,
		current_phase: currentPhaseNum,
		phases,
		migration_status: migrationStatus,
	};

	return plan;
}
