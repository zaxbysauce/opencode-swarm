/** Knowledge query tool for architect-level access to swarm and hive knowledge.
 * Provides filtered, formatted text output for knowledge retrieval.
 */

import { existsSync } from 'node:fs';

// Note: imports from hooks/knowledge-store.js and hooks/knowledge-types.js
// are kept as-is - they will be moved to core in step 1.5

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_LIMIT = 10;
const MAX_LESSON_LENGTH = 200; // Truncate lesson if longer than this

// Valid categories for filtering
const VALID_CATEGORIES = [
	'process',
	'architecture',
	'tooling',
	'security',
	'testing',
	'debugging',
	'performance',
	'integration',
	'other',
] as const;

// Valid statuses for filtering
const VALID_STATUSES = ['candidate', 'established', 'promoted'] as const;

// Valid tiers for filtering
const VALID_TIERS = ['swarm', 'hive', 'all'] as const;

// ============================================================================
// Types
// ============================================================================

type TierInput = (typeof VALID_TIERS)[number];
type StatusInput = (typeof VALID_STATUSES)[number];
type KnowledgeCategory = (typeof VALID_CATEGORIES)[number];

// ============================================================================
// Validation Functions
// ============================================================================

export function validateTierInput(tier: unknown): TierInput | null {
	if (typeof tier !== 'string') return null;
	const normalized = tier.toLowerCase().trim();
	if (VALID_TIERS.includes(normalized as TierInput)) {
		return normalized as TierInput;
	}
	return null;
}

export function validateStatusInput(status: unknown): StatusInput | null {
	if (typeof status !== 'string') return null;
	const normalized = status.toLowerCase().trim();
	if (VALID_STATUSES.includes(normalized as StatusInput)) {
		return normalized as StatusInput;
	}
	return null;
}

export function validateCategoryInput(
	category: unknown,
): KnowledgeCategory | null {
	if (typeof category !== 'string') return null;
	const normalized = category.toLowerCase().trim();
	if (VALID_CATEGORIES.includes(normalized as KnowledgeCategory)) {
		return normalized as KnowledgeCategory;
	}
	return null;
}

export function validateMinScore(score: unknown): number | null {
	if (typeof score === 'number' && !Number.isNaN(score)) {
		return Math.max(0, Math.min(1, score));
	}
	if (typeof score === 'string') {
		const parsed = Number.parseFloat(score);
		if (!Number.isNaN(parsed)) {
			return Math.max(0, Math.min(1, parsed));
		}
	}
	return null;
}

export function validateLimit(limit: unknown): number {
	if (typeof limit === 'number' && !Number.isNaN(limit) && limit > 0) {
		return Math.min(limit, 100); // Cap at 100
	}
	if (typeof limit === 'string') {
		const parsed = Number.parseInt(limit, 10);
		if (!Number.isNaN(parsed) && parsed > 0) {
			return Math.min(parsed, 100);
		}
	}
	return DEFAULT_LIMIT;
}

// ============================================================================
// Filtering Functions
// ============================================================================

interface FilterOptions {
	status?: StatusInput;
	category?: KnowledgeCategory;
	minScore?: number;
}

interface SwarmKnowledgeEntry {
	id: string;
	tier: string;
	lesson: string;
	category: string;
	status: string;
	confidence: number;
	confirmed_by: string[];
	project_name: string;
}

interface HiveKnowledgeEntry {
	id: string;
	tier: string;
	lesson: string;
	category: string;
	status: string;
	confidence: number;
	encounter_score: number;
	source_project: string;
	confirmed_by: string[];
}

export function filterSwarmEntries(
	entries: SwarmKnowledgeEntry[],
	filters: FilterOptions,
): SwarmKnowledgeEntry[] {
	return entries.filter((entry) => {
		if (filters.status && entry.status !== filters.status) {
			return false;
		}
		if (filters.category && entry.category !== filters.category) {
			return false;
		}
		if (filters.minScore !== undefined && entry.confidence < filters.minScore) {
			return false;
		}
		return true;
	});
}

export function filterHiveEntries(
	entries: HiveKnowledgeEntry[],
	filters: FilterOptions,
): HiveKnowledgeEntry[] {
	return entries.filter((entry) => {
		if (filters.status && entry.status !== filters.status) {
			return false;
		}
		if (filters.category && entry.category !== filters.category) {
			return false;
		}
		if (filters.minScore !== undefined && entry.confidence < filters.minScore) {
			return false;
		}
		return true;
	});
}

// ============================================================================
// Formatting Functions
// ============================================================================

function truncateLesson(lesson: string, maxLength: number): string {
	if (lesson.length <= maxLength) {
		return lesson;
	}
	return `${lesson.slice(0, maxLength - 3)}...`;
}

export function formatSwarmEntry(entry: SwarmKnowledgeEntry): string {
	const lines: string[] = [];
	lines.push(`[${entry.tier.toUpperCase()}] ${entry.id}`);
	lines.push(`  Lesson: ${truncateLesson(entry.lesson, MAX_LESSON_LENGTH)}`);
	lines.push(`  Category: ${entry.category}`);
	lines.push(`  Status: ${entry.status}`);
	lines.push(`  Confidence: ${entry.confidence.toFixed(2)}`);
	lines.push(`  Confirmed by: ${entry.confirmed_by.length} phase(s)`);
	lines.push(`  Project: ${entry.project_name}`);
	return lines.join('\n');
}

export function formatHiveEntry(entry: HiveKnowledgeEntry): string {
	const lines: string[] = [];
	lines.push(`[${entry.tier.toUpperCase()}] ${entry.id}`);
	lines.push(`  Lesson: ${truncateLesson(entry.lesson, MAX_LESSON_LENGTH)}`);
	lines.push(`  Category: ${entry.category}`);
	lines.push(`  Status: ${entry.status}`);
	lines.push(`  Confidence: ${entry.confidence.toFixed(2)}`);
	lines.push(`  Encounter Score: ${entry.encounter_score.toFixed(2)}`);
	lines.push(`  Source Project: ${entry.source_project}`);
	lines.push(`  Confirmed by: ${entry.confirmed_by.length} project(s)`);
	return lines.join('\n');
}

// Note: The actual readKnowledge, resolveHiveKnowledgePath, resolveSwarmKnowledgePath
// functions are imported from hooks/knowledge-store.js in the original file.
// They will be available after step 1.5 moves them to core.
