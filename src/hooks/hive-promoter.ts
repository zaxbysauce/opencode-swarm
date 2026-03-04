/** Hive promoter hook for opencode-swarm v6.17 two-tier knowledge system. */

import {
	appendKnowledge,
	findNearDuplicate,
	readKnowledge,
	resolveHiveKnowledgePath,
	resolveHiveRejectedPath,
	resolveSwarmKnowledgePath,
	rewriteKnowledge,
} from './knowledge-store.js';
import type {
	HiveKnowledgeEntry,
	KnowledgeCategory,
	KnowledgeConfig,
	ProjectConfirmationRecord,
	RejectedLesson,
	SwarmKnowledgeEntry,
} from './knowledge-types.js';
import { validateLesson } from './knowledge-validator.js';
import { safeHook } from './utils.js';

/**
 * Check if a swarm entry already exists in the hive (near-duplicate).
 * Uses findNearDuplicate with the configured threshold.
 */
function isAlreadyInHive(
	entry: SwarmKnowledgeEntry,
	hiveEntries: HiveKnowledgeEntry[],
	threshold: number,
): boolean {
	return findNearDuplicate(entry.lesson, hiveEntries, threshold) !== undefined;
}

/**
 * Count distinct phase numbers in a swarm entry's confirmed_by array.
 */
function countDistinctPhases(
	confirmedBy: SwarmKnowledgeEntry['confirmed_by'],
): number {
	const phaseNumbers = new Set<number>();
	for (const record of confirmedBy) {
		phaseNumbers.add(record.phase_number);
	}
	return phaseNumbers.size;
}

/**
 * Count distinct project names in a hive entry's confirmed_by array.
 */
function countDistinctProjects(
	confirmedBy: ProjectConfirmationRecord[],
): number {
	const projectNames = new Set<string>();
	for (const record of confirmedBy) {
		projectNames.add(record.project_name);
	}
	return projectNames.size;
}

/**
 * Check if a project confirmation already exists in the hive entry's confirmed_by.
 */
function hasProjectConfirmation(
	hiveEntry: HiveKnowledgeEntry,
	projectName: string,
): boolean {
	return hiveEntry.confirmed_by.some(
		(record) => record.project_name === projectName,
	);
}

/**
 * Get the age of an entry in milliseconds.
 */
function getEntryAgeMs(createdAt: string): number {
	const createdTime = new Date(createdAt).getTime();
	if (Number.isNaN(createdTime)) return 0;
	return Date.now() - createdTime;
}

/**
 * Main promotion logic: checks swarm entries and promotes eligible ones to hive.
 * Also updates existing hive entries with new project confirmations.
 *
 * @note The 'hive-fast-track' tag is treated as privileged — it bypasses the
 *   3-phase confirmation requirement. It should only be set by authorized tooling
 *   (inferTags() never produces it automatically).
 */
