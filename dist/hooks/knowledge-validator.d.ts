/** Three-layer validation gate for the opencode-swarm v6.17 knowledge system. */
import type { KnowledgeCategory } from './knowledge-types.js';
export interface ValidationResult {
    valid: boolean;
    layer: 1 | 2 | 3 | null;
    reason: string | null;
    severity: 'error' | 'warning' | null;
}
export declare const DANGEROUS_COMMAND_PATTERNS: RegExp[];
export declare const SECURITY_DEGRADING_PATTERNS: RegExp[];
export declare const INJECTION_PATTERNS: RegExp[];
export declare function validateLesson(candidate: string, existingLessons: string[], meta: {
    category: KnowledgeCategory;
    scope: string;
    confidence: number;
}): ValidationResult;
