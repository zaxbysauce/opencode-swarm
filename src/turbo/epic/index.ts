/**
 * Epic mode — barrel export.
 *
 * Epic mode is a new, additive execution mode that composes Lean Turbo without
 * modifying it. Capabilities:
 *  - A: co-change-aware pair conflict (`epicPairConflict`).
 *  - B: coupling KPI + decoupling roadmap (`computeCouplingReport`).
 *  - C: per-plan activation decision (`decideEpicActivation`).
 *
 * Dependency direction is one-way: `epic` depends on `lean`; `lean` never
 * depends on `epic`. All Lean Turbo files stay byte-for-byte untouched.
 */

export type {
	EpicActivationOptions,
	EpicActivationRationale,
	EpicActivationVerdict,
} from './activation.js';
export { decideEpicActivation } from './activation.js';
export type {
	CoChangeThreshold,
	EpicPairVerdict,
} from './cochange-conflict.js';
export { epicPairConflict } from './cochange-conflict.js';
export type {
	CoChangeData,
	GetCoChangePairsOptions,
} from './cochange-source.js';
export { getCoChangeData, getCoChangePairs } from './cochange-source.js';
export type {
	ComputeCouplingReportOptions,
	ConflictingPair,
	CouplingReport,
	CouplingTask,
	ModuleContention,
} from './coupling-report.js';
export {
	computeCouplingReport,
	formatCouplingReportMarkdown,
} from './coupling-report.js';
export type { PromotionEvidenceRecord } from './promotion-evidence.js';
export {
	appendPromotionEvidence,
	readPromotionEvidence,
} from './promotion-evidence.js';
export type {
	EpicLastDecision,
	EpicPersistedState,
	EpicSessionState,
} from './state.js';
export {
	disableEpicMode,
	emptyPersisted as emptyEpicPersisted,
	emptySessionState as emptyEpicSessionState,
	enableEpicMode,
	isEpicModeActive,
	isStateUnreadable as isEpicStateUnreadable,
	loadEpicSessionState,
	recordEpicDecision,
	repairStateUnreadable as repairEpicStateUnreadable,
	resetEpicSession,
	saveEpicSessionState,
} from './state.js';