export async function checkHivePromotions(
	swarmEntries: SwarmKnowledgeEntry[],
	config: KnowledgeConfig,
): Promise<void> {
	// Route 1: Early exit if hive is disabled
	if (config.hive_enabled === false) {
		return;
	}

	// Read existing hive entries
	const hiveEntries = await readKnowledge<HiveKnowledgeEntry>(
		resolveHiveKnowledgePath(),
	);

	// NOTE: New hive entries are appended immediately (no lock); existing-entry updates
	// use rewriteKnowledge (with lock). This mixed pattern is safe under single-writer
	// assumptions (hooks are fire-and-forget, safeHook prevents concurrent calls).

	// Process each swarm entry for promotion
	for (const swarmEntry of swarmEntries) {
		// Check if already in hive (skip near-duplicates)
		if (isAlreadyInHive(swarmEntry, hiveEntries, config.dedup_threshold)) {
			continue;
		}

		// Determine promotion eligibility via three routes
		let shouldPromote = false;

		// Route 1: hive_eligible flag + 3+ distinct phases
		if (
			swarmEntry.hive_eligible === true &&
			countDistinctPhases(swarmEntry.confirmed_by) >= 3
		) {
			shouldPromote = true;
		}

		// Route 2: fast-track tag bypasses count requirement
		if (swarmEntry.tags.includes('hive-fast-track')) {
			shouldPromote = true;
		}

		// Route 3: age-based promotion
		const ageMs = getEntryAgeMs(swarmEntry.created_at);
		const ageThresholdMs = config.auto_promote_days * 86400000; // days to ms
		if (ageMs >= ageThresholdMs) {
			shouldPromote = true;
		}

		if (!shouldPromote) {
			continue;
		}

		// Re-validate before promotion
		const validationResult = validateLesson(
			swarmEntry.lesson,
			hiveEntries.map((e) => e.lesson),
			{
				category: swarmEntry.category,
				scope: swarmEntry.scope,
				confidence: swarmEntry.confidence,
			},
		);

		// If validation fails with error severity, reject to hive-rejected
		if (validationResult.severity === 'error') {
			const rejectedLesson: RejectedLesson = {
				id: crypto.randomUUID(),
				lesson: swarmEntry.lesson,
				rejection_reason:
					validationResult.reason || 'validation failed for hive promotion',
				rejected_at: new Date().toISOString(),
				rejection_layer: validationResult.layer || 2,
			};

			// Append to hive rejected lessons using correct path
			const hiveRejectedPath = resolveHiveRejectedPath();
			await appendKnowledge(hiveRejectedPath, rejectedLesson);

			continue;
		}

		// Build new hive entry
		const newHiveEntry: HiveKnowledgeEntry = {
			id: crypto.randomUUID(),
			tier: 'hive',
			lesson: swarmEntry.lesson,
			category: swarmEntry.category,
			tags: swarmEntry.tags,
			scope: swarmEntry.scope,
			confidence: 0.5, // starts at 0.5 in hive
			status: 'candidate', // ALWAYS candidate on entry
			confirmed_by: [], // empty — no project confirmations yet
			retrieval_outcomes: {
				applied_count: 0,
				succeeded_after_count: 0,
				failed_after_count: 0,
			},
			schema_version: config.schema_version,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			source_project: swarmEntry.project_name,
		};

		// Append to hive
		await appendKnowledge(resolveHiveKnowledgePath(), newHiveEntry);

		// Add the new entry to local array for subsequent processing
		hiveEntries.push(newHiveEntry);
	}

	// After promotions, update hive entry confirmations for near-duplicates
	// from different projects
	let hiveModified = false;

	for (const hiveEntry of hiveEntries) {
		// Find near-duplicate swarm entries from different projects
		const nearDuplicate = findNearDuplicate(
			hiveEntry.lesson,
			swarmEntries,
			config.dedup_threshold,
		);

		if (!nearDuplicate) {
			continue;
		}

		// Skip if same project
		if (nearDuplicate.project_name === hiveEntry.source_project) {
			continue;
		}

		// Skip if already confirmed by this project
		if (hasProjectConfirmation(hiveEntry, nearDuplicate.project_name)) {
			continue;
		}

		// Add project confirmation
		const newConfirmation: ProjectConfirmationRecord = {
			project_name: nearDuplicate.project_name,
			confirmed_at: new Date().toISOString(),
		};

		hiveEntry.confirmed_by.push(newConfirmation);
		hiveEntry.updated_at = new Date().toISOString();

		// Advance status from candidate to established if 3+ distinct projects
		if (
			hiveEntry.status === 'candidate' &&
			countDistinctProjects(hiveEntry.confirmed_by) >= 3
		) {
			hiveEntry.status = 'established';
		}

		hiveModified = true;
	}

	// Rewrite hive file if any entries were modified
	if (hiveModified) {
		await rewriteKnowledge(resolveHiveKnowledgePath(), hiveEntries);
	}
}

/**
 * Create a hook that promotes swarm entries to the hive.
 * The hook fires unconditionally - the caller decides when to invoke it.
 */
export function createHivePromoterHook(
	directory: string,
	config: KnowledgeConfig,
): (input: unknown, output: unknown) => Promise<void> {
	const hook = async (_input: unknown, _output: unknown): Promise<void> => {
		// Read swarm entries from the project directory
		const swarmEntries = await readKnowledge<SwarmKnowledgeEntry>(
			resolveSwarmKnowledgePath(directory),
		);

		// Run promotion logic
		await checkHivePromotions(swarmEntries, config);
	};

	// Wrap in safeHook for fire-and-forget error suppression
	return safeHook(hook);
}

