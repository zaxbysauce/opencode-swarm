import { z } from 'zod';
export declare const TaskStatusSchema: z.ZodEnum<{
    pending: "pending";
    in_progress: "in_progress";
    completed: "completed";
    blocked: "blocked";
}>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export declare const TaskSizeSchema: z.ZodEnum<{
    small: "small";
    medium: "medium";
    large: "large";
}>;
export type TaskSize = z.infer<typeof TaskSizeSchema>;
export declare const PhaseStatusSchema: z.ZodEnum<{
    pending: "pending";
    in_progress: "in_progress";
    blocked: "blocked";
    complete: "complete";
}>;
export type PhaseStatus = z.infer<typeof PhaseStatusSchema>;
export declare const MigrationStatusSchema: z.ZodEnum<{
    native: "native";
    migrated: "migrated";
    migration_failed: "migration_failed";
}>;
export type MigrationStatus = z.infer<typeof MigrationStatusSchema>;
export declare const TaskSchema: z.ZodObject<{
    id: z.ZodString;
    phase: z.ZodNumber;
    status: z.ZodDefault<z.ZodEnum<{
        pending: "pending";
        in_progress: "in_progress";
        completed: "completed";
        blocked: "blocked";
    }>>;
    size: z.ZodDefault<z.ZodEnum<{
        small: "small";
        medium: "medium";
        large: "large";
    }>>;
    description: z.ZodString;
    depends: z.ZodDefault<z.ZodArray<z.ZodString>>;
    acceptance: z.ZodOptional<z.ZodString>;
    files_touched: z.ZodDefault<z.ZodArray<z.ZodString>>;
    evidence_path: z.ZodOptional<z.ZodString>;
    blocked_reason: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type Task = z.infer<typeof TaskSchema>;
export declare const PhaseSchema: z.ZodObject<{
    id: z.ZodNumber;
    name: z.ZodString;
    status: z.ZodDefault<z.ZodEnum<{
        pending: "pending";
        in_progress: "in_progress";
        blocked: "blocked";
        complete: "complete";
    }>>;
    tasks: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        phase: z.ZodNumber;
        status: z.ZodDefault<z.ZodEnum<{
            pending: "pending";
            in_progress: "in_progress";
            completed: "completed";
            blocked: "blocked";
        }>>;
        size: z.ZodDefault<z.ZodEnum<{
            small: "small";
            medium: "medium";
            large: "large";
        }>>;
        description: z.ZodString;
        depends: z.ZodDefault<z.ZodArray<z.ZodString>>;
        acceptance: z.ZodOptional<z.ZodString>;
        files_touched: z.ZodDefault<z.ZodArray<z.ZodString>>;
        evidence_path: z.ZodOptional<z.ZodString>;
        blocked_reason: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type Phase = z.infer<typeof PhaseSchema>;
export declare const PlanSchema: z.ZodObject<{
    schema_version: z.ZodLiteral<"1.0.0">;
    title: z.ZodString;
    swarm: z.ZodString;
    current_phase: z.ZodNumber;
    phases: z.ZodArray<z.ZodObject<{
        id: z.ZodNumber;
        name: z.ZodString;
        status: z.ZodDefault<z.ZodEnum<{
            pending: "pending";
            in_progress: "in_progress";
            blocked: "blocked";
            complete: "complete";
        }>>;
        tasks: z.ZodDefault<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            phase: z.ZodNumber;
            status: z.ZodDefault<z.ZodEnum<{
                pending: "pending";
                in_progress: "in_progress";
                completed: "completed";
                blocked: "blocked";
            }>>;
            size: z.ZodDefault<z.ZodEnum<{
                small: "small";
                medium: "medium";
                large: "large";
            }>>;
            description: z.ZodString;
            depends: z.ZodDefault<z.ZodArray<z.ZodString>>;
            acceptance: z.ZodOptional<z.ZodString>;
            files_touched: z.ZodDefault<z.ZodArray<z.ZodString>>;
            evidence_path: z.ZodOptional<z.ZodString>;
            blocked_reason: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
    }, z.core.$strip>>;
    migration_status: z.ZodOptional<z.ZodEnum<{
        native: "native";
        migrated: "migrated";
        migration_failed: "migration_failed";
    }>>;
}, z.core.$strip>;
export type Plan = z.infer<typeof PlanSchema>;
