// Bridge module - re-exports from core hooks hive-promoter
export type {
	HivePromotionSummary,
} from '@opencode-swarm/core';
export {
	createHivePromoterHook,
	checkHivePromotions,
	promoteToHive,
	promoteFromSwarm,
} from '@opencode-swarm/core';