/**
 * Promote a lesson directly to the hive (manual promotion).
 * @param directory - Project directory
 * @param lesson - The lesson text to promote
 * @param category - Optional category (defaults to 'process')
 * @returns Confirmation message
 */
export async function promoteToHive(
	directory: string,
	lesson: string,
	category?: string,
): Promise<string> {
	const trimmedLesson = lesson.trim();

	// Read existing hive entries for deduplication
	const hiveEntries = await readKnowledge<HiveKnowledgeEntry>(
		resolveHiveKnowledgePath(),
	);

	// Validate before writing
	const validationResult = validateLesson(
		trimmedLesson,
		hiveEntries.map((e) => e.lesson),
		{
			category: (category as KnowledgeCategory) || 'process',
			scope: 'global',
			confidence: 1.0,
		},
	);

	if (validationResult.severity === 'error') {
		throw new Error(`Lesson rejected by validator: ${validationResult.reason}`);
	}

	// Check for near-duplicate
	if (findNearDuplicate(trimmedLesson, hiveEntries, 0.6)) {
		return `Lesson already exists in hive (near-duplicate).`;
	}

	// Build hive entry
	const newHiveEntry: HiveKnowledgeEntry = {
		id: crypto.randomUUID(),
		tier: 'hive',
		lesson: trimmedLesson,
		category: (category as KnowledgeCategory) || 'process',
		tags: [],
		scope: 'global',
		confidence: 1.0,
		status: 'promoted',
		confirmed_by: [],
		retrieval_outcomes: {
			applied_count: 0,
			succeeded_after_count: 0,
			failed_after_count: 0,
		},
		schema_version: 1,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		source_project: directory.split('/').pop() || 'unknown',
	};

	// Append to hive
	await appendKnowledge(resolveHiveKnowledgePath(), newHiveEntry);

	return `Promoted to hive: "${trimmedLesson.slice(0, 50)}${trimmedLesson.length > 50 ? '...' : ''}" (confidence: 1.0, source: manual)`;
}

/**
 * Promote a lesson from swarm knowledge to hive.
 * @param directory - Project directory
 * @param lessonId - The ID of the lesson to promote from swarm
 * @returns Confirmation message
 */
export async function promoteFromSwarm(
	directory: string,
	lessonId: string,
): Promise<string> {
	// Read swarm entries
	const swarmEntries = await readKnowledge<SwarmKnowledgeEntry>(
		resolveSwarmKnowledgePath(directory),
	);

	// Find the lesson
	const swarmEntry = swarmEntries.find((e) => e.id === lessonId);
	if (!swarmEntry) {
		throw new Error(`Lesson ${lessonId} not found in .swarm/knowledge.jsonl`);
	}

	// Read existing hive entries
	const hiveEntries = await readKnowledge<HiveKnowledgeEntry>(
		resolveHiveKnowledgePath(),
	);

	// Validate before writing
	const validationResult = validateLesson(
		swarmEntry.lesson,
		hiveEntries.map((e) => e.lesson),
		{
			category: swarmEntry.category,
			scope: swarmEntry.scope,
			confidence: swarmEntry.confidence,
		},
	);

	if (validationResult.severity === 'error') {
		throw new Error(`Lesson rejected by validator: ${validationResult.reason}`);
	}

	// Check for near-duplicate
	if (findNearDuplicate(swarmEntry.lesson, hiveEntries, 0.6)) {
		return `Lesson already exists in hive (near-duplicate).`;
	}

	// Build hive entry from swarm entry
	const newHiveEntry: HiveKnowledgeEntry = {
		id: crypto.randomUUID(),
		tier: 'hive',
		lesson: swarmEntry.lesson,
		category: swarmEntry.category,
		tags: swarmEntry.tags,
		scope: swarmEntry.scope,
		confidence: 1.0,
		status: 'promoted',
		confirmed_by: [],
		retrieval_outcomes: {
			applied_count: 0,
			succeeded_after_count: 0,
			failed_after_count: 0,
		},
		schema_version: 1,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		source_project: swarmEntry.project_name,
	};

	// Append to hive
	await appendKnowledge(resolveHiveKnowledgePath(), newHiveEntry);

	return `Promoted lesson ${lessonId} from swarm to hive: "${swarmEntry.lesson.slice(0, 50)}${swarmEntry.lesson.length > 50 ? '...' : ''}"`;
}
