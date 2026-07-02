import type { RecallScoringDiagnostics } from './scoring';
import type {
	AppliedMemoryChange,
	MemoryListFilter,
	MemoryProposal,
	MemoryRecord,
	RecallRequest,
	RecallResultItem,
	ResolvedCuratorMemoryDecision,
} from './types';

export interface MemoryRecallResult {
	items: RecallResultItem[];
	diagnostics?: RecallScoringDiagnostics;
}

export interface MemoryRecallUsageEvent {
	bundleId: string;
	query: string;
	scopes: RecallRequest['scopes'];
	kinds?: RecallRequest['kinds'];
	memoryIds: string[];
	scores: number[];
	tokenEstimate: number;
	agentRole?: string;
	runId?: string;
	qValue?: number;
	lastReward?: number;
	taskOutcome?: MemoryTaskOutcome;
	timestamp: string;
}

export interface MemoryRecallUsageFilter {
	limit?: number;
}

export type MemoryTaskOutcome =
	| 'approved'
	| 'rejected'
	| 'concerns'
	| 'unknown';

export interface MemoryRecallRewardInput {
	runId?: string;
	outcome: MemoryTaskOutcome;
	verdictPayload: unknown;
	timestamp?: string;
}

export interface MemoryRecallRewardResult {
	success: boolean;
	bundleId?: string;
	outcome: MemoryTaskOutcome;
	memoryIds: string[];
	updatedMemoryIds: string[];
	propagatedMemoryIds: string[];
	reward: number;
	qValue?: number;
	reason?: string;
}

export interface MemoryValueLogEntry {
	memoryId: string;
	kind: MemoryRecord['kind'];
	scopeKey: string;
	textPreview: string;
	qValue: number;
	lastReward?: number;
	taskOutcome?: MemoryTaskOutcome;
	recallCount: number;
	lastRecalledAt?: string;
	promotionCandidate: boolean;
	suppressionCandidate: boolean;
}

export interface MemoryValueLogFilter {
	limit?: number;
	includePromotionCandidatesOnly?: boolean;
	includeSuppressionCandidatesOnly?: boolean;
}

export interface MemoryCompactOptions {
	dryRun?: boolean;
	now?: string;
}

export interface MemoryCompactResult {
	dryRun: boolean;
	removedDeleted: number;
	removedSuperseded: number;
	removedExpiredScratch: number;
	remaining: number;
}

export interface MemoryProvider {
	readonly name: string;
	initialize?(): Promise<void>;
	close?(): Promise<void> | void;
	upsert(record: MemoryRecord): Promise<MemoryRecord>;
	get(id: string): Promise<MemoryRecord | null>;
	delete(id: string, reason?: string): Promise<void>;
	recall(request: RecallRequest): Promise<RecallResultItem[]>;
	recallWithDiagnostics?(request: RecallRequest): Promise<MemoryRecallResult>;
	recordRecallUsage?(event: MemoryRecallUsageEvent): Promise<void>;
	listRecallUsage?(
		filter?: MemoryRecallUsageFilter,
	): Promise<MemoryRecallUsageEvent[]>;
	applyRecallReward?(
		input: MemoryRecallRewardInput,
	): Promise<MemoryRecallRewardResult>;
	listMemoryValueLog?(
		filter?: MemoryValueLogFilter,
	): Promise<MemoryValueLogEntry[]>;
	compactMaintenance?(
		options?: MemoryCompactOptions,
	): Promise<MemoryCompactResult>;
	list(filter: MemoryListFilter): Promise<MemoryRecord[]>;
}

export interface MemoryProposalStore {
	createProposal(proposal: MemoryProposal): Promise<MemoryProposal>;
	listProposals(filter?: {
		status?: MemoryProposal['status'];
		limit?: number;
	}): Promise<MemoryProposal[]>;
	applyCuratorDecision?(
		decision: ResolvedCuratorMemoryDecision,
	): Promise<AppliedMemoryChange>;
}
