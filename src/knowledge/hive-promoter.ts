/**
 * Hive promoter module for opencode-swarm two-tier knowledge system.
 * Provides manual promotion of lessons to global hive knowledge.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { appendFile, readFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

// ============================================================================
// Types
// ============================================================================

export interface ValidationResult {
	valid: boolean;
	reason?: string;
}

export interface HiveEntry {
	id: string;
	lesson: string;
	category: string;
	scope_tag: string;
	confidence: number;
	status: string;
	promotion_source: string;
	promotedAt: string;
	retrievalOutcomes: {
		applied: number;
		succeededAfter: number;
		failedAfter: number;
	};
}

// ============================================================================
// Dangerous pattern detection
// ============================================================================

const DANGEROUS_PATTERNS: Array<[RegExp, string]> = [
	[/rm\s+-rf/, 'rm\\s+-rf'],
	[/:\s*!\s*\|/, ':!|'],
	[/\|\s*sh\b/, '| sh'],
	[/\|\s*bash\b/, '| bash'],
	[/`[^`]*\$[A-Z_]/i, 'command substitution with variable'],
	[/\$\([^)]*\$\([^)]*\)/, 'nested command substitution'],
	[/;\s*rm\s+/, '; rm'],
	[/>\s*\/dev\//, '> /dev/'],
	[/\bmkfs\b/, 'mkfs'],
	[/\bdd\s+if=/, 'dd if='],
	[/\bchmod\s+777\b/, 'chmod 777'],
	[/\bchown\s+-R\b/, 'chown -R'],
	[/\beval\s*\(/, 'eval('],
	[/\bexec\s*\(/, 'exec('],
];

const SHELL_COMMAND_PATTERN = /^(grep|ls|cat|sed|awk|curl|wget|chmod|chown|mkdir|cp|mv|tar|ssh|scp)\s+/;

/**
 * Validate a lesson text for safety and quality.
 * Returns {valid: true} if the lesson is acceptable.
 * Returns {valid: false, reason: ...} if rejected.
 */
export function validateLesson(text: string): ValidationResult {
	// Check for empty or whitespace-only
	if (!text || text.trim().length === 0) {
		return { valid: false, reason: 'Lesson text cannot be empty' };
	}

	const trimmed = text.trim();

	// Check for dangerous patterns
	for (const [pattern, patternName] of DANGEROUS_PATTERNS) {
		if (pattern.test(trimmed)) {
			return {
				valid: false,
				reason: `Dangerous pattern detected: ${patternName}`,
			};
		}
	}

	// Check for raw shell commands (without explanation context)
	// A raw command is one that starts with a shell command with no explanation before it
	if (SHELL_COMMAND_PATTERN.test(trimmed)) {
		return { valid: false, reason: 'Lesson appears to contain raw shell commands' };
	}

	return { valid: true };
}

// ============================================================================
// Hive file path
// ============================================================================

/**
 * Get the platform-specific path to the hive knowledge file.
 */
export function getHiveFilePath(): string {
	const platform = process.platform;
	const home = os.homedir();
	let dataDir: string;

	if (platform === 'win32') {
		dataDir = path.join(
			process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'),
			'opencode-swarm',
		);
	} else if (platform === 'darwin') {
		dataDir = path.join(
			home,
			'Library',
			'Application Support',
			'opencode-swarm',
		);
	} else {
		dataDir = path.join(
			process.env.XDG_DATA_HOME || path.join(home, '.local', 'share'),
			'opencode-swarm',
		);
	}

	return path.join(dataDir, 'hive-knowledge.jsonl');
}

// ============================================================================
// Promotion functions
// ============================================================================

/**
 * Promote a lesson directly to the hive knowledge store.
 * @param directory - Project directory (used for context)
 * @param lesson - The lesson text to promote
 * @param category - Optional category (defaults to 'process')
 * @returns Confirmation message
 * @throws Error if lesson is empty or validation fails
 */
