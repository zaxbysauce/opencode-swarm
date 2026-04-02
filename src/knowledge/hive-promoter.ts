/**
 * Hive promotion logic for manually promoting lessons to the hive knowledge store.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface LessonValidationResult {
	valid: boolean;
	reason?: string;
}

// Patterns that indicate dangerous shell commands; each entry is [regex, human-readable pattern source]
const DANGEROUS_PATTERNS: Array<[RegExp, string]> = [
	[/rm\s+-rf/, 'rm\\s+-rf'],
	[/:\s*!\s*\|/, ':\\s*!\\s*\\|'],
	[/\|\s*sh\b/, '\\|\\s*sh\\b'],
	[/`[^`]*`/, '`[^`]*`'],
	[/\$\(/, '\\$\\('],
	[/;\s*rm\s+\//, ';\\s*rm\\s+\\/'],
	[/>\s*\/dev\//, '>\\s*\\/dev\\/'],
	[/\bmkfs\b/, '\\bmkfs\\b'],
	[/\bdd\s+if=/, '\\bdd\\s+if='],
	[/chmod\s+[0-7]*7[0-7]{2}/, 'chmod\\s+[0-7]*7[0-7]\\{2\\}'],
	[/\bchown\s+-R\b/, '\\bchown\\s+-R\\b'],
	[/(?<!\.)\beval\s*\(/, '(?<!\\.)\\beval\\s*\\('],
	[/(?<!\.)\bexec\s*\(/, '(?<!\\.)\\bexec\\s*\\('],
];

// Shell command words that indicate a raw shell invocation at the start of a lesson
const SHELL_COMMAND_START =
	/^(grep|find|ls|cat|sed|awk|curl|wget|ssh|scp|git|mv|cp|mkdir|touch|echo|printf|python|python3|node|bash|sh|zsh|apt|yum|brew)\s/;

/**
 * Validate a lesson text for dangerous content or raw shell commands.
 */
export function validateLesson(text: string): LessonValidationResult {
	if (!text || !text.trim()) {
		return { valid: false, reason: 'Lesson text cannot be empty' };
	}

	// Check dangerous command/injection patterns
	for (const [pattern, patternSource] of DANGEROUS_PATTERNS) {
		if (pattern.test(text)) {
			return {
				valid: false,
				reason: `Dangerous pattern detected: ${patternSource}`,
			};
		}
	}

	// Reject raw shell command lines (starts with a shell verb and lacks sentence-ending punctuation)
	const trimmed = text.trim();
	if (SHELL_COMMAND_START.test(trimmed)) {
		const lastChar = trimmed[trimmed.length - 1];
		if (!['.', '!', '?', ';'].includes(lastChar)) {
			return {
				valid: false,
				reason: 'Lesson appears to contain raw shell commands',
			};
		}
	}

	return { valid: true };
}

/**
 * Return the platform-appropriate path to the hive knowledge file.
 */
export function getHiveFilePath(): string {
	const platform = process.platform;
	const home = os.homedir();
	let dataDir: string;
	if (platform === 'win32') {
		dataDir = path.join(
			process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'),
			'opencode-swarm',
			'Data',
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

/**
 * Promote a lesson text directly to the hive knowledge store.
 */
export async function promoteToHive(
	_directory: string,
	lesson: string,
	category?: string,
): Promise<string> {
	const trimmed = (lesson ?? '').trim();
	if (!trimmed) {
		throw new Error('Lesson text required');
	}

	const validation = validateLesson(trimmed);
	if (!validation.valid) {
		throw new Error(`Lesson rejected by validator: ${validation.reason}`);
	}

	const hivePath = getHiveFilePath();
	const hiveDir = path.dirname(hivePath);
	if (!fs.existsSync(hiveDir)) {
		fs.mkdirSync(hiveDir, { recursive: true });
	}

	const now = new Date();
	const entry = {
		id: `hive-manual-${now.getTime()}`,
		lesson: trimmed,
		category: category || 'process',
		scope_tag: 'global',
		confidence: 1.0,
		status: 'promoted',
		promotion_source: 'manual',
		promotedAt: now.toISOString(),
		retrievalOutcomes: { applied: 0, succeededAfter: 0, failedAfter: 0 },
	};

	fs.appendFileSync(hivePath, `${JSON.stringify(entry)}\n`, 'utf-8');

	const preview = `${trimmed.slice(0, 50)}${trimmed.length > 50 ? '...' : ''}`;
	return `Promoted to hive: "${preview}" (confidence: 1.0, source: manual)`;
}

/**
 * Promote an existing lesson from .swarm/knowledge.jsonl to the hive by ID.
 */
export async function promoteFromSwarm(
	directory: string,
	lessonId: string,
): Promise<string> {
	const knowledgePath = path.join(directory, '.swarm', 'knowledge.jsonl');

	const entries: Array<Record<string, unknown>> = [];
	if (fs.existsSync(knowledgePath)) {
		const content = fs.readFileSync(knowledgePath, 'utf-8');
		for (const line of content.split('\n')) {
			const t = line.trim();
			if (!t) continue;
			try {
				entries.push(JSON.parse(t) as Record<string, unknown>);
			} catch {
				// skip malformed lines
			}
		}
	}

	const swarmEntry = entries.find((e) => e.id === lessonId);
	if (!swarmEntry) {
		throw new Error(`Lesson ${lessonId} not found in .swarm/knowledge.jsonl`);
	}

	const lessonText =
		typeof swarmEntry.lesson === 'string' ? swarmEntry.lesson.trim() : '';
	if (!lessonText) {
		throw new Error('Lesson text required');
	}

	const validation = validateLesson(lessonText);
	if (!validation.valid) {
		throw new Error(`Lesson rejected by validator: ${validation.reason}`);
	}

	const hivePath = getHiveFilePath();
	const hiveDir = path.dirname(hivePath);
	if (!fs.existsSync(hiveDir)) {
		fs.mkdirSync(hiveDir, { recursive: true });
	}

	const now = new Date();
	const hiveEntry = {
		id: `hive-manual-${now.getTime()}`,
		lesson: lessonText,
		category:
			typeof swarmEntry.category === 'string' ? swarmEntry.category : 'process',
		scope_tag:
			typeof swarmEntry.scope === 'string' ? swarmEntry.scope : 'global',
		confidence: 1.0,
		status: 'promoted',
		promotion_source: 'manual',
		promotedAt: now.toISOString(),
		retrievalOutcomes: { applied: 0, succeededAfter: 0, failedAfter: 0 },
	};

	fs.appendFileSync(hivePath, `${JSON.stringify(hiveEntry)}\n`, 'utf-8');

	const preview = `${lessonText.slice(0, 50)}${lessonText.length > 50 ? '...' : ''}`;
	return `Promoted to hive: "${preview}" (confidence: 1.0, source: manual)`;
}
