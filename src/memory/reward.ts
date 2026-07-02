import type { CouncilVerdict } from '../council/types';
import { type MemoryConfig, resolveMemoryConfig } from './config';
import { createConfiguredMemoryProvider } from './gateway';
import type {
	MemoryProvider,
	MemoryRecallRewardInput,
	MemoryRecallRewardResult,
	MemoryTaskOutcome,
} from './provider';

export function councilVerdictToMemoryOutcome(
	verdict: CouncilVerdict,
): MemoryTaskOutcome {
	switch (verdict) {
		case 'APPROVE':
			return 'approved';
		case 'REJECT':
			return 'rejected';
		case 'CONCERNS':
			return 'concerns';
	}
}

export async function applyRecallRewardForCouncil(
	directory: string,
	configInput: Partial<MemoryConfig> | undefined,
	input: Omit<MemoryRecallRewardInput, 'outcome'> & {
		verdict: CouncilVerdict;
	},
): Promise<MemoryRecallRewardResult> {
	const config = resolveMemoryConfig(configInput);
	const outcome = councilVerdictToMemoryOutcome(input.verdict);
	if (!config.enabled) {
		return skippedRewardResult(outcome, 'memory_disabled');
	}
	const provider = createConfiguredMemoryProvider(
		directory,
		config,
	) as MemoryProvider;
	try {
		await provider.initialize?.();
		if (!provider.applyRecallReward) {
			return skippedRewardResult(outcome, 'provider_does_not_support_learning');
		}
		return await provider.applyRecallReward({
			runId: input.runId,
			outcome,
			verdictPayload: input.verdictPayload,
			timestamp: input.timestamp,
		});
	} finally {
		await provider.close?.();
	}
}

function skippedRewardResult(
	outcome: MemoryTaskOutcome,
	reason: string,
): MemoryRecallRewardResult {
	return {
		success: false,
		outcome,
		memoryIds: [],
		reward: outcome === 'approved' ? 1 : outcome === 'rejected' ? -1 : 0,
		updatedMemoryIds: [],
		propagatedMemoryIds: [],
		reason,
	};
}