export async function promoteToHive(
	directory: string,
	lesson: string,
	category?: string,
): Promise<string> {
	const trimmedLesson = (lesson || '').trim();

	// Check for empty
	if (!trimmedLesson) {
		throw new Error('Lesson text required');
	}

	// Validate lesson
	const validation = validateLesson(trimmedLesson);
	if (!validation.valid) {
		throw new Error(`Lesson rejected by validator: ${validation.reason}`);
	}

	// Build hive entry
	const now = Date.now();
	const entry: HiveEntry = {
		id: `hive-manual-${now}`,
		lesson: trimmedLesson,
		category: category || 'process',
		scope_tag: 'global',
		confidence: 1.0,
		status: 'promoted',
		promotion_source: 'manual',
		promotedAt: new Date(now).toISOString(),
		retrievalOutcomes: {
			applied: 0,
			succeededAfter: 0,
			failedAfter: 0,
		},
	};

	// Write to hive file
	const hivePath = getHiveFilePath();
	const hiveDir = path.dirname(hivePath);
	if (!existsSync(hiveDir)) {
		mkdirSync(hiveDir, { recursive: true });
	}

	await appendFile(hivePath, `${JSON.stringify(entry)}\n`, 'utf-8');

	return `Promoted to hive: "${trimmedLesson.slice(0, 50)}${trimmedLesson.length > 50 ? '...' : ''}" (confidence: 1.0, source: manual)`;
}

/**
 * Promote a lesson from swarm knowledge to hive.
 * @param directory - Project directory
 * @param lessonId - The ID of the lesson to promote from swarm
 * @returns Confirmation message
 * @throws Error if lesson not found or validation fails
 */
export async function promoteFromSwarm(
	directory: string,
	lessonId: string,
): Promise<string> {
	// Read swarm knowledge file
	const swarmPath = path.join(directory, '.swarm', 'knowledge.jsonl');

	let swarmEntry: Record<string, unknown> | undefined;

	try {
		const content = await readFile(swarmPath, 'utf-8');
		for (const line of content.split('\n')) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			try {
				const parsed = JSON.parse(trimmed) as Record<string, unknown>;
				if (parsed.id === lessonId) {
					swarmEntry = parsed;
					break;
				}
			} catch {
				// Skip malformed lines
			}
		}
	} catch {
		// File doesn't exist or can't be read
	}

	if (!swarmEntry) {
		throw new Error(`Lesson ${lessonId} not found in .swarm/knowledge.jsonl`);
	}

	const lesson = (swarmEntry.lesson as string) || '';
	const category = (swarmEntry.category as string) || 'process';
	const scope = (swarmEntry.scope as string) || 'global';

	// Check for empty lesson
	const trimmedLesson = lesson.trim();
	if (!trimmedLesson) {
		throw new Error('Lesson text required');
	}

	// Validate lesson
	const validation = validateLesson(trimmedLesson);
	if (!validation.valid) {
		throw new Error(`Lesson rejected by validator: ${validation.reason}`);
	}

	// Build hive entry
	const now = Date.now();
	const entry: HiveEntry = {
		id: `hive-manual-${now}`,
		lesson: trimmedLesson,
		category,
		scope_tag: scope,
		confidence: 1.0,
		status: 'promoted',
		promotion_source: 'manual',
		promotedAt: new Date(now).toISOString(),
		retrievalOutcomes: {
			applied: 0,
			succeededAfter: 0,
			failedAfter: 0,
		},
	};

	// Write to hive file
	const hivePath = getHiveFilePath();
	const hiveDir = path.dirname(hivePath);
	if (!existsSync(hiveDir)) {
		mkdirSync(hiveDir, { recursive: true });
	}

	await appendFile(hivePath, `${JSON.stringify(entry)}\n`, 'utf-8');

	return `Promoted to hive: "${trimmedLesson.slice(0, 50)}${trimmedLesson.length > 50 ? '...' : ''}" (confidence: 1.0, source: manual)`;
}
