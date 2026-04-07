import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { KnowledgeConfigSchema } from '../config/schema';
import { archiveEvidence } from '../evidence/manager';
import {
	getCurrentBranch,
	getDefaultBaseBranch,
	hasUncommittedChanges,
	isGitRepo,
} from '../git/branch';
import { curateAndStoreSwarm } from '../hooks/knowledge-curator';
import { validateSwarmPath } from '../hooks/utils';
import { writeCheckpoint } from '../plan/checkpoint';
import { flushPendingSnapshot } from '../session/snapshot-writer';
import { swarmState } from '../state';
import { executeWriteRetro } from '../tools/write-retro';

interface PlanPhase {
	id: number;
	name: string;
	status: string;
	tasks: Array<{
		id: string;
		status: string;
	}>;
}

interface PlanData {
	title: string;
	phases: PlanPhase[];
}

/**
 * Artifacts to include in the archive bundle.
 * Each entry is a relative path under .swarm/.
 */
const ARCHIVE_ARTIFACTS = [
	'plan.json',
	'plan.md',
	'context.md',
	'events.jsonl',
	'handoff.md',
	'handoff-prompt.md',
	'handoff-consumed.md',
	'escalation-report.md',
	'close-lessons.md',
];

/**
 * Active-state files/dirs to clean after archiving so future swarms start clean.
 * plan.json is NOT deleted because its terminal state (all phases closed) is safe
 * and some workflows inspect it after close. It is archived and overwritten by
 * the next /swarm plan invocation.
 */
const ACTIVE_STATE_TO_CLEAN = [
	'plan.md',
	'events.jsonl',
	'handoff.md',
	'handoff-prompt.md',
	'handoff-consumed.md',
	'escalation-report.md',
];

/**
 * Handles /swarm close command - performs full terminal session finalization:
 * 1. Finalize: write retrospectives, produce terminal summary
 * 2. Archive: create timestamped bundle of swarm artifacts
 * 3. Clean: clear active-state files that confuse future swarms
 * 4. Align: safe git alignment to main
 *
 * Must be idempotent - safe to run multiple times.
 */
