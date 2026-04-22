/**
 * Course Correction Module
 * Generates structured guidance messages from pattern detection results
 */
import type { CourseCorrection, PatternMatch, TrajectoryEntry } from './types';
/**
 * Generates a structured CourseCorrection guidance message from a PatternMatch and trajectory context
 *
 * @param match - The pattern match result from pattern detection
 * @param trajectory - The trajectory entries providing context for the correction
 * @returns A structured CourseCorrection object with alert, category, guidance, action, pattern, and stepRange
 */
export declare function generateCourseCorrection(match: PatternMatch, trajectory: TrajectoryEntry[]): CourseCorrection;
/**
 * Formats a CourseCorrection for injection into agent messages
 *
 * @param correction - The course correction to format
 * @returns A formatted string suitable for injection into messages
 */
export declare function formatCourseCorrectionForInjection(correction: CourseCorrection): string;
