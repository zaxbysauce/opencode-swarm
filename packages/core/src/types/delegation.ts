/**
 * Delegation Envelope Types
 * Interface for passing delegated tasks between agents
 */

export interface DelegationEnvelope {
	taskId: string;
	targetAgent: string;
	action: string;
	commandType: 'task' | 'slash_command';
	files: string[];
	acceptanceCriteria: string[];
	technicalContext: string;
	errorStrategy?: 'FAIL_FAST' | 'BEST_EFFORT';
	platformNotes?: string;
}

/**
 * Validation result types
 */
export type EnvelopeValidationResult =
	| { valid: true }
	| { valid: false; reason: string };
