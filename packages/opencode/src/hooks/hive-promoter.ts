// Bridge module - re-exports from core hooks hive-promoter
export type { HivePromotionSummary } from '@opencode-swarm/core';
export {
	checkHivePromotions,
	createHivePromoterHook,
	promoteFromSwarm,
	promoteToHive,
} from '@opencode-swarm/core';
