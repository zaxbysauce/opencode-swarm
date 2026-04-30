/**
 * Submit Phase Council Verdicts — architect-only tool.
 *
 * Accepts pre-collected parallel verdicts from critic, reviewer, sme,
 * test_engineer, and explorer reviewing the FULL PHASE holistically,
 * then synthesizes them into a phase-level verdict and writes
 * .swarm/evidence/{phase}/phase-council.json for Gate 5 in phase_complete.
 *
 * PREREQUISITE: The architect must dispatch each council member as a separate
 * Agent task (with phase-scoped context) and collect the resulting
 * CouncilMemberVerdict objects BEFORE calling this tool. This tool performs
 * synthesis only — it does NOT dispatch, invoke, or contact council members.
 *
 * Config-gated (council.enabled must be true) and architect-only via
 * AGENT_TOOL_MAP. Follows the convene-council.ts pattern.
 */
import type { tool } from '@opencode-ai/plugin';
import { z } from 'zod';
export declare const ArgsSchema: z.ZodObject<{
    phaseNumber: z.ZodNumber;
    swarmId: z.ZodString;
    phaseSummary: z.ZodString;
    roundNumber: z.ZodOptional<z.ZodNumber>;
    verdicts: z.ZodArray<z.ZodObject<{
        agent: z.ZodEnum<{
            sme: "sme";
            reviewer: "reviewer";
            critic: "critic";
            explorer: "explorer";
            test_engineer: "test_engineer";
        }>;
        verdict: z.ZodEnum<{
            APPROVE: "APPROVE";
            REJECT: "REJECT";
            CONCERNS: "CONCERNS";
        }>;
        confidence: z.ZodNumber;
        findings: z.ZodArray<z.ZodObject<{
            severity: z.ZodEnum<{
                HIGH: "HIGH";
                MEDIUM: "MEDIUM";
                LOW: "LOW";
            }>;
            category: z.ZodString;
            location: z.ZodString;
            detail: z.ZodString;
            evidence: z.ZodString;
        }, z.core.$strip>>;
        criteriaAssessed: z.ZodArray<z.ZodString>;
        criteriaUnmet: z.ZodArray<z.ZodString>;
        durationMs: z.ZodNumber;
    }, z.core.$strip>>;
    working_directory: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const submit_phase_council_verdicts: ReturnType<typeof tool>;
