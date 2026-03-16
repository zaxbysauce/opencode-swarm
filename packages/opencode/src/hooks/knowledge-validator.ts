// Bridge module - re-exports from core hooks knowledge-validator
export type {
	ValidationResult,
	QuarantinedEntry,
	EntryHealthResult,
} from '@opencode-swarm/core';
export {
	DANGEROUS_COMMAND_PATTERNS,
	SECURITY_DEGRADING_PATTERNS,
	INJECTION_PATTERNS,
	validateLesson,
	auditEntryHealth,
	quarantineEntry,
	restoreEntry,
} from '@opencode-swarm/core';
