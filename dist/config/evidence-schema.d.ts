import { z } from 'zod';
export declare const EVIDENCE_MAX_JSON_BYTES: number;
export declare const EVIDENCE_MAX_PATCH_BYTES: number;
export declare const EVIDENCE_MAX_TASK_BYTES: number;
export declare const EvidenceTypeSchema: z.ZodEnum<{
    review: "review";
    test: "test";
    diff: "diff";
    approval: "approval";
    note: "note";
}>;
export type EvidenceType = z.infer<typeof EvidenceTypeSchema>;
export declare const EvidenceVerdictSchema: z.ZodEnum<{
    pass: "pass";
    fail: "fail";
    approved: "approved";
    rejected: "rejected";
    info: "info";
}>;
export type EvidenceVerdict = z.infer<typeof EvidenceVerdictSchema>;
export declare const BaseEvidenceSchema: z.ZodObject<{
    task_id: z.ZodString;
    type: z.ZodEnum<{
        review: "review";
        test: "test";
        diff: "diff";
        approval: "approval";
        note: "note";
    }>;
    timestamp: z.ZodString;
    agent: z.ZodString;
    verdict: z.ZodEnum<{
        pass: "pass";
        fail: "fail";
        approved: "approved";
        rejected: "rejected";
        info: "info";
    }>;
    summary: z.ZodString;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>;
export type BaseEvidence = z.infer<typeof BaseEvidenceSchema>;
export declare const ReviewEvidenceSchema: z.ZodObject<{
    task_id: z.ZodString;
    timestamp: z.ZodString;
    agent: z.ZodString;
    verdict: z.ZodEnum<{
        pass: "pass";
        fail: "fail";
        approved: "approved";
        rejected: "rejected";
        info: "info";
    }>;
    summary: z.ZodString;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    type: z.ZodLiteral<"review">;
    risk: z.ZodEnum<{
        medium: "medium";
        low: "low";
        high: "high";
        critical: "critical";
    }>;
    issues: z.ZodDefault<z.ZodArray<z.ZodObject<{
        severity: z.ZodEnum<{
            error: "error";
            info: "info";
            warning: "warning";
        }>;
        message: z.ZodString;
        file: z.ZodOptional<z.ZodString>;
        line: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type ReviewEvidence = z.infer<typeof ReviewEvidenceSchema>;
export declare const TestEvidenceSchema: z.ZodObject<{
    task_id: z.ZodString;
    timestamp: z.ZodString;
    agent: z.ZodString;
    verdict: z.ZodEnum<{
        pass: "pass";
        fail: "fail";
        approved: "approved";
        rejected: "rejected";
        info: "info";
    }>;
    summary: z.ZodString;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    type: z.ZodLiteral<"test">;
    tests_passed: z.ZodNumber;
    tests_failed: z.ZodNumber;
    test_file: z.ZodOptional<z.ZodString>;
    failures: z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        message: z.ZodString;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type TestEvidence = z.infer<typeof TestEvidenceSchema>;
export declare const DiffEvidenceSchema: z.ZodObject<{
    task_id: z.ZodString;
    timestamp: z.ZodString;
    agent: z.ZodString;
    verdict: z.ZodEnum<{
        pass: "pass";
        fail: "fail";
        approved: "approved";
        rejected: "rejected";
        info: "info";
    }>;
    summary: z.ZodString;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    type: z.ZodLiteral<"diff">;
    files_changed: z.ZodDefault<z.ZodArray<z.ZodString>>;
    additions: z.ZodDefault<z.ZodNumber>;
    deletions: z.ZodDefault<z.ZodNumber>;
    patch_path: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type DiffEvidence = z.infer<typeof DiffEvidenceSchema>;
export declare const ApprovalEvidenceSchema: z.ZodObject<{
    task_id: z.ZodString;
    timestamp: z.ZodString;
    agent: z.ZodString;
    verdict: z.ZodEnum<{
        pass: "pass";
        fail: "fail";
        approved: "approved";
        rejected: "rejected";
        info: "info";
    }>;
    summary: z.ZodString;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    type: z.ZodLiteral<"approval">;
}, z.core.$strip>;
export type ApprovalEvidence = z.infer<typeof ApprovalEvidenceSchema>;
export declare const NoteEvidenceSchema: z.ZodObject<{
    task_id: z.ZodString;
    timestamp: z.ZodString;
    agent: z.ZodString;
    verdict: z.ZodEnum<{
        pass: "pass";
        fail: "fail";
        approved: "approved";
        rejected: "rejected";
        info: "info";
    }>;
    summary: z.ZodString;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    type: z.ZodLiteral<"note">;
}, z.core.$strip>;
export type NoteEvidence = z.infer<typeof NoteEvidenceSchema>;
export declare const EvidenceSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    task_id: z.ZodString;
    timestamp: z.ZodString;
    agent: z.ZodString;
    verdict: z.ZodEnum<{
        pass: "pass";
        fail: "fail";
        approved: "approved";
        rejected: "rejected";
        info: "info";
    }>;
    summary: z.ZodString;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    type: z.ZodLiteral<"review">;
    risk: z.ZodEnum<{
        medium: "medium";
        low: "low";
        high: "high";
        critical: "critical";
    }>;
    issues: z.ZodDefault<z.ZodArray<z.ZodObject<{
        severity: z.ZodEnum<{
            error: "error";
            info: "info";
            warning: "warning";
        }>;
        message: z.ZodString;
        file: z.ZodOptional<z.ZodString>;
        line: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>>;
}, z.core.$strip>, z.ZodObject<{
    task_id: z.ZodString;
    timestamp: z.ZodString;
    agent: z.ZodString;
    verdict: z.ZodEnum<{
        pass: "pass";
        fail: "fail";
        approved: "approved";
        rejected: "rejected";
        info: "info";
    }>;
    summary: z.ZodString;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    type: z.ZodLiteral<"test">;
    tests_passed: z.ZodNumber;
    tests_failed: z.ZodNumber;
    test_file: z.ZodOptional<z.ZodString>;
    failures: z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        message: z.ZodString;
    }, z.core.$strip>>>;
}, z.core.$strip>, z.ZodObject<{
    task_id: z.ZodString;
    timestamp: z.ZodString;
    agent: z.ZodString;
    verdict: z.ZodEnum<{
        pass: "pass";
        fail: "fail";
        approved: "approved";
        rejected: "rejected";
        info: "info";
    }>;
    summary: z.ZodString;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    type: z.ZodLiteral<"diff">;
    files_changed: z.ZodDefault<z.ZodArray<z.ZodString>>;
    additions: z.ZodDefault<z.ZodNumber>;
    deletions: z.ZodDefault<z.ZodNumber>;
    patch_path: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    task_id: z.ZodString;
    timestamp: z.ZodString;
    agent: z.ZodString;
    verdict: z.ZodEnum<{
        pass: "pass";
        fail: "fail";
        approved: "approved";
        rejected: "rejected";
        info: "info";
    }>;
    summary: z.ZodString;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    type: z.ZodLiteral<"approval">;
}, z.core.$strip>, z.ZodObject<{
    task_id: z.ZodString;
    timestamp: z.ZodString;
    agent: z.ZodString;
    verdict: z.ZodEnum<{
        pass: "pass";
        fail: "fail";
        approved: "approved";
        rejected: "rejected";
        info: "info";
    }>;
    summary: z.ZodString;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    type: z.ZodLiteral<"note">;
}, z.core.$strip>], "type">;
export type Evidence = z.infer<typeof EvidenceSchema>;
export declare const EvidenceBundleSchema: z.ZodObject<{
    schema_version: z.ZodLiteral<"1.0.0">;
    task_id: z.ZodString;
    entries: z.ZodDefault<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        task_id: z.ZodString;
        timestamp: z.ZodString;
        agent: z.ZodString;
        verdict: z.ZodEnum<{
            pass: "pass";
            fail: "fail";
            approved: "approved";
            rejected: "rejected";
            info: "info";
        }>;
        summary: z.ZodString;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        type: z.ZodLiteral<"review">;
        risk: z.ZodEnum<{
            medium: "medium";
            low: "low";
            high: "high";
            critical: "critical";
        }>;
        issues: z.ZodDefault<z.ZodArray<z.ZodObject<{
            severity: z.ZodEnum<{
                error: "error";
                info: "info";
                warning: "warning";
            }>;
            message: z.ZodString;
            file: z.ZodOptional<z.ZodString>;
            line: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>>;
    }, z.core.$strip>, z.ZodObject<{
        task_id: z.ZodString;
        timestamp: z.ZodString;
        agent: z.ZodString;
        verdict: z.ZodEnum<{
            pass: "pass";
            fail: "fail";
            approved: "approved";
            rejected: "rejected";
            info: "info";
        }>;
        summary: z.ZodString;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        type: z.ZodLiteral<"test">;
        tests_passed: z.ZodNumber;
        tests_failed: z.ZodNumber;
        test_file: z.ZodOptional<z.ZodString>;
        failures: z.ZodDefault<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            message: z.ZodString;
        }, z.core.$strip>>>;
    }, z.core.$strip>, z.ZodObject<{
        task_id: z.ZodString;
        timestamp: z.ZodString;
        agent: z.ZodString;
        verdict: z.ZodEnum<{
            pass: "pass";
            fail: "fail";
            approved: "approved";
            rejected: "rejected";
            info: "info";
        }>;
        summary: z.ZodString;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        type: z.ZodLiteral<"diff">;
        files_changed: z.ZodDefault<z.ZodArray<z.ZodString>>;
        additions: z.ZodDefault<z.ZodNumber>;
        deletions: z.ZodDefault<z.ZodNumber>;
        patch_path: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        task_id: z.ZodString;
        timestamp: z.ZodString;
        agent: z.ZodString;
        verdict: z.ZodEnum<{
            pass: "pass";
            fail: "fail";
            approved: "approved";
            rejected: "rejected";
            info: "info";
        }>;
        summary: z.ZodString;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        type: z.ZodLiteral<"approval">;
    }, z.core.$strip>, z.ZodObject<{
        task_id: z.ZodString;
        timestamp: z.ZodString;
        agent: z.ZodString;
        verdict: z.ZodEnum<{
            pass: "pass";
            fail: "fail";
            approved: "approved";
            rejected: "rejected";
            info: "info";
        }>;
        summary: z.ZodString;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        type: z.ZodLiteral<"note">;
    }, z.core.$strip>], "type">>>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
}, z.core.$strip>;
export type EvidenceBundle = z.infer<typeof EvidenceBundleSchema>;
