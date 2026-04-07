import { copyFileSync, existsSync, renameSync, unlinkSync } from 'node:fs';
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
import {
	appendLedgerEvent,
	computeCurrentPlanHash,
	computePlanHash,
	getLatestLedgerSeq,
	initLedger,
	type LedgerEventInput,
	LedgerStaleWriterError,
	ledgerExists,
	readLedgerEvents,
	replayFromLedger,
	takeSnapshotEvent,
} from './ledger';

// Track which workspaces have already had their startup ledger integrity check.
// Keyed by resolved workspace directory so each workspace gets exactly one check
// per process lifetime, even when a long-lived process touches multiple repos.
const startupLedgerCheckedWorkspaces = new Set<string>();

/** Reset the startup ledger check flag. For testing only. */
export function resetStartupLedgerCheck(): void {
	startupLedgerCheckedWorkspaces.clear();
}

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
		// SECURITY: Reject content with null bytes (injection) or invalid UTF-8 (corruption markers)
		if (planJsonContent.includes('\0') || planJsonContent.includes('\uFFFD')) {
			warn(
				'Plan rejected: .swarm/plan.json contains null bytes or invalid encoding',
			);
			return null;
		}
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
 * Natural numeric comparison for task IDs (e.g., "1.2" < "1.10").
 * This ensures deterministic ordering: 1.1, 1.2, 1.10, 1.11, 2.1
 */
function compareTaskIds(a: string, b: string): number {
	const partsA = a.split('.').map((n) => parseInt(n, 10));
	const partsB = b.split('.').map((n) => parseInt(n, 10));
	const maxLen = Math.max(partsA.length, partsB.length);

	for (let i = 0; i < maxLen; i++) {
		const numA = partsA[i] ?? 0;
		const numB = partsB[i] ?? 0;
		if (numA !== numB) {
			return numA - numB;
		}
	}
	return 0;
}

/**
 * Get the plan_hash_after from the last ledger event.
 * Returns empty string if ledger is empty/missing or read fails.
 */
async function getLatestLedgerHash(directory: string): Promise<string> {
	try {
		const events = await readLedgerEvents(directory);
		if (events.length === 0) return '';
		const lastEvent = events[events.length - 1];
		return lastEvent.plan_hash_after;
	} catch {
		return '';
	}
}

/**
 * Compute deterministic content hash for plan (excludes timestamp/derived fields).
 * Used to detect drift between plan.json and plan.md.
 * Uses natural numeric sorting for task IDs (1.2 < 1.10).
 * Returns a short hash string for compact storage in plan.md.
 */
function computePlanContentHash(plan: Plan): string {
	// Create deterministic representation (no timestamps, sorted IDs)
	const content = {
		schema_version: plan.schema_version,
		title: plan.title,
		swarm: plan.swarm,
		current_phase: plan.current_phase,
		migration_status: plan.migration_status,
		phases: plan.phases
			.map((phase) => ({
				id: phase.id,
				name: phase.name,
				status: phase.status,
				tasks: phase.tasks
					.map((task) => ({
						id: task.id,
						phase: task.phase,
						status: task.status,
						size: task.size,
						description: task.description,
						depends: [...task.depends].sort(compareTaskIds),
						acceptance: task.acceptance,
						files_touched: [...task.files_touched].sort(),
						evidence_path: task.evidence_path,
						blocked_reason: task.blocked_reason,
					}))
					.sort((a, b) => compareTaskIds(a.id, b.id)),
			}))
			.sort((a, b) => a.id - b.id),
	};
	const jsonString = JSON.stringify(content);
	// Use Bun's hash for a compact hash string
	return Bun.hash(jsonString).toString(36);
}

/**
 * Extract content hash from plan.md header if present.
 * Format: <!-- PLAN_HASH: <hash> -->
 */
function extractPlanHashFromMarkdown(markdown: string): string | null {
	const match = markdown.match(/<!--\s*PLAN_HASH:\s*(\S+)\s*-->/);
	return match ? match[1] : null;
}

/**
 * Check if plan.md is derived from the given plan by comparing content hashes.
 * Returns true if plan.md exists and matches the plan's content hash.
 * This avoids timestamp comparison issues by using a deterministic hash.
 */
