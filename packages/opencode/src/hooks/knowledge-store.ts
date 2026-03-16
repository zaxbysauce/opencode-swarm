// Bridge module - re-exports from core hooks knowledge-store
export {
	appendKnowledge,
	appendRejectedLesson,
	computeConfidence,
	findNearDuplicate,
	getPlatformConfigDir,
	inferTags,
	jaccardBigram,
	normalize,
	readKnowledge,
	readRejectedLessons,
	resolveHiveKnowledgePath,
	resolveHiveRejectedPath,
	resolveSwarmKnowledgePath,
	resolveSwarmRejectedPath,
	rewriteKnowledge,
	wordBigrams,
} from '@opencode-swarm/core';
