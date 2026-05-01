import type { tool } from '@opencode-ai/plugin';
import { z } from 'zod';
import { loadPluginConfig } from '../config/loader';
import { synthesizePhaseCouncilAdvisory } from '../council/council-service';
import type { CouncilMemberVerdict } from '../council/types';
import { createSwarmTool } from './create-tool';
import { resolveWorkingDirectory } from './resolve-working-directory';

const VerdictSchema = z.object({
	agent: z.enum(['critic', 'reviewer', 'sme', 'test_engineer', 'explorer']),
	verdict: z.enum(['APPROVE', 'CONCERNS', 'REJECT']),
	confidence: z.number().min(0).max(1),
	findings: z.array(
		z.object({
			severity: z.enum(['HIGH', 'MEDIUM', 'LOW']),
			category: z.string().min(1),
			location: z.string(),
			detail: z.string(),
			evidence: z.string(),
		}),
	),
	criteriaAssessed: z.array(z.string()),
	criteriaUnmet: z.array(z.string()),
	durationMs: z.number().nonnegative(),
});

export const ArgsSchema = z.object({
	phaseNumber: z.number().int().min(1),
	swarmId: z.string().min(1),
	phaseSummary: z.string().min(1),
	roundNumber: z.number().int().min(1).max(10).optional(),
	verdicts: z.array(VerdictSchema).min(1).max(5),
	working_directory: z.string().optional(),
});

export const submit_phase_council_verdicts: ReturnType<typeof tool> =
	createSwarmTool({
		description:
			'Submit pre-collected council member verdicts for PHASE-LEVEL synthesis. ' +
			'PREREQUISITE — you MUST dispatch each council member (critic, reviewer, sme, ' +
			'test_engineer, explorer) as separate Agent tasks with PHASE-SCOPED context and ' +
			'collect their verdict responses BEFORE calling this tool. This tool performs ' +
			'synthesis only — it does NOT dispatch, invoke, or contact council members. ' +
			'Writes .swarm/evidence/{phase}/phase-council.json which is required by ' +
			'phase_complete Gate 5 when council_mode is enabled. ' +
			'Architect-only. Config-gated via council.enabled.',
		args: {
			phaseNumber: z
				.number()
				.int()
				.min(1)
				.describe('Phase number being reviewed (e.g. 1, 2, 3)'),
			swarmId: z.string().min(1).describe('Swarm identifier, e.g. "mega"'),
			phaseSummary: z
				.string()
				.min(1)
				.describe('2–4 sentence summary of what the phase accomplished'),
			roundNumber: z
				.number()
				.int()
				.min(1)
				.max(10)
				.optional()
				.describe('1-indexed round number. Defaults to 1.'),
			verdicts: z
				.array(
					z.object({
						agent: z.enum([
							'critic',
							'reviewer',
							'sme',
							'test_engineer',
							'explorer',
						]),
						verdict: z.enum(['APPROVE', 'CONCERNS', 'REJECT']),
						confidence: z.number().min(0).max(1),
						findings: z.array(
							z.object({
								severity: z.enum(['HIGH', 'MEDIUM', 'LOW']),
								category: z.string().min(1),
								location: z.string(),
								detail: z.string(),
								evidence: z.string(),
							}),
						),
						criteriaAssessed: z.array(z.string()),
						criteriaUnmet: z.array(z.string()),
						durationMs: z.number(),
					}),
				)
				.min(1)
				.max(5)
				.describe(
					'Collected CouncilMemberVerdict objects from all dispatched council members',
				),
			working_directory: z
				.string()
				.optional()
				.describe('Working directory where the plan is located'),
		},
		async execute(args: unknown, directory: string): Promise<string> {
			const parsed = ArgsSchema.safeParse(args);
			if (!parsed.success) {
				return JSON.stringify(
					{
						success: false,
						reason: 'invalid arguments',
						errors: parsed.error.issues.map((i) => ({
							path: i.path.join('.'),
							message: i.message,
						})),
					},
					null,
					2,
				);
			}
			const input = parsed.data;

			const dirResult = resolveWorkingDirectory(
				input.working_directory,
				directory,
			);
			if (!dirResult.success) {
				return JSON.stringify(
					{ success: false, reason: dirResult.message },
					null,
					2,
				);
			}
			const workingDir = dirResult.directory;

			const config = loadPluginConfig(workingDir);
			if (!config.council?.enabled) {
				return JSON.stringify(
					{
						success: false,
						reason:
							'council feature is disabled — set council.enabled: true in .opencode/opencode-swarm.json to enable',
					},
					null,
					2,
				);
			}

			const effectiveMinimum = config.council?.requireAllMembers
				? 5
				: (config.council?.minimumMembers ?? 3);
			const ALL_MEMBERS = [
				'critic',
				'reviewer',
				'sme',
				'test_engineer',
				'explorer',
			] as const;
			const distinctMembers = new Set<(typeof ALL_MEMBERS)[number]>(
				input.verdicts.map((v) => v.agent),
			);
			const membersVoted = [...distinctMembers];
			const membersAbsent = ALL_MEMBERS.filter((m) => !distinctMembers.has(m));

			if (membersVoted.length < effectiveMinimum) {
				return JSON.stringify(
					{
						success: false,
						reason: 'insufficient_quorum',
						message:
							`Phase council quorum not met: ${membersVoted.length} of ${effectiveMinimum} required members provided verdicts. ` +
							`Members voted: [${membersVoted.join(', ')}]. ` +
							`Members absent: [${membersAbsent.join(', ')}]. ` +
							`Dispatch the absent council members with phase-scoped context and collect their verdicts before calling submit_phase_council_verdicts.`,
						membersVoted,
						membersAbsent,
						quorumRequired: effectiveMinimum,
					},
					null,
					2,
				);
			}

			const synthesis = synthesizePhaseCouncilAdvisory(
				input.phaseNumber,
				input.phaseSummary,
				input.verdicts as CouncilMemberVerdict[],
				input.roundNumber ?? 1,
				config.council,
				workingDir,
			);

			return JSON.stringify(
				{
					success: true,
					overallVerdict: synthesis.overallVerdict,
					vetoedBy: synthesis.vetoedBy,
					roundNumber: synthesis.roundNumber,
					allCriteriaMet: synthesis.allCriteriaMet,
					requiredFixesCount: synthesis.requiredFixes?.length ?? 0,
					advisoryFindingsCount: synthesis.advisoryFindings?.length ?? 0,
					unresolvedConflictsCount: synthesis.unresolvedConflicts?.length ?? 0,
					advisoryNotes: synthesis.advisoryNotes ?? [],
					membersVoted,
					membersAbsent,
					quorumSize: membersVoted.length,
					quorumMet: true,
					evidencePath: synthesis.evidencePath,
					unifiedFeedbackMd: synthesis.unifiedFeedbackMd,
				},
				null,
				2,
			);
		},
	});
