// Bridge module - re-exports from core hooks knowledge-store
export {
	getPlatformConfigDir,
	resolveSwarmKnowledgePath,
	resolveSwarmRejectedPath,
	resolveHiveKnowledgePath,
	resolveHiveRejectedPath,
	readKnowledge,
	readRejectedLessons,
	appendKnowledge,
	rewriteKnowledge,
	appendRejectedLesson,
	normalize,
	wordBigrams,
	jaccardBigram,
	findNearDuplicate,
	computeConfidence,
	inferTags,
} from '@opencode-swarm/core';
