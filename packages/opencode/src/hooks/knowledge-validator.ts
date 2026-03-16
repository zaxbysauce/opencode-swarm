// Bridge module - re-exports from core hooks knowledge-validator
export type {
	EntryHealthResult,
	QuarantinedEntry,
	ValidationResult,
} from '@opencode-swarm/core';
export {
	auditEntryHealth,
	DANGEROUS_COMMAND_PATTERNS,
	INJECTION_PATTERNS,
	quarantineEntry,
	restoreEntry,
	SECURITY_DEGRADING_PATTERNS,
	validateLesson,
} from '@opencode-swarm/core';
