/**
 * Work Complete Council — architect-only tool.
 *
 * Accepts parallel verdicts from critic, reviewer, sme, and test_engineer,
 * then synthesizes them into a veto-aware overall verdict with required fixes
 * and a single unified feedback document.
 *
 * Config-gated (council.enabled must be true) and architect-only via
 * AGENT_TOOL_MAP. Follows the check-gate-status.ts pattern.
 */
import type { tool } from '@opencode-ai/plugin';
import { z } from 'zod';
export declare const ArgsSchema: z.ZodObject<{
    taskId: z.ZodString;
    swarmId: z.ZodString;
    roundNumber: z.ZodDefault<z.ZodNumber>;
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
            CONCERNS: "CONCERNS";
            REJECT: "REJECT";
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
export declare const convene_council: ReturnType<typeof tool>;