export async function handleCloseCommand(
	directory: string,
	args: string[],
): Promise<string> {
	const planPath = validateSwarmPath(directory, 'plan.json');
	const swarmDir = path.join(directory, '.swarm');

	let planExists = false;
	let planData: PlanData = {
		title: path.basename(directory) || 'Ad-hoc session',
		phases: [],
	};
	try {
		const content = await fs.readFile(planPath, 'utf-8');
		planData = JSON.parse(content);
		planExists = true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
			return `❌ Failed to read plan.json: ${error instanceof Error ? error.message : String(error)}`;
		}
		// ENOENT — check whether .swarm/ itself exists to distinguish plan-free from wrong directory
		const swarmDirExists = await fs
			.access(swarmDir)
			.then(() => true)
			.catch(() => false);
		if (!swarmDirExists) {
			return `❌ No .swarm/ directory found in ${directory}. Run /swarm close from the project root, or run /swarm plan first.`;
		}
		// .swarm/ exists but plan.json is absent — valid plan-free session, continue with cleanup
	}

	const phases = planData.phases ?? [];
	const inProgressPhases = phases.filter((p) => p.status === 'in_progress');
	const isForced = args.includes('--force');

	// planAlreadyDone: skip retro writing and plan mutation, but still run all cleanup steps
	let planAlreadyDone = false;
	if (planExists) {
		planAlreadyDone =
			phases.length > 0 &&
			phases.every(
				(p) =>
					p.status === 'complete' ||
					p.status === 'completed' ||
					p.status === 'blocked' ||
					p.status === 'closed',
			);
	}

	const config = KnowledgeConfigSchema.parse({});
	const projectName = planData.title ?? 'Unknown Project';
	const closedPhases: number[] = [];
	const closedTasks: string[] = [];
	const warnings: string[] = [];

	// ─── STAGE 1: FINALIZE ───────────────────────────────────────────
	if (!planAlreadyDone) {
		for (const phase of inProgressPhases) {
			closedPhases.push(phase.id);

			let retroResult: string | undefined;
			try {
				retroResult = await executeWriteRetro(
					{
						phase: phase.id,
						summary: isForced
							? `Phase force-closed via /swarm close --force`
							: `Phase closed via /swarm close`,
						task_count: Math.max(1, (phase.tasks ?? []).length),
						task_complexity: 'simple',
						total_tool_calls: 0,
						coder_revisions: 0,
						reviewer_rejections: 0,
						test_failures: 0,
						security_findings: 0,
						integration_issues: 0,
					},
					directory,
				);
			} catch (retroError) {
				warnings.push(
					`Retrospective write threw for phase ${phase.id}: ${retroError instanceof Error ? retroError.message : String(retroError)}`,
				);
			}

			if (retroResult !== undefined) {
				try {
					const parsed = JSON.parse(retroResult);
					if (parsed.success !== true) {
						warnings.push(`Retrospective write failed for phase ${phase.id}`);
					}
				} catch {
					// Non-JSON response is not an error
				}
			}

			for (const task of phase.tasks ?? []) {
				if (task.status !== 'completed' && task.status !== 'complete') {
					closedTasks.push(task.id);
				}
			}
		}
	}

	// Read explicit lessons from .swarm/close-lessons.md if present
	const lessonsFilePath = path.join(swarmDir, 'close-lessons.md');
	let explicitLessons: string[] = [];
	try {
		const lessonsText = await fs.readFile(lessonsFilePath, 'utf-8');
		explicitLessons = lessonsText
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.length > 0 && !line.startsWith('#'));
	} catch {
		// File absent or unreadable — use empty array
	}

	let curationSucceeded = false;
	try {
		await curateAndStoreSwarm(
			explicitLessons,
			projectName,
			{ phase_number: 0 },
			directory,
			config,
		);
		curationSucceeded = true;
	} catch (error) {
		console.warn('[close-command] curateAndStoreSwarm error:', error);
	}

	if (curationSucceeded && explicitLessons.length > 0) {
		await fs.unlink(lessonsFilePath).catch(() => {});
	}

	if (planExists && !planAlreadyDone) {
		for (const phase of phases) {
			if (phase.status !== 'complete' && phase.status !== 'completed') {
				phase.status = 'closed';
				if (!closedPhases.includes(phase.id)) {
					closedPhases.push(phase.id);
				}
			}
			for (const task of phase.tasks ?? []) {
				if (task.status !== 'completed' && task.status !== 'complete') {
					task.status = 'closed';
					if (!closedTasks.includes(task.id)) {
						closedTasks.push(task.id);
					}
				}
			}
		}

		try {
			await fs.writeFile(planPath, JSON.stringify(planData, null, 2), 'utf-8');
		} catch (error) {
			console.warn('[close-command] Failed to write plan.json:', error);
		}
	}

	// ─── STAGE 2: ARCHIVE ────────────────────────────────────────────
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const archiveDir = path.join(swarmDir, 'archive', `swarm-${timestamp}`);
	let archiveResult = '';
	let archivedFileCount = 0;
	/** Track which active-state files were successfully backed up to the archive.
	 *  Only these files are safe to delete in the clean stage. */
	const archivedActiveStateFiles = new Set<string>();

	try {
		await fs.mkdir(archiveDir, { recursive: true });

		// Copy swarm artifacts to archive
		for (const artifact of ARCHIVE_ARTIFACTS) {
			const srcPath = path.join(swarmDir, artifact);
			const destPath = path.join(archiveDir, artifact);
			try {
				await fs.copyFile(srcPath, destPath);
				archivedFileCount++;
				if (ACTIVE_STATE_TO_CLEAN.includes(artifact)) {
					archivedActiveStateFiles.add(artifact);
				}
			} catch {
				// File may not exist — skip silently
			}
		}

		// Archive evidence directory
		const evidenceDir = path.join(swarmDir, 'evidence');
		const archiveEvidenceDir = path.join(archiveDir, 'evidence');
		try {
			const evidenceEntries = await fs.readdir(evidenceDir);
			if (evidenceEntries.length > 0) {
				await fs.mkdir(archiveEvidenceDir, { recursive: true });
				for (const entry of evidenceEntries) {
					const srcEntry = path.join(evidenceDir, entry);
					const destEntry = path.join(archiveEvidenceDir, entry);
					try {
						const stat = await fs.stat(srcEntry);
						if (stat.isDirectory()) {
							await fs.mkdir(destEntry, { recursive: true });
							const subEntries = await fs.readdir(srcEntry);
							for (const sub of subEntries) {
								await fs
									.copyFile(path.join(srcEntry, sub), path.join(destEntry, sub))
									.catch(() => {});
							}
						} else {
							await fs.copyFile(srcEntry, destEntry);
						}
						archivedFileCount++;
					} catch {
						// Per-entry failure is non-blocking
					}
				}
			}
		} catch {
			// evidence dir may not exist
		}

		// Archive session state
		const sessionStatePath = path.join(swarmDir, 'session', 'state.json');
		try {
			const archiveSessionDir = path.join(archiveDir, 'session');
			await fs.mkdir(archiveSessionDir, { recursive: true });
			await fs.copyFile(
				sessionStatePath,
				path.join(archiveSessionDir, 'state.json'),
			);
			archivedFileCount++;
		} catch {
			// session state may not exist
		}

		archiveResult = `Archived ${archivedFileCount} artifact(s) to .swarm/archive/swarm-${timestamp}/`;
	} catch (archiveError) {
		warnings.push(
			`Archive creation failed: ${archiveError instanceof Error ? archiveError.message : String(archiveError)}`,
		);
		archiveResult = 'Archive creation failed (see warnings)';
	}

	// Archive evidence bundles (retention policy)
	try {
		await archiveEvidence(directory, 30, 10);
	} catch (error) {
		console.warn('[close-command] archiveEvidence error:', error);
	}

	// ─── STAGE 3: CLEAN ──────────────────────────────────────────────
	let configBackupsRemoved = 0;
	const cleanedFiles: string[] = [];

	// Only delete active-state files that were successfully copied to the archive.
	// This prevents data loss when a partial archive succeeds for some files but
	// fails for others — only the backed-up files are safe to remove.
	if (archivedActiveStateFiles.size > 0) {
		for (const artifact of ACTIVE_STATE_TO_CLEAN) {
			if (!archivedActiveStateFiles.has(artifact)) {
				// This file was NOT successfully archived — do not delete it
				warnings.push(
					`Preserved ${artifact} because it was not successfully archived.`,
				);
				continue;
			}
			const filePath = path.join(swarmDir, artifact);
			try {
				await fs.unlink(filePath);
				cleanedFiles.push(artifact);
			} catch {
				// File may not exist
			}
		}
	} else {
		warnings.push(
			'Skipped active-state cleanup because no active-state files were archived. Files preserved to prevent data loss.',
		);
	}

	// Remove stale config-backup-*.json files
	try {
		const swarmFiles = await fs.readdir(swarmDir);
		const configBackups = swarmFiles.filter(
			(f) => f.startsWith('config-backup-') && f.endsWith('.json'),
		);
		for (const backup of configBackups) {
			try {
				await fs.unlink(path.join(swarmDir, backup));
				configBackupsRemoved++;
			} catch {
				// Per-file failure is non-blocking
			}
		}
	} catch {
		// readdir failure is non-blocking
	}

	// Reset context.md so new sessions start fresh
	const contextPath = path.join(swarmDir, 'context.md');
	const contextContent = [
		'# Context',
		'',
		'## Status',
		`Session closed after: ${projectName}`,
		`Closed: ${new Date().toISOString()}`,
		`Finalization: ${isForced ? 'forced' : planAlreadyDone ? 'plan-already-done' : 'normal'}`,
		'No active plan. Next session starts fresh.',
		'',
	].join('\n');
	try {
		await fs.writeFile(contextPath, contextContent, 'utf-8');
	} catch (error) {
		console.warn('[close-command] Failed to write context.md:', error);
	}

	// ─── STAGE 4: ALIGN ──────────────────────────────────────────────
	const pruneBranches = args.includes('--prune-branches');
	const prunedBranches: string[] = [];
	const pruneErrors: string[] = [];
	let gitAlignResult = '';

	const isGit = isGitRepo(directory);
	if (isGit) {
		// Safe git alignment: check for dirty worktree, detached HEAD, etc.
		try {
			const currentBranch = getCurrentBranch(directory);

			if (currentBranch === 'HEAD') {
				gitAlignResult = 'Skipped git alignment: detached HEAD state';
				warnings.push(
					'Repo is in detached HEAD state. Checkout a branch before starting a new swarm.',
				);
			} else if (hasUncommittedChanges(directory)) {
				gitAlignResult =
					'Skipped git alignment: uncommitted changes in worktree';
				warnings.push(
					'Uncommitted changes detected. Commit or stash before aligning to main.',
				);
			} else {
				// Determine base branch
				const baseBranch = getDefaultBaseBranch(directory);
				const localBase = baseBranch.replace(/^origin\//, '');

				if (currentBranch === localBase) {
					// Already on main/master — try a safe pull
					try {
						execFileSync('git', ['fetch', 'origin', localBase], {
							cwd: directory,
							encoding: 'utf-8',
							timeout: 30_000,
							stdio: ['pipe', 'pipe', 'pipe'],
						});

						// Check if fast-forward is possible
						const mergeBase = execFileSync(
							'git',
							['merge-base', 'HEAD', baseBranch],
							{
								cwd: directory,
								encoding: 'utf-8',
								timeout: 10_000,
								stdio: ['pipe', 'pipe', 'pipe'],
							},
						).trim();

						const headSha = execFileSync('git', ['rev-parse', 'HEAD'], {
							cwd: directory,
							encoding: 'utf-8',
							timeout: 10_000,
							stdio: ['pipe', 'pipe', 'pipe'],
						}).trim();

						if (mergeBase === headSha) {
							// HEAD is ancestor of remote — fast-forward safe
							execFileSync('git', ['merge', '--ff-only', baseBranch], {
								cwd: directory,
								encoding: 'utf-8',
								timeout: 30_000,
								stdio: ['pipe', 'pipe', 'pipe'],
							});
							gitAlignResult = `Aligned to ${baseBranch} (fast-forward)`;
						} else {
							gitAlignResult = `On ${localBase} but cannot fast-forward to ${baseBranch} (diverged)`;
							warnings.push(
								`Local ${localBase} has diverged from ${baseBranch}. Manual merge/rebase needed.`,
							);
						}
					} catch (fetchErr) {
						gitAlignResult = `Fetch from origin/${localBase} failed — remote may be unavailable`;
						warnings.push(
							`Git fetch failed: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`,
						);
					}
				} else {
					// On a feature branch — just report status, don't force checkout
					gitAlignResult = `On branch ${currentBranch}. Switch to ${localBase} manually when ready for a new swarm.`;
				}
			}
		} catch (gitError) {
			gitAlignResult = `Git alignment error: ${gitError instanceof Error ? gitError.message : String(gitError)}`;
		}

		// Optional branch pruning
		if (pruneBranches) {
			try {
				const branchOutput = execFileSync('git', ['branch', '-vv'], {
					cwd: directory,
					encoding: 'utf-8',
					stdio: ['pipe', 'pipe', 'pipe'],
				});
				const goneBranches = branchOutput
					.split('\n')
					.filter((line) => line.includes(': gone]'))
					.map(
						(line) =>
							line
								.trim()
								.replace(/^[*+]\s+/, '')
								.split(/\s+/)[0],
					)
					.filter(Boolean);
				for (const branch of goneBranches) {
					try {
						execFileSync('git', ['branch', '-d', branch], {
							cwd: directory,
							encoding: 'utf-8',
							stdio: ['pipe', 'pipe', 'pipe'],
						});
						prunedBranches.push(branch);
					} catch {
						pruneErrors.push(branch);
					}
				}
			} catch {
				// Not a git repo or git not installed — non-blocking
			}
		}
	} else {
		gitAlignResult = 'Not a git repository — skipped git alignment';
	}

	// ─── WRITE CLOSE SUMMARY ─────────────────────────────────────────
	const closeSummaryPath = validateSwarmPath(directory, 'close-summary.md');

	const finalizationType = isForced
		? 'Forced closure'
		: planAlreadyDone
			? 'Plan already terminal — cleanup only'
			: 'Normal finalization';

	const actionsPerformed = [
		...(!planAlreadyDone && inProgressPhases.length > 0
			? ['- Wrote retrospectives for in-progress phases']
			: []),
		`- ${archiveResult}`,
		...(cleanedFiles.length > 0
			? [
					`- Cleaned ${cleanedFiles.length} active-state file(s): ${cleanedFiles.join(', ')}`,
				]
			: []),
		'- Reset context.md for next session',
		...(configBackupsRemoved > 0
			? [`- Removed ${configBackupsRemoved} stale config backup file(s)`]
			: []),
		...(prunedBranches.length > 0
			? [
					`- Pruned ${prunedBranches.length} stale local git branch(es): ${prunedBranches.join(', ')}`,
				]
			: []),
		'- Cleared agent sessions and delegation chains',
		...(planExists && !planAlreadyDone
			? ['- Set non-completed phases/tasks to closed status']
			: []),
		...(gitAlignResult ? [`- Git: ${gitAlignResult}`] : []),
	];

	const summaryContent = [
		'# Swarm Close Summary',
		'',
		`**Project:** ${projectName}`,
		`**Closed:** ${new Date().toISOString()}`,
		`**Finalization:** ${finalizationType}`,
		'',
		`## Phases Closed: ${closedPhases.length}`,
		!planExists
			? '_No plan — ad-hoc session_'
			: closedPhases.length > 0
				? closedPhases.map((id) => `- Phase ${id}`).join('\n')
				: '_No phases to close_',
		'',
		`## Tasks Closed: ${closedTasks.length}`,
		closedTasks.length > 0
			? closedTasks.map((id) => `- ${id}`).join('\n')
			: '_No incomplete tasks_',
		'',
		'## Actions Performed',
		...actionsPerformed,
		'',
		...(warnings.length > 0
			? ['## Warnings', ...warnings.map((w) => `- ${w}`), '']
			: []),
	].join('\n');

	try {
		await fs.writeFile(closeSummaryPath, summaryContent, 'utf-8');
	} catch (error) {
		console.warn('[close-command] Failed to write close-summary.md:', error);
	}

	// Flush snapshot before clearing sessions
	try {
		await flushPendingSnapshot(directory);
	} catch (error) {
		console.warn('[close-command] flushPendingSnapshot error:', error);
	}

	// Write root-level checkpoint artifact before clearing sessions (non-blocking)
	await writeCheckpoint(directory).catch(() => {});

	swarmState.agentSessions.clear();
	swarmState.delegationChains.clear();

	if (pruneErrors.length > 0) {
		warnings.push(
			`Could not prune ${pruneErrors.length} branch(es) (unmerged or checked out): ${pruneErrors.join(', ')}`,
		);
	}

	const warningMsg =
		warnings.length > 0
			? `\n\n**Warnings:**\n${warnings.map((w) => `- ${w}`).join('\n')}`
			: '';

	if (planAlreadyDone) {
		return `✅ Session finalized. Plan was already in a terminal state — cleanup and archive applied.\n\n**Archive:** ${archiveResult}\n**Git:** ${gitAlignResult}${warningMsg}`;
	}
	return `✅ Swarm finalized. ${closedPhases.length} phase(s) closed, ${closedTasks.length} incomplete task(s) marked closed.\n\n**Archive:** ${archiveResult}\n**Git:** ${gitAlignResult}${warningMsg}`;
}
