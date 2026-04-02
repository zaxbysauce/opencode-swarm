/**
 * Handles the /swarm promote command.
 * Manually promotes lessons to hive knowledge.
 *
 * Usage:
 * - /swarm promote "<lesson text>" — Promote direct text
 * - /swarm promote --category <category> "<lesson text>" — Promote with category
 * - /swarm promote --from-swarm <lesson-id> — Promote from existing swarm lesson
 */

import {
	promoteFromSwarm,
	promoteToHive,
	validateLesson,
} from '../knowledge/hive-promoter';

export async function handlePromoteCommand(
	directory: string,
	args: string[],
): Promise<string> {
	// Parse arguments
	let category: string | undefined;
	let lessonId: string | undefined;
	let lessonText: string | undefined;

	// Simple argument parsing
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (arg === '--category' && i + 1 < args.length) {
			category = args[i + 1];
			i++; // Skip next arg
		} else if (arg === '--from-swarm' && i + 1 < args.length) {
			lessonId = args[i + 1];
			i++; // Skip next arg
		} else if (!arg.startsWith('--')) {
			// Treat as lesson text (take the rest of the args as text)
			lessonText = args.slice(i).join(' ');
			break;
		}
	}

	// Validate input - check for empty lesson text or lesson ID
	if (!lessonText && !lessonId) {
		return `Usage: /swarm promote "<lesson text>" or /swarm promote --from-swarm <id>`;
	}

	// Validate lesson text before any promotion
	if (lessonText) {
		const validation = validateLesson(lessonText);
		if (!validation.valid) {
			return `Lesson rejected by validator: ${validation.reason}`;
		}
	}

	// Handle --from-swarm case
	if (lessonId) {
		try {
			return await promoteFromSwarm(directory, lessonId);
		} catch (error) {
			if (error instanceof Error) {
				return error.message;
			}
			return `Failed to promote lesson: ${error instanceof Error ? error.message : String(error)}`;
		}
	}

	// Handle direct text promotion
	try {
		return await promoteToHive(directory, lessonText!, category);
	} catch (error) {
		if (error instanceof Error) {
			return error.message;
		}
		return `Failed to promote lesson: ${error instanceof Error ? error.message : String(error)}`;
	}
}
