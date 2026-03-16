// Bridge module - re-exports from core services evidence-service
export {
	type EvidenceEntryData,
	type EvidenceListData,
	formatEvidenceListMarkdown,
	formatTaskEvidenceMarkdown,
	getEvidenceListData,
	getTaskEvidenceData,
	getVerdictEmoji,
	handleEvidenceCommand,
	handleEvidenceSummaryCommand,
	type TaskEvidenceData,
} from '@opencode-swarm/core';
