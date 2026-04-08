import { z } from 'zod';
export declare const ObligationSchema: z.ZodEnum<{
    MUST: "MUST";
    SHALL: "SHALL";
    SHOULD: "SHOULD";
    MAY: "MAY";
}>;
export type Obligation = z.infer<typeof ObligationSchema>;
export declare const SpecRequirementSchema: z.ZodObject<{
    id: z.ZodString;
    obligation: z.ZodEnum<{
        MUST: "MUST";
        SHALL: "SHALL";
        SHOULD: "SHOULD";
        MAY: "MAY";
    }>;
    text: z.ZodString;
}, z.core.$strip>;
export type SpecRequirement = z.infer<typeof SpecRequirementSchema>;
export declare const SpecScenarioSchema: z.ZodObject<{
    name: z.ZodString;
    given: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString>>>;
    when: z.ZodArray<z.ZodString>;
    thenClauses: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type SpecScenario = z.infer<typeof SpecScenarioSchema>;
export declare const SpecSectionSchema: z.ZodObject<{
    name: z.ZodString;
    requirements: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        obligation: z.ZodEnum<{
            MUST: "MUST";
            SHALL: "SHALL";
            SHOULD: "SHOULD";
            MAY: "MAY";
        }>;
        text: z.ZodString;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type SpecSection = z.infer<typeof SpecSectionSchema>;
export declare const SwarmSpecSchema: z.ZodObject<{
    title: z.ZodString;
    purpose: z.ZodString;
    sections: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        requirements: z.ZodDefault<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            obligation: z.ZodEnum<{
                MUST: "MUST";
                SHALL: "SHALL";
                SHOULD: "SHOULD";
                MAY: "MAY";
            }>;
            text: z.ZodString;
        }, z.core.$strip>>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type SwarmSpec = z.infer<typeof SwarmSpecSchema>;
export declare const SpecDeltaSchema: z.ZodObject<{
    added: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        obligation: z.ZodEnum<{
            MUST: "MUST";
            SHALL: "SHALL";
            SHOULD: "SHOULD";
            MAY: "MAY";
        }>;
        text: z.ZodString;
    }, z.core.$strip>>>;
    modified: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        obligation: z.ZodEnum<{
            MUST: "MUST";
            SHALL: "SHALL";
            SHOULD: "SHOULD";
            MAY: "MAY";
        }>;
        text: z.ZodString;
    }, z.core.$strip>>>;
    removed: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        obligation: z.ZodEnum<{
            MUST: "MUST";
            SHALL: "SHALL";
            SHOULD: "SHOULD";
            MAY: "MAY";
        }>;
        text: z.ZodString;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type SpecDelta = z.infer<typeof SpecDeltaSchema>;
export declare const DeltaSpecSchema: z.ZodType<SwarmSpec | SpecDelta>;
export type DeltaSpec = z.infer<typeof DeltaSpecSchema>;
interface ValidationIssue {
    line: number;
    message: string;
}
interface SpecContentValidationResult {
    valid: boolean;
    issues: ValidationIssue[];
}
/**
 * Validate raw markdown spec content using regex patterns.
 * Checks for:
 * - FR-### requirement IDs
 * - Obligation keywords (MUST, SHALL, SHOULD, MAY)
 * - Section headers (## Section Name)
 *
 * @param content - Raw markdown string to validate
 * @returns Validation result with issues array
 */
export declare function validateSpecContent(content: string): SpecContentValidationResult;
export {};
