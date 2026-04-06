/**
 * Handles the /swarm promote command.
 * Manually promotes lessons to hive knowledge.
 *
 * Usage:
 * - /swarm promote "<lesson text>" — Promote direct text
 * - /swarm promote --category <category> "<lesson text>" — Promote with category
 * - /swarm promote --from-swarm <lesson-id> — Promote from existing swarm lesson
 */
export declare function handlePromoteCommand(directory: string, args: string[]): Promise<string>;