async function isPlanMdInSync(directory: string, plan: Plan): Promise<boolean> {
	const planMdContent = await readSwarmFileAsync(directory, 'plan.md');
	if (planMdContent === null) {
		return false;
	}

	// Compute deterministic hash from plan
	const expectedHash = computePlanContentHash(plan);

	// Try to extract hash from existing plan.md
	const existingHash = extractPlanHashFromMarkdown(planMdContent);

	// If both hashes match, plan.md is in sync
	if (existingHash === expectedHash) {
		return true;
	}

	// Fallback: If no hash in plan.md but content structure matches, still in sync
	// This provides backward compatibility with plan.md files generated before hashing
	const expectedMarkdown = derivePlanMarkdown(plan);
	const normalizedExpected = expectedMarkdown.trim();
	const normalizedActual = planMdContent.trim();

	// Check if actual matches expected (allowing for trailing whitespace differences)
	if (normalizedActual === normalizedExpected) {
		return true;
	}

	// Check if actual contains the derived content (handles added comments/metadata)
	return (
		normalizedActual.includes(normalizedExpected) ||
		normalizedExpected.includes(normalizedActual.replace(/^#.*$/gm, '').trim())
	);
}

/**
 * Regenerate plan.md from valid plan.json (auto-heal case 1).
 */
export async function regeneratePlanMarkdown(
	directory: string,
	plan: Plan,
): Promise<void> {
	const swarmDir = path.resolve(directory, '.swarm');
	const contentHash = computePlanContentHash(plan);
	const markdown = derivePlanMarkdown(plan);
	// Prepend hash as comment for sync detection
	const markdownWithHash = `<!-- PLAN_HASH: ${contentHash} -->\n${markdown}`;
	const mdPath = path.join(swarmDir, 'plan.md');
	const mdTempPath = path.join(
		swarmDir,
		`plan.md.tmp.${Date.now()}.${Math.floor(Math.random() * 1e9)}`,
	);
	try {
		await Bun.write(mdTempPath, markdownWithHash);
		renameSync(mdTempPath, mdPath);
	} finally {
		try {
			unlinkSync(mdTempPath);
		} catch {
			/* already renamed or never created */
		}
	}
}

/**
 * Load and validate plan from .swarm/plan.json with auto-heal sync.
 *
 * 4-step precedence with auto-heal:
 * 1. .swarm/plan.json exists AND validates ->
 *    a) If plan.md missing or stale -> regenerate plan.md from plan.json
 *    b) Return parsed Plan
 * 2. .swarm/plan.json exists but FAILS validation ->
 *    a) If plan.md exists -> migrate from plan.md, save valid plan.json, then derive plan.md
 *    b) Return migrated Plan
 * 3. .swarm/plan.md exists only -> migrate from plan.md, save both files, return Plan
 * 4. Neither exists -> return null
 */
export async function loadPlan(directory: string): Promise<Plan | null> {
	// Step 1: Try to load and validate plan.json
	const planJsonContent = await readSwarmFileAsync(directory, 'plan.json');
	if (planJsonContent !== null) {
		// SECURITY: Reject content with null bytes or invalid UTF-8
		if (planJsonContent.includes('\0') || planJsonContent.includes('\uFFFD')) {
			warn(
				'Plan rejected: .swarm/plan.json contains null bytes or invalid encoding',
			);
			// Skip to plan.md migration path - don't parse tainted content
		} else {
			try {
				const parsed = JSON.parse(planJsonContent);
				const validated = PlanSchema.parse(parsed);

				// Auto-heal case 1: Valid plan.json exists, check if plan.md needs regeneration
				const inSync = await isPlanMdInSync(directory, validated);
				if (!inSync) {
					try {
						await regeneratePlanMarkdown(directory, validated);
					} catch (regenError) {
						// Log warning but don't fail - plan.json is valid
						warn(
							`Failed to regenerate plan.md: ${regenError instanceof Error ? regenError.message : String(regenError)}. Proceeding with plan.json only.`,
						);
					}
				}

				// Task 3.1: Ledger-aware rehydration guard
				// If ledger exists and plan.json hash doesn't match latest ledger hash,
				// the projection is stale — rebuild from ledger before returning.
				// SCOPED TO STARTUP ONLY: Hash mismatches during active sessions are expected
				// due to concurrent writes (save_plan + update_task_status). Only rebuild on
				// first loadPlan() call per workspace per process lifetime.
				if (await ledgerExists(directory)) {
					const planHash = computePlanHash(validated);
					const ledgerHash = await getLatestLedgerHash(directory);
					const resolvedWorkspace = path.resolve(directory);
					if (!startupLedgerCheckedWorkspaces.has(resolvedWorkspace)) {
						startupLedgerCheckedWorkspaces.add(resolvedWorkspace);
						if (ledgerHash !== '' && planHash !== ledgerHash) {
							const currentPlanId =
								`${validated.swarm}-${validated.title}`.replace(
									/[^a-zA-Z0-9-_]/g,
									'_',
								);
							const ledgerEvents = await readLedgerEvents(directory);
							const firstEvent =
								ledgerEvents.length > 0 ? ledgerEvents[0] : null;
							if (firstEvent && firstEvent.plan_id !== currentPlanId) {
								// Ledger is from a different plan identity — migration detected.
								// Use the first event (plan_created anchor) as the authoritative identity,
								// consistent with savePlan's archive guard which also uses events[0].
								// Do not rebuild; plan.json is the authoritative post-migration state.
								warn(
									`[loadPlan] Ledger identity mismatch (ledger: ${firstEvent.plan_id}, plan: ${currentPlanId}) — skipping ledger rebuild (migration detected). Use /swarm reset-session to reinitialize the ledger.`,
								);
							} else {
								warn(
									'[loadPlan] plan.json is stale (hash mismatch with ledger) — rebuilding from ledger. If this recurs, run /swarm reset-session to clear stale session state.',
								);
								try {
									const rebuilt = await replayFromLedger(directory);
									if (rebuilt) {
										await rebuildPlan(directory, rebuilt);
										warn(
											'[loadPlan] Rebuilt plan from ledger. Checkpoint available at SWARM_PLAN.md if it exists.',
										);
										return rebuilt;
									}
								} catch (replayError) {
									warn(
										`[loadPlan] Ledger replay failed during hash-mismatch rebuild: ${replayError instanceof Error ? replayError.message : String(replayError)}. Returning stale plan.json. To recover: check SWARM_PLAN.md for a checkpoint, or run /swarm reset-session.`,
									);
								}
								// Fall through and return the validated plan.json
							}
						}
					} else if (ledgerHash !== '' && planHash !== ledgerHash) {
						// During active session: hash mismatch is expected due to concurrent writes.
						if (process.env.DEBUG_SWARM) {
							console.warn(
								`[loadPlan] Ledger hash mismatch during active session for ${resolvedWorkspace} — skipping rebuild (startup check already performed).`,
							);
						}
					}
				}
				return validated;
			} catch (error) {
				// Step 2: Validation failed, log warning and fall through to legacy
				warn(
					`[loadPlan] plan.json validation failed: ${error instanceof Error ? error.message : String(error)}. Attempting rebuild from ledger. If rebuild fails, check SWARM_PLAN.md for a checkpoint.`,
				);
				// MIGRATION GUARD (catch path): Extract swarm+title from the raw JSON
				// before schema validation even though validation failed. If we can determine
				// the plan's identity and it doesn't match the ledger's first-event identity,
				// skip the replay to prevent a post-migration ledger from overwriting the
				// (schema-invalid) migrated plan.json.
				let rawPlanId: string | null = null;
				try {
					const rawParsed = JSON.parse(planJsonContent);
					if (
						typeof rawParsed?.swarm === 'string' &&
						typeof rawParsed?.title === 'string'
					) {
						rawPlanId = `${rawParsed.swarm}-${rawParsed.title}`.replace(
							/[^a-zA-Z0-9-_]/g,
							'_',
						);
					}
				} catch {
					// JSON itself is malformed — rawPlanId stays null (conservative: skip ledger)
				}
				// Try replay from ledger before legacy migration
				if (await ledgerExists(directory)) {
					const ledgerEventsForCatch = await readLedgerEvents(directory);
					const catchFirstEvent =
						ledgerEventsForCatch.length > 0 ? ledgerEventsForCatch[0] : null;
					const identityMatch =
						rawPlanId === null || // Can't determine identity — skip rebuild (conservative)
						catchFirstEvent === null || // Empty ledger — no identity to compare
						catchFirstEvent.plan_id === rawPlanId; // Same identity — safe to rebuild
					if (!identityMatch) {
						warn(
							`[loadPlan] Ledger identity mismatch in validation-failure path (ledger: ${catchFirstEvent?.plan_id}, plan: ${rawPlanId}) — skipping ledger rebuild (migration detected).`,
						);
					} else if (catchFirstEvent !== null && rawPlanId !== null) {
						// Identities match — attempt ledger rebuild
						const rebuilt = await replayFromLedger(directory);
						if (rebuilt) {
							await rebuildPlan(directory, rebuilt);
							warn(
								'[loadPlan] Rebuilt plan from ledger after validation failure. Projection was stale.',
							);
							return rebuilt;
						}
					}
				}
				// Auto-heal case 2: plan.json invalid but plan.md exists -> migrate from plan.md
				const planMdContent = await readSwarmFileAsync(directory, 'plan.md');
				if (planMdContent !== null) {
					const migrated = migrateLegacyPlan(planMdContent);
					// savePlan writes both plan.json and plan.md
					await savePlan(directory, migrated);
					return migrated;
				}
				// If plan.md doesn't exist either, fall through to step 3
			}
		}
	}

	// Step 3: Try to migrate from legacy plan.md (no plan.json exists)
	const planMdContent = await readSwarmFileAsync(directory, 'plan.md');
	if (planMdContent !== null) {
		const migrated = migrateLegacyPlan(planMdContent);
		// Save the migrated plan (writes both files)
		await savePlan(directory, migrated);
		return migrated;
	}

	// Step 4: Neither exists
	// Try to rebuild from ledger
	if (await ledgerExists(directory)) {
		const rebuilt = await replayFromLedger(directory);
		if (rebuilt) {
			await savePlan(directory, rebuilt);
			return rebuilt;
		}
	}
	return null;
}

/**
 * Validate against PlanSchema (throw on invalid), write to .swarm/plan.json via atomic temp+rename pattern,
 * then derive and write .swarm/plan.md
 */
export async function savePlan(
	directory: string,
	plan: Plan,
	options?: { preserveCompletedStatuses?: boolean },
): Promise<void> {
	// Fail-fast: reject blank or whitespace-only directory inputs before any I/O
	if (
		directory === null ||
		directory === undefined ||
		typeof directory !== 'string' ||
		directory.trim().length === 0
	) {
		throw new Error(`Invalid directory: directory must be a non-empty string`);
	}

	// Validate against schema
	const validated = PlanSchema.parse(plan);

	// Protect completed tasks from regression (root cause #4):
	// If any task was 'completed' in the current plan.json, preserve that status
	// even if the incoming plan has it as 'pending'/'in_progress'/'blocked'.
	if (options?.preserveCompletedStatuses !== false) {
		try {
			const currentPlan = await loadPlanJsonOnly(directory);
			if (currentPlan) {
				const completedTaskIds = new Set<string>();
				for (const phase of currentPlan.phases) {
					for (const task of phase.tasks) {
						if (task.status === 'completed') completedTaskIds.add(task.id);
					}
				}
				if (completedTaskIds.size > 0) {
					for (const phase of validated.phases) {
						for (const task of phase.tasks) {
							if (
								completedTaskIds.has(task.id) &&
								task.status !== 'completed'
							) {
								task.status = 'completed';
							}
						}
					}
				}
			}
		} catch {
			/* first write or corrupted plan — proceed without regression protection */
		}
	} // end preserveCompletedStatuses guard

	// Derive phase status from task statuses on every save (fixes remaining Issue #145):
	// Ensures phase status is always consistent even when architect calls save_plan directly.
	for (const phase of validated.phases) {
		const tasks = phase.tasks;
		if (tasks.length > 0 && tasks.every((t) => t.status === 'completed')) {
			phase.status = 'complete';
		} else if (tasks.some((t) => t.status === 'in_progress')) {
			phase.status = 'in_progress';
		} else if (tasks.some((t) => t.status === 'blocked')) {
			phase.status = 'blocked';
		} else {
			phase.status = 'pending';
		}
	}

	// LEDGER-FIRST: Append task_updated events before writing projections
	// Load current plan for comparison and ledger initialization
	const currentPlan = await loadPlanJsonOnly(directory);

	// Initialize or re-initialize the ledger as needed.
	// Re-initialization is required when the swarm identity changes (e.g., after session
	// migration), because the existing ledger's events and hashes are keyed to the old
	// plan identity. Continuing to append to a mismatched ledger causes the hash-mismatch
	// guard in loadPlan() to fire and destructively rebuild plan.json from stale state.
	const planId = `${validated.swarm}-${validated.title}`.replace(
		/[^a-zA-Z0-9-_]/g,
		'_',
	);
	// Compute hash of the incoming plan NOW so initLedger records the correct
	// plan_hash_after. initLedger reads from disk otherwise, but plan.json is
	// only written later in this function — so without passing the hash here,
	// the init event would capture the OLD plan's hash.
	const planHashForInit = computePlanHash(validated);
	if (!(await ledgerExists(directory))) {
		await initLedger(directory, planId, planHashForInit);
	} else {
		const existingEvents = await readLedgerEvents(directory);
		if (existingEvents.length > 0 && existingEvents[0].plan_id !== planId) {
			// The ledger was created for a different plan identity.
			// Reinitialize so events and hashes are keyed to the new plan identity.
			//
			// Recovery-safe ordering (Issue 392):
			// 1. Move the old ledger file aside (rename to backup) BEFORE calling initLedger.
			//    This allows the real initLedger to create a fresh ledger (it refuses to run
			//    if the ledger file already exists at the path).
			// 2. Attempt initLedger — if it fails with "already initialized" (concurrent),
			//    discard the backup since the new ledger is already in place.
			// 3. If it fails with any OTHER error, restore the original ledger from backup.
			// 4. Only archive the backup AFTER initLedger succeeds.
			const swarmDir = path.resolve(directory, '.swarm');
			const oldLedgerPath = path.join(swarmDir, 'plan-ledger.jsonl');
			const oldLedgerBackupPath = path.join(
				swarmDir,
				`plan-ledger.backup-${Date.now()}-${Math.floor(Math.random() * 1e9)}.jsonl`,
			);
			let backupExists = false;

			// Move the old ledger file aside BEFORE initLedger runs.
			// This ensures initLedger sees no existing ledger and can create a fresh one.
			if (existsSync(oldLedgerPath)) {
				try {
					renameSync(oldLedgerPath, oldLedgerBackupPath);
					backupExists = true;
				} catch (renameErr) {
					// Cross-platform rename failure (e.g., file locked on Windows).
					// If we can't move the file aside, we cannot safely reinitialize,
					// and continuing would append mixed-identity events into the mismatched ledger.
					throw new Error(
						`[savePlan] Cannot reinitialize ledger: could not move old ledger aside (rename failed: ${renameErr instanceof Error ? renameErr.message : String(renameErr)}). The existing ledger has plan_id="${existingEvents[0].plan_id}" which does not match the current plan="${planId}". To proceed, close any programs that may have the ledger file open, or run /swarm reset-session to clear the ledger.`,
					);
				}
			}

			let initSucceeded = false;

			if (backupExists) {
				try {
					await initLedger(directory, planId, planHashForInit);
					initSucceeded = true;
				} catch (initErr) {
					// Another concurrent savePlan already initialized the new ledger — that is fine.
					// Any OTHER error: restore the original ledger and do NOT archive.
					// Use String() to handle non-Error throws (strings, objects with no .message).
					const errorMessage = String(initErr);
					if (errorMessage.includes('already initialized')) {
						// Concurrent initialization — new ledger is already in place.
						// Discard the backup since we don't need it (new ledger is already there).
						try {
							if (existsSync(oldLedgerBackupPath))
								unlinkSync(oldLedgerBackupPath);
						} catch {
							/* best effort */
						}
					} else {
						// Unexpected error — restore the original ledger so workspace stays usable
						if (existsSync(oldLedgerBackupPath)) {
							try {
								renameSync(oldLedgerBackupPath, oldLedgerPath);
							} catch {
								// Restore failed — try copy as fallback
								copyFileSync(oldLedgerBackupPath, oldLedgerPath);
								try {
									unlinkSync(oldLedgerBackupPath);
								} catch {
									/* best effort */
								}
							}
						}
						throw initErr;
					}
				}
			}

			// Archive the backup only after initLedger succeeded.
			if (initSucceeded && backupExists) {
				const archivePath = path.join(
					swarmDir,
					`plan-ledger.archived-${Date.now()}-${Math.floor(Math.random() * 1e9)}.jsonl`,
				);
				try {
					renameSync(oldLedgerBackupPath, archivePath);
					warn(
						`[savePlan] Ledger identity mismatch (was "${existingEvents[0].plan_id}", now "${planId}") — archived old ledger to ${archivePath} and reinitializing.`,
					);
				} catch (renameErr) {
					// Cross-platform rename failure (e.g., file locked on Windows).
					// The new ledger is already initialized and usable — warn but don't throw.
					warn(
						`[savePlan] Could not archive old ledger (rename failed: ${renameErr instanceof Error ? renameErr.message : String(renameErr)}). Old ledger may still exist at ${oldLedgerBackupPath}.`,
					);
					// Clean up backup since archive failed
					try {
						if (existsSync(oldLedgerBackupPath))
							unlinkSync(oldLedgerBackupPath);
					} catch {
						/* best effort */
					}
				}
			} else if (!initSucceeded && backupExists) {
				// init didn't succeed and we have a backup — clean it up
				// (error case already handled above: restored or discarded)
				try {
					if (existsSync(oldLedgerBackupPath)) unlinkSync(oldLedgerBackupPath);
				} catch {
					/* best effort */
				}
			}
		}
	}

	// Get current plan hash for optimistic concurrency
	const currentHash = computeCurrentPlanHash(directory);

	// Compute post-mutation hash from the fully-mutated validated plan
	// This must happen BEFORE ledger events are appended so each event
	// receives the correct planHashAfter (the hash after all mutations)
	const hashAfter = computePlanHash(validated);

	// Compute task changes by comparing old vs new plan
	if (currentPlan) {
		const oldTaskMap = new Map<string, { phase: number; status: TaskStatus }>();
		for (const phase of currentPlan.phases) {
			for (const task of phase.tasks) {
				oldTaskMap.set(task.id, { phase: task.phase, status: task.status });
			}
		}

		// Find tasks that changed status
		try {
			for (const phase of validated.phases) {
				for (const task of phase.tasks) {
					const oldTask = oldTaskMap.get(task.id);
					if (oldTask && oldTask.status !== task.status) {
						// Task status changed - append ledger event
						const eventInput: LedgerEventInput = {
							plan_id: `${validated.swarm}-${validated.title}`.replace(
								/[^a-zA-Z0-9-_]/g,
								'_',
							),
							event_type: 'task_status_changed',
							task_id: task.id,
							phase_id: phase.id,
							from_status: oldTask.status,
							to_status: task.status,
							source: 'savePlan',
						};
						await appendLedgerEvent(directory, eventInput, {
							expectedHash: currentHash,
							planHashAfter: hashAfter,
						});
					}
				}
			}
		} catch (error) {
			if (error instanceof LedgerStaleWriterError) {
				throw new Error(
					`Concurrent plan modification detected: ${error.message}. Please retry the operation.`,
				);
			}
			throw error;
		}
	}

	// After the ledger event loop, check if we should take a snapshot
	const SNAPSHOT_INTERVAL = 50;
	const latestSeq = await getLatestLedgerSeq(directory);
	if (latestSeq > 0 && latestSeq % SNAPSHOT_INTERVAL === 0) {
		await takeSnapshotEvent(directory, validated, {
			planHashAfter: hashAfter,
		}).catch(() => {});
	}

	const swarmDir = path.resolve(directory, '.swarm');
	const planPath = path.join(swarmDir, 'plan.json');
	const tempPath = path.join(
		swarmDir,
		`plan.json.tmp.${Date.now()}.${Math.floor(Math.random() * 1e9)}`,
	);

	// Write to temp and atomically rename
	try {
		await Bun.write(tempPath, JSON.stringify(validated, null, 2));
		renameSync(tempPath, planPath);
	} finally {
		try {
			unlinkSync(tempPath);
		} catch {
			/* already renamed or never created */
		}
	}

	// Derive and write markdown atomically (with content hash for sync detection)
	const contentHash = computePlanContentHash(validated);
	const markdown = derivePlanMarkdown(validated);
	const markdownWithHash = `<!-- PLAN_HASH: ${contentHash} -->\n${markdown}`;
	const mdPath = path.join(swarmDir, 'plan.md');
	const mdTempPath = path.join(
		swarmDir,
		`plan.md.tmp.${Date.now()}.${Math.floor(Math.random() * 1e9)}`,
	);
	try {
		await Bun.write(mdTempPath, markdownWithHash);
		renameSync(mdTempPath, mdPath);
	} finally {
		try {
			unlinkSync(mdTempPath);
		} catch {
			/* already renamed or never created */
		}
	}

	// Advisory: write marker file for plan-manager write detection
	try {
		const markerPath = path.join(swarmDir, '.plan-write-marker');
		const tasksCount = validated.phases.reduce(
			(sum, phase) => sum + phase.tasks.length,
			0,
		);
		const marker = JSON.stringify({
			source: 'plan_manager',
			timestamp: new Date().toISOString(),
			phases_count: validated.phases.length,
			tasks_count: tasksCount,
		});
		await Bun.write(markerPath, marker);
	} catch {
		/* Advisory only - marker write failure does not affect plan save */
	}
}

/**
 * Rebuild plan from ledger events.
 * Replays the ledger to reconstruct plan state, then writes the result.
 * Uses direct atomic writes to avoid circular ledger append (savePlan appends ledger events).
 *
 * @param directory - The working directory
 * @returns Reconstructed Plan from ledger, or null if ledger is empty/missing
 */
export async function rebuildPlan(
	directory: string,
	plan?: Plan,
): Promise<Plan | null> {
	const targetPlan = plan ?? (await replayFromLedger(directory));
	if (!targetPlan) return null;

	// Write directly without going through savePlan (avoid circular ledger append)
	const swarmDir = path.join(directory, '.swarm');
	const planPath = path.join(swarmDir, 'plan.json');
	const mdPath = path.join(swarmDir, 'plan.md');

	// Atomic write for plan.json
	const tempPlanPath = path.join(swarmDir, `plan.json.rebuild.${Date.now()}`);
	await Bun.write(tempPlanPath, JSON.stringify(targetPlan, null, 2));
	renameSync(tempPlanPath, planPath);

	// Also regenerate plan.md with content hash (matches the format written by savePlan/
	// regeneratePlanMarkdown so that isPlanMdInSync() can detect the hash and avoid
	// unnecessary re-generation on the next loadPlan() call).
	const contentHash = computePlanContentHash(targetPlan);
	const markdown = derivePlanMarkdown(targetPlan);
	const markdownWithHash = `<!-- PLAN_HASH: ${contentHash} -->\n${markdown}`;
	const tempMdPath = path.join(swarmDir, `plan.md.rebuild.${Date.now()}`);
	await Bun.write(tempMdPath, markdownWithHash);
	renameSync(tempMdPath, mdPath);

	// Update write-marker so PlanSyncWorker's checkForUnauthorizedWrite() does not
	// emit spurious warnings after a ledger-triggered rebuild.
	try {
		const markerPath = path.join(swarmDir, '.plan-write-marker');
		const tasksCount = targetPlan.phases.reduce(
			(sum, phase) => sum + phase.tasks.length,
			0,
		);
		const marker = JSON.stringify({
			source: 'plan_manager',
			timestamp: new Date().toISOString(),
			phases_count: targetPlan.phases.length,
			tasks_count: tasksCount,
		});
		await Bun.write(markerPath, marker);
	} catch {
		/* Advisory only */
	}

	return targetPlan;
}

/**
 * Load plan → find task by ID → update status → save → return updated plan.
 * Throw if plan not found or task not found.
 *
 * Uses loadPlan() (not loadPlanJsonOnly) so that legitimate same-identity ledger
 * drift is detected and healed before the status update is applied. Without this,
 * a stale plan.json would silently overwrite ledger-ahead task state with only the
 * one targeted status change applied on top.
 *
 * The migration guard in loadPlan() (plan_id identity check) prevents destructive
 * revert after a swarm rename — so this is safe even in post-migration scenarios.
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

	const derivePhaseStatusFromTasks = (tasks: Task[]): Phase['status'] => {
		if (
			tasks.length > 0 &&
			tasks.every((task) => task.status === 'completed')
		) {
			return 'complete';
		}

		if (tasks.some((task) => task.status === 'in_progress')) {
			return 'in_progress';
		}

		if (tasks.some((task) => task.status === 'blocked')) {
			return 'blocked';
		}

		return 'pending';
	};

	const updatedPhases: Phase[] = plan.phases.map((phase) => {
		const updatedTasks: Task[] = phase.tasks.map((task) => {
			if (task.id === taskId) {
				taskFound = true;
				return { ...task, status };
			}
			return task;
		});
		return {
			...phase,
			status: derivePhaseStatusFromTasks(updatedTasks),
			tasks: updatedTasks,
		};
	});

	if (!taskFound) {
		throw new Error(`Task not found: ${taskId}`);
	}

	const updatedPlan: Plan = { ...plan, phases: updatedPhases };
	await savePlan(directory, updatedPlan, { preserveCompletedStatuses: true });
	return updatedPlan;
}

/**
 * Generate deterministic markdown view from plan object.
 * Ensures stable ordering: phases by ID (ascending), tasks by ID (natural numeric).
 */
export function derivePlanMarkdown(plan: Plan): string {
	const statusMap: Record<string, string> = {
		pending: 'PENDING',
		in_progress: 'IN PROGRESS',
		complete: 'COMPLETE',
		blocked: 'BLOCKED',
	};

	const now = new Date().toISOString();
	const currentPhase = plan.current_phase ?? 1;
	const phaseStatus =
		statusMap[plan.phases[currentPhase - 1]?.status] || 'PENDING';

	let markdown = `# ${plan.title}\nSwarm: ${plan.swarm}\nPhase: ${currentPhase} [${phaseStatus}] | Updated: ${now}\n`;

	// Sort phases deterministically by ID (ascending)
	const sortedPhases = [...plan.phases].sort((a, b) => a.id - b.id);

	for (const phase of sortedPhases) {
		const phaseStatusText = statusMap[phase.status] || 'PENDING';
		markdown += `\n## Phase ${phase.id}: ${phase.name} [${phaseStatusText}]\n`;

		// Sort tasks deterministically by ID (natural numeric, e.g., "1.1", "1.2", "1.10")
		const sortedTasks = [...phase.tasks].sort((a, b) =>
			compareTaskIds(a.id, b.id),
		);

		// Find the first in_progress task in the current phase to mark as CURRENT
		let currentTaskMarked = false;

		for (const task of sortedTasks) {
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

			// Add dependencies if present (sorted for determinism)
			if (task.depends.length > 0) {
				const sortedDepends = [...task.depends].sort();
				suffix += ` (depends: ${sortedDepends.join(', ')})`;
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

		// Parse phase headers: ## Phase N: Name [STATUS] or ### Phase N [STATUS]
		const phaseMatch = trimmed.match(
			/^#{2,3}\s*Phase\s+(\d+)(?::\s*([^[]+))?\s*(?:\[([^\]]+)\])?/i,
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

		// Fallback: Parse numbered list tasks (1. Description [SIZE])
		const numberedTaskMatch = trimmed.match(
			/^(\d+)\.\s+(.+?)(?:\s*\[(\w+)\])?$/,
		);
		if (numberedTaskMatch && currentPhase !== null) {
			const taskId = `${currentPhase.id}.${currentPhase.tasks.length + 1}`;
			let description = numberedTaskMatch[2].trim();
			const sizeText = numberedTaskMatch[3]?.toLowerCase() || 'small';

			// Check for dependencies in description: (depends: X.Y, X.Z)
			const dependsMatch = description.match(/\s*\(depends:\s*([^)]+)\)$/i);
			const depends: string[] = [];
			if (dependsMatch) {
				const depsText = dependsMatch[1];
				depends.push(...depsText.split(',').map((d) => d.trim()));
				description = description.substring(0, dependsMatch.index).trim();
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
				status: 'pending',
				size: sizeMap[sizeText] || 'small',
				description,
				depends,
				acceptance: undefined,
				files_touched: [],
				evidence_path: undefined,
				blocked_reason: undefined,
			};

			currentPhase.tasks.push(task);
		}

		// Fallback: Parse checkbox tasks without N.M: prefix
		const noPrefixTaskMatch = trimmed.match(
			/^-\s*\[([^\]]+)\]\s+(?!\d+\.\d+:)(.+?)(?:\s*\[(\w+)\])?(?:\s*-\s*(.+))?$/i,
		);
		if (noPrefixTaskMatch && currentPhase !== null) {
			const checkbox = noPrefixTaskMatch[1].toLowerCase();
			const taskId = `${currentPhase.id}.${currentPhase.tasks.length + 1}`;
			let description = noPrefixTaskMatch[2].trim();
			const sizeText = noPrefixTaskMatch[3]?.toLowerCase() || 'small';
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
				const blockedReasonMatch = noPrefixTaskMatch[4];
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
		console.warn(
			`migrateLegacyPlan: 0 phases parsed from ${lines.length} lines. First 3 lines: ${lines.slice(0, 3).join(' | ')}`,
		);
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
