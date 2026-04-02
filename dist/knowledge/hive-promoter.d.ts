/**
 * Hive promotion logic for manually promoting lessons to the hive knowledge store.
 */
export interface LessonValidationResult {
    valid: boolean;
    reason?: string;
}
/**
 * Validate a lesson text for dangerous content or raw shell commands.
 */
export declare function validateLesson(text: string): LessonValidationResult;
/**
 * Return the platform-appropriate path to the hive knowledge file.
 */
export declare function getHiveFilePath(): string;
/**
 * Promote a lesson text directly to the hive knowledge store.
 */
export declare function promoteToHive(_directory: string, lesson: string, category?: string): Promise<string>;
/**
 * Promote an existing lesson from .swarm/knowledge.jsonl to the hive by ID.
 */
export declare function promoteFromSwarm(directory: string, lessonId: string): Promise<string>;
